import {
  Backpack, BookOpen, BookOpenText, Command, History, LayoutDashboard, MapPin, Maximize2,
  PanelLeft, PanelRight, PencilRuler, Plus, RotateCcw, Search, Settings2, UserRound, X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Campaign } from '../../shared/types'
import type { InspectorTab } from './Inspector'

interface PaletteAction {
  id: string
  label: string
  detail: string
  group: string
  icon: LucideIcon
  disabled?: boolean
  run: () => void
}

interface CommandPaletteProps {
  open: boolean
  campaign: Campaign
  campaigns: Campaign[]
  focusMode: boolean
  canUndo: boolean
  onClose: () => void
  onFocusMode: () => void
  onSidebar: () => void
  onInspector: () => void
  onInspectorTab: (tab: InspectorTab) => void
  onSelectCampaign: (id: string) => void
  onNew: () => void
  onSettings: () => void
  onEdit: () => void
  onUndo: () => void
}

export function CommandPalette(props: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const paletteOpen = props.open
  const closePalette = props.onClose

  const actions = useMemo<PaletteAction[]>(() => {
    const openTab = (tab: InspectorTab) => {
      props.onInspectorTab(tab)
      props.onClose()
    }
    return [
      { id: 'focus', label: props.focusMode ? 'Выйти из режима чтения' : 'Режим чтения', detail: 'Оставить историю и поле ввода без отвлекающих панелей', group: 'Вид', icon: Maximize2, run: () => { props.onFocusMode(); props.onClose() } },
      { id: 'left', label: 'Показать или скрыть список кампаний', detail: 'Левая панель с вашими мирами', group: 'Вид', icon: PanelLeft, run: () => { props.onSidebar(); props.onClose() } },
      { id: 'right', label: 'Показать или скрыть сведения', detail: 'Правая панель состояния кампании', group: 'Вид', icon: PanelRight, run: () => { props.onInspector(); props.onClose() } },
      { id: 'dashboard', label: 'Открыть Пульт мира', detail: 'Текущая сцена, ставки, живые процессы, механики и уникальные показатели', group: 'Разделы', icon: LayoutDashboard, run: () => openTab('dashboard') },
      { id: 'scene', label: 'Открыть текущую сцену', detail: 'Персонажи рядом, миссии и последствия', group: 'Разделы', icon: MapPin, run: () => openTab('scene') },
      { id: 'hero', label: 'Открыть персонажа', detail: 'Ресурсы, характеристики и способности', group: 'Разделы', icon: UserRound, run: () => openTab('hero') },
      { id: 'inventory', label: 'Открыть снаряжение', detail: `${props.campaign.inventory.length} предметов в текущей кампании`, group: 'Разделы', icon: Backpack, run: () => openTab('inventory') },
      { id: 'changes', label: 'Открыть журнал изменений', detail: 'Что именно изменилось по ходам', group: 'Разделы', icon: History, run: () => openTab('changes') },
      { id: 'world', label: 'Открыть мир', detail: 'Фракции, законы, механики, память и лор', group: 'Разделы', icon: BookOpen, run: () => openTab('world') },
      { id: 'new', label: 'Создать новую историю', detail: 'Открыть кузницу мира', group: 'Действия', icon: Plus, run: () => { props.onNew(); props.onClose() } },
      { id: 'edit', label: 'Редактировать кампанию', detail: 'Ручная или ИИ-корректировка без сюжетного хода', group: 'Действия', icon: PencilRuler, run: () => { props.onEdit(); props.onClose() } },
      { id: 'settings', label: 'Открыть настройки', detail: 'Модель, рассказчик и внешний вид', group: 'Действия', icon: Settings2, run: () => { props.onSettings(); props.onClose() } },
      { id: 'undo', label: 'Отменить последний ход', detail: 'Вернуть состояние перед последним ответом', group: 'Действия', icon: RotateCcw, disabled: !props.canUndo, run: () => { if (props.canUndo) props.onUndo(); props.onClose() } },
      ...props.campaigns.map((campaign) => ({ id: `campaign-${campaign.id}`, label: campaign.title, detail: `${campaign.scene.location} · ход ${campaign.turn}`, group: 'Ваши миры', icon: BookOpenText, run: () => { props.onSelectCampaign(campaign.id); props.onClose() } })),
    ]
  }, [props])

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru-RU')
    if (!normalized) return actions
    return actions.filter((action) => `${action.label} ${action.detail} ${action.group}`.toLocaleLowerCase('ru-RU').includes(normalized))
  }, [actions, query])

  useEffect(() => {
    if (!props.open) return
    setQuery('')
    setSelected(0)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [props.open])

  useEffect(() => setSelected((current) => Math.min(current, Math.max(0, visible.length - 1))), [visible.length])

  useEffect(() => {
    if (!paletteOpen) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') closePalette() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [closePalette, paletteOpen])

  if (!props.open) return null
  return <div className="command-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose() }}>
    <section className="command-palette" role="dialog" aria-modal="true" aria-label="Быстрые действия">
      <header><Command size={18} /><div><strong>Быстрые действия</strong><span>Переходите куда нужно, не разыскивая кнопки</span></div><button onClick={props.onClose} aria-label="Закрыть"><X size={17} /></button></header>
      <label className="command-search"><Search size={17} /><input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setSelected(0) }} onKeyDown={(event) => {
        if (event.key === 'Escape') props.onClose()
        if (event.key === 'ArrowDown') { event.preventDefault(); setSelected((value) => Math.min(visible.length - 1, value + 1)) }
        if (event.key === 'ArrowUp') { event.preventDefault(); setSelected((value) => Math.max(0, value - 1)) }
        if (event.key === 'Enter' && visible[selected] && !visible[selected].disabled) { event.preventDefault(); visible[selected].run() }
      }} placeholder="Например: снаряжение, настройки, новая история…" /><kbd>Esc</kbd></label>
      <div className="command-results">
        {visible.map((action, index) => {
          const Icon = action.icon
          const showGroup = index === 0 || visible[index - 1].group !== action.group
          return <div className="command-result-wrap" key={action.id}>{showGroup && <div className="command-group">{action.group}</div>}<button className={selected === index ? 'is-selected' : ''} disabled={action.disabled} onMouseEnter={() => setSelected(index)} onClick={action.run}><span><Icon size={17} /></span><div><strong>{action.label}</strong><small>{action.detail}</small></div>{selected === index && <kbd>Enter</kbd>}</button></div>
        })}
        {!visible.length && <div className="command-empty">Ничего не найдено. Попробуйте более короткий запрос.</div>}
      </div>
      <footer><span><kbd>↑</kbd><kbd>↓</kbd> выбор</span><span><kbd>Enter</kbd> открыть</span><span><kbd>Ctrl</kbd><b>+</b><kbd>K</kbd> в любое время</span></footer>
    </section>
  </div>
}
