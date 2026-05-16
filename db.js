/**
 * db.js — Encrypted SQLite account store for Zerodha credentials
 * Accounts are stored with AES-256-GCM encryption keyed by APP_SECRET env var.
 */
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ─── Encryption ──────────────────────────────────────────────────────────────

function getEncKey() {
  const secret = process.env.APP_SECRET || 'finsageai-default-dev-secret-change-me!';
  if (secret === 'finsageai-default-dev-secret-change-me!') {
    console.warn('[DB] ⚠️  APP_SECRET not set. Using insecure default key. Set APP_SECRET in .env for production.');
  }
  return createHash('sha256').update(secret).digest(); // 32-byte key
}

export function encrypt(plaintext) {
  if (!plaintext) return { enc: '', iv: '', tag: '' };
  const iv     = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncKey(), iv);
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    enc: enc.toString('hex'),
    iv:  iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
  };
}

export function decrypt(enc, iv, tag) {
  if (!enc) return '';
  try {
    const decipher = createDecipheriv('aes-256-gcm', getEncKey(), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(enc, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return '';
  }
}

// ─── DB Initialisation ───────────────────────────────────────────────────────

const DATA_DIR = join(__dirname, 'data');
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, 'finsageai.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS kite_accounts (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    api_key    TEXT NOT NULL,
    sec_enc    TEXT NOT NULL,
    sec_iv     TEXT NOT NULL,
    sec_tag    TEXT NOT NULL,
    tok_enc    TEXT,
    tok_iv     TEXT,
    tok_tag    TEXT,
    user_name  TEXT,
    tok_at     INTEGER,
    is_active  INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  )
`);

// ─── Token expiry helper ──────────────────────────────────────────────────────

/**
 * Kite tokens expire at 6:00 AM IST (00:30 UTC) each day.
 */
function isTokenExpired(tokAt) {
  if (!tokAt) return true;
  const now     = Date.now();
  const created = tokAt * 1000;
  if (now - created > 24 * 3600 * 1000) return true;
  // Next 00:30 UTC after creation
  const exp = new Date(created);
  exp.setUTCHours(0, 30, 0, 0);
  if (exp <= new Date(created)) exp.setUTCDate(exp.getUTCDate() + 1);
  return now > exp.getTime();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function listAccounts() {
  return db.prepare(
    'SELECT id, name, api_key, user_name, tok_at, is_active, created_at FROM kite_accounts ORDER BY created_at DESC'
  ).all().map(r => ({
    id:            r.id,
    name:          r.name,
    api_key_hint:  r.api_key.slice(0, 4) + '****' + r.api_key.slice(-4),
    user_name:     r.user_name || null,
    is_active:     r.is_active === 1,
    has_token:     !!r.tok_at,
    token_expired: isTokenExpired(r.tok_at),
    created_at:    r.created_at,
  }));
}

export function addAccount(name, apiKey, apiSecret) {
  const id          = randomBytes(8).toString('hex');
  const { enc, iv, tag } = encrypt(apiSecret);
  db.prepare(
    'INSERT INTO kite_accounts (id, name, api_key, sec_enc, sec_iv, sec_tag, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, apiKey, enc, iv, tag, Math.floor(Date.now() / 1000));
  return id;
}

export function getAccount(id) {
  return db.prepare('SELECT * FROM kite_accounts WHERE id = ?').get(id) || null;
}

export function getActiveAccount() {
  return db.prepare('SELECT * FROM kite_accounts WHERE is_active = 1 LIMIT 1').get() || null;
}

export function getAccountSecret(id) {
  const r = db.prepare('SELECT sec_enc, sec_iv, sec_tag FROM kite_accounts WHERE id = ?').get(id);
  return r ? decrypt(r.sec_enc, r.sec_iv, r.sec_tag) : null;
}

export function getAccountToken(id) {
  const r = db.prepare('SELECT tok_enc, tok_iv, tok_tag FROM kite_accounts WHERE id = ?').get(id);
  return (r && r.tok_enc) ? decrypt(r.tok_enc, r.tok_iv, r.tok_tag) : null;
}

export function storeToken(id, accessToken, userName) {
  const { enc, iv, tag } = encrypt(accessToken);
  db.prepare(
    'UPDATE kite_accounts SET tok_enc=?, tok_iv=?, tok_tag=?, user_name=?, tok_at=? WHERE id=?'
  ).run(enc, iv, tag, userName, Math.floor(Date.now() / 1000), id);
}

export function setActive(id) {
  db.prepare('UPDATE kite_accounts SET is_active = 0').run();
  db.prepare('UPDATE kite_accounts SET is_active = 1 WHERE id = ?').run(id);
}

export function removeAccount(id) {
  db.prepare('DELETE FROM kite_accounts WHERE id = ?').run(id);
}
