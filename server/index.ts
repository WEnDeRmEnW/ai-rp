import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import type { Campaign, CampaignEditResponse, TurnResponse } from '../shared/types.js'
import { OperationJobs } from './operation-jobs.js'
import { editCampaign, runTurn, generateWorld } from './orchestrator.js'
import { campaignEditRequestSchema, turnRequestSchema, worldRequestSchema } from './schemas.js'
import { normalizeWorld } from './world-normalizer.js'

const app = express()
const port = Number(process.env.PORT || 8787)
const turnJobs = new OperationJobs<TurnResponse>()
const worldJobs = new OperationJobs<Campaign>()
const editJobs = new OperationJobs<CampaignEditResponse>()

function requestId(value: unknown) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(value)) throw new Error('Некорректный идентификатор запроса.')
  return value
}

app.disable('x-powered-by')
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))
app.use(cors({ origin: [/^http:\/\/127\.0\.0\.1:\d+$/, /^http:\/\/localhost:\d+$/] }))
// Кампания целиком остаётся локальной, но очень длинная история может занимать десятки мегабайт.
app.use(express.json({ limit: '250mb' }))
app.use('/api', rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'letopis-api', time: new Date().toISOString() })
})

app.post('/api/jobs/turn', (req, res, next) => {
  try {
    const id = requestId(req.body?.requestId)
    const parsed = turnRequestSchema.parse(req.body?.payload)
    const job = turnJobs.start(id, (report) => runTurn(parsed as any, report))
    res.status(job.status === 'pending' ? 202 : 200).json(job)
  } catch (error) {
    next(error)
  }
})

app.post('/api/jobs/world', (req, res, next) => {
  try {
    const id = requestId(req.body?.requestId)
    const request = worldRequestSchema.parse(req.body?.payload)
    const job = worldJobs.start(id, async (report) => normalizeWorld(await generateWorld(request, report), request))
    res.status(job.status === 'pending' ? 202 : 200).json(job)
  } catch (error) {
    next(error)
  }
})

app.post('/api/jobs/edit', (req, res, next) => {
  try {
    const id = requestId(req.body?.requestId)
    const request = campaignEditRequestSchema.parse(req.body?.payload)
    const job = editJobs.start(id, (report) => editCampaign(request as any, report))
    res.status(job.status === 'pending' ? 202 : 200).json(job)
  } catch (error) {
    next(error)
  }
})

app.get('/api/jobs/turn/:id', (req, res) => {
  const job = turnJobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'Задача хода не найдена.' })
  return res.json(job)
})

app.get('/api/jobs/world/:id', (req, res) => {
  const job = worldJobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'Задача создания мира не найдена.' })
  return res.json(job)
})

app.get('/api/jobs/edit/:id', (req, res) => {
  const job = editJobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'Задача ИИ-корректировки не найдена.' })
  return res.json(job)
})

app.delete('/api/jobs/turn/:id', (req, res) => res.status(turnJobs.forget(req.params.id) ? 204 : 404).end())
app.delete('/api/jobs/world/:id', (req, res) => res.status(worldJobs.forget(req.params.id) ? 204 : 404).end())
app.delete('/api/jobs/edit/:id', (req, res) => res.status(editJobs.forget(req.params.id) ? 204 : 404).end())

app.post('/api/turn', async (req, res, next) => {
  try {
    const parsed = turnRequestSchema.parse(req.body)
    const result = await runTurn(parsed as any)
    res.json(result)
  } catch (error) {
    next(error)
  }
})

app.post('/api/worlds/generate', async (req, res, next) => {
  try {
    const request = worldRequestSchema.parse(req.body)
    const generated = await generateWorld(request)
    res.json(normalizeWorld(generated, request))
  } catch (error) {
    next(error)
  }
})

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const webDist = path.resolve(currentDir, '../../dist')
app.use(express.static(webDist))
app.use((req, res, next) => {
  if (req.method === 'GET' && req.accepts('html')) return res.sendFile(path.join(webDist, 'index.html'))
  next()
})

app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
  void _next
  const status = error?.name === 'ZodError' ? 400 : 500
  const message = error instanceof Error ? error.message : 'Неизвестная ошибка сервера.'
  if (process.env.NODE_ENV !== 'test') console.error(`[api] ${message}`)
  res.status(status).json({ error: message })
})

const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Letopis API: http://127.0.0.1:${port}`)
})

process.on('SIGTERM', () => server.close())
process.on('SIGINT', () => server.close())
