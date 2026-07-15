import { Cloud, Command, Maximize2, Menu, Minimize2, MoreHorizontal, PanelLeftClose, PanelRight, PencilRuler, RotateCcw, Settings2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Campaign } from '../../shared/types'

interface TopBarProps {
  campaign: Campaign
  canUndo: boolean
  sidebarOpen: boolean
  inspectorOpen: boolean
  focusMode: boolean
  onMenu: () => void
  onInspector: () => void
  onUndo: () => void
  onSettings: () => void
  onEdit: () => void
  onFocusMode: () => void
  onCommand: () => void
}

export function TopBar({ campaign, canUndo, sidebarOpen, inspectorOpen, focusMode, onMenu, onInspector, onUndo, onSettings, onEdit, onFocusMode, onCommand }: TopBarProps) {
  const [overflowOpen, setOverflowOpen] = useState(false)
  const overflowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!overflowOpen) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return
      if (event instanceof MouseEvent && overflowRef.current?.contains(event.target as Node)) return
      setOverflowOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [overflowOpen])
  return (
    <header className="topbar">
      <button className={`icon-button sidebar-toggle ${sidebarOpen ? 'is-active' : ''}`} onClick={onMenu} aria-label={sidebarOpen ? 'Скрыть кампании' : 'Показать кампании'} title={sidebarOpen ? 'Скрыть левую панель' : 'Показать левую панель'}>{sidebarOpen ? <PanelLeftClose size={19} /> : <Menu size={20} />}</button>
      <div className="topbar-title">
        <strong>{campaign.scene.title}</strong>
        <span>{campaign.title} <i>•</i> {campaign.scene.location} <i>•</i> {campaign.scene.time}</span>
      </div>
      <div className="save-state"><i /><Cloud size={13} /> <span>Сохранено на устройстве</span></div>
      <div className="topbar-actions">
        <button className="command-button" onClick={onCommand} aria-label="Открыть быстрые действия" title="Быстрые действия (Ctrl+K)"><Command size={15} /><span>Действия</span><kbd>Ctrl K</kbd></button>
        <span className="topbar-divider" />
        <button className="icon-button" disabled={!canUndo} onClick={onUndo} aria-label="Отменить последний ход" title="Отменить ход"><RotateCcw size={18} /></button>
        <button className={`icon-button desktop-only ${focusMode ? 'is-active' : ''}`} onClick={onFocusMode} aria-label={focusMode ? 'Выйти из режима чтения' : 'Включить режим чтения'} title={focusMode ? 'Вернуть панели' : 'Режим чтения'}>{focusMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
        <button className={`icon-button ${inspectorOpen ? 'is-active' : ''}`} onClick={onInspector} aria-label={inspectorOpen ? 'Скрыть сведения о мире' : 'Показать сведения о мире'} title={inspectorOpen ? 'Скрыть правую панель' : 'Показать правую панель'}><PanelRight size={18} /></button>
        <button className="icon-button desktop-only" onClick={onEdit} aria-label="Редактировать кампанию" title="Мастерская кампании"><PencilRuler size={17} /></button>
        <button className="icon-button desktop-only" onClick={onSettings} aria-label="Настройки кампании"><Settings2 size={18} /></button>
        <div className="topbar-overflow-wrap mobile-only" ref={overflowRef}><button className={`icon-button ${overflowOpen ? 'is-active' : ''}`} onClick={() => setOverflowOpen((value) => !value)} aria-label="Другие действия" aria-expanded={overflowOpen}><MoreHorizontal size={19} /></button>{overflowOpen && <div className="topbar-overflow" role="menu"><button role="menuitem" onClick={() => { onCommand(); setOverflowOpen(false) }}><Command size={16} /> Быстрые действия</button><button role="menuitem" onClick={() => { onEdit(); setOverflowOpen(false) }}><PencilRuler size={16} /> Мастерская кампании</button><button role="menuitem" onClick={() => { onFocusMode(); setOverflowOpen(false) }}>{focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />} {focusMode ? 'Вернуть панели' : 'Режим чтения'}</button><button role="menuitem" onClick={() => { onSettings(); setOverflowOpen(false) }}><Settings2 size={16} /> Настройки</button></div>}</div>
      </div>
    </header>
  )
}
