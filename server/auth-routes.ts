import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { Router, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { authFrom, clearSessionCookie, createSession, getAuth, hashSecret, publicUserById, randomSecret, requireAuth, revokeCurrentSession } from './auth.js'
import { audit, db } from './database.js'

const emailSchema = z.string().trim().toLowerCase().email('Введите корректный адрес почты.').max(254)
const passwordSchema = z.string().min(8, 'Пароль должен содержать не меньше 8 символов.').max(128, 'Пароль слишком длинный.')
const nameSchema = z.string().trim().min(2, 'Укажите имя длиной не меньше 2 символов.').max(80)

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Слишком много попыток. Подождите несколько минут.' }),
})

const publicUrl = () => (process.env.PUBLIC_URL || `http://127.0.0.1:${process.env.PORT || 8787}`).replace(/\/$/, '')
const googleAvailable = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
const pkceChallenge = (value: string) => crypto.createHash('sha256').update(value).digest('base64url')

function safeRedirect(value: unknown) {
  return typeof value === 'string' && /^\/(?!\/)[\w\-./?=&%]*$/.test(value) ? value : '/'
}

function setOauthCookie(res: Response, state: string) {
  res.cookie('letopis_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || publicUrl().startsWith('https://'),
    sameSite: 'lax',
    path: '/api/auth/google/callback',
    maxAge: 10 * 60_000,
  })
}

function oauthCookie(req: Request) {
  const match = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith('letopis_oauth_state='))
  return match ? decodeURIComponent(match.slice(match.indexOf('=') + 1)) : ''
}

