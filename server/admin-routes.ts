import { Router } from 'express'
import { z } from 'zod'
import { authFrom, publicUserById, requireAdmin } from './auth.js'
import { audit, db } from './database.js'

const pageSchema = z.coerce.number().int().min(1).max(100_000).catch(1)
const limitSchema = z.coerce.number().int().min(1).max(100).catch(30)

function parsePayload(value: string) {
  try { return JSON.parse(value) } catch { return null }
}

export function createAdminRouter() {
  const router = Router()
  router.use(requireAdmin)

  router.get('/stats', (_req, res) => {
    const now = new Date()
    const dayAgo = new Date(now.getTime() - 86_400_000).toISOString()
    const users = (db.prepare('SELECT COUNT(*) AS count FROM users').get() as any).count
    const campaigns = (db.prepare('SELECT COUNT(*) AS count FROM campaigns').get() as any).count
    const activeSessions = (db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE revoked_at IS NULL AND expires_at > ?').get(now.toISOString()) as any).count
    const newUsers24h = (db.prepare('SELECT COUNT(*) AS count FROM users WHERE created_at >= ?').get(dayAgo) as any).count
    const rows = db.prepare('SELECT payload_json FROM campaigns').all() as Array<{ payload_json: string }>
    let messages = 0
    let turns = 0
    let bytes = 0
    for (const row of rows) {
      bytes += Buffer.byteLength(row.payload_json)
      const campaign = parsePayload(row.payload_json)
      messages += Array.isArray(campaign?.messages) ? campaign.messages.length : 0
      turns += Number.isFinite(campaign?.turn) ? campaign.turn : 0
    }
    res.json({ users, campaigns, activeSessions, newUsers24h, messages, turns, storageBytes: bytes })
  })

  router.get('/users', (req, res) => {
    const page = pageSchema.parse(req.query.page)
    const limit = limitSchema.parse(req.query.limit)
    const search = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : ''
    const pattern = `%${search}%`
    const total = (db.prepare('SELECT COUNT(*) AS count FROM users WHERE (? = \'\' OR email LIKE ? OR display_name LIKE ?)').get(search, pattern, pattern) as any).count
    const users = db.prepare(`
      SELECT u.id, u.email, u.display_name AS displayName, u.avatar_url AS avatarUrl, u.role, u.status,
             u.created_at AS createdAt, u.last_login_at AS lastLoginAt,
             COUNT(DISTINCT c.id) AS campaignCount, COUNT(DISTINCT CASE WHEN s.revoked_at IS NULL AND s.expires_at > ? THEN s.id END) AS sessionCount
        FROM users u
        LEFT JOIN campaigns c ON c.user_id = u.id
        LEFT JOIN sessions s ON s.user_id = u.id
       WHERE (? = '' OR u.email LIKE ? OR u.display_name LIKE ?)
       GROUP BY u.id ORDER BY COALESCE(u.last_login_at, u.created_at) DESC LIMIT ? OFFSET ?
    `).all(new Date().toISOString(), search, pattern, pattern, limit, (page - 1) * limit)
    res.json({ users, page, limit, total })
  })

  router.get('/users/:id', (req, res) => {
    const user = publicUserById(req.params.id)
    if (!user) return res.status(404).json({ error: 'Пользователь не найден.' })
    const meta = db.prepare('SELECT created_at AS createdAt, updated_at AS updatedAt, last_login_at AS lastLoginAt FROM users WHERE id = ?').get(req.params.id)
    const campaigns = db.prepare('SELECT id, title, turn, created_at AS createdAt, updated_at AS updatedAt, LENGTH(payload_json) AS bytes FROM campaigns WHERE user_id = ? ORDER BY updated_at DESC').all(req.params.id)
    const sessions = db.prepare(`SELECT id, created_at AS createdAt, last_seen_at AS lastSeenAt, expires_at AS expiresAt, user_agent AS userAgent, ip, revoked_at AS revokedAt FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC LIMIT 100`).all(req.params.id)
    return res.json({ user: { ...user, ...(meta as object) }, campaigns, sessions })
  })

  router.patch('/users/:id', (req, res, next) => {
    try {
      const auth = authFrom(req)
      const body = z.object({ role: z.enum(['user', 'admin']).optional(), status: z.enum(['active', 'disabled']).optional() }).refine((value) => value.role || value.status, 'Нет изменений.').parse(req.body)
      const target = publicUserById(req.params.id)
      if (target?.isOwner) return res.status(403).json({ error: 'Аккаунт владельца и создателя защищён от изменения прав и отключения.' })
      if (!target) return res.status(404).json({ error: 'Пользователь не найден.' })
      if (target.id === auth.user.id && (body.status === 'disabled' || body.role === 'user')) return res.status(400).json({ error: 'Нельзя отключить себя или снять собственные права администратора.' })
      if (target.role === 'admin' && (body.status === 'disabled' || body.role === 'user')) {
        const admins = (db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'").get() as any).count
        if (admins <= 1) return res.status(400).json({ error: 'Нельзя отключить последнего активного администратора.' })
      }
      db.prepare('UPDATE users SET role = COALESCE(?, role), status = COALESCE(?, status), updated_at = ? WHERE id = ?')
        .run(body.role || null, body.status || null, new Date().toISOString(), target.id)
      if (body.status === 'disabled') db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(new Date().toISOString(), target.id)
      audit(auth.user.id, 'admin.user_update', 'user', target.id, body, req.ip)
      return res.json({ user: publicUserById(target.id) })
    } catch (error) { return next(error) }
  })

  router.get('/campaigns', (req, res) => {
    const page = pageSchema.parse(req.query.page)
    const limit = limitSchema.parse(req.query.limit)
    const search = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : ''
    const pattern = `%${search}%`
    const total = (db.prepare(`SELECT COUNT(*) AS count FROM campaigns c JOIN users u ON u.id = c.user_id WHERE (? = '' OR c.title LIKE ? OR u.email LIKE ? OR u.display_name LIKE ?)`).get(search, pattern, pattern, pattern) as any).count
    const campaigns = db.prepare(`
      SELECT c.id, c.user_id AS userId, c.title, c.turn, c.created_at AS createdAt, c.updated_at AS updatedAt,
             LENGTH(c.payload_json) AS bytes, u.email, u.display_name AS displayName
        FROM campaigns c JOIN users u ON u.id = c.user_id
       WHERE (? = '' OR c.title LIKE ? OR u.email LIKE ? OR u.display_name LIKE ?)
       ORDER BY c.updated_at DESC LIMIT ? OFFSET ?
    `).all(search, pattern, pattern, pattern, limit, (page - 1) * limit)
    res.json({ campaigns, page, limit, total })
  })

  router.get('/campaigns/:userId/:campaignId', (req, res) => {
    const row = db.prepare(`SELECT c.payload_json, c.server_updated_at AS serverUpdatedAt, u.email, u.display_name AS displayName FROM campaigns c JOIN users u ON u.id=c.user_id WHERE c.user_id=? AND c.id=?`).get(req.params.userId, req.params.campaignId) as any
    if (!row) return res.status(404).json({ error: 'История не найдена.' })
    return res.json({ campaign: parsePayload(row.payload_json), owner: { email: row.email, displayName: row.displayName }, serverUpdatedAt: row.serverUpdatedAt })
  })

  router.delete('/campaigns/:userId/:campaignId', (req, res) => {
    const auth = authFrom(req)
    const now = new Date().toISOString()
    const result = db.prepare('DELETE FROM campaigns WHERE user_id = ? AND id = ?').run(req.params.userId, req.params.campaignId)
    if (!result.changes) return res.status(404).json({ error: 'История не найдена.' })
    db.prepare('INSERT INTO campaign_tombstones (user_id, campaign_id, deleted_at) VALUES (?, ?, ?) ON CONFLICT(user_id,campaign_id) DO UPDATE SET deleted_at=excluded.deleted_at').run(req.params.userId, req.params.campaignId, now)
    audit(auth.user.id, 'admin.campaign_delete', 'campaign', req.params.campaignId, { userId: req.params.userId }, req.ip)
    return res.status(204).end()
  })

  router.delete('/sessions/:id', (req, res) => {
    const auth = authFrom(req)
    const targetSession = db.prepare('SELECT user_id AS userId FROM sessions WHERE id = ?').get(req.params.id) as { userId?: string } | undefined
    if (targetSession?.userId) {
      const target = publicUserById(targetSession.userId)
      if (target?.isOwner && target.id !== auth.user.id) return res.status(403).json({ error: 'Сессии владельца защищены.' })
    }
    const result = db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(new Date().toISOString(), req.params.id)
    if (!result.changes) return res.status(404).json({ error: 'Активная сессия не найдена.' })
    audit(auth.user.id, 'admin.session_revoke', 'session', req.params.id, undefined, req.ip)
    return res.status(204).end()
  })

  router.get('/audit', (req, res) => {
    const page = pageSchema.parse(req.query.page)
    const limit = limitSchema.parse(req.query.limit)
    const total = (db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get() as any).count
    const entries = db.prepare(`
      SELECT a.id, a.action, a.target_type AS targetType, a.target_id AS targetId, a.detail_json AS detailJson,
             a.ip, a.created_at AS createdAt, u.email AS actorEmail, u.display_name AS actorName
        FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id
       ORDER BY a.id DESC LIMIT ? OFFSET ?
    `).all(limit, (page - 1) * limit)
    res.json({ entries, page, limit, total })
  })

  return router
}
