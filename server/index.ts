import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { createAdminRouter } from './admin-routes.js'
import { createAuthRouter } from './auth-routes.js'
import { closeDatabase } from './database.js'
import { createSyncRouter } from './sync-routes.js'
import { privacyPage, termsPage } from './legal-pages.js'
import type { Campaign, CampaignEditResponse, TurnResponse, WorldQuestionResponse } from '../shared/types.js'
import { OperationJobs } from './operation-jobs.js'
import { answerWorldQuestion, editCampaign, runTurn, generateWorld } from './orchestrator.js'
import { campaignEditRequestSchema, turnRequestSchema, worldQuestionRequestSchema, worldRequestSchema } from './schemas.js'
import { normalizeWorld } from './world-normalizer.js'
import { withCompletionScope } from './provider.js'

const app = express()
const port = Number(process.env.PORT || 8787)
const turnJobs = new OperationJobs<TurnResponse>()
const worldJobs = new OperationJobs<Campaign>()
const editJobs = new OperationJobs<CampaignEditResponse>()
const questionJobs = new OperationJobs<WorldQuestionResponse>()

if (process.env.NODE_ENV === 'production') {
  // Production traffic reaches Express only through the local Nginx proxy.
  // Trust exactly that hop so rate limiting uses the visitor's real IP.
  app.set('trust proxy', 1)
}

function requestId(value: unknown) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(value)) throw new Error('Некорректный идентификатор запроса.')
  return value
}

app.disable('x-powered-by')
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))
app.use(cors({ origin: [/^http:\/\/127\.0\.0\.1:\d+$/, /^http:\/\/localhost:\d+$/] }))
// Кампания целиком остаётся локальной, но очень длинная история может занимать десятки мегабайт.
app.use(express.json({ limit: '250mb' }))
app.use('/api', rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Long AI jobs are polled frequently. Reading or forgetting an existing job
  // must not consume the same quota as creating expensive model requests.
  skip: (req) => req.method === 'GET' || req.method === 'DELETE',
  handler: (_req, res) => res.status(429).json({ error: 'Слишком много новых запросов за минуту. Подождите немного и повторите.' }),
}))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'letopis-api', time: new Date().toISOString() })
})

app.use('/api/auth', createAuthRouter())
app.use('/api/sync', createSyncRouter())
app.use('/api/admin', createAdminRouter())

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

app.post('/api/jobs/question', (req, res, next) => {
  try {
    const id = requestId(req.body?.requestId)
    const request = worldQuestionRequestSchema.parse(req.body?.payload)
    const job = questionJobs.start(id, (report) => answerWorldQuestion(request as any, report))
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

app.get('/api/jobs/question/:id', (req, res) => {
  const job = questionJobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'Запрос к справочнику не найден.' })
  return res.json(job)
})

app.delete('/api/jobs/turn/:id', (req, res) => res.status(turnJobs.forget(req.params.id) ? 204 : 404).end())
app.delete('/api/jobs/world/:id', (req, res) => res.status(worldJobs.forget(req.params.id) ? 204 : 404).end())
app.delete('/api/jobs/edit/:id', (req, res) => res.status(editJobs.forget(req.params.id) ? 204 : 404).end())
app.delete('/api/jobs/question/:id', (req, res) => res.status(questionJobs.forget(req.params.id) ? 204 : 404).end())

app.post('/api/turn', async (req, res, next) => {
  try {
    const parsed = turnRequestSchema.parse(req.body)
    const result = await withCompletionScope(() => runTurn(parsed as any))
    res.json(result)
  } catch (error) {
    next(error)
  }
})

app.post('/api/worlds/generate', async (req, res, next) => {
  try {
    const request = worldRequestSchema.parse(req.body)
    const generated = await withCompletionScope(() => generateWorld(request))
    res.json(normalizeWorld(generated, request))
  } catch (error) {
    next(error)
  }
})

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const webDist = path.resolve(currentDir, '../../dist')
app.get('/privacy', privacyPage)
app.get('/terms', termsPage)
app.use(express.static(webDist))
app.use((req, res, next) => {
  if (req.method === 'GET' && req.accepts('html')) return res.sendFile(path.join(webDist, 'index.html'))
  next()
})

app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
  void _next
  const status = error?.name === 'ZodError' || error?.type === 'entity.parse.failed' || error?.status === 400 ? 400 : 500
  const message = error instanceof Error ? error.message : 'Неизвестная ошибка сервера.'
  if (process.env.NODE_ENV !== 'test') console.error(`[api] ${message}`)
  res.status(status).json({ error: message })
})

const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Letopis API: http://127.0.0.1:${port}`)
})

const shutdown = () => server.close(() => closeDatabase())
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
