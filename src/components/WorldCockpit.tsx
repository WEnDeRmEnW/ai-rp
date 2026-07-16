import {
  Activity, ArrowDown, ArrowUp, BookOpenCheck, BrainCircuit, ChevronRight, CircleGauge, Eye,
  EyeOff, Gauge, LayoutDashboard, MapPin, Orbit, Pin, PinOff, RefreshCw, Settings2, ShieldAlert,
  Sparkles, Swords, Trash2, WandSparkles,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type {
  AdaptiveInterfacePlacement, Campaign, DashboardSectionId, InspectorTabId, WorldInterfaceBlueprint,
} from '../../shared/types'
import { adaptiveInterfaceBindingIssues } from '../lib/adaptive-interface'
import { uiLabel } from '../lib/ui-labels'
import { getWorldInterfaceBlueprint } from '../lib/world-customization'
import { AdaptiveWorldModules } from './AdaptiveWorldModules'
import { Modal } from './Modal'

interface WorldCockpitProps {
  campaign: Campaign
  onNavigate: (tab: InspectorTabId) => void
  onUpdate: (updater: (campaign: Campaign) => Campaign) => Promise<void>
  onDesign?: (instruction: string) => void
  designing?: boolean
}

const sectionLabels: Record<DashboardSectionId, string> = {
  scene: 'Командный центр сцены',
  stakes: 'Ставки и давление',
  modules: 'Уникальные системы мира',
  worldPulse: 'Пульс мира',
  openLoops: 'Открытые линии',
  mechanics: 'Законы и показатели',
  interfaceHealth: 'Управление пультом',
}

const placementLabels: Record<AdaptiveInterfacePlacement, string> = {
  dashboard: 'Пульт',
  scene: 'Сцена',
  hero: 'Герой',
  inventory: 'Рюкзак',
  world: 'Мир',
}

const tabLabels: Record<InspectorTabId, string> = {
  dashboard: 'Пульт', scene: 'Сцена', hero: 'Герой', inventory: 'Рюкзак', changes: 'Изменения', world: 'Мир',
}

const designPresets = [
  {
    icon: LayoutDashboard,
    title: 'Пересобрать весь пульт',
    text: 'Проанализируй весь фактический мир и полностью пересобери правую панель: blueprint вкладок, порядок секций, уникальные метрики и адаптивные модули. Сохрани закреплённые пользователем модули. Не меняй сюжетные факты.',
  },
  {
    icon: Orbit,
    title: 'Добавить механики мира',
    text: 'Найди важные уникальные циклы, риски и системы именно этого мира. Создай для них настоящие world.metrics с причинными правилами обновления и удобные живые модули. Не дублируй обычные HP, инвентарь и характеристики.',
  },
  {
    icon: RefreshCw,
    title: 'Починить связи',
    text: 'Проверь все адаптивные модули и их живые привязки. Исправь или удали только сломанные элементы, привяжи их к существующим точным сущностям и сохрани остальной дизайн без изменений.',
  },
  {
    icon: Swords,
    title: 'Подстроить под текущую сцену',
    text: 'Адаптируй пульт под текущую сцену и её реальные ставки: выведи важные угрозы, ресурсы, контрмеры и выходы, но не раскрывай скрытые сведения и не удаляй полезные постоянные модули.',
  },
] as const

function CockpitSection({ title, icon, children, action }: { title: string; icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return <section className="cockpit-section">
    <header><span>{icon}<strong>{title}</strong></span>{action}</header>
    <div>{children}</div>
  </section>
}

function EmptySignal({ children }: { children: ReactNode }) {
  return <p className="cockpit-empty">{children}</p>
}

function WorldMetricCards({ campaign }: { campaign: Campaign }) {
  const metrics = (campaign.world.metrics ?? []).filter((metric) => metric.visibility !== 'hidden')
  if (!metrics.length) return <EmptySignal>У этого мира пока нет открытых уникальных показателей.</EmptySignal>
  return <div className="world-metric-grid">{metrics.map((metric) => {
    if (metric.visibility === 'rumored') return <article key={metric.id} className="world-metric-card is-rumored">
      <header><span>{metric.label}</span><em>по слухам</em></header>
      <strong>Точное значение неизвестно</strong>
      <p>Пока доступны только неподтверждённые сведения. Число откроется после надёжного наблюдения или проверки.</p>
    </article>
    const range = metric.max - metric.min
    const progress = range > 0 ? Math.max(0, Math.min(100, (metric.value - metric.min) / range * 100)) : 0
    return <article key={metric.id} className="world-metric-card" title={metric.description}>
      <header><span>{metric.label}</span></header>
      <strong>{metric.value}{metric.unit ?? ''}</strong>
      <div role="progressbar" aria-label={metric.label} aria-valuemin={metric.min} aria-valuemax={metric.max} aria-valuenow={metric.value}><i style={{ width: `${progress}%` }} /></div>
      <p>{metric.description}</p>
    </article>
  })}</div>
}

function InterfaceStudio({ campaign, open, onClose, onUpdate, onDesign, designing }: WorldCockpitProps & { open: boolean; onClose: () => void }) {
  const blueprint = getWorldInterfaceBlueprint(campaign.world)
  const [instruction, setInstruction] = useState('')
  const modules = [...(campaign.world.interfaceModules ?? [])].sort((left, right) => right.priority - left.priority)
  const issues = adaptiveInterfaceBindingIssues(campaign)

  const updateBlueprint = (recipe: (current: WorldInterfaceBlueprint) => WorldInterfaceBlueprint) => void onUpdate((next) => {
    next.world.interfaceBlueprint = recipe(getWorldInterfaceBlueprint(next.world))
    next.world.interfaceBlueprint.updatedTurn = next.turn
    return next
  })
  const updateModule = (id: string, patch: Partial<(typeof modules)[number]>) => void onUpdate((next) => {
    const module = next.world.interfaceModules?.find((entry) => entry.id === id)
    if (module) Object.assign(module, patch, { lastChangedTurn: next.turn })
    return next
  })
  const moveSection = (section: DashboardSectionId, direction: -1 | 1) => updateBlueprint((current) => {
    const sections = [...current.dashboardSections]
    const index = sections.indexOf(section)
    const target = index + direction
    if (index >= 0 && target >= 0 && target < sections.length) [sections[index], sections[target]] = [sections[target], sections[index]]
    return { ...current, dashboardSections: sections }
  })

  return <Modal open={open} onClose={onClose} title="Мастерская интерфейса мира" eyebrow="Ручное управление и DeepSeek" width="large">
    <div className="interface-studio">
      <section className="studio-intro">
        <div><WandSparkles size={20} /><span><strong>{blueprint.title}</strong><p>{blueprint.subtitle}</p></span></div>
        <small>ИИ управляет только безопасными виджетами, данными и компоновкой. Сюжет от перестройки интерфейса не меняется.</small>
      </section>

      <section className="studio-section">
        <header><div><Sparkles size={15} /><span><strong>Перестроить с помощью ИИ</strong><small>Выберите точную задачу или опишите свою.</small></span></div></header>
        <div className="studio-preset-grid">{designPresets.map((preset) => <button key={preset.title} disabled={designing || !onDesign} onClick={() => onDesign?.(preset.text)}><preset.icon size={17} /><span><strong>{preset.title}</strong><small>{preset.text}</small></span><ChevronRight size={14} /></button>)}</div>
        <label className="studio-prompt"><span>Своя команда</span><textarea rows={4} value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Например: создай пульт охотника на духов с циклами луны, печатями и уровнем внимания клана…" /></label>
        <button className="primary-button studio-run" disabled={designing || !onDesign || !instruction.trim()} onClick={() => { onDesign?.(instruction.trim()); setInstruction('') }}>{designing ? <><Activity className="spin" size={15} /> DeepSeek проектирует…</> : <><BrainCircuit size={15} /> Выполнить безопасную перестройку</>}</button>
      </section>

      <section className="studio-section">
        <header><div><LayoutDashboard size={15} /><span><strong>Вкладки пульта</strong><small>Все шесть основных разделов всегда доступны; мир может менять только их названия.</small></span></div></header>
        <div className="studio-tab-grid">{blueprint.tabs.map((item) => <button key={item.id} role="switch" aria-checked="true" disabled className="is-on" title="Обязательная вкладка"><Eye size={14} /><span>{item.label || tabLabels[item.id]}</span></button>)}</div>
      </section>

      <section className="studio-section">
        <header><div><Gauge size={15} /><span><strong>Порядок командного центра</strong><small>Блоки располагаются сверху вниз.</small></span></div></header>
        <div className="studio-order-list">{blueprint.dashboardSections.map((section, index) => <div key={section}><span><i>{index + 1}</i><strong>{sectionLabels[section]}</strong></span><span><button disabled={index === 0} onClick={() => moveSection(section, -1)} aria-label="Поднять"><ArrowUp size={14} /></button><button disabled={index === blueprint.dashboardSections.length - 1} onClick={() => moveSection(section, 1)} aria-label="Опустить"><ArrowDown size={14} /></button></span></div>)}</div>
      </section>

      <section className="studio-section">
        <header><div><Orbit size={15} /><span><strong>Модули мира</strong><small>Закреплённый модуль также появляется на Пульте и должен сохраняться при AI-перестройке.</small></span></div><b>{modules.length}</b></header>
        {modules.length ? <div className="studio-module-list">{modules.map((module) => <article key={module.id}>
          <div className="studio-module-main"><i style={{ background: module.accent }} /><span><strong>{module.title}</strong><small>{module.description}</small></span>{module.pinned && <Pin size={13} />}</div>
          <div className="studio-module-controls">
            <label><span>Раздел</span><select value={module.placement} onChange={(event) => updateModule(module.id, { placement: event.target.value as AdaptiveInterfacePlacement })}>{Object.entries(placementLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span>Плотность</span><select value={module.density ?? 'comfortable'} onChange={(event) => updateModule(module.id, { density: event.target.value as 'compact' | 'comfortable' })}><option value="comfortable">Свободно</option><option value="compact">Компактно</option></select></label>
            <button className={module.pinned ? 'is-active' : ''} onClick={() => updateModule(module.id, { pinned: !module.pinned })}>{module.pinned ? <PinOff size={14} /> : <Pin size={14} />}{module.pinned ? 'Открепить' : 'На Пульт'}</button>
            <button onClick={() => updateModule(module.id, { visibility: module.visibility === 'hidden' ? 'known' : 'hidden' })}>{module.visibility === 'hidden' ? <Eye size={14} /> : <EyeOff size={14} />}{module.visibility === 'hidden' ? 'Показать' : 'Скрыть'}</button>
            <button className="danger-action" onClick={() => void onUpdate((next) => { next.world.interfaceModules = (next.world.interfaceModules ?? []).filter((entry) => entry.id !== module.id); return next })}><Trash2 size={14} />Удалить</button>
          </div>
        </article>)}</div> : <EmptySignal>Модули ещё не созданы. DeepSeek может спроектировать их из законов и состояния мира.</EmptySignal>}
      </section>

      <section className={`studio-health ${issues.length ? 'has-issues' : ''}`}>
        {issues.length ? <ShieldAlert size={18} /> : <BookOpenCheck size={18} />}
        <span><strong>{issues.length ? `Нарушено живых связей: ${issues.length}` : 'Все живые связи исправны'}</strong><small>{issues.length ? issues.slice(0, 3).map((issue) => `${issue.moduleTitle}: ${issue.elementLabel}`).join(' · ') : 'Показатели читаются из актуального состояния и не раскрывают скрытые сведения.'}</small></span>
        {issues.length > 0 && <button disabled={designing || !onDesign} onClick={() => onDesign?.(designPresets[2].text)}><RefreshCw size={14} /> Исправить с ИИ</button>}
      </section>
    </div>
  </Modal>
}

export function WorldCockpit({ campaign, onNavigate, onUpdate, onDesign, designing }: WorldCockpitProps) {
  const [studioOpen, setStudioOpen] = useState(false)
  const blueprint = getWorldInterfaceBlueprint(campaign.world)
  const issues = useMemo(() => adaptiveInterfaceBindingIssues(campaign), [campaign])
  const processes = (campaign.world.processes ?? []).filter((process) => process.visibility !== 'hidden' && ['active', 'stalled'].includes(process.status)).slice(0, 4)
  const pressures = (campaign.worldPressures ?? []).filter((pressure) => pressure.visibility !== 'hidden' && pressure.stage !== 'resolved').slice(0, 3)
  const events = (campaign.worldEvents ?? []).filter((event) => event.visibility !== 'hidden' && ['scheduled', 'due'].includes(event.status)).slice(0, 3)
  const threads = (campaign.threads ?? []).filter((thread) => !thread.secret && !['resolved', 'fulfilled', 'broken'].includes(thread.status)).slice(0, 4)
  const quests = campaign.quests.filter((quest) => quest.status === 'active').slice(0, 4)
  const mechanics = (campaign.world.mechanics ?? []).filter((mechanic) => mechanic.discovered && mechanic.status === 'active').slice(0, 4)

  const sections: Record<DashboardSectionId, ReactNode> = {
    scene: <CockpitSection title="Сейчас" icon={<MapPin size={15} />} action={<button className="cockpit-link" onClick={() => onNavigate('scene')}>Открыть сцену <ChevronRight size={13} /></button>}>
      <div className="cockpit-scene"><div><small>{campaign.scene.time} · {campaign.scene.weather}</small><strong>{campaign.scene.location}</strong><p>{campaign.scene.title}</p></div><span><b>{campaign.scene.tension}%</b><small>напряжение</small></span></div>
    </CockpitSection>,
    stakes: <CockpitSection title="Ставки и давление" icon={campaign.activeConflict ? <Swords size={15} /> : <CircleGauge size={15} />}>
      {campaign.activeConflict ? <div className="cockpit-conflict"><header><strong>{campaign.activeConflict.title}</strong><em>раунд {campaign.activeConflict.round}</em></header><p>{campaign.activeConflict.stakes}</p><div><span>Фаза</span><b>{campaign.activeConflict.phase}</b></div><div><span>Темп</span><b>{campaign.activeConflict.momentum === 'player' ? 'у героя' : campaign.activeConflict.momentum === 'opposition' ? 'у противника' : 'оспаривается'}</b></div></div> : campaign.pacing ? <div className="cockpit-pacing"><div><span>Ритм истории</span><strong>{campaign.pacing.reason}</strong></div><b>{campaign.pacing.intensity}%</b></div> : <EmptySignal>Прямого противостояния сейчас нет.</EmptySignal>}
    </CockpitSection>,
    modules: <CockpitSection title="Системы этого мира" icon={<Orbit size={15} />} action={<button className="cockpit-link" onClick={() => setStudioOpen(true)}><Settings2 size={13} /> Настроить</button>}>
      <AdaptiveWorldModules campaign={campaign} placement="dashboard" onDesign={() => setStudioOpen(true)} designing={designing} />
    </CockpitSection>,
    worldPulse: <CockpitSection title="Мир движется" icon={<Activity size={15} />} action={<button className="cockpit-link" onClick={() => onNavigate('world')}>Подробнее <ChevronRight size={13} /></button>}>
      {(processes.length || pressures.length || events.length) ? <div className="world-pulse-list">
        {pressures.map((pressure) => pressure.visibility === 'rumored'
          ? <article className="pulse-entry is-rumored" key={pressure.id}><i /><span><small>Неподтверждённые сведения</small><strong>{pressure.sourceName}</strong><p>Замечены признаки возможного давления, но его масштаб, цель и источник пока не установлены.</p></span></article>
          : <article className={`pulse-entry tier-${pressure.tier}`} key={pressure.id}><i /><span><small>{pressure.sourceName} · {uiLabel(pressure.stage)}</small><strong>{pressure.objective}</strong><p>{pressure.signs[0] ?? pressure.cause}</p></span></article>)}
        {processes.map((process) => process.visibility === 'rumored'
          ? <article className="pulse-entry is-rumored" key={process.id}><i /><span><small>Ходят слухи</small><strong>{process.title}</strong><p>Что именно происходит и к чему это ведёт, герою ещё предстоит выяснить.</p></span></article>
          : <article className="pulse-entry" key={process.id}><i /><span><small>{process.stage} · импульс {process.momentum}%</small><strong>{process.title}</strong><p>{process.nextMilestone}</p></span></article>)}
        {events.map((event) => event.visibility === 'rumored'
          ? <article className="pulse-entry is-event is-rumored" key={event.id}><i /><span><small>Неподтверждённое событие</small><strong>{event.title}</strong><p>Точное время, причины и последствия пока неизвестны.</p></span></article>
          : <article className="pulse-entry is-event" key={event.id}><i /><span><small>{event.status === 'due' ? 'Событие наступает' : event.dueTurn ? `ожидается к ходу ${event.dueTurn}` : 'грядущее событие'}</small><strong>{event.title}</strong><p>{event.description}</p></span></article>)}
      </div> : <EmptySignal>Открытых крупных процессов пока не замечено — скрытая жизнь мира всё равно продолжается.</EmptySignal>}
    </CockpitSection>,
    openLoops: <CockpitSection title="Не забыть" icon={<BookOpenCheck size={15} />}>
      {(quests.length || threads.length) ? <div className="open-loop-list">{quests.map((quest) => <button key={quest.id} onClick={() => onNavigate('scene')}><span>Цель</span><strong>{quest.title}</strong><small>{quest.objectives.filter((objective) => objective.completed).length}/{quest.objectives.length} этапов</small></button>)}{threads.map((thread) => <article key={thread.id}><span>Линия</span><strong>{thread.title}</strong><small>{thread.dueTurn ? `срок: ход ${thread.dueTurn}` : thread.detail}</small></article>)}</div> : <EmptySignal>Все открытые линии завершены или пока скрыты.</EmptySignal>}
    </CockpitSection>,
    mechanics: <CockpitSection title="Живые законы" icon={<Gauge size={15} />}>
      <WorldMetricCards campaign={campaign} />
      {mechanics.length > 0 && <div className="cockpit-mechanics">{mechanics.map((mechanic) => <details key={mechanic.id}><summary><span>{mechanic.name}</span><small>{uiLabel(mechanic.category)}</small></summary><p>{mechanic.description}</p><strong>Когда действует</strong><span>{mechanic.trigger}</span></details>)}</div>}
    </CockpitSection>,
    interfaceHealth: <CockpitSection title="Управление пультом" icon={issues.length ? <ShieldAlert size={15} /> : <Settings2 size={15} />}>
      <button className={`cockpit-studio-card ${issues.length ? 'has-issues' : ''}`} onClick={() => setStudioOpen(true)}><span>{issues.length ? <ShieldAlert size={19} /> : <WandSparkles size={19} />}</span><div><strong>{issues.length ? `Нужно исправить связей: ${issues.length}` : 'Мастерская мира'}</strong><small>Перестройка с ИИ, вкладки, порядок, закрепление и ручная корректировка</small></div><ChevronRight size={16} /></button>
    </CockpitSection>,
  }

  return <>
    <div className="world-cockpit">
      <header className="cockpit-hero"><div><small>Интерфейс этого мира</small><h2>{blueprint.title}</h2><p>{blueprint.subtitle}</p></div><button onClick={() => setStudioOpen(true)} aria-label="Настроить пульт"><WandSparkles size={16} /></button></header>
      {blueprint.dashboardSections.map((section) => <div key={section}>{sections[section]}</div>)}
    </div>
    <InterfaceStudio campaign={campaign} open={studioOpen} onClose={() => setStudioOpen(false)} onNavigate={onNavigate} onUpdate={onUpdate} onDesign={onDesign} designing={designing} />
  </>
}
