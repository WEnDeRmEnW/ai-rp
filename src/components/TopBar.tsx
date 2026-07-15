import { Cloud, Command, Maximize2, Menu, Minimize2, MoreHorizontal, PanelLeftClose, PanelRight, PencilRuler, RotateCcw, Settings2 } from 'lucide-react'
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
        <button className={`icon-button ${focusMode ? 'is-active' : ''}`} onClick={onFocusMode} aria-label={focusMode ? 'Выйти из режима чтения' : 'Включить режим чтения'} title={focusMode ? 'Вернуть панели' : 'Режим чтения'}>{focusMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
        <button className={`icon-button ${inspectorOpen ? 'is-active' : ''}`} onClick={onInspector} aria-label={inspectorOpen ? 'Скрыть сведения о мире' : 'Показать сведения о мире'} title={inspectorOpen ? 'Скрыть правую панель' : 'Показать правую панель'}><PanelRight size={18} /></button>
        <button className="icon-button" onClick={onEdit} aria-label="Редактировать кампанию" title="Мастерская кампании"><PencilRuler size={17} /></button>
        <button className="icon-button desktop-only" onClick={onSettings} aria-label="Настройки кампании"><Settings2 size={18} /></button>
        <button className="icon-button mobile-only" onClick={onSettings} aria-label="Другие действия"><MoreHorizontal size={19} /></button>
      </div>
    </header>
  )
}
