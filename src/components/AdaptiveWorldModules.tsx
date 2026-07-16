import {
  Activity, Compass, Crown, Eye, Flame, Gauge, LockKeyhole, Moon, Network,
  Orbit, Settings2, Shield, Sparkles, Star, Waypoints, type LucideIcon,
} from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import type {
  AdaptiveInterfaceElement, AdaptiveInterfaceElementState, AdaptiveInterfaceIcon,
  AdaptiveInterfaceModule, AdaptiveInterfacePlacement, Campaign,
} from '../../shared/types'
import { resolveAdaptiveElementState, resolveAdaptiveInterfaceElement, type ResolvedInterfaceElement } from '../lib/adaptive-interface'

interface AdaptiveWorldModulesProps {
  campaign: Campaign
  placement: AdaptiveInterfacePlacement
  onDesign?: () => void
  designing?: boolean
}

const iconMap: Record<AdaptiveInterfaceIcon, LucideIcon> = {
  spark: Sparkles,
  eye: Eye,
  shield: Shield,
  network: Network,
  pulse: Activity,
  compass: Compass,
  crown: Crown,
  rune: Orbit,
  gear: Settings2,
  flame: Flame,
  star: Star,
  moon: Moon,
}

const stateLabels: Record<AdaptiveInterfaceElementState, string> = {
  normal: 'Стабильно',
  positive: 'Благоприятно',
  warning: 'Требует внимания',
  danger: 'Опасность',
  locked: 'Закрыто',
  inactive: 'Неактивно',
}

const textValue = (resolved: ResolvedInterfaceElement) => {
  if (resolved.missing) return 'Нет связи'
  if (resolved.concealed) return 'Пока неизвестно'
  if (typeof resolved.value === 'boolean') return resolved.value ? 'Да' : 'Нет'
  return `${resolved.value}${resolved.unit ?? ''}`
}

const progressValue = (resolved: ResolvedInterfaceElement) => {
  if (resolved.concealed) return undefined
  if (typeof resolved.value !== 'number') return undefined
  const min = resolved.min ?? 0
  const max = resolved.max
  if (max === undefined || max <= min) return undefined
  return Math.max(0, Math.min(100, ((resolved.value - min) / (max - min)) * 100))
}

function MeterElement({ campaign, element }: { campaign: Campaign; element: AdaptiveInterfaceElement }) {
  const resolved = resolveAdaptiveInterfaceElement(campaign, element)
  const state = resolveAdaptiveElementState(element, resolved)
  const progress = progressValue(resolved)
  return <div className={`adaptive-meter element-${state} ${resolved.missing ? 'binding-missing' : ''} ${resolved.concealed ? 'binding-concealed' : ''}`} title={resolved.missing ? 'Источник данных больше не найден' : resolved.concealed ? 'Герой пока располагает только слухами' : element.description}>
    <div><span>{element.label}</span><strong>{textValue(resolved)}</strong></div>
    {progress !== undefined && <div className="adaptive-progress" role="progressbar" aria-label={element.label} aria-valuemin={resolved.min} aria-valuemax={resolved.max} aria-valuenow={typeof resolved.value === 'number' ? resolved.value : undefined}><i style={{ width: `${progress}%` }} /></div>}
    {element.description && <small>{element.description}</small>}
  </div>
}

function ValueElement({ campaign, element }: { campaign: Campaign; element: AdaptiveInterfaceElement }) {
  const resolved = resolveAdaptiveInterfaceElement(campaign, element)
  const state = resolveAdaptiveElementState(element, resolved)
  return <div className={`adaptive-value element-${state} ${resolved.missing ? 'binding-missing' : ''} ${resolved.concealed ? 'binding-concealed' : ''}`} title={resolved.missing ? 'Источник данных больше не найден' : resolved.concealed ? 'Герой пока располагает только слухами' : stateLabels[state]}>
    <span>{element.label}</span><strong>{state === 'locked' && <LockKeyhole size={12} />}{textValue(resolved)}</strong>
    {element.description && <small>{element.description}</small>}
  </div>
}

function Meters({ campaign, module }: { campaign: Campaign; module: AdaptiveInterfaceModule }) {
  return <div className="adaptive-meter-grid">{module.elements.map((element) => element.kind === 'meter'
    ? <MeterElement campaign={campaign} element={element} key={element.id} />
    : <ValueElement campaign={campaign} element={element} key={element.id} />)}</div>
}

function Nodes({ campaign, module }: { campaign: Campaign; module: AdaptiveInterfaceModule }) {
  const byId = new Map(module.elements.map((element) => [element.id, element]))
  return <div className="adaptive-node-map">{module.elements.map((element) => {
    const resolved = resolveAdaptiveInterfaceElement(campaign, element)
    const state = resolveAdaptiveElementState(element, resolved)
    const links = (element.links ?? []).map((id) => byId.get(id)?.label).filter(Boolean)
    return <div className={`adaptive-node element-${state} ${resolved.missing ? 'binding-missing' : ''} ${resolved.concealed ? 'binding-concealed' : ''}`} key={element.id}>
      <span className="adaptive-node-orbit"><i /></span>
      <div><strong>{element.label}</strong><b>{textValue(resolved)}</b>{element.description && <small>{element.description}</small>}{links.length > 0 && <em><Waypoints size={11} /> {links.join(' · ')}</em>}</div>
    </div>
  })}</div>
}

