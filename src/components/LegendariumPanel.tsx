import { BookOpenText, ChevronDown, Crown, Footprints, Landmark, Search, ShieldQuestion, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import type {
  Campaign,
  LegendDiscoverySection,
  LegendLegacyKind,
  LegendLifeStatus,
  LegendStage,
  LegendTruthStatus,
  LegendaryFigure,
} from '../../shared/types'

type LegendFilter = 'all' | 'living' | 'historical' | 'emerging'

const stageLabels: Record<LegendStage, string> = {
  notable: 'Заметная фигура',
  renowned: 'Прославленный человек',
  legendary: 'Легендарная личность',
  mythic: 'Фигура эпохи',
}

const lifeLabels: Record<LegendLifeStatus, string> = {
  living: 'Жив',
  dead: 'Мёртв',
  missing: 'Пропал',
  sealed: 'Запечатан',
  dormant: 'Неактивен',
  returned: 'Вернулся',
  ascended: 'Покинул смертную жизнь',
  unknown: 'Судьба неизвестна',
}

const truthLabels: Record<LegendTruthStatus, string> = {
  confirmed: 'Подтверждено',
  partly_true: 'Подтверждено частично',
  distorted: 'Искажённый рассказ',
  fabricated: 'Опровергнуто',
  unknown: 'Не установлено',
}

const legacyKindLabels: Record<LegendLegacyKind, string> = {
  technique: 'Техника',
  artifact: 'Артефакт',
  bloodline: 'Наследственная линия',
  school: 'Школа',
  faction: 'Организация',
  cult: 'Культ',
  law: 'Закон',
  place: 'Место',
  prophecy: 'Пророчество',
  title: 'Титул',
  other: 'Наследие',
}

const historicalStatuses = new Set<LegendLifeStatus>(['dead', 'ascended'])
const livingStatuses = new Set<LegendLifeStatus>(['living', 'returned'])

function hasSection(legend: LegendaryFigure, section: LegendDiscoverySection) {
  return legend.discovery.revealedSections.includes(section)
}

function legendMatchesFilter(legend: LegendaryFigure, filter: LegendFilter) {
  if (filter === 'living') return livingStatuses.has(legend.lifeStatus)
  if (filter === 'historical') return historicalStatuses.has(legend.lifeStatus)
  if (filter === 'emerging') return legend.stage === 'notable' || legend.stage === 'renowned'
  return true
}

function ListBlock({ title, values }: { title: string; values: string[] }) {
  if (!values.length) return null
  return <div className="legend-detail-list"><b>{title}</b>{values.map((value) => <span key={value}>{value}</span>)}</div>
}

function RumorCard({ legend }: { legend: LegendaryFigure }) {
  const visibleMyths = hasSection(legend, 'myths') ? legend.myths.filter((myth) => myth.visibility !== 'hidden') : []
  return <details className="legend-card is-rumored">
    <summary>
      <span className="legend-sigil"><ShieldQuestion size={16} /></span>
      <span className="legend-heading"><small>Сведения требуют проверки</small><strong>{legend.name}</strong>{legend.epithet && <em>{legend.epithet}</em>}</span>
      <span className="legend-awareness"><b>{Math.round(legend.discovery.awareness)}%</b><small>изучено</small></span>
      <ChevronDown size={15} />
    </summary>
    <div className="legend-body">
      <p className="legend-rumor-note">Герой знает лишь отдельные рассказы. Они могут смешивать реальные события, ошибки свидетелей и намеренные искажения.</p>
      {visibleMyths.map((myth) => <article className="legend-myth" key={myth.id}>
        <header><strong>{myth.title}</strong><span>{truthLabels[myth.truth]}</span></header>
        <p>{myth.claim}</p>
        <small>Источник рассказа: {myth.origin}</small>
      </article>)}
      {!visibleMyths.length && <p className="legend-locked-copy">Известно только имя. Подробности откроются через наблюдения, документы, свидетелей или проверку слухов.</p>}
      {!!legend.discovery.evidence.length && <div className="legend-evidence"><b>Откуда это известно</b>{legend.discovery.evidence.slice(-4).map((entry) => <span key={entry.id}><i>{entry.reliability}%</i><strong>{entry.source}</strong><small>{entry.summary}</small></span>)}</div>}
    </div>
  </details>
}

function LegendCard({ campaign, legend }: { campaign: Campaign; legend: LegendaryFigure }) {
  if (legend.discovery.visibility === 'rumored') return <RumorCard legend={legend} />
  const location = legend.currentState.locationId
    ? campaign.world.places?.find((place) => place.id === legend.currentState.locationId)?.name
    : undefined
  const linkedPlayer = legend.characterId === campaign.player.id
  const linkedNpc = legend.characterId ? campaign.npcs.find((npc) => npc.id === legend.characterId) : undefined
  const visibleDeeds = hasSection(legend, 'deeds') ? legend.deeds.filter((deed) => deed.visibility !== 'hidden') : []
  const visibleMyths = hasSection(legend, 'myths') ? legend.myths.filter((myth) => myth.visibility !== 'hidden') : []
  const visibleLegacies = hasSection(legend, 'legacies') ? legend.legacies.filter((legacy) => legacy.visibility !== 'hidden') : []

  return <details className={`legend-card stage-${legend.stage}`}>
    <summary>
      <span className="legend-sigil"><Crown size={16} /></span>
      <span className="legend-heading">
        <small>{hasSection(legend, 'status') ? stageLabels[legend.stage] : 'Известная личность'}</small>
        <strong>{legend.name}</strong>
        {legend.epithet && <em>{legend.epithet}</em>}
      </span>
      <span className="legend-awareness"><b>{Math.round(legend.discovery.awareness)}%</b><small>изучено</small></span>
      <ChevronDown size={15} />
    </summary>
    <div className="legend-body">
      {hasSection(legend, 'status') && <div className="legend-status-row">
        <span>{lifeLabels[legend.lifeStatus]}</span>
        <span>{stageLabels[legend.stage]}</span>
        <span>{truthLabels[legend.truthStatus]}</span>
      </div>}
      {hasSection(legend, 'summary') && <><p className="legend-summary">{legend.summary}</p><p className="legend-reputation">{legend.reputation}</p></>}
      {hasSection(legend, 'origin') && <div className="legend-origin"><small>{legend.era}</small><p>{legend.origin}</p></div>}
      {hasSection(legend, 'summary') && <div className="legend-metric-grid">
        <div><span>Известность в мире</span><strong>{Math.round(legend.renown)}%</strong><i><b style={{ width: `${legend.renown}%` }} /></i></div>
        <div><span>Сохранившееся влияние</span><strong>{Math.round(legend.influence)}%</strong><i><b style={{ width: `${legend.influence}%` }} /></i></div>
      </div>}
      {hasSection(legend, 'summary') && <div className="legend-emergence">
        <header><Sparkles size={14} /><b>Путь этого имени</b><strong>{Math.round(legend.emergence.momentum)}%</strong></header>
        <i><b style={{ width: `${Math.max(0, legend.emergence.momentum)}%` }} /></i>
        <p>{legend.emergence.nextMilestone}</p>
        <ListBlock title="Что уже подтверждает статус" values={legend.emergence.qualifyingSigns} />
        <ListBlock title="Что может опровергнуть притязание" values={legend.emergence.disqualifiers} />
      </div>}
      <ListBlock title="Известные свершения" values={hasSection(legend, 'summary') ? legend.knownFeats : []} />
      {visibleDeeds.length > 0 && <div className="legend-subsection">
        <header><Landmark size={14} /><b>Подтверждённые события</b></header>
        {visibleDeeds.map((deed) => <article className="legend-deed" key={deed.id}>
          <div><strong>{deed.title}</strong><span>{truthLabels[deed.truth]}</span></div>
          <small>{deed.era}</small>
          <p>{deed.summary}</p>
          <ListBlock title="Что изменилось" values={deed.consequences} />
          {!!deed.witnesses.length && <footer>Свидетели и следы: {deed.witnesses.join(' · ')}</footer>}
        </article>)}
      </div>}
      {visibleMyths.length > 0 && <div className="legend-subsection">
        <header><BookOpenText size={14} /><b>Рассказы и споры</b></header>
        {visibleMyths.map((myth) => <article className="legend-myth" key={myth.id}>
          <header><strong>{myth.title}</strong><span>{truthLabels[myth.truth]}</span></header>
          <p>{myth.claim}</p>
          <small>{myth.origin} · {myth.spread}</small>
          {myth.distortion && <em>Что могло исказиться: {myth.distortion}</em>}
        </article>)}
      </div>}
      {visibleLegacies.length > 0 && <div className="legend-subsection">
        <header><Sparkles size={14} /><b>Наследие</b></header>
        {visibleLegacies.map((legacy) => <article className="legend-legacy" key={legacy.id}>
          <div><strong>{legacy.name}</strong><span>{legacyKindLabels[legacy.kind]}</span></div>
          <p>{legacy.description}</p>
          <small>{legacy.status}</small>
          <ListBlock title="Как получить или продолжить" values={legacy.accessConditions} />
          <ListBlock title="К чему это ведёт" values={legacy.consequences} />
        </article>)}
      </div>}
      {hasSection(legend, 'whereabouts') && <div className="legend-current">
        <header><Footprints size={14} /><b>Последние достоверные сведения</b></header>
        {linkedPlayer && <span className="legend-live-mark">Ваш герой уже вошёл в живую историю мира</span>}
        {linkedNpc && <span className="legend-live-mark">Действующий персонаж мира · {linkedNpc.role}</span>}
        <p>{legend.currentState.activity}</p>
        {location && <small>Последнее известное место: {location}</small>}
        <small>{legend.currentState.lastConfirmedAt}</small>
        {!!legend.currentState.signs.length && <ListBlock title="Наблюдаемые следы" values={legend.currentState.signs} />}
      </div>}
      {hasSection(legend, 'encounter') && <div className="legend-encounter">
        <header><span><Footprints size={14} /><b>Возможность пересечения</b></span><strong>{Math.round(legend.currentState.encounterReadiness)}%</strong></header>
        <i><b style={{ width: `${legend.currentState.encounterReadiness}%` }} /></i>
        <ListBlock title="Что должно произойти" values={legend.currentState.encounterConditions} />
        <ListBlock title="Что мешает сейчас" values={legend.currentState.blockers} />
      </div>}
      {hasSection(legend, 'canon') && <details className="legend-canon"><summary>Основа и непрерывность мира</summary><p>{legend.canon.continuity}</p><ListBlock title="Неизменяемые факты" values={legend.canon.anchorFacts} /><ListBlock title="Что противоречило бы миру" values={legend.canon.forbiddenContradictions} /></details>}
      {!!legend.discovery.evidence.length && <div className="legend-evidence"><b>Основания знаний героя</b>{legend.discovery.evidence.slice(-6).map((entry) => <span key={entry.id}><i>{entry.reliability}%</i><strong>{entry.source}</strong><small>{entry.summary}</small></span>)}</div>}
      {!hasSection(legend, 'deeds') && !hasSection(legend, 'myths') && !hasSection(legend, 'legacies') && <p className="legend-locked-copy">Подвиги, споры и наследие этой фигуры пока не изучены достаточно надёжно.</p>}
    </div>
  </details>
}

export function LegendariumPanel({ campaign }: { campaign: Campaign }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<LegendFilter>('all')
  const legendarium = campaign.world.legendarium
  const visibleLegends = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru-RU')
    return (campaign.world.legends ?? [])
      .filter((legend) => legend.discovery.visibility !== 'hidden')
      .filter((legend) => legendMatchesFilter(legend, filter))
      .filter((legend) => !normalized || [
        legend.name,
        ...legend.aliases,
        ...legend.titles,
        legend.epithet ?? '',
        legend.role,
        hasSection(legend, 'summary') ? legend.summary : '',
      ].join(' ').toLocaleLowerCase('ru-RU').includes(normalized))
      .sort((left, right) => right.discovery.awareness - left.discovery.awareness || right.renown - left.renown)
  }, [campaign.world.legends, filter, query])

  if (!legendarium && !(campaign.world.legends ?? []).some((legend) => legend.discovery.visibility !== 'hidden')) {
    return <div className="mini-empty">Исторические личности и предания этого мира ещё не выделены в отдельную систему.</div>
  }

  return <div className="legendarium-panel">
    {legendarium && <article className="legendarium-culture">
      <header><span><Crown size={17} /></span><div><small>Как этот мир помнит исключительных людей</small><strong>{legendarium.name}</strong></div></header>
      <p>{legendarium.summary}</p>
      <div className="legend-thresholds" aria-label="Ступени признания в этом мире">
        {legendarium.thresholds.map((threshold) => <div key={threshold.stage}>
          <span>{stageLabels[threshold.stage]}</span>
          <strong>от {threshold.minRenown}%</strong>
          <small>{threshold.requirements.slice(0, 2).join(' · ')}</small>
        </div>)}
      </div>
      <details>
        <summary>Правила памяти и признания <ChevronDown size={14} /></summary>
        <div className="legendarium-rule-grid">
          <ListBlock title="Что признают свершением" values={legendarium.recognitionRules} />
          <ListBlock title="Как распространяются истории" values={legendarium.transmissionChannels} />
          <ListBlock title="Что искажает память" values={legendarium.distortionForces} />
          <ListBlock title="Кто хранит свидетельства" values={legendarium.memoryKeepers} />
          <ListBlock title="Что стирает имена" values={legendarium.erasureForces} />
          <ListBlock title="Как наследуют имя и дело" values={legendarium.successionRules} />
          <ListBlock title="Почему встреча возможна или невозможна" values={legendarium.encounterRules} />
        </div>
      </details>
    </article>}
    <div className="legend-toolbar">
      <label><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти имя, титул или роль" /></label>
      <div role="group" aria-label="Фильтр легендарных фигур">
        {([
          ['all', 'Все'],
          ['living', 'Живые'],
          ['historical', 'История'],
          ['emerging', 'Новые имена'],
        ] as const).map(([value, label]) => <button className={filter === value ? 'is-active' : ''} key={value} onClick={() => setFilter(value)}>{label}</button>)}
      </div>
    </div>
    <div className="legend-list">
      {visibleLegends.map((legend) => <LegendCard campaign={campaign} legend={legend} key={legend.id} />)}
      {!visibleLegends.length && <div className="mini-empty">По этому фильтру доступных герою сведений пока нет.</div>}
    </div>
  </div>
}
