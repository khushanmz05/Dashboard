const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {promisify} = require('node:util');
const scrypt = promisify(crypto.scrypt);
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
const usersPath = path.join(__dirname, 'users.json');
const users = fs.existsSync(usersPath) ? JSON.parse(fs.readFileSync(usersPath, 'utf8')) : [];
const sessions = new Map();
const states = new Map();
const lifetime = 7 * 24 * 60 * 60;
const random = () => crypto.randomBytes(32).toString('hex');
const save = () => fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), {mode: 0o600});
const callback = process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/auth/github/callback';
const loginPage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Login</title></head><body>
<h1>Log in</h1><form method="post" action="/login">
<label>Username <input name="username" required autocomplete="username"></label>
<label>Password <input name="password" type="password" required autocomplete="current-password"></label>
<button>Log in</button></form>
<form action="/auth/github"><button id="oauth-github">Sign in with GitHub</button></form>
<h2>Sign up</h2><form method="post" action="/signup">
<label>Username <input name="username" required autocomplete="username"></label>
<label>Email <input name="email" type="email" required></label>
<label>Password <input name="password" type="password" required autocomplete="new-password"></label>
<button>Sign up</button></form></body></html>`;

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {...options, signal: AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error('GitHub request failed');
  return response.json();
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3000');
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(value => {
    const index = value.indexOf('=');
    return [value.slice(0, index).trim(), value.slice(index + 1).trim()];
  }));
  const secure = callback.startsWith('https:') ? '; Secure' : '';
  const cookie = (name, value, age) => `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${secure}`;
  const send = (status, text, type = 'text/plain; charset=utf-8') => {
    res.writeHead(status, {'Content-Type': type, 'Cache-Control': 'no-store'});
    res.end(text);
  };
  const redirect = location => {res.writeHead(302, {Location: location}); res.end();};
  const login = user => {
    if (cookies.sid) sessions.delete(cookies.sid);
    const sid = random();
    sessions.set(sid, {userId: user.id, expires: Date.now() + lifetime * 1000});
    res.setHeader('Set-Cookie', cookie('sid', sid, lifetime));
    redirect('/private');
  };
  try {
    if (req.method === 'GET' && url.pathname === '/')
      return send(200, fs.readFileSync(path.join(__dirname, 'index.html')), 'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/private') {
      const session = sessions.get(cookies.sid);
      if (!session || session.expires <= Date.now()) {
        sessions.delete(cookies.sid);
        return redirect('/login');
      }
      return send(200, fs.readFileSync(path.join(__dirname, 'private.html')), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/login') return send(200, loginPage, 'text/html; charset=utf-8');
    if (req.method === 'POST' && ['/login', '/signup'].includes(url.pathname)) {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 16384) return send(413, 'Body too large');
      }
      const form = new URLSearchParams(body);
      const username = (form.get('username') || '').trim();
      const password = form.get('password') || '';
      if (!username || !password) return send(400, 'Username and password are required');
      if (url.pathname === '/signup') {
        const email = (form.get('email') || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(400, 'Valid email is required');
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = (await scrypt(password, salt, 64)).toString('hex');
        if (users.some(user => user.username === username || user.email === email)) return send(409, 'User already exists');
        users.push({id: random(), username, email, salt, passwordHash: hash});
        save();
        return redirect('/login');
      }
      const user = users.find(value => value.username === username);
      if (!user || !user.passwordHash) return send(401, 'Invalid credentials');
      const hash = await scrypt(password, user.salt, 64);
      if (!crypto.timingSafeEqual(hash, Buffer.from(user.passwordHash, 'hex'))) return send(401, 'Invalid credentials');
      return login(user);
    }
    if (req.method === 'GET' && url.pathname === '/auth/github') {
      if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) return send(503, 'Configure GitHub OAuth in .env first');
      for (const [key, expiry] of states) if (expiry < Date.now()) states.delete(key);
      const state = random();
      states.set(state, Date.now() + 600000);
      res.setHeader('Set-Cookie', cookie('oauth_state', state, 600));
      const query = new URLSearchParams({client_id: process.env.GITHUB_CLIENT_ID, redirect_uri: callback, scope: 'read:user user:email', state});
      return redirect(`https://github.com/login/oauth/authorize?${query}`);
    }
    if (req.method === 'GET' && url.pathname === '/auth/github/callback') {
      const state = url.searchParams.get('state');
      if (!state || state !== cookies.oauth_state || !(states.get(state) > Date.now())) return send(400, 'Invalid OAuth state');
      states.delete(state);
      res.setHeader('Set-Cookie', cookie('oauth_state', '', 0));
      if (url.searchParams.has('error') || !url.searchParams.get('code')) return send(400, 'GitHub sign-in was cancelled or failed');
      const token = await jsonFetch('https://github.com/login/oauth/access_token', {
        method: 'POST', headers: {'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded'},
        body: new URLSearchParams({client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code: url.searchParams.get('code'), redirect_uri: callback})
      });
      if (!token.access_token) return send(502, 'GitHub sign-in failed');
      const headers = {Authorization: `Bearer ${token.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'dashboard-bootstrap'};
      const profile = await jsonFetch('https://api.github.com/user', {headers});
      const emails = await jsonFetch('https://api.github.com/user/emails', {headers});
      if (!profile.id || !Array.isArray(emails)) return send(502, 'Invalid GitHub response');
      let user = users.find(value => value.githubId === String(profile.id));
      if (!user) {
        const email = emails.find(value => value.primary && value.verified)?.email?.toLowerCase();
        if (!email) return send(400, 'A verified primary GitHub email is required');
        // Never silently link an existing local account by email.
        if (users.some(value => value.email === email)) return send(409, 'This email already has an account. Sign in with your existing username and password.');
        user = {id: random(), githubId: String(profile.id), email};
        users.push(user);
        save();
      }
      // The access token is used only for the requests above and is never saved.
      return login(user);
    }
    send(404, 'Not found');
  } catch {
    send(500, 'Request failed. Please try again.');
  }
}).listen(3000, () => console.log('Authentication: http://localhost:3000'));
