import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(path.join(config.dataDir, 'uploads'), { recursive: true });

export const db = new DatabaseSync(path.join(config.dataDir, 'studio3.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');

const MIGRATIONS = [
  `CREATE TABLE users (
     id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, pass_hash TEXT NOT NULL,
     role TEXT NOT NULL DEFAULT 'admin', created_at TEXT NOT NULL DEFAULT (datetime('now')), last_login TEXT);
   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
   CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE debates (
     id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, format TEXT NOT NULL,
     statement TEXT, summary TEXT, description TEXT, event_at TEXT, location TEXT, deadline TEXT,
     spots INTEGER, needs TEXT NOT NULL DEFAULT '[]', questions TEXT NOT NULL DEFAULT '[]',
     cover_url TEXT, status TEXT NOT NULL DEFAULT 'draft', youtube_url TEXT, featured INTEGER NOT NULL DEFAULT 0,
     audience_seats INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
     opened_at TEXT);
   CREATE TABLE applications (
     id INTEGER PRIMARY KEY, ref TEXT UNIQUE NOT NULL, debate_id INTEGER REFERENCES debates(id) ON DELETE SET NULL,
     kind TEXT NOT NULL DEFAULT 'deltagare', status TEXT NOT NULL DEFAULT 'ny', rating INTEGER NOT NULL DEFAULT 0, score INTEGER NOT NULL DEFAULT 0,
     name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, birth_year INTEGER, gender TEXT, municipality TEXT, county TEXT,
     occupation TEXT, party TEXT, party_member INTEGER NOT NULL DEFAULT 0, office TEXT, organisations TEXT,
     econ INTEGER, social INTEGER, stance INTEGER, need_label TEXT,
     motivation TEXT, data TEXT NOT NULL DEFAULT '{}', photo TEXT, tags TEXT NOT NULL DEFAULT '[]', notes TEXT,
     consent_political INTEGER NOT NULL DEFAULT 0, consent_media INTEGER NOT NULL DEFAULT 0,
     ip_hash TEXT, source TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
   CREATE INDEX idx_app_debate ON applications(debate_id, status);
   CREATE INDEX idx_app_email ON applications(email);
   CREATE TABLE application_events (
     id INTEGER PRIMARY KEY, application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
     type TEXT NOT NULL, message TEXT, user_email TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
   CREATE TABLE subscribers (
     id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, prefs TEXT NOT NULL DEFAULT '[]', county TEXT,
     status TEXT NOT NULL DEFAULT 'pending', token TEXT NOT NULL, source TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now')), confirmed_at TEXT, unsubscribed_at TEXT);
   CREATE TABLE campaigns (
     id INTEGER PRIMARY KEY, subject TEXT NOT NULL, body TEXT NOT NULL, segment TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
     recipients INTEGER NOT NULL DEFAULT 0, auto INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), sent_at TEXT);
   CREATE TABLE outbox (
     id INTEGER PRIMARY KEY, to_email TEXT NOT NULL, subject TEXT NOT NULL, html TEXT NOT NULL, kind TEXT,
     status TEXT NOT NULL DEFAULT 'queued', provider_id TEXT, error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), sent_at TEXT);
   CREATE TABLE videos (
     id TEXT PRIMARY KEY, title TEXT NOT NULL, display TEXT, quote TEXT, topic TEXT, format TEXT NOT NULL DEFAULT 'ovrigt',
     views INTEGER, duration INTEGER, published_at TEXT, position INTEGER NOT NULL DEFAULT 0, live INTEGER NOT NULL DEFAULT 0,
     people TEXT NOT NULL DEFAULT '[]', hidden INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0,
     first_seen TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
   CREATE TABLE leads (
     id INTEGER PRIMARY KEY, type TEXT NOT NULL, organisation TEXT, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT,
     budget TEXT, date_wish TEXT, message TEXT, status TEXT NOT NULL DEFAULT 'ny', value_sek INTEGER, notes TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
   CREATE TABLE analytics (day TEXT NOT NULL, event TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, event));`,
];

db.exec('CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY)');
const applied = new Set(db.prepare('SELECT version FROM _migrations').all().map((r) => r.version));
MIGRATIONS.forEach((sql, i) => {
  if (applied.has(i + 1)) return;
  db.exec('BEGIN');
  try {
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(i + 1);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
});

export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const parse = (s, fallback) => {
  try {
    return s == null ? fallback : JSON.parse(s);
  } catch {
    return fallback;
  }
};

export function getSetting(key, fallback) {
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  return row ? parse(row.value, fallback) : fallback;
}

export function setSetting(key, value) {
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
}

export function track(event, n = 1) {
  const day = new Date().toISOString().slice(0, 10);
  run('INSERT INTO analytics (day, event, count) VALUES (?, ?, ?) ON CONFLICT(day, event) DO UPDATE SET count = count + ?', day, event, n, n);
}
