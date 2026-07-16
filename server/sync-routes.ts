import { Router } from 'express'
import { z } from 'zod'
import { authFrom, requireAuth } from './auth.js'
import { audit, db } from './database.js'

const campaignSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(300),
  turn: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  messages: z.array(z.unknown()),
  world: z.object({ name: z.string().min(1) }).passthrough(),
  player: z.object({ name: z.string().min(1), abilities: z.array(z.unknown()) }).passthrough(),
  inventory: z.array(z.unknown()),
  npcs: z.array(z.unknown()),
  scene: z.record(z.unknown()),
  settings: z.record(z.unknown()),
}).passthrough()

function serializeCampaign(value: unknown) {
  const campaign = campaignSchema.parse(value)
  const payload = JSON.stringify(campaign)
  if (Buffer.byteLength(payload) > 100 * 1024 * 1024) throw new Error('Одна история не может занимать больше 100 МБ в облаке.')
  return { campaign, payload }
}

function allCampaigns(userId: string) {
  return (db.prepare('SELECT payload_json FROM campaigns WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as Array<{ payload_json: string }>)
    .map((row) => campaignSchema.safeParse(JSON.parse(row.payload_json)))
    .filter((result) => result.success)
    .map((result) => result.data)
}

export function createSyncRouter() {
  const router = Router()
  router.use(requireAuth)

  router.get('/campaigns', (req, res) => {
    const auth = authFrom(req)
    const tombstones = (db.prepare('SELECT campaign_id AS id, deleted_at AS deletedAt FROM campaign_tombstones WHERE user_id = ?').all(auth.user.id))
    res.json({ campaigns: allCampaigns(auth.user.id), tombstones, syncedAt: new Date().toISOString() })
  })

  router.post('/reconcile', (req, res, next) => {
    try {
      const auth = authFrom(req)
      const body = z.object({ campaigns: z.array(z.unknown()).max(1000), deletedIds: z.array(z.string().uuid()).max(1000).default([]) }).parse(req.body)
      const now = new Date().toISOString()
      const transaction = db.transaction(() => {
        for (const id of body.deletedIds) {
          db.prepare('DELETE FROM campaigns WHERE user_id = ? AND id = ?').run(auth.user.id, id)
          db.prepare('INSERT INTO campaign_tombstones (user_id, campaign_id, deleted_at) VALUES (?, ?, ?) ON CONFLICT(user_id, campaign_id) DO UPDATE SET deleted_at = excluded.deleted_at').run(auth.user.id, id, now)
        }
        for (const raw of body.campaigns) {
          const { campaign, payload } = serializeCampaign(raw)
          const tombstone = db.prepare('SELECT deleted_at FROM campaign_tombstones WHERE user_id = ? AND campaign_id = ?').get(auth.user.id, campaign.id) as any
          if (tombstone && Date.parse(tombstone.deleted_at) >= Date.parse(campaign.updatedAt)) continue
          const current = db.prepare('SELECT updated_at FROM campaigns WHERE user_id = ? AND id = ?').get(auth.user.id, campaign.id) as any
          if (!current || Date.parse(campaign.updatedAt) > Date.parse(current.updated_at)) {
            db.prepare(`
              INSERT INTO campaigns (id, user_id, title, turn, created_at, updated_at, server_updated_at, payload_json)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_id, id) DO UPDATE SET title=excluded.title, turn=excluded.turn, updated_at=excluded.updated_at,
                server_updated_at=excluded.server_updated_at, payload_json=excluded.payload_json
            `).run(campaign.id, auth.user.id, campaign.title, campaign.turn, campaign.createdAt, campaign.updatedAt, now, payload)
            db.prepare('DELETE FROM campaign_tombstones WHERE user_id = ? AND campaign_id = ?').run(auth.user.id, campaign.id)
          }
        }
      })
      transaction()
      audit(auth.user.id, 'sync.reconcile', 'campaign', null, { uploaded: body.campaigns.length, deleted: body.deletedIds.length }, req.ip)
      const tombstones = db.prepare('SELECT campaign_id AS id, deleted_at AS deletedAt FROM campaign_tombstones WHERE user_id = ?').all(auth.user.id)
      res.json({ campaigns: allCampaigns(auth.user.id), tombstones, syncedAt: now })
    } catch (error) { next(error) }
  })

  router.put('/campaigns/:id', (req, res, next) => {
    try {
      const auth = authFrom(req)
      const { campaign, payload } = serializeCampaign(req.body)
      if (campaign.id !== req.params.id) return res.status(400).json({ error: 'ID истории в адресе и данных не совпадает.' })
      const now = new Date().toISOString()
      const tombstone = db.prepare('SELECT deleted_at FROM campaign_tombstones WHERE user_id = ? AND campaign_id = ?').get(auth.user.id, campaign.id) as any
      if (tombstone && Date.parse(tombstone.deleted_at) >= Date.parse(campaign.updatedAt)) {
        return res.status(409).json({ error: 'Эта история уже была удалена на другом устройстве. Обновите облачные данные.' })
      }
      const current = db.prepare('SELECT updated_at, payload_json FROM campaigns WHERE user_id = ? AND id = ?').get(auth.user.id, campaign.id) as any
      if (current && Date.parse(current.updated_at) > Date.parse(campaign.updatedAt)) {
        return res.json({ campaign: JSON.parse(current.payload_json), syncedAt: now, conflictResolved: true })
      }
      db.prepare(`
        INSERT INTO campaigns (id, user_id, title, turn, created_at, updated_at, server_updated_at, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, id) DO UPDATE SET title=excluded.title, turn=excluded.turn, updated_at=excluded.updated_at,
          server_updated_at=excluded.server_updated_at, payload_json=excluded.payload_json
      `).run(campaign.id, auth.user.id, campaign.title, campaign.turn, campaign.createdAt, campaign.updatedAt, now, payload)
      db.prepare('DELETE FROM campaign_tombstones WHERE user_id = ? AND campaign_id = ?').run(auth.user.id, campaign.id)
      res.json({ campaign, syncedAt: now })
    } catch (error) { next(error) }
  })

  router.delete('/campaigns/:id', (req, res) => {
    const auth = authFrom(req)
    const now = new Date().toISOString()
    db.prepare('DELETE FROM campaigns WHERE user_id = ? AND id = ?').run(auth.user.id, req.params.id)
    db.prepare('INSERT INTO campaign_tombstones (user_id, campaign_id, deleted_at) VALUES (?, ?, ?) ON CONFLICT(user_id, campaign_id) DO UPDATE SET deleted_at = excluded.deleted_at').run(auth.user.id, req.params.id, now)
    audit(auth.user.id, 'campaign.delete', 'campaign', req.params.id, undefined, req.ip)
    res.status(204).end()
  })

  return router
}