function Slots({ campaign, module }: { campaign: Campaign; module: AdaptiveInterfaceModule }) {
  return <div className="adaptive-slot-grid">{module.elements.map((element) => {
    const resolved = resolveAdaptiveInterfaceElement(campaign, element)
    const state = resolveAdaptiveElementState(element, resolved)
    return <div className={`adaptive-slot element-${state} ${resolved.missing ? 'binding-missing' : ''} ${resolved.concealed ? 'binding-concealed' : ''}`} key={element.id}>
      <span>{state === 'locked' ? <LockKeyhole size={15} /> : <Orbit size={15} />}</span><strong>{element.label}</strong><b>{textValue(resolved)}</b>{element.description && <small>{element.description}</small>}
    </div>
  })}</div>
}

function Track({ campaign, module }: { campaign: Campaign; module: AdaptiveInterfaceModule }) {
  return <div className="adaptive-track">{module.elements.map((element, index) => {
    const resolved = resolveAdaptiveInterfaceElement(campaign, element)
    const state = resolveAdaptiveElementState(element, resolved)
    return <div className={`adaptive-step element-${state} ${resolved.missing ? 'binding-missing' : ''} ${resolved.concealed ? 'binding-concealed' : ''}`} key={element.id}><span>{index + 1}</span><div><strong>{element.label}</strong><b>{textValue(resolved)}</b>{element.description && <small>{element.description}</small>}</div></div>
  })}</div>
}

function Ledger({ campaign, module }: { campaign: Campaign; module: AdaptiveInterfaceModule }) {
  return <div className="adaptive-ledger">{module.elements.map((element) => <ValueElement campaign={campaign} element={element} key={element.id} />)}</div>
}

function Signals({ campaign, module }: { campaign: Campaign; module: AdaptiveInterfaceModule }) {
  return <div className="adaptive-signals">{module.elements.map((element) => {
    const resolved = resolveAdaptiveInterfaceElement(campaign, element)
    const state = resolveAdaptiveElementState(element, resolved)
    return <div className={`adaptive-signal element-${state} ${resolved.missing ? 'binding-missing' : ''} ${resolved.concealed ? 'binding-concealed' : ''}`} key={element.id}><i /><div><strong>{element.label}</strong><span>{textValue(resolved)}</span>{element.description && <small>{element.description}</small>}</div></div>
  })}</div>
}

function Cards({ campaign, module }: { campaign: Campaign; module: AdaptiveInterfaceModule }) {
  return <div className="adaptive-card-grid">{module.elements.map((element) => {
    const resolved = resolveAdaptiveInterfaceElement(campaign, element)
    const state = resolveAdaptiveElementState(element, resolved)
    const progress = progressValue(resolved)
    return <article className={`adaptive-data-card element-${state} ${resolved.missing ? 'binding-missing' : ''} ${resolved.concealed ? 'binding-concealed' : ''}`} key={element.id}>
      <header><span>{element.label}</span><i /></header><strong>{textValue(resolved)}</strong>
      {progress !== undefined && <div className="adaptive-card-progress"><i style={{ width: `${progress}%` }} /></div>}
      {element.description && <p>{element.description}</p>}
    </article>
  })}</div>
}

