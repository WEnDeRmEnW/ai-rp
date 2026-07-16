import { AlertCircle, Check, Cloud, Eye, EyeOff, KeyRound, Laptop, LogOut, RefreshCw, ShieldCheck, Smartphone, UserRound, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { authApi, type AccountSession } from '../lib/auth-api'
import { useApp } from '../state/AppContext'
import { useAuth } from '../state/AuthContext'

interface AccountDialogProps {
  open: boolean
  onClose: () => void
  onAdmin: () => void
}

function deviceName(userAgent: string) {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(userAgent)
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /Firefox\//.test(userAgent) ? 'Firefox' : /Chrome\//.test(userAgent) ? 'Chrome' : /Safari\//.test(userAgent) ? 'Safari' : 'Браузер'
  const os = /Android/.test(userAgent) ? 'Android' : /iPhone|iPad/.test(userAgent) ? 'iOS' : /Windows/.test(userAgent) ? 'Windows' : /Mac OS/.test(userAgent) ? 'macOS' : /Linux/.test(userAgent) ? 'Linux' : 'устройство'
  return { label: `${browser} · ${os}`, mobile }
}

const formatDate = (value: string) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

export function AccountDialog({ open, onClose, onAdmin }: AccountDialogProps) {
  const auth = useAuth()
  const app = useApp()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [section, setSection] = useState<'account' | 'devices' | 'security'>('account')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [bootstrapToken, setBootstrapToken] = useState('')
  const [sessions, setSessions] = useState<AccountSession[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  const oauthError = useMemo(() => new URLSearchParams(window.location.search).get('authError'), [open])

  useEffect(() => {
    if (!open || !auth.user || section !== 'devices') return
    void authApi.sessions().then((result) => setSessions(result.sessions)).catch((cause) => setError(cause instanceof Error ? cause.message : 'Не удалось загрузить устройства.'))
  }, [auth.user, open, section])

  useEffect(() => {
    if (open && auth.user) setDisplayName(auth.user.displayName)
  }, [auth.user, open])

  if (!open) return null

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true); setError(undefined); setNotice(undefined)
    try {
      if (mode === 'register') await auth.register(displayName, email, password)
      else await auth.login(email, password)
      setPassword('')
      setNotice('Готово. Локальные истории объединяются с облаком.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось войти.') }
    finally { setBusy(false) }
  }

  const saveProfile = async () => {
    setBusy(true); setError(undefined)
    try { await auth.updateProfile(displayName); setNotice('Имя сохранено.') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить профиль.') }
    finally { setBusy(false) }
  }

  const changePassword = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(undefined)
    try {
      await auth.changePassword(currentPassword, newPassword)
      setCurrentPassword(''); setNewPassword(''); setNotice('Пароль обновлён.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сменить пароль.') }
    finally { setBusy(false) }
  }

  const revoke = async (id: string) => {
    setBusy(true); setError(undefined)
    try {
      await authApi.revokeSession(id)
      if (id === auth.sessionId) { await auth.refresh(); onClose() }
      else setSessions((current) => current.filter((session) => session.id !== id))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось завершить сессию.') }
    finally { setBusy(false) }
  }

  const bootstrap = async () => {
    setBusy(true); setError(undefined)
    try { await auth.bootstrapAdmin(bootstrapToken); setBootstrapToken(''); setNotice('Админ-панель активирована.') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Неверный код.') }
    finally { setBusy(false) }
  }

  return <div className="modal-backdrop account-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="account-dialog" role="dialog" aria-modal="true" aria-label={auth.user ? 'Аккаунт' : 'Вход в аккаунт'}>
      <header className="account-heading">
        <div className="account-brand"><span className="brand-mark"><i /></span><div><b>Летопись</b><small>{auth.user ? 'Ваш аккаунт и синхронизация' : 'Продолжайте историю на любом устройстве'}</small></div></div>
        <button className="icon-button" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
      </header>

      {!auth.user ? <div className="auth-layout">
        <div className="auth-intro">
          <span className="auth-cloud"><Cloud size={27} /></span>
          <h2>Ваши миры всегда рядом</h2>
          <p>Истории сохраняются и на устройстве, и в вашем аккаунте. Можно начать на компьютере и продолжить с телефона.</p>
          <ul><li><Check size={15} /> автоматическая синхронизация</li><li><Check size={15} /> офлайн-копия остаётся у вас</li><li><Check size={15} /> отдельные данные каждого аккаунта</li></ul>
        </div>
        <form className="auth-form" onSubmit={submitAuth}>
          <div className="auth-switch"><button type="button" className={mode === 'login' ? 'is-active' : ''} onClick={() => { setMode('login'); setError(undefined) }}>Вход</button><button type="button" className={mode === 'register' ? 'is-active' : ''} onClick={() => { setMode('register'); setError(undefined) }}>Регистрация</button></div>
          <div><h2>{mode === 'login' ? 'С возвращением' : 'Создать аккаунт'}</h2><p>{mode === 'login' ? 'Войдите, чтобы открыть сохранённые миры.' : 'Это займёт меньше минуты.'}</p></div>
          {(error || oauthError) && <div className="form-message is-error"><AlertCircle size={15} />{error || oauthError}</div>}
          {notice && <div className="form-message is-success"><Check size={15} />{notice}</div>}
          {mode === 'register' && <label>Как вас называть<input autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Имя или псевдоним" required minLength={2} maxLength={80} /></label>}
          <label>Электронная почта<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.ru" required /></label>
          <label>Пароль<span className="password-input"><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Не меньше 8 символов" required minLength={mode === 'register' ? 8 : undefined} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label>
          <button className="auth-primary" disabled={busy}>{busy ? <RefreshCw className="spin" size={17} /> : <UserRound size={17} />}{mode === 'login' ? 'Войти' : 'Создать аккаунт'}</button>
          <div className="auth-divider"><span>или</span></div>
          <button className="google-button" type="button" disabled={!auth.googleAvailable || busy} onClick={() => { window.location.href = '/api/auth/google/start?returnTo=/' }}><span className="google-g">G</span>Продолжить с Google</button>
          {!auth.googleAvailable && <small className="google-hint">Google-вход появится после подключения OAuth владельцем сайта.</small>}
          {mode === 'register' && <small className="auth-legal">Создавая аккаунт, вы соглашаетесь с <a href="/terms" target="_blank">условиями</a> и <a href="/privacy" target="_blank">политикой конфиденциальности</a>. Администратор сервиса имеет доступ к историям для поддержки и модерации.</small>}
        </form>
      </div> : <div className="account-authenticated">
        <nav className="account-nav">
          <button className={section === 'account' ? 'is-active' : ''} onClick={() => setSection('account')}><UserRound size={17} />Профиль</button>
          <button className={section === 'devices' ? 'is-active' : ''} onClick={() => setSection('devices')}><Laptop size={17} />Устройства</button>
          <button className={section === 'security' ? 'is-active' : ''} onClick={() => setSection('security')}><KeyRound size={17} />Безопасность</button>
          {auth.user.role === 'admin' && <button className="account-admin-link" onClick={onAdmin}><ShieldCheck size={17} />Админ-панель</button>}
        </nav>
        <main className="account-content">
          {(error || notice) && <div className={`form-message ${error ? 'is-error' : 'is-success'}`}>{error ? <AlertCircle size={15} /> : <Check size={15} />}{error || notice}</div>}
          {section === 'account' && <>
            <div className="profile-hero">{auth.user.avatarUrl ? <img src={auth.user.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <span>{auth.user.displayName.slice(0, 1).toUpperCase()}</span>}<div><h2>{auth.user.displayName}</h2><p>{auth.user.email}</p><div className="provider-badges">{auth.user.hasPassword && <i>Пароль</i>}{auth.user.hasGoogle && <i>Google</i>}{auth.user.isOwner ? <i className="is-owner">Владелец · создатель</i> : auth.user.role === 'admin' && <i className="is-admin">Администратор</i>}</div></div></div>
            <div className={`sync-card is-${app.syncState}`}><span>{app.syncState === 'syncing' ? <RefreshCw className="spin" size={19} /> : <Cloud size={19} />}</span><div><b>{app.syncState === 'synced' ? 'Облако синхронизировано' : app.syncState === 'error' ? 'Работаем с локальной копией' : app.syncState === 'syncing' ? 'Идёт синхронизация' : 'Хранится на этом устройстве'}</b><small>{app.syncMessage || 'Ваши истории сохраняются автоматически.'}</small></div>{app.syncState !== 'syncing' && <button onClick={() => void app.syncNow()}><RefreshCw size={15} />Обновить</button>}</div>
            <label className="account-field">Отображаемое имя<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} /></label>
            <div className="account-actions"><button className="auth-primary" disabled={busy || displayName.trim() === auth.user.displayName} onClick={() => void saveProfile()}>Сохранить</button><button className="quiet-danger" onClick={() => void auth.logout().then(onClose)}><LogOut size={15} />Выйти</button></div>
            {auth.needsAdminBootstrap && <div className="bootstrap-card"><ShieldCheck size={21} /><div><b>Назначить первого администратора</b><p>Введите одноразовый код, полученный при развёртывании сервера.</p><span><input type="password" value={bootstrapToken} onChange={(event) => setBootstrapToken(event.target.value)} placeholder="Код активации" /><button disabled={!bootstrapToken || busy} onClick={() => void bootstrap()}>Активировать</button></span></div></div>}
          </>}
          {section === 'devices' && <>
            <div className="section-heading"><div><h2>Активные устройства</h2><p>Завершите незнакомую или старую сессию одним нажатием.</p></div><button className="compact-button" onClick={() => void authApi.sessions().then((result) => setSessions(result.sessions))}><RefreshCw size={14} />Обновить</button></div>
            <div className="session-list">{sessions.map((session) => { const device = deviceName(session.userAgent); return <article key={session.id}><span className="device-icon">{device.mobile ? <Smartphone size={19} /> : <Laptop size={19} />}</span><div><b>{device.label} {session.current ? <em>Это устройство</em> : null}</b><small>Последняя активность: {formatDate(session.lastSeenAt)}</small><small>{session.ip || 'IP не определён'}</small></div><button disabled={busy} onClick={() => void revoke(session.id)}>Завершить</button></article> })}</div>
          </>}
          {section === 'security' && <>
            <div className="section-heading"><div><h2>Пароль и доступ</h2><p>{auth.user.hasPassword ? 'Обновите пароль аккаунта.' : 'Добавьте пароль к аккаунту Google.'}</p></div></div>
            <form className="password-form" onSubmit={changePassword}>{auth.user.hasPassword && <label>Текущий пароль<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>}<label>Новый пароль<input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label><button className="auth-primary" disabled={busy}>Обновить пароль</button></form>
            <div className="security-danger"><div><b>Выйти на всех устройствах</b><p>Все активные входы, включая этот, будут завершены.</p></div><button disabled={busy} onClick={() => void auth.logoutAll().then(onClose)}>Выйти везде</button></div>
          </>}
        </main>
      </div>}
    </section>
  </div>
}
