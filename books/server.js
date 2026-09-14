const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const books = JSON.parse(fs.readFileSync(path.join(__dirname, 'books.json'), 'utf8'));
const TOKEN = 'bootstrap-token';
let nextId = Math.max(...books.map(book => book.id)) + 1;

http.createServer(async (req, res) => {
  const send = (status, value) => {
    res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify(value));
  };
  const url = new URL(req.url, 'http://localhost');
  const match = url.pathname.match(/^\/books\/(\d+)$/);
  if ((req.method === 'POST' && url.pathname === '/books') ||
      (req.method === 'DELETE' && match)) {
    if (!req.headers.authorization) return send(401, {error: 'Authentication required'});
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(403, {error: 'Invalid token'});
  }
  if (req.method === 'GET' && url.pathname === '/books') return send(200, books);
  if (match && ['GET', 'DELETE'].includes(req.method)) {
    const index = books.findIndex(book => book.id === Number(match[1]));
    if (index < 0) return send(404, {error: 'Book not found'});
    if (req.method === 'GET') return send(200, books[index]);
    books.splice(index, 1);
    res.writeHead(204);
    return res.end();
  }
  if (req.method === 'POST' && url.pathname === '/books') {
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 16384) return send(413, {error: 'Body too large'});
      }
      const data = JSON.parse(body);
      if (!data || typeof data.title !== 'string' || typeof data.author !== 'string' ||
          !data.title.trim() || !data.author.trim()) return send(400, {error: 'Title and author are required'});
      const book = {id: nextId++, title: data.title.trim(), author: data.author.trim()};
      books.push(book);
      return send(201, book);
    } catch {
      return send(400, {error: 'Invalid JSON'});
    }
  }
  send(404, {error: 'Not found'});
}).listen(8000, () => console.log('Books API: http://localhost:8000'));