export function createAuthRouter() {
  const router = Router()

  router.get('/me', (req, res) => {
    const auth = getAuth(req)
    const adminCount = (db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'").get() as any).count as number
    res.json({ user: auth?.user || null, sessionId: auth?.id || null, googleAvailable: googleAvailable(), needsAdminBootstrap: adminCount === 0 })
  })

  router.post('/register', authLimiter, async (req, res, next) => {
    try {
      const body = z.object({ email: emailSchema, password: passwordSchema, displayName: nameSchema }).parse(req.body)
      if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(body.email)) return res.status(409).json({ error: 'Аккаунт с такой почтой уже существует.' })
      const now = new Date().toISOString()
      const id = crypto.randomUUID()
      const hash = await bcrypt.hash(body.password, 12)
      db.prepare(`INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, body.email, hash, body.displayName, now, now, now)
      createSession(req, res, id)
      audit(id, 'auth.register', 'user', id, { provider: 'password' }, req.ip)
      return res.status(201).json({ user: publicUserById(id) })
    } catch (error) { return next(error) }
  })

  router.post('/login', authLimiter, async (req, res, next) => {
    try {
      const body = z.object({ email: emailSchema, password: z.string().max(128) }).parse(req.body)
      const row = db.prepare('SELECT * FROM users WHERE email = ?').get(body.email) as any
      const valid = row?.password_hash ? await bcrypt.compare(body.password, row.password_hash) : false
      if (!row || !valid) return res.status(401).json({ error: 'Неверная почта или пароль.' })
      if (row.status !== 'active') return res.status(403).json({ error: 'Аккаунт отключён администратором.' })
      const now = new Date().toISOString()
      db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(now, now, row.id)
      createSession(req, res, row.id)
      audit(row.id, 'auth.login', 'user', row.id, { provider: 'password' }, req.ip)
      return res.json({ user: publicUserById(row.id) })
    } catch (error) { return next(error) }
  })

  router.post('/logout', (req, res) => {
    const auth = getAuth(req)
    revokeCurrentSession(req)
    clearSessionCookie(res)
    if (auth) audit(auth.user.id, 'auth.logout', 'session', auth.id, undefined, req.ip)
    res.status(204).end()
  })

  router.post('/logout-all', requireAuth, (req, res) => {
    const auth = authFrom(req)
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(new Date().toISOString(), auth.user.id)
    clearSessionCookie(res)
    audit(auth.user.id, 'auth.logout_all', 'user', auth.user.id, undefined, req.ip)
    res.status(204).end()
  })

  router.patch('/profile', requireAuth, (req, res, next) => {
    try {
      const auth = authFrom(req)
      const body = z.object({ displayName: nameSchema }).parse(req.body)
      db.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?').run(body.displayName, new Date().toISOString(), auth.user.id)
      audit(auth.user.id, 'profile.update', 'user', auth.user.id, { displayName: body.displayName }, req.ip)
      res.json({ user: publicUserById(auth.user.id) })
    } catch (error) { next(error) }
  })

  router.post('/password', authLimiter, requireAuth, async (req, res, next) => {
    try {
      const auth = authFrom(req)
      const body = z.object({ currentPassword: z.string().max(128).optional(), newPassword: passwordSchema }).parse(req.body)
      const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(auth.user.id) as any
      if (row.password_hash && (!body.currentPassword || !(await bcrypt.compare(body.currentPassword, row.password_hash)))) {
        return res.status(400).json({ error: 'Текущий пароль указан неверно.' })
      }
      const hash = await bcrypt.hash(body.newPassword, 12)
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, new Date().toISOString(), auth.user.id)
      audit(auth.user.id, 'profile.password_changed', 'user', auth.user.id, undefined, req.ip)
      return res.status(204).end()
    } catch (error) { return next(error) }
  })

  router.get('/sessions', requireAuth, (req, res) => {
    const auth = authFrom(req)
    const sessions = db.prepare(`
      SELECT id, created_at AS createdAt, last_seen_at AS lastSeenAt, expires_at AS expiresAt, user_agent AS userAgent, ip,
             CASE WHEN id = ? THEN 1 ELSE 0 END AS current
        FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_seen_at DESC
    `).all(auth.id, auth.user.id, new Date().toISOString())
    res.json({ sessions })
  })

  router.delete('/sessions/:id', requireAuth, (req, res) => {
    const auth = authFrom(req)
    const sessionId = String(req.params.id)
    const result = db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL').run(new Date().toISOString(), sessionId, auth.user.id)
    if (!result.changes) return res.status(404).json({ error: 'Сессия не найдена.' })
    if (sessionId === auth.id) clearSessionCookie(res)
    audit(auth.user.id, 'session.revoke', 'session', sessionId, undefined, req.ip)
    return res.status(204).end()
  })

  router.post('/admin-bootstrap', authLimiter, requireAuth, (req, res) => {
    const auth = authFrom(req)
    const configured = process.env.ADMIN_BOOTSTRAP_TOKEN || ''
    const supplied = typeof req.body?.token === 'string' ? req.body.token : ''
    const hasAdmin = Boolean(db.prepare("SELECT 1 FROM users WHERE role = 'admin' AND status = 'active'").get())
    if (hasAdmin) return res.status(409).json({ error: 'Администратор уже назначен.' })
    if (!configured || supplied.length !== configured.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(configured))) {
      return res.status(403).json({ error: 'Неверный код назначения администратора.' })
    }
    const now = new Date().toISOString()
    db.transaction(() => {
      db.prepare("UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?").run(now, auth.user.id)
      db.prepare("INSERT INTO site_settings (key, value, updated_at) VALUES ('owner_user_id', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
        .run(auth.user.id, now)
    })()
    audit(auth.user.id, 'owner.bootstrap', 'user', auth.user.id, undefined, req.ip)
    return res.json({ user: publicUserById(auth.user.id) })
  })

  router.get('/google/start', authLimiter, (req, res) => {
    if (!googleAvailable()) return res.redirect(`${safeRedirect(req.query.returnTo)}?authError=${encodeURIComponent('Вход через Google пока не настроен владельцем сайта.')}`)
    const state = randomSecret()
    const verifier = randomSecret(48)
    const nonce = randomSecret()
    const challenge = pkceChallenge(verifier)
    db.prepare('DELETE FROM oauth_states WHERE created_at < ?').run(new Date(Date.now() - 15 * 60_000).toISOString())
    db.prepare('INSERT INTO oauth_states (state_hash, verifier, nonce, redirect_path, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(hashSecret(state), verifier, nonce, safeRedirect(req.query.returnTo), new Date().toISOString())
    setOauthCookie(res, state)
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: `${publicUrl()}/api/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    })
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
  })

  router.get('/google/callback', authLimiter, async (req, res) => {
    const state = typeof req.query.state === 'string' ? req.query.state : ''
    const code = typeof req.query.code === 'string' ? req.query.code : ''
    const cookieState = oauthCookie(req)
    const fail = (message: string) => res.redirect(`/?authError=${encodeURIComponent(message)}`)
    if (!state || !cookieState || state.length !== cookieState.length || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(cookieState))) return fail('Проверка безопасности Google-входа не пройдена.')
    const record = db.prepare('SELECT * FROM oauth_states WHERE state_hash = ?').get(hashSecret(state)) as any
    db.prepare('DELETE FROM oauth_states WHERE state_hash = ?').run(hashSecret(state))
    if (!record || Date.now() - Date.parse(record.created_at) > 10 * 60_000 || !code) return fail('Ссылка Google-входа устарела. Попробуйте снова.')
    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: `${publicUrl()}/api/auth/google/callback`,
          grant_type: 'authorization_code',
          code_verifier: record.verifier,
        }),
      })
      if (!tokenResponse.ok) throw new Error('Google отклонил обмен кода авторизации.')
      const token = await tokenResponse.json() as { id_token?: string }
      if (!token.id_token) throw new Error('Google не вернул данные профиля.')
      const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
      const { payload } = await jwtVerify(token.id_token, jwks, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: process.env.GOOGLE_CLIENT_ID!,
      })
      if (payload.nonce !== record.nonce || !payload.sub || typeof payload.email !== 'string' || payload.email_verified !== true) throw new Error('Google не подтвердил почту аккаунта.')
      const email = payload.email.toLowerCase()
      let user = db.prepare('SELECT * FROM users WHERE google_sub = ? OR email = ?').get(payload.sub, email) as any
      const now = new Date().toISOString()
      if (!user) {
        const id = crypto.randomUUID()
        db.prepare(`INSERT INTO users (id, email, display_name, avatar_url, google_sub, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(id, email, String(payload.name || email.split('@')[0]).slice(0, 80), typeof payload.picture === 'string' ? payload.picture.slice(0, 1000) : null, payload.sub, now, now, now)
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
      } else {
        if (user.google_sub && user.google_sub !== payload.sub) throw new Error('Эта почта уже связана с другим Google-аккаунтом.')
        db.prepare('UPDATE users SET google_sub = ?, avatar_url = COALESCE(?, avatar_url), last_login_at = ?, updated_at = ? WHERE id = ?')
          .run(payload.sub, typeof payload.picture === 'string' ? payload.picture.slice(0, 1000) : null, now, now, user.id)
      }
      if (user.status !== 'active') return fail('Аккаунт отключён администратором.')
      createSession(req, res, user.id)
      audit(user.id, 'auth.login', 'user', user.id, { provider: 'google' }, req.ip)
      return res.redirect(`${safeRedirect(record.redirect_path)}?auth=google-success`)
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'Не удалось войти через Google.')
    }
  })

  return router
}
