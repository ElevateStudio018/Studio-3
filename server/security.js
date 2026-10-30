import crypto from 'node:crypto';
import { config } from './config.js';
import { get, run } from './db.js';
import { HttpError, parseCookies, clientIp } from './http.js';

const SESSION_COOKIE = 's3_session';
const SESSION_DAYS = 14;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [algo, salt, hash] = String(stored).split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const hashIp = (req) => sha256(config.ipSalt + clientIp(req)).slice(0, 24);

export function createSession(res, userId) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), userId, expires.toISOString());
  run("UPDATE users SET last_login = datetime('now') WHERE id = ?", userId);
  res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86400 }));
}

export function destroySession(req, res) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
  res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, '', { maxAge: 0 }));
}

export function sessionHash(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  return token ? sha256(token) : '';
}

export function currentUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const row = get(
    `SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`, sha256(token), new Date().toISOString());
  return row || null;
}

function cookie(name, value, { maxAge }) {
  return [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`, config.cookieSecure && 'Secure']
    .filter(Boolean).join('; ');
}

/** Admin-API kräver inloggning + en egen header (stoppar CSRF från andra sajter). */
export function requireAdmin(req) {
  const user = currentUser(req);
  if (!user) throw new HttpError(401, 'Logga in för att fortsätta.');
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'studio3') throw new HttpError(403, 'Saknar CSRF-skydd.');
  req.user = user;
  return user;
}

const buckets = new Map();
/** Enkel hastighetsbegränsning per IP och nyckel. */
export function rateLimit(req, key, max, windowMs) {
  const id = `${key}:${clientIp(req)}`;
  const now = Date.now();
  const b = buckets.get(id);
  if (!b || b.reset < now) {
    buckets.set(id, { count: 1, reset: now + windowMs });
    return;
  }
  b.count += 1;
  if (b.count > max) throw new HttpError(429, 'För många försök. Vänta en stund och försök igen.');
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 60_000).unref();

export function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' https://www.youtube.com https://s.ytimg.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://i.ytimg.com https://yt3.googleusercontent.com",
      "media-src 'self' blob: https:",
      "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
      "connect-src 'self'",
      "form-action 'self'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
    ].join('; ')
  );
}
