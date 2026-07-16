import { Activity, AlertTriangle, BookOpen, ChevronLeft, Database, Download, Eye, FileClock, LogOut, RefreshCw, Search, ShieldCheck, Smartphone, Trash2, UserCog, Users, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { Campaign } from '../../shared/types'
import { adminRequest } from '../lib/auth-api'

interface AdminPanelProps { open: boolean; onClose: () => void }
type Section = 'overview' | 'users' | 'campaigns' | 'audit'
interface Stats { users: number; campaigns: number; activeSessions: number; newUsers24h: number; messages: number; turns: number; storageBytes: number }
interface AdminUser { id: string; email: string; displayName: string; role: 'user' | 'admin'; isOwner: boolean; status: 'active' | 'disabled'; createdAt: string; lastLoginAt?: string; campaignCount: number; sessionCount: number }
interface CampaignRow { id: string; userId: string; title: string; turn: number; updatedAt: string; bytes: number; email: string; displayName: string }
interface AuditRow { id: number; action: string; targetType: string; targetId?: string; detailJson?: string; ip: string; createdAt: string; actorEmail?: string; actorName?: string }

const fmt = (value: string) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
const bytes = (value: number) => value < 1024 ? `${value} Б` : value < 1024 ** 2 ? `${(value / 1024).toFixed(1)} КБ` : `${(value / 1024 ** 2).toFixed(1)} МБ`
const actionLabels: Record<string, string> = {
  'auth.register': 'Регистрация', 'auth.login': 'Вход', 'auth.logout': 'Выход', 'auth.logout_all': 'Выход со всех устройств',
  'sync.reconcile': 'Синхронизация', 'campaign.delete': 'История удалена', 'admin.campaign_delete': 'История удалена администратором',
  'admin.user_update': 'Права пользователя изменены', 'admin.session_revoke': 'Сессия завершена', 'profile.update': 'Профиль изменён',
  'profile.password_changed': 'Пароль изменён', 'admin.bootstrap': 'Назначен первый администратор',
}

export function AdminPanel({ open, onClose }: AdminPanelProps) {
  const [section, setSection] = useState<Section>('overview')
  const [stats, setStats] = useState<Stats>()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<{ campaign: Campaign; owner: { email: string; displayName: string }; serverUpdatedAt: string }>()
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    if (!open) return
    setBusy(true); setError(undefined)
    try {
      if (section === 'overview') setStats(await adminRequest<Stats>('/stats'))
      if (section === 'users') setUsers((await adminRequest<{ users: AdminUser[] }>(`/users?q=${encodeURIComponent(search)}`)).users)
      if (section === 'campaigns') setCampaigns((await adminRequest<{ campaigns: CampaignRow[] }>(`/campaigns?q=${encodeURIComponent(search)}`)).campaigns)
      if (section === 'audit') setAudit((await adminRequest<{ entries: AuditRow[] }>('/audit?limit=80')).entries)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось загрузить данные.') }
    finally { setBusy(false) }
  }, [open, search, section])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!open || (section !== 'users' && section !== 'campaigns')) return
    const timer = window.setTimeout(() => void load(), 300)
    return () => window.clearTimeout(timer)
  }, [load, open, search, section])

  if (!open) return null

  const updateUser = async (user: AdminUser, patch: { role?: 'user' | 'admin'; status?: 'active' | 'disabled' }) => {
    if (!window.confirm(patch.status === 'disabled' ? `Отключить аккаунт ${user.email}?` : 'Применить изменение прав?')) return
    setBusy(true); setError(undefined)
    try {
      const result = await adminRequest<{ user: AdminUser }>(`/users/${user.id}`, { method: 'PATCH', body: JSON.stringify(patch), headers: { 'content-type': 'application/json' } })
      setUsers((current) => current.map((entry) => entry.id === user.id ? { ...entry, ...result.user } : entry))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось изменить пользователя.') }
    finally { setBusy(false) }
  }

  const openCampaign = async (row: CampaignRow) => {
    setBusy(true); setError(undefined)
    try { setSelectedCampaign(await adminRequest(`/campaigns/${row.userId}/${row.id}`)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось открыть историю.') }
    finally { setBusy(false) }
  }

  const deleteCampaign = async (row: CampaignRow) => {
    if (!window.confirm(`Безвозвратно удалить историю «${row.title}» из облака?`)) return
    setBusy(true)
    try { await adminRequest<void>(`/campaigns/${row.userId}/${row.id}`, { method: 'DELETE' }); setCampaigns((current) => current.filter((entry) => entry.id !== row.id || entry.userId !== row.userId)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось удалить историю.') }
    finally { setBusy(false) }
  }

  const download = () => {
    if (!selectedCampaign) return
    const blob = new Blob([JSON.stringify(selectedCampaign.campaign, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${selectedCampaign.campaign.title}.json`; link.click(); URL.revokeObjectURL(url)
  }

  return <div className="admin-shell" role="dialog" aria-modal="true" aria-label="Админ-панель">
    <aside className="admin-sidebar">
      <div className="admin-logo"><span><ShieldCheck size={19} /></span><div><b>Управление</b><small>Летопись</small></div></div>
      <nav>
        <button className={section === 'overview' ? 'is-active' : ''} onClick={() => { setSection('overview'); setSelectedCampaign(undefined) }}><Activity size={17} />Обзор</button>
        <button className={section === 'users' ? 'is-active' : ''} onClick={() => { setSection('users'); setSelectedCampaign(undefined); setSearch('') }}><Users size={17} />Пользователи</button>
        <button className={section === 'campaigns' ? 'is-active' : ''} onClick={() => { setSection('campaigns'); setSelectedCampaign(undefined); setSearch('') }}><BookOpen size={17} />Истории и переписки</button>
        <button className={section === 'audit' ? 'is-active' : ''} onClick={() => { setSection('audit'); setSelectedCampaign(undefined) }}><FileClock size={17} />Журнал действий</button>
      </nav>
      <button className="admin-exit" onClick={onClose}><LogOut size={16} />Вернуться в историю</button>
    </aside>
    <main className="admin-main">
      <header className="admin-top"><div><span>Администрирование</span><h1>{selectedCampaign ? selectedCampaign.campaign.title : section === 'overview' ? 'Состояние сервиса' : section === 'users' ? 'Пользователи' : section === 'campaigns' ? 'Истории и переписки' : 'Журнал действий'}</h1></div><div>{busy && <RefreshCw className="spin" size={17} />}<button className="icon-button" onClick={onClose}><X size={19} /></button></div></header>
      {error && <div className="admin-error"><AlertTriangle size={17} />{error}<button onClick={() => setError(undefined)}><X size={14} /></button></div>}
      <div className="admin-content">
        {selectedCampaign ? <section className="admin-conversation">
          <div className="conversation-toolbar"><button onClick={() => setSelectedCampaign(undefined)}><ChevronLeft size={16} />К списку</button><div><span>Владелец: <b>{selectedCampaign.owner.displayName}</b> · {selectedCampaign.owner.email}</span><span>Ход {selectedCampaign.campaign.turn} · {selectedCampaign.campaign.messages.length} сообщений</span></div><button onClick={download}><Download size={15} />Экспорт</button></div>
          <div className="conversation-meta"><article><span>Мир</span><b>{selectedCampaign.campaign.world.name}</b></article><article><span>Герой</span><b>{selectedCampaign.campaign.player.name}</b></article><article><span>Последняя сцена</span><b>{selectedCampaign.campaign.scene.title}</b></article><article><span>Обновлено</span><b>{fmt(selectedCampaign.serverUpdatedAt)}</b></article></div>
          <div className="conversation-messages">{selectedCampaign.campaign.messages.length ? selectedCampaign.campaign.messages.map((message) => <article className={`is-${message.role}`} key={message.id}><header><b>{message.role === 'user' ? selectedCampaign.campaign.player.name : 'Мир отвечает'}</b><span>Ход {message.turn}</span></header><p>{message.content}</p></article>) : <div className="admin-empty">В этой истории пока нет сообщений.</div>}</div>
        </section> : <>
          {section === 'overview' && stats && <>
            <div className="stats-grid"><article><span><Users size={18} /></span><div><small>Пользователи</small><b>{stats.users}</b><em>+{stats.newUsers24h} за сутки</em></div></article><article><span><BookOpen size={18} /></span><div><small>Истории</small><b>{stats.campaigns}</b><em>{stats.turns} ходов</em></div></article><article><span><Smartphone size={18} /></span><div><small>Активные сессии</small><b>{stats.activeSessions}</b><em>сейчас</em></div></article><article><span><Database size={18} /></span><div><small>Облачные данные</small><b>{bytes(stats.storageBytes)}</b><em>{stats.messages} сообщений</em></div></article></div>
            <div className="admin-overview-grid"><article><h2>Что доступно администратору</h2><ul><li><CheckLine />Поиск аккаунтов, историй и владельцев</li><li><CheckLine />Просмотр переписки и состояния мира</li><li><CheckLine />Завершение подозрительных сессий</li><li><CheckLine />Отключение аккаунтов и управление ролями</li><li><CheckLine />Экспорт и удаление облачной истории</li><li><CheckLine />Аудит важных действий</li></ul></article><article className="privacy-note"><ShieldCheck size={25} /><h2>Приватность игроков</h2><p>Переписки доступны только администраторам. Используйте просмотр лишь для поддержки, безопасности и модерации. Доступ фиксируется в журнале.</p></article></div>
          </>}
          {(section === 'users' || section === 'campaigns') && <div className="admin-tools"><label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={section === 'users' ? 'Имя или электронная почта' : 'Название истории или владелец'} /></label><button onClick={() => void load()}><RefreshCw size={15} />Обновить</button></div>}
          {section === 'users' && <div className="admin-card-list">{users.map((user) => <article key={user.id} className={user.status === 'disabled' ? 'is-disabled' : ''}><div className="admin-user-avatar">{user.displayName.slice(0, 1).toUpperCase()}</div><div className="admin-card-main"><b>{user.displayName}<span className={user.isOwner ? 'role-owner' : `role-${user.role}`}>{user.isOwner ? 'Владелец' : user.role === 'admin' ? 'Администратор' : 'Игрок'}</span>{user.status === 'disabled' && <span className="status-disabled">Отключён</span>}</b><small>{user.email}</small><p>{user.campaignCount} историй · {user.sessionCount} активных устройств · вход {user.lastLoginAt ? fmt(user.lastLoginAt) : 'ещё не выполнялся'}</p></div>{!user.isOwner && <div className="admin-row-actions"><button onClick={() => void updateUser(user, { role: user.role === 'admin' ? 'user' : 'admin' })}><UserCog size={15} />{user.role === 'admin' ? 'Снять права' : 'Сделать админом'}</button><button className="danger" onClick={() => void updateUser(user, { status: user.status === 'active' ? 'disabled' : 'active' })}>{user.status === 'active' ? 'Отключить' : 'Включить'}</button></div>}</article>)}</div>}
          {section === 'campaigns' && <div className="admin-card-list campaign-admin-list">{campaigns.map((campaign) => <article key={`${campaign.userId}-${campaign.id}`}><span className="campaign-admin-icon"><BookOpen size={18} /></span><div className="admin-card-main"><b>{campaign.title}</b><small>{campaign.displayName} · {campaign.email}</small><p>Ход {campaign.turn} · {bytes(campaign.bytes)} · обновлено {fmt(campaign.updatedAt)}</p></div><div className="admin-row-actions"><button onClick={() => void openCampaign(campaign)}><Eye size={15} />Открыть</button><button className="danger icon-danger" onClick={() => void deleteCampaign(campaign)} title="Удалить"><Trash2 size={15} /></button></div></article>)}</div>}
          {section === 'audit' && <div className="audit-list">{audit.map((entry) => <article key={entry.id}><span><FileClock size={15} /></span><div><b>{actionLabels[entry.action] || entry.action}</b><small>{entry.actorName || 'Система'} {entry.actorEmail ? `· ${entry.actorEmail}` : ''}</small><p>{entry.targetType}{entry.targetId ? ` · ${entry.targetId}` : ''}{entry.ip ? ` · ${entry.ip}` : ''}</p></div><time>{fmt(entry.createdAt)}</time></article>)}</div>}
          {!busy && ((section === 'users' && !users.length) || (section === 'campaigns' && !campaigns.length) || (section === 'audit' && !audit.length)) && <div className="admin-empty">Ничего не найдено.</div>}
        </>}
      </div>
    </main>
  </div>
}

function CheckLine() { return <span className="check-line">✓</span> }