function Radar({ campaign, module }: { campaign: Campaign; module: AdaptiveInterfaceModule }) {
  const numeric = module.elements.map((element) => ({ element, resolved: resolveAdaptiveInterfaceElement(campaign, element) })).filter((entry) => !entry.resolved.concealed && typeof entry.resolved.value === 'number')
  if (numeric.length < 3) return <Meters campaign={campaign} module={module} />
  const size = 184
  const center = size / 2
  const radius = 68
  const point = (index: number, ratio: number) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / numeric.length
    return `${center + Math.cos(angle) * radius * ratio},${center + Math.sin(angle) * radius * ratio}`
  }
  const polygon = numeric.map((entry, index) => point(index, (progressValue(entry.resolved) ?? 0) / 100)).join(' ')
  const grid = [0.33, 0.66, 1].map((ratio) => numeric.map((_, index) => point(index, ratio)).join(' '))
  return <div className="adaptive-radar">
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${module.title}: диаграмма показателей`}>
      {grid.map((points, index) => <polygon className="radar-grid" points={points} key={index} />)}
      {numeric.map((_, index) => <line className="radar-axis" x1={center} y1={center} x2={point(index, 1).split(',')[0]} y2={point(index, 1).split(',')[1]} key={index} />)}
      <polygon className="radar-shape" points={polygon} />
      {numeric.map((entry, index) => { const [cx, cy] = point(index, (progressValue(entry.resolved) ?? 0) / 100).split(','); return <circle cx={cx} cy={cy} r="3" key={entry.element.id} /> })}
    </svg>
    <div className="adaptive-radar-legend">{numeric.map(({ element, resolved }) => <div key={element.id}><i className={`element-${resolveAdaptiveElementState(element, resolved)}`} /><span>{element.label}</span><strong>{textValue(resolved)}</strong></div>)}</div>
  </div>
}

function ModuleVisual({ campaign, module }: { campaign: Campaign; module: AdaptiveInterfaceModule }) {
  const visibleModule = {
    ...module,
    elements: module.elements.filter((element) => !resolveAdaptiveInterfaceElement(campaign, element).suppressed),
  }
  if (module.visual === 'nodes') return <Nodes campaign={campaign} module={visibleModule} />
  if (module.visual === 'slots') return <Slots campaign={campaign} module={visibleModule} />
  if (module.visual === 'track') return <Track campaign={campaign} module={visibleModule} />
  if (module.visual === 'ledger') return <Ledger campaign={campaign} module={visibleModule} />
  if (module.visual === 'signals') return <Signals campaign={campaign} module={visibleModule} />
  if (module.visual === 'radar') return <Radar campaign={campaign} module={visibleModule} />
  if (module.visual === 'cards') return <Cards campaign={campaign} module={visibleModule} />
  return <Meters campaign={campaign} module={visibleModule} />
}

function ModuleFrame({ campaign, module }: { campaign: Campaign; module: AdaptiveInterfaceModule }) {
  const Icon = iconMap[module.icon] ?? Gauge
  const style = { '--module-accent': module.accent, '--module-secondary': module.secondary } as CSSProperties
  const heading = <div className="adaptive-module-heading"><span className="adaptive-module-icon"><Icon size={17} /></span><div><small>{module.subtitle ?? 'Интерфейс мира'}</small><h3>{module.title}</h3></div>{module.visibility === 'rumored' && <em>по слухам</em>}</div>
  const body: ReactNode = <><p className="adaptive-module-description">{module.description}</p><ModuleVisual campaign={campaign} module={module} /><details className="adaptive-module-rationale"><summary>Почему это важно именно здесь</summary><p>{module.reason}</p></details><footer className="adaptive-module-footer"><span><Orbit size={11} /> создано из правил этого мира</span><span>обновлено: ход {module.lastChangedTurn}</span></footer></>
  const className = `adaptive-module visual-${module.visual} density-${module.density ?? 'comfortable'} emphasis-${module.emphasis ?? 'standard'} ${module.pinned ? 'is-pinned' : ''}`
  if (module.collapsible) return <details className={className} style={style} open={!module.collapsedByDefault}><summary>{heading}<span className="adaptive-module-chevron" /></summary><div className="adaptive-module-body">{body}</div></details>
  return <article className={className} style={style}>{heading}<div className="adaptive-module-body">{body}</div></article>
}

export function AdaptiveWorldModules({ campaign, placement, onDesign, designing }: AdaptiveWorldModulesProps) {
  const authoredModules = (campaign.world.interfaceModules ?? [])
    .filter((module) => module.visibility !== 'hidden')
  const modules = authoredModules
    .filter((module) => (module.placement === placement || (placement === 'dashboard' && module.pinned)) && module.visibility !== 'hidden')
    .filter((module) => module.elements.some((element) => !resolveAdaptiveInterfaceElement(campaign, element).suppressed))
    .sort((left, right) => right.priority - left.priority)

  if (!modules.length) {
    if (!['world', 'dashboard'].includes(placement) || !onDesign) return null
    const hasAuthoredModules = authoredModules.length > 0
    return <section className="adaptive-empty">
      <span><Orbit size={22} /><i /></span>
      <div><small>{hasAuthoredModules ? 'В этом разделе пока нет отдельной панели' : 'У этого мира ещё нет собственного слоя'}</small><strong>{hasAuthoredModules ? 'Модули уже работают в других разделах' : 'Пусть ИИ спроектирует интерфейс'}</strong><p>{hasAuthoredModules ? 'Интерфейс мира создан, но ни один открытый модуль пока не назначен этому разделу. Можно перенести сюда существующий модуль или попросить ИИ создать новый.' : 'Нейросеть изучит силы, законы, фракции, ресурсы и особенности кампании, а затем сама решит, что действительно стоит показывать и как это должно выглядеть.'}</p></div>
      <button disabled={designing} onClick={onDesign}>{designing ? <><Activity className="spin" size={15} /> Проектирование…</> : <><Sparkles size={15} /> {hasAuthoredModules ? 'Настроить раздел' : 'Спроектировать'}</>}</button>
    </section>
  }

  return <div className={`adaptive-world-modules placement-${placement}`}>{modules.map((module) => <ModuleFrame campaign={campaign} module={module} key={module.id} />)}</div>
}
