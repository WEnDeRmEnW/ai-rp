import crypto from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { db } from './database.js'

export interface AuthUser {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
  role: 'user' | 'admin'
  isOwner: boolean
  status: 'active' | 'disabled'
  hasPassword: boolean
  hasGoogle: boolean
}

export interface AuthSession {
  id: string
  user: AuthUser
}

const SESSION_COOKIE = 'letopis_session'
const SESSION_DAYS = 30

export const hashSecret = (value: string) => crypto.createHash('sha256').update(value).digest('hex')
export const randomSecret = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url')

function parseCookies(req: Request): Record<string, string> {
  const result: Record<string, string> = {}
  for (const segment of (req.headers.cookie || '').split(';')) {
    const separator = segment.indexOf('=')
    if (separator < 1) continue
    try {
      result[segment.slice(0, separator).trim()] = decodeURIComponent(segment.slice(separator + 1).trim())
    } catch { /* Ignore a malformed unrelated cookie. */ }
  }
  return result
}

function secureCookies() {
  return process.env.NODE_ENV === 'production' || (process.env.PUBLIC_URL || '').startsWith('https://')
}

function mapUser(row: any): AuthUser {
  const ownerId = db.prepare("SELECT value FROM site_settings WHERE key = 'owner_user_id'").pluck().get() as string | undefined
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url || null,
    role: row.role,
    isOwner: row.id === ownerId,
    status: row.status,
    hasPassword: Boolean(row.password_hash),
    hasGoogle: Boolean(row.google_sub),
  }
}

export function createSession(req: Request, res: Response, userId: string): string {
  const token = randomSecret()
  const id = crypto.randomUUID()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000)
  db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, created_at, last_seen_at, expires_at, user_agent, ip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, hashSecret(token), now.toISOString(), now.toISOString(), expiresAt.toISOString(), String(req.headers['user-agent'] || '').slice(0, 500), req.ip || '')
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 86_400_000,
  })
  return id
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: secureCookies(), sameSite: 'lax', path: '/' })
}

export function getAuth(req: Request): AuthSession | null {
  const token = parseCookies(req)[SESSION_COOKIE]
  if (!token) return null
  const row = db.prepare(`
    SELECT s.id AS session_id, s.last_seen_at, s.expires_at,
           u.id, u.email, u.display_name, u.avatar_url, u.role, u.status, u.password_hash, u.google_sub
      FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL
  `).get(hashSecret(token)) as any
  if (!row || row.status !== 'active' || Date.parse(row.expires_at) <= Date.now()) return null
  if (Date.now() - Date.parse(row.last_seen_at) > 5 * 60_000) {
    db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), row.session_id)
  }
  return { id: row.session_id, user: mapUser(row) }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  ;(req as any).auth = getAuth(req)
  next()
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req)
  if (!auth) return res.status(401).json({ error: 'Войдите в аккаунт, чтобы продолжить.' })
  ;(req as any).auth = auth
  return next()
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req)
  if (!auth) return res.status(401).json({ error: 'Войдите в аккаунт, чтобы продолжить.' })
  if (auth.user.role !== 'admin') return res.status(403).json({ error: 'Доступ только для администратора.' })
  ;(req as any).auth = auth
  return next()
}

export function authFrom(req: Request): AuthSession {
  return (req as any).auth as AuthSession
}

export function revokeCurrentSession(req: Request) {
  const auth = getAuth(req)
  if (auth) db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').run(new Date().toISOString(), auth.id)
}

export function publicUserById(id: string): AuthUser | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any
  return row ? mapUser(row) : null
}
