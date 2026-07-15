import { BookOpenText, Download, MoreHorizontal, Plus, Search, Settings2, Sparkles, Trash2, Upload, GitBranch, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { Campaign, ProviderConfig } from '../../shared/types'
import { downloadCampaign, downloadCampaignBook } from '../lib/storage'

interface SidebarProps {
  campaigns: Campaign[]
  activeId?: string
  provider: ProviderConfig
  mobileOpen: boolean
  onCloseMobile: () => void
  onSelect: (id: string) => void
  onNew: () => void
  onSettings: () => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onImport: (file: File) => void
}

function relativeDate(value: string) {
  const diff = Date.now() - new Date(value).getTime()
  if (diff < 60_000) return 'только что'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин назад`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ч назад`
  return new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' }).format(new Date(value))
}

export function Sidebar(props: SidebarProps) {
  const [menuId, setMenuId] = useState<string>()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const providerLabel = props.provider.provider === 'demo' ? 'Демо-рассказчик' : props.provider.model
  const visibleCampaigns = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru-RU')
    if (!normalized) return props.campaigns
    return props.campaigns.filter((campaign) => `${campaign.title} ${campaign.world.name} ${campaign.scene.title} ${campaign.scene.location}`.toLocaleLowerCase('ru-RU').includes(normalized))
  }, [props.campaigns, query])

  return (
    <>
      {props.mobileOpen && <button className="mobile-scrim" onClick={props.onCloseMobile} aria-label="Закрыть список кампаний" />}
      <aside className={`sidebar ${props.mobileOpen ? 'sidebar--mobile-open' : ''}`} aria-label="Кампании">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><span /></div>
          <div>
            <div className="brand-name">Летопись</div>
            <div className="brand-caption">живые истории</div>
          </div>
        </div>

        <button className="new-story-button" onClick={props.onNew}>
          <Plus size={18} />
          Новая история
        </button>

        <label className="sidebar-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти мир…" aria-label="Найти кампанию" />{query && <button onClick={() => setQuery('')} aria-label="Очистить поиск"><X size={13} /></button>}</label>
        <div className="sidebar-section-label"><span>Ваши миры</span><b>{visibleCampaigns.length}</b></div>
        <nav className="campaign-list">
          {visibleCampaigns.map((campaign) => (
            <div className={`campaign-row ${campaign.id === props.activeId ? 'is-active' : ''}`} key={campaign.id}>
              <button className="campaign-select" onClick={() => { props.onSelect(campaign.id); props.onCloseMobile() }}>
                <span className="campaign-glyph"><BookOpenText size={16} /></span>
                <span className="campaign-copy">
                  <strong>{campaign.title}</strong>
                  <span>{campaign.scene.location}</span>
                  <small>Ход {campaign.turn} · {relativeDate(campaign.updatedAt)}</small>
                </span>
              </button>
              <button className="campaign-more" aria-label={`Действия: ${campaign.title}`} onClick={() => setMenuId(menuId === campaign.id ? undefined : campaign.id)}>
                <MoreHorizontal size={17} />
              </button>
              {menuId === campaign.id && (
                <div className="context-menu">
                  <button onClick={() => { props.onDuplicate(campaign.id); setMenuId(undefined) }}><GitBranch size={15} /> Создать ветку</button>
                  <button onClick={() => { downloadCampaign(campaign); setMenuId(undefined) }}><Download size={15} /> Экспорт</button>
                  <button onClick={() => { downloadCampaignBook(campaign); setMenuId(undefined) }}><BookOpenText size={15} /> Книга Markdown</button>
                  <button className="danger-action" onClick={() => {
                    if (window.confirm(`Удалить кампанию «${campaign.title}»?`)) props.onDelete(campaign.id)
                    setMenuId(undefined)
                  }}><Trash2 size={15} /> Удалить</button>
                </div>
              )}
            </div>
          ))}
          {!visibleCampaigns.length && <div className="sidebar-empty"><Search size={18} /><strong>Мир не найден</strong><span>Попробуйте название, место или сцену.</span></div>}
        </nav>

        <div className="sidebar-footer">
          <input ref={inputRef} className="visually-hidden" type="file" accept=".json,.letopis" onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) props.onImport(file)
            event.currentTarget.value = ''
          }} />
          <button className="sidebar-link" onClick={() => inputRef.current?.click()}><Upload size={17} /> Импорт кампании</button>
          <button className="sidebar-link" onClick={props.onSettings}><Settings2 size={17} /> Настройки</button>
          <div className="model-pill" title={providerLabel}>
            <span className={`status-dot ${props.provider.provider === 'demo' ? 'is-demo' : ''}`} />
            <Sparkles size={14} />
            <span><b>Рассказчик</b>{providerLabel}</span>
          </div>
        </div>
      </aside>
    </>
  )
}
