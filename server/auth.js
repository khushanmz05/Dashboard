const crypto = require("node:crypto");
const database = require("./database");

const SESSION_DURATION = 7 * 24 * 60 * 60;
const VERIFICATION_DURATION = 24 * 60 * 60;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");

  return `${salt}:${hash}`;
}

function passwordMatches(password, storedPassword) {
  const [salt, storedHash] = storedPassword.split(":");

  if (!salt || !storedHash) return false;

  const suppliedHash = crypto.scryptSync(password, salt, 64);
  const expectedHash = Buffer.from(storedHash, "hex");

  return suppliedHash.length === expectedHash.length &&
    crypto.timingSafeEqual(suppliedHash, expectedHash);
}

function createUser({ username, email, password }) {
  const id = crypto.randomUUID();
  const verificationToken = crypto.randomBytes(32).toString("hex");

  database.prepare(`
    INSERT INTO users (
      id, username, email, password_hash,
      verification_token, verification_token_expires_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    username,
    email,
    hashPassword(password),
    verificationToken,
    Math.floor(Date.now() / 1000) + VERIFICATION_DURATION
  );

  return { id, verificationToken };
}

function verifyUser(token) {
  const result = database.prepare(`
    UPDATE users
    SET is_verified = 1,
        verification_token = NULL,
        verification_token_expires_at = NULL
    WHERE verification_token = ?
      AND verification_token_expires_at > ?
  `).run(token, Math.floor(Date.now() / 1000));

  return result.changes === 1;
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION;

  database.prepare("DELETE FROM sessions WHERE expires_at <= ?")
    .run(Math.floor(Date.now() / 1000));

  database.prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(tokenHash, userId, expiresAt);

  return token;
}

function authenticate(username, password) {
  const user = database.prepare(`
    SELECT id, username, email, password_hash, is_verified
    FROM users
    WHERE username = ?
  `).get(username);

  if (!user || !passwordMatches(password, user.password_hash)) {
    return { error: "Invalid username or password", status: 401 };
  }

  if (!user.is_verified) {
    return { error: "Confirm your registration before signing in", status: 403 };
  }

  return { user, token: createSession(user.id) };
}

function getUserFromSession(token) {
  if (!token) return null;

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  return database.prepare(`
    SELECT users.id, users.username, users.email
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
      AND sessions.expires_at > ?
  `).get(tokenHash, Math.floor(Date.now() / 1000)) || null;
}

function deleteSession(token) {
  if (!token) return;

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

module.exports = {
  SESSION_DURATION,
  createUser,
  verifyUser,
  authenticate,
  getUserFromSession,
  deleteSession
};