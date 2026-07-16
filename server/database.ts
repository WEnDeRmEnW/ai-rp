import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const dataDir = path.resolve(process.env.LETOPIS_DATA_DIR || '.data')
fs.mkdirSync(dataDir, { recursive: true })

export const db = new Database(path.join(dataDir, 'letopis.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('busy_timeout = 5000')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    google_sub TEXT UNIQUE,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    user_agent TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    revoked_at TEXT
  );
  CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id, last_seen_at DESC);
  CREATE INDEX IF NOT EXISTS sessions_token_idx ON sessions(token_hash);

  CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    turn INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    server_updated_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
  );
  CREATE INDEX IF NOT EXISTS campaigns_updated_idx ON campaigns(user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS campaign_tombstones (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    campaign_id TEXT NOT NULL,
    deleted_at TEXT NOT NULL,
    PRIMARY KEY (user_id, campaign_id)
  );

  CREATE TABLE IF NOT EXISTS oauth_states (
    state_hash TEXT PRIMARY KEY,
    verifier TEXT NOT NULL,
    nonce TEXT NOT NULL,
    redirect_path TEXT NOT NULL DEFAULT '/',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    detail_json TEXT,
    ip TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs(created_at DESC);

  CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`)

export function audit(
  actorUserId: string | null,
  action: string,
  targetType: string,
  targetId: string | null,
  detail: unknown,
  ip = '',
) {
  db.prepare(`
    INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, detail_json, ip, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(actorUserId, action, targetType, targetId, detail === undefined ? null : JSON.stringify(detail), ip, new Date().toISOString())
}

export function closeDatabase() {
  db.close()
}
