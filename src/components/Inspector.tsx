import {
  Activity, Backpack, BookMarked, Check, ChevronDown, CircleGauge, Coins, HeartHandshake, History, MapPin,
  Brain, Clock3, FileUp, HeartPulse, Minus, Network, PackagePlus, Plus, Route, Search, Shield, ShieldAlert, Sparkles, Swords, Target, Trash2, UserRound, Users, X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Ability, Campaign, InventoryItem, LoreEntry, Rarity, StateChange, WorldPresentation } from '../../shared/types'
import { buildContextSelection } from '../../shared/context'
import { rarityFromKnownCopies } from '../../shared/rarity'
import { readCanonDocument } from '../lib/canon'
import { localizeTechnicalText, resourceUiLabel, uiLabel } from '../lib/ui-labels'
import { getWorldPresentation, getWorldSystem } from '../lib/world-customization'
import { Modal } from './Modal'
import { StateChangeLine } from './StateReceipt'
import { AdaptiveWorldModules } from './AdaptiveWorldModules'

export type InspectorTab = 'scene' | 'hero' | 'inventory' | 'changes' | 'world'
type ChangeFilter = 'all' | 'character' | 'inventory' | 'social' | 'world'

interface InspectorProps {
  campaign: Campaign
  open: boolean
  activeTab: InspectorTab
  onTabChange: (tab: InspectorTab) => void
  onClose: () => void
  onUpdate: (updater: (campaign: Campaign) => Campaign) => Promise<void>
  onDesignInterface?: () => void
  designingInterface?: boolean
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="inspector-section"><div className="section-heading"><h3>{title}</h3>{action}</div>{children}</section>
}

function EmptyMini({ children }: { children: React.ReactNode }) {
  return <div className="mini-empty">{children}</div>
}

function DetailList({ title, values }: { title: string; values?: string[] }) {
  if (!values?.length) return null
  return <div className="power-detail-list"><b>{title}</b><ul>{values.map((value) => <li key={value}>{value}</li>)}</ul></div>
}

function AbilityCard({ ability, expanded, onToggle, resources }: { ability: Ability; expanded: boolean; onToggle: () => void; resources?: Campaign['player']['resources'] }) {
  return <div className={`ability-card ${expanded ? 'is-expanded' : ''}`}>
    <button className="ability-main" onClick={onToggle}>
      <span className="ability-icon"><Sparkles size={14} /></span><span className="ability-copy"><strong>{ability.name}{ability.rank ? ` · ${ability.rank}` : ''}</strong><p>{ability.description}</p><small>{uiLabel(ability.kind, 'Особенность')}{ability.source ? ` · ${ability.source}` : ''}</small></span><ChevronDown size={14} />
    </button>
    {expanded && <div className="ability-details">
      <div className="mastery-line"><span>Освоение</span><strong>{Math.round(ability.mastery ?? 0)}%</strong><i><b style={{ width: `${Math.max(0, Math.min(100, ability.mastery ?? 0))}%` }} /></i></div>
      <div className="power-badges">{ability.category && <span>{uiLabel(ability.category)}</span>}{canonLabel(ability.canonStatus) && <span>{canonLabel(ability.canonStatus)}</span>}{ability.scale && <span>{ability.scale}</span>}</div>
      {ability.activation && <p><b>Активация:</b> {ability.activation}</p>}
      {ability.cooldown && <p><b>Откат:</b> {ability.cooldown}</p>}
      {!!ability.costs?.length && <p><b>Цена:</b> {ability.costs.map((cost) => `${cost.amount} ${resourceUiLabel(cost.resource, resources)}`).join(', ')}</p>}
      <DetailList title="Что умеет" values={ability.capabilities} />
      <DetailList title="Эффекты" values={ability.effects} />
      <DetailList title="Требования" values={ability.requirements} />
      <DetailList title="Ограничения" values={ability.limitations} />
      <DetailList title="Синергии" values={ability.synergies} />
      <DetailList title="Контрмеры" values={ability.counters} />
      <DetailList title="Примеры применения" values={ability.examples} />
      {ability.canonReference && <p className="canon-note"><b>Основа:</b> {ability.canonReference}</p>}
      {ability.progression && <p><b>Развитие:</b> {ability.progression}</p>}
      {!!ability.evolutionPaths?.length && <div className="evolution-list"><b>Ветви развития</b>{ability.evolutionPaths.map((path) => <div className={path.unlocked ? 'is-unlocked' : ''} key={path.id}><strong>{path.name}</strong><span>{path.description}</span><small>{path.unlocked ? 'Открыто' : path.requirement}</small></div>)}</div>}
      {!!ability.history?.length && <div className="progress-history"><b>История способности</b>{[...ability.history].reverse().slice(0, 6).map((entry) => <div key={entry.id}><strong>{entry.title} · ход {entry.turn}</strong><span>{entry.description}</span></div>)}</div>}
    </div>}
  </div>
}

const canonLabel = (status?: 'canonical' | 'derived' | 'original') => status === 'canonical' ? 'Канон' : status === 'derived' ? 'Развитие канона' : status === 'original' ? 'Оригинальное' : undefined

const itemStateLabels: Record<NonNullable<InventoryItem['state']>, string> = {
  intact: 'Исправен', damaged: 'Повреждён', broken: 'Сломан', depleted: 'Истощён', sealed: 'Запечатан',
}

const lifeStateLabels: Record<Campaign['player']['lifeState'], string> = {
  active: 'В строю', unconscious: 'Без сознания', incapacitated: 'Обездвижен', dead: 'Мёртв', missing: 'Пропал',
}

const recruitmentLabels = {
  unavailable: 'Не вступит', possible: 'Может согласиться', invited: 'Принимает решение', member: 'В отряде', left: 'Покинул отряд',
} as const

const changeMatchesFilter = (change: StateChange, filter: ChangeFilter) => {
  if (filter === 'all') return true
  if (filter === 'character') return ['health', 'resource', 'stat', 'condition', 'ability', 'character'].includes(change.kind)
  if (filter === 'inventory') return ['inventory', 'artifact', 'currency'].includes(change.kind)
  if (filter === 'social') return ['relationship', 'reputation', 'quest'].includes(change.kind)
  return ['knowledge', 'scene', 'world', 'system'].includes(change.kind)
}

function ItemEditor({ open, presentation, onClose, onSave }: { open: boolean; presentation: WorldPresentation; onClose: () => void; onSave: (item: InventoryItem) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<InventoryItem['category']>('other')
  const [rarity, setRarity] = useState<Rarity>('common')
  const [quantity, setQuantity] = useState(1)
  const [effects, setEffects] = useState('')
  const [rarityBasis, setRarityBasis] = useState('')
  const [scarcity, setScarcity] = useState('')
  const [knownCopies, setKnownCopies] = useState('')
  const [recognition, setRecognition] = useState('')
  const [marketImpact, setMarketImpact] = useState('')
  const [acquisitionRisk, setAcquisitionRisk] = useState(0)

  return <Modal open={open} onClose={onClose} title={`Добавить: ${presentation.labels.inventory}`} eyebrow="Ручное изменение">
    <form className="form-stack" onSubmit={(event) => {
      event.preventDefault()
      if (!name.trim() || !description.trim() || !rarityBasis.trim() || !scarcity.trim() || !recognition.trim() || !marketImpact.trim()) return
      const copies = knownCopies.trim() ? Math.max(1, Number(knownCopies)) : undefined
      onSave({
        id: crypto.randomUUID(), name: name.trim(), description: description.trim(), category, quantity,
        rarity: rarityFromKnownCopies(rarity, copies), rarityProfile: { basis: rarityBasis.trim(), scarcity: scarcity.trim(), knownCopies: copies, recognition: recognition.trim(), marketImpact: marketImpact.trim(), acquisitionRisk }, equipped: false, effects: effects.split('\n').map((value) => value.trim()).filter(Boolean), discoveredTurn: 0,
        origin: 'Добавлено вручную',
      })
      setName(''); setDescription(''); setEffects(''); setQuantity(1); setRarityBasis(''); setScarcity(''); setKnownCopies(''); setRecognition(''); setMarketImpact(''); setAcquisitionRisk(0); onClose()
    }}>
      <label className="field"><span>Название</span><input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} placeholder="Например, печать огня" /></label>
      <label className="field"><span>Описание</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} required rows={3} maxLength={1000} /></label>
      <div className="field-grid">
        <label className="field"><span>Категория</span><select value={category} onChange={(event) => setCategory(event.target.value as InventoryItem['category'])}>
          {Object.entries(presentation.categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label className="field"><span>Редкость</span><select value={rarity} onChange={(event) => setRarity(event.target.value as Rarity)}>
          {Object.entries(presentation.rarityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      </div>
      <label className="field"><span>Почему предмет редок</span><textarea value={rarityBasis} onChange={(event) => setRarityBasis(event.target.value)} required rows={2} /></label>
      <label className="field"><span>Где и как встречается</span><textarea value={scarcity} onChange={(event) => setScarcity(event.target.value)} required rows={2} /></label>
      <div className="field-grid"><label className="field"><span>Известно экземпляров</span><input type="number" min={1} value={knownCopies} onChange={(event) => setKnownCopies(event.target.value)} placeholder="Можно не указывать" /></label><label className="field"><span>Риск добычи, %</span><input type="number" min={0} max={100} value={acquisitionRisk} onChange={(event) => setAcquisitionRisk(Math.max(0, Math.min(100, Number(event.target.value))))} /></label></div>
      <label className="field"><span>Кто и как его узнаёт</span><textarea value={recognition} onChange={(event) => setRecognition(event.target.value)} required rows={2} /></label>
      <label className="field"><span>Цена, спрос и последствия</span><textarea value={marketImpact} onChange={(event) => setMarketImpact(event.target.value)} required rows={2} /></label>
      <label className="field"><span>Количество</span><input type="number" min={1} max={999} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
      <label className="field"><span>Эффекты — по одному на строке</span><textarea value={effects} onChange={(event) => setEffects(event.target.value)} rows={3} maxLength={1000} /></label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Отмена</button><button className="primary-button" type="submit">Добавить</button></div>
    </form>
  </Modal>
}

function LoreEditor({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (entry: LoreEntry) => void }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [keys, setKeys] = useState('')
  const [type, setType] = useState<LoreEntry['type']>('history')
  return <Modal open={open} onClose={onClose} title="Новая запись лора" eyebrow="Канон кампании">
    <form className="form-stack" onSubmit={(event) => {
      event.preventDefault()
      if (!title.trim() || !content.trim()) return
      onSave({ id: crypto.randomUUID(), title: title.trim(), content: content.trim(), keys: keys.split(',').map((key) => key.trim()).filter(Boolean), type, enabled: true, alwaysOn: false, secret: false, discovered: true, priority: 70 })
      setTitle(''); setContent(''); setKeys(''); onClose()
    }}>
      <label className="field"><span>Название</span><input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} /></label>
      <label className="field"><span>Тип</span><select value={type} onChange={(event) => setType(event.target.value as LoreEntry['type'])}>
        <option value="character">Персонаж</option><option value="location">Место</option><option value="faction">Фракция</option><option value="object">Предмет</option><option value="rule">Правило</option><option value="history">История</option><option value="secret">Тайна</option>
      </select></label>
      <label className="field"><span>Факт мира</span><textarea value={content} onChange={(event) => setContent(event.target.value)} required rows={6} maxLength={4000} /></label>
      <label className="field"><span>Ключи через запятую</span><input value={keys} onChange={(event) => setKeys(event.target.value)} placeholder="имя, место, прозвище" /></label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Отмена</button><button className="primary-button" type="submit">Закрепить в мире</button></div>
    </form>
  </Modal>
}

export function Inspector({ campaign, open, activeTab: tab, onTabChange: setTab, onClose, onUpdate, onDesignInterface, designingInterface }: InspectorProps) {
  const [itemEditor, setItemEditor] = useState(false)
  const [loreEditor, setLoreEditor] = useState(false)
  const [query, setQuery] = useState('')
  const [expandedItem, setExpandedItem] = useState<string>()
  const [expandedAbility, setExpandedAbility] = useState<string>()
  const [expandedNpc, setExpandedNpc] = useState<string>()
  const [expandedNpcAbility, setExpandedNpcAbility] = useState<string>()
  const [expandedLore, setExpandedLore] = useState<string>()
  const [canonError, setCanonError] = useState<string>()
  const [changeFilter, setChangeFilter] = useState<ChangeFilter>('all')
  const [changeLimit, setChangeLimit] = useState(30)
  const canonInput = useRef<HTMLInputElement>(null)
  const inspectorBody = useRef<HTMLDivElement>(null)
  const lastAssistant = [...campaign.messages].reverse().find((message) => message.role === 'assistant')
  const activeLoreIds = new Set(lastAssistant?.activeLoreIds ?? [])
  const weight = campaign.inventory.reduce((sum, item) => sum + (item.weight ?? 0) * item.quantity, 0)
  const filteredItems = useMemo(() => campaign.inventory.filter((item) => `${item.name} ${item.description}`.toLocaleLowerCase('ru-RU').includes(query.toLocaleLowerCase('ru-RU'))), [campaign.inventory, query])
  const visibleLore = campaign.lore.filter((entry) => !entry.secret || entry.discovered)
  const visibleInitiatives = campaign.npcs.filter((npc) => npc.initiative && npc.initiative.visibility !== 'hidden' && npc.status !== 'dead')
  const visibleWorldEvents = (campaign.worldEvents ?? []).filter((event) => event.visibility !== 'hidden' && ['scheduled', 'due'].includes(event.status))
  const presentation = getWorldPresentation(campaign.world)
  const system = getWorldSystem(campaign.world)
  const labels = presentation.labels
  const entityName = (entityId?: string) => entityId === campaign.player.id ? campaign.player.name : campaign.npcs.find((npc) => npc.id === entityId)?.name ?? entityId ?? 'Неизвестно'
  const contextPreview = useMemo(() => buildContextSelection(campaign, lastAssistant?.content ?? campaign.scene.location), [campaign, lastAssistant?.content])
  const changeMessages = useMemo(() => [...campaign.messages].reverse().filter((message) => message.role === 'assistant' && ((message.stateChanges?.some((change) => changeMatchesFilter(change, changeFilter))) || (!message.stateChanges?.length && changeFilter === 'all' && message.changeSummary?.length))), [campaign.messages, changeFilter])

  useEffect(() => {
    inspectorBody.current?.scrollTo({ top: 0, behavior: 'auto' })
    if (tab === 'changes') setChangeLimit(30)
  }, [tab, campaign.id])

  const mutate = (updater: (next: Campaign) => void) => void onUpdate((next) => { updater(next); return next })
  const importCanon = async (file?: File) => {
    if (!file) return
    try {
      const document = await readCanonDocument(file)
      await onUpdate((next) => { next.documents ??= []; next.documents.push(document); return next })
      setCanonError(undefined)
    } catch (cause) {
      setCanonError(cause instanceof Error ? cause.message : 'Не удалось прочитать документ.')
    }
  }

  return (
    <>
      {open && <button className="inspector-scrim" onClick={onClose} aria-label="Закрыть сведения" />}
      <aside className={`inspector ${open ? 'is-open' : ''}`} aria-label="Сведения о кампании">
        <div className="inspector-mobile-heading"><strong>Сведения</strong><button className="icon-button" onClick={onClose} aria-label="Закрыть"><X size={18} /></button></div>
        <div className="inspector-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'scene'} className={tab === 'scene' ? 'is-active' : ''} onClick={() => setTab('scene')}><MapPin size={16} /><span>{labels.scene}</span></button>
          <button role="tab" aria-selected={tab === 'hero'} className={tab === 'hero' ? 'is-active' : ''} onClick={() => setTab('hero')}><UserRound size={16} /><span>{labels.character}</span></button>
          <button role="tab" aria-selected={tab === 'inventory'} className={tab === 'inventory' ? 'is-active' : ''} onClick={() => setTab('inventory')}><Backpack size={16} /><span>{labels.inventory}</span><i>{campaign.inventory.length}</i></button>
          <button role="tab" aria-selected={tab === 'changes'} className={tab === 'changes' ? 'is-active' : ''} onClick={() => setTab('changes')}><History size={16} /><span>Изменения</span></button>
          <button role="tab" aria-selected={tab === 'world'} className={tab === 'world' ? 'is-active' : ''} onClick={() => setTab('world')}><BookMarked size={16} /><span>{labels.world}</span></button>
        </div>

        <div className="inspector-body" ref={inspectorBody}>
          {tab === 'scene' && <>
            <div className="scene-card">
              <div className="eyebrow">Сейчас</div>
              <h2>{campaign.scene.location}</h2>
              <p>{campaign.scene.weather}</p>
              <div className="scene-meta"><span>{campaign.scene.time}</span><span>Напряжение {campaign.scene.tension}%</span></div>
            </div>
            <AdaptiveWorldModules campaign={campaign} placement="scene" />
            <Section title="В сцене" action={<Users size={15} />}>
              <div className="npc-list">
                {campaign.npcs.filter((npc) => campaign.scene.presentNpcIds.includes(npc.id)).map((npc) => (
                  <div className={`npc-card ${expandedNpc === npc.id ? 'is-expanded' : ''}`} key={npc.id}>
                    <div className="avatar-letter">{npc.name.slice(0, 1)}</div>
                    <div className="npc-copy"><strong>{npc.name}</strong><span>{npc.role}</span><small><HeartHandshake size={12} /> {npc.relationship > 20 ? 'Доверяет' : npc.relationship < -20 ? 'Враждебен' : 'Присматривается'} · {npc.relationship > 0 ? '+' : ''}{npc.relationship}</small>
                      {npc.relationshipDimensions && <div className="bond-dimensions" aria-label={`Грани отношений: ${npc.name}`}>
                        <i>Доверие {npc.relationshipDimensions.trust}</i><i>Уважение {npc.relationshipDimensions.respect}</i><i>Привязанность {npc.relationshipDimensions.affection}</i><i>Страх {npc.relationshipDimensions.fear}</i><i>Подозрение {npc.relationshipDimensions.suspicion}</i><i>Зависимость {npc.relationshipDimensions.dependence}</i>
                      </div>}
                      {!!npc.resources?.length && <div className="bond-dimensions" aria-label={`Ресурсы: ${npc.name}`}>{npc.resources.map((resource) => <i key={resource.key}>{resource.label} {resource.value}/{resource.max ?? '∞'}</i>)}</div>}
                      {!!npc.statusEffects?.filter((effect) => !effect.hidden).length && <small><ShieldAlert size={11} /> {npc.statusEffects.filter((effect) => !effect.hidden).map((effect) => effect.name).join(' · ')}</small>}
                      {npc.initiative && npc.initiative.visibility !== 'hidden' && <p className="npc-initiative"><strong>Намерение:</strong> {npc.initiative.visibility === 'rumored' ? 'Возможно, ' : ''}{npc.initiative.nextMove}</p>}
                    </div>
                    <button className="npc-expand" aria-label={`${expandedNpc === npc.id ? 'Свернуть' : 'Подробнее'}: ${npc.name}`} onClick={() => setExpandedNpc(expandedNpc === npc.id ? undefined : npc.id)}><ChevronDown size={14} /></button>
                    {expandedNpc === npc.id && <div className="npc-details">
                      <div className="npc-detail-heading"><strong>Параметры</strong><span>{npc.disposition}</span></div>
                      {!!npc.stats?.length && <div className="npc-stat-grid">{npc.stats.map((stat) => <div key={stat.key}><span>{stat.label}</span><strong>{stat.value}{stat.max !== undefined ? ` / ${stat.max}` : ''}</strong>{stat.description && <small>{stat.description}</small>}</div>)}</div>}
                      {!!npc.resources?.length && <div className="npc-resource-list">{npc.resources.map((resource) => <div className={resource.criticalBelow !== undefined && resource.value <= resource.criticalBelow ? 'is-critical' : ''} key={resource.key}><span>{resource.label}</span><b>{resource.value} / {resource.max ?? '∞'}</b><i><em style={{ width: `${Math.max(0, Math.min(100, resource.max ? resource.value / resource.max * 100 : resource.value))}%`, background: resource.color }} /></i></div>)}</div>}
                      {npc.strategy && npc.strategy.visibility !== 'hidden' && <div className="npc-strategy">
                        <div className="npc-detail-heading"><strong><Brain size={13} /> Стратегический профиль</strong><span>{npc.strategy.visibility === 'rumored' ? 'Приблизительная оценка' : npc.strategy.planningHorizon}</span></div>
                        <div className="strategy-metrics">{([
                          ['Интеллект', npc.strategy.intelligence], ['Тактика', npc.strategy.tacticalSkill], ['Стратегия', npc.strategy.strategicSkill], ['Прогноз', npc.strategy.predictionSkill], ['Адаптация', npc.strategy.adaptability], ['Обман', npc.strategy.deceptionSkill],
                        ] as Array<[string, number]>).map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b><i><em style={{ width: `${value}%` }} /></i></div>)}</div>
                        <p><b>Стиль решений:</b> {npc.strategy.decisionStyle}</p>
                        {npc.strategy.visibility === 'known' && <>
                          <p><b>Текущий замысел:</b> {npc.strategy.currentPlan}</p>
                          <DetailList title="Наблюдённые привычки героя" values={npc.strategy.observedPlayerPatterns} />
                          <DetailList title="Сильные стороны" values={npc.strategy.strengths} />
                          <DetailList title="Слепые зоны" values={npc.strategy.blindSpots} />
                          <DetailList title="Запасные планы" values={npc.strategy.contingencies} />
                        </>}
                      </div>}
                      <div className="npc-detail-heading"><strong><Sparkles size={13} /> Способности</strong><span>{npc.abilities?.length ?? 0}</span></div>
                      {(npc.abilities?.length ?? 0) > 0 ? <div className="ability-list npc-ability-list">{npc.abilities!.map((ability) => {
                        const expansionId = `${npc.id}:${ability.id}`
                        return <AbilityCard key={ability.id} ability={ability} resources={npc.resources} expanded={expandedNpcAbility === expansionId} onToggle={() => setExpandedNpcAbility(expandedNpcAbility === expansionId ? undefined : expansionId)} />
                      })}</div> : <EmptyMini>Способности этого персонажа пока не раскрыты в истории.</EmptyMini>}
                      {!!npc.statusEffects?.filter((effect) => !effect.hidden).length && <div className="npc-effect-list"><strong>Состояния</strong>{npc.statusEffects.filter((effect) => !effect.hidden).map((effect) => <div key={effect.id}><b>{effect.name}{effect.stacks > 1 ? ` ×${effect.stacks}` : ''}</b><span>{effect.description}</span><small>{effect.effects.join(' · ')}</small></div>)}</div>}
                    </div>}
                  </div>
                ))}
                {!campaign.scene.presentNpcIds.length && <EmptyMini>Сейчас рядом никого нет.</EmptyMini>}
              </div>
            </Section>
            <Section title={labels.quests} action={<Target size={15} />}>
              <div className="quest-list">
                {campaign.quests.filter((quest) => quest.status === 'active').map((quest) => (
                  <div className="quest-card" key={quest.id}>
                    <strong>{quest.title}</strong><p>{quest.description}</p>
                    {quest.objectives.map((objective) => <div className={`objective ${objective.completed ? 'is-complete' : ''}`} key={objective.id}><span>{objective.completed ? <Check size={11} /> : null}</span>{objective.text}</div>)}
                  </div>
                ))}
              </div>
            </Section>
            <Section title="Обещания и последствия" action={<Clock3 size={15} />}>
              <div className="quest-list">
                {(campaign.threads ?? []).filter((thread) => !['fulfilled', 'broken', 'resolved'].includes(thread.status.toLocaleLowerCase('ru-RU')) && !thread.secret).map((thread) => <div className="quest-card" key={thread.id}><strong>{thread.title}</strong><p>{thread.detail}</p><small>{uiLabel(thread.type, 'Сюжетная линия')} · {uiLabel(thread.status, 'В процессе')}{thread.dueTurn ? ` · до хода ${thread.dueTurn}` : ''}</small></div>)}
                {(campaign.worldEvents ?? []).filter((event) => event.status !== 'resolved' && event.visibility !== 'hidden').map((event) => <div className="quest-card" key={event.id}><strong>{event.title}</strong><p>{event.description}</p><small>{event.status === 'due' ? 'Уже назрело' : event.dueTurn ? `Ожидается к ходу ${event.dueTurn}` : 'Срок неизвестен'}</small></div>)}
                {!(campaign.threads ?? []).some((thread) => !['fulfilled', 'broken', 'resolved'].includes(thread.status.toLocaleLowerCase('ru-RU')) && !thread.secret) && !(campaign.worldEvents ?? []).some((event) => event.status !== 'resolved' && event.visibility !== 'hidden') && <EmptyMini>Открытых обязательств пока нет.</EmptyMini>}
              </div>
            </Section>
          </>}

          {tab === 'hero' && <>
            <div className="hero-summary">
              <div className="hero-monogram">{campaign.player.name.slice(0, 1)}</div>
              <div className="hero-summary-copy"><div className="eyebrow">{labels.level} {campaign.player.level}</div><h2>{campaign.player.name}</h2><p>{campaign.player.archetype}</p><span className={`life-state-badge life-${campaign.player.lifeState ?? 'active'}`}><HeartPulse size={12} /> {lifeStateLabels[campaign.player.lifeState ?? 'active']}</span></div>
            </div>
            <AdaptiveWorldModules campaign={campaign} placement="hero" />
            <Section title={labels.resources}>
              <div className="resource-list">
                {campaign.player.resources.map((resource) => <div className={`resource ${resource.criticalBelow !== undefined && resource.value <= resource.criticalBelow ? 'is-critical' : ''}`} key={resource.key}>
                  <div><span>{resource.label}</span><strong>{resource.value}<i> / {resource.max ?? '∞'}</i></strong></div>
                  <div className="resource-bar"><span style={{ width: `${Math.max(0, Math.min(100, resource.max ? resource.value / resource.max * 100 : resource.value))}%`, background: resource.color }} /></div>
                  {resource.criticalBelow !== undefined && <small>Критический порог: {resource.criticalBelow}</small>}
                </div>)}
              </div>
            </Section>
            <Section title={labels.stats} action={<CircleGauge size={15} />}>
              <div className="stat-grid">
                {campaign.player.stats.map((stat) => <div className="stat-card" key={stat.key} title={stat.description}>
                  <span>{stat.label}</span><strong>{stat.value}</strong>
                  <div className="stat-controls"><button aria-label={`Уменьшить ${stat.label}`} onClick={() => mutate((next) => { const target = next.player.stats.find((item) => item.key === stat.key); if (target) target.value -= 1 })}><Minus size={10} /></button><button aria-label={`Увеличить ${stat.label}`} onClick={() => mutate((next) => { const target = next.player.stats.find((item) => item.key === stat.key); if (target) target.value = Math.min(target.max ?? 999, target.value + 1) })}><Plus size={10} /></button></div>
                </div>)}
              </div>
            </Section>
            <Section title={labels.abilities} action={<Sparkles size={15} />}>
              <div className="ability-list">
                {campaign.player.abilities.map((ability) => <AbilityCard key={ability.id} ability={ability} resources={campaign.player.resources} expanded={expandedAbility === ability.id} onToggle={() => setExpandedAbility(expandedAbility === ability.id ? undefined : ability.id)} />)}
              </div>
            </Section>
            {!!campaign.characterArcs?.some((arc) => arc.ownerId === campaign.player.id && !arc.secret) && <Section title="Личная арка" action={<Target size={15} />}>
              <div className="arc-list">{campaign.characterArcs.filter((arc) => arc.ownerId === campaign.player.id && !arc.secret).map((arc) => <div className="arc-card" key={arc.id}><div><strong>{arc.title}</strong><span>{arc.progress}% · {uiLabel(arc.status)}</span></div><p>{arc.currentStage}</p><div className="mini-progress"><i style={{ width: `${arc.progress}%` }} /></div><small>{arc.theme}</small></div>)}</div>
            </Section>}
            {!!((campaign.player.statusEffects ?? []).filter((effect) => !effect.hidden).length || campaign.player.conditions.length) && <Section title={labels.conditions} action={<ShieldAlert size={15} />}>
              <div className="status-effect-list">
                {(campaign.player.statusEffects ?? []).filter((effect) => !effect.hidden).map((effect) => <div className={`status-effect-card effect-${effect.category}`} key={effect.id}>
                  <div><strong>{effect.name}{effect.stacks > 1 ? ` ×${effect.stacks}` : ''}</strong><span>Тяжесть {effect.severity}/100</span></div>
                  <p>{effect.description}</p>
                  {!!effect.effects.length && <small>{effect.effects.join(' · ')}</small>}
                  {!!Object.keys(effect.resourceDeltasPerTurn ?? {}).length && <small>Каждый ход: {Object.entries(effect.resourceDeltasPerTurn ?? {}).map(([key, delta]) => `${key} ${delta >= 0 ? '+' : '−'}${Math.abs(delta)}`).join(' · ')}</small>}
                  {!!Object.keys(effect.checkModifiers ?? {}).length && <small>Проверки: {Object.entries(effect.checkModifiers ?? {}).map(([key, delta]) => `${key === '*' ? 'все' : key} ${delta >= 0 ? '+' : '−'}${Math.abs(delta)}`).join(' · ')}</small>}
                  <footer><span>{effect.source}</span><b>{effect.duration.unit === 'indefinite' ? 'Постоянно' : effect.duration.remaining !== undefined ? `${effect.duration.remaining} ${effect.duration.unit === 'turns' ? 'ход.' : effect.duration.unit}` : effect.duration.condition ?? effect.duration.unit}</b></footer>
                </div>)}
                {!!campaign.player.conditions.length && <div className="condition-list">{campaign.player.conditions.map((condition) => <span key={condition}>{condition}</span>)}</div>}
              </div>
            </Section>}
            <Section title="О герое"><div className="character-notes"><strong>Цель</strong><p>{campaign.player.goal}</p><strong>История</strong><p>{campaign.player.backstory}</p></div></Section>
            <Section title="Отряд" action={<Users size={15} />}>
              <div className="party-roster">
                {campaign.npcs.filter((npc) => (campaign.partyMemberIds ?? []).includes(npc.id)).map((npc) => <div className="party-member" key={npc.id}><div className="avatar-letter">{npc.name.slice(0, 1)}</div><div><strong>{npc.name}</strong><span>{campaign.partyRoles?.[npc.id] ?? npc.role}</span><small>{npc.recruitment?.reason}</small></div><b>{recruitmentLabels.member}</b></div>)}
                {!(campaign.partyMemberIds ?? []).length && <EmptyMini>Герой пока действует один.</EmptyMini>}
              </div>
              {!!campaign.npcs.some((npc) => npc.recruitment && ['possible', 'invited'].includes(npc.recruitment.status) && !(campaign.partyMemberIds ?? []).includes(npc.id)) && <div className="recruitment-watch"><strong>Возможные спутники</strong>{campaign.npcs.filter((npc) => npc.recruitment && ['possible', 'invited'].includes(npc.recruitment.status) && !(campaign.partyMemberIds ?? []).includes(npc.id)).map((npc) => <div key={npc.id}><header><b>{npc.name}</b><span>{npc.recruitment!.willingness}% готовности</span></header><p>{npc.recruitment!.reason}</p><small>{recruitmentLabels[npc.recruitment!.status]}{npc.recruitment!.requirements.length ? ` · ${npc.recruitment!.requirements.join(' · ')}` : ''}</small></div>)}</div>}
              <p className="party-rule-note">Состав меняется только в сцене: персонаж сам решает, учитывая цели, отношения и свои условия.</p>
            </Section>
            <Section title="Репутация фракций">
              <div className="resource-list">{(campaign.factionReputation ?? []).map((entry) => <div className="resource" key={entry.factionName}><div><span>{entry.factionName}</span><strong>{entry.value > 0 ? '+' : ''}{entry.value} <i>{entry.label}</i></strong></div><div className="resource-bar"><span style={{ width: `${Math.max(0, Math.min(100, (entry.value + 100) / 2))}%` }} /></div></div>)}</div>
            </Section>
          </>}

          {tab === 'inventory' && <>
            <div className="inventory-summary">
              <div><span><Backpack size={15} /> Вес</span><strong>{weight.toFixed(1)} кг</strong></div>
              {Object.entries(campaign.player.currency).map(([currency, value]) => <div key={currency}><span><Coins size={15} /> {currency}</span><strong>{value}</strong></div>)}
            </div>
            <AdaptiveWorldModules campaign={campaign} placement="inventory" />
            <div className="inventory-tools">
              <label className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти предмет" /></label>
              <button className="compact-button" onClick={() => setItemEditor(true)}><PackagePlus size={16} /> Добавить</button>
            </div>
            <div className="item-list">
              {filteredItems.map((item) => <div className={`item-card rarity-${item.rarity} ${item.state ? `state-${item.state}` : ''} ${expandedItem === item.id ? 'is-expanded' : ''}`} key={item.id}>
                <button className="item-main" onClick={() => setExpandedItem(expandedItem === item.id ? undefined : item.id)}>
                  <span className="rarity-gem" title={presentation.rarityLabels[item.rarity]} />
                  <span className="item-icon">{item.category === 'weapon' ? <Swords size={17} /> : item.category === 'armor' ? <Shield size={17} /> : <Backpack size={17} />}</span>
                  <span className="item-copy"><strong>{item.name}{item.quantity > 1 && <i> ×{item.quantity}</i>}</strong><small>{presentation.rarityLabels[item.rarity]} · {presentation.categoryLabels[item.category]}</small>
                    {(item.state || item.durability !== undefined || item.charges !== undefined) && <span className="item-state-line">
                      {item.state && <b>{itemStateLabels[item.state]}</b>}
                      {item.durability !== undefined && <i>Прочность {item.durability}{item.maxDurability !== undefined ? `/${item.maxDurability}` : ''}</i>}
                      {item.charges !== undefined && <i>Заряды {item.charges}{item.maxCharges !== undefined ? `/${item.maxCharges}` : ''}</i>}
                    </span>}
                  </span>
                  {item.equipped && <span className="equipped-mark">{system.equipmentSlots.find((slot) => slot.key === item.equippedSlot)?.label ?? 'Надето'}</span>}
                  <ChevronDown size={15} />
                </button>
                {expandedItem === item.id && <div className="item-details">
                  {(item.state || item.durability !== undefined || item.charges !== undefined) && <div className="item-condition-grid">
                    {item.state && <div className={`item-condition-state state-${item.state}`}><span>Состояние</span><strong>{itemStateLabels[item.state]}</strong></div>}
                    {item.durability !== undefined && <div><span>Прочность</span><strong>{item.durability}{item.maxDurability !== undefined ? ` / ${item.maxDurability}` : ''}</strong>{item.maxDurability !== undefined && item.maxDurability > 0 && <i><b style={{ width: `${Math.max(0, Math.min(100, item.durability / item.maxDurability * 100))}%` }} /></i>}</div>}
                    {item.charges !== undefined && <div><span>Заряды</span><strong>{item.charges}{item.maxCharges !== undefined ? ` / ${item.maxCharges}` : ''}</strong>{item.maxCharges !== undefined && item.maxCharges > 0 && <i><b style={{ width: `${Math.max(0, Math.min(100, item.charges / item.maxCharges * 100))}%` }} /></i>}</div>}
                  </div>}
                  <p>{item.description}</p>
                  {item.rarityProfile && <div className="rarity-profile">
                    <header><span>Реальная редкость</span><strong>{item.rarityProfile.knownCopies ? `известно экземпляров: ${item.rarityProfile.knownCopies}` : 'точное число неизвестно'}</strong></header>
                    <p>{item.rarityProfile.basis}</p><small>{item.rarityProfile.scarcity}</small>
                    <dl><div><dt>Узнаваемость</dt><dd>{item.rarityProfile.recognition}</dd></div><div><dt>Рынок и спрос</dt><dd>{item.rarityProfile.marketImpact}</dd></div></dl>
                    <div className="rarity-risk"><span>Риск добычи</span><b>{item.rarityProfile.acquisitionRisk}%</b><i><em style={{ width: `${item.rarityProfile.acquisitionRisk}%` }} /></i></div>
                  </div>}
                  {!!item.effects.length && <ul>{item.effects.map((effect) => <li key={effect}>{effect}</li>)}</ul>}
                  {item.origin && <small>Источник: {item.origin}</small>}
                  {item.artifact && <div className="artifact-profile">
                    <div className="artifact-heading"><strong>{item.artifact.sentient ? 'Разумный артефакт' : 'Особый предмет'}</strong><span>{item.artifact.sentient ? (item.artifact.awakened ? 'Пробуждён' : 'Спит') : (item.artifact.awakened ? 'Активирован' : 'Неактивен')}</span></div>
                    <div className="artifact-meters">{item.artifact.mastery !== undefined && <span>Освоение <b>{Math.round(item.artifact.mastery)}%</b></span>}<span>Настройка <b>{Math.round(item.artifact.attunement)}%</b></span><span>{item.artifact.sentient ? 'Связь' : 'Резонанс'} <b>{item.artifact.bond > 0 ? '+' : ''}{Math.round(item.artifact.bond)}</b></span></div>
                    <div className="power-badges">{item.artifact.classification && <span>{item.artifact.classification}</span>}{canonLabel(item.artifact.canonStatus) && <span>{canonLabel(item.artifact.canonStatus)}</span>}{item.artifact.scale && <span>{item.artifact.scale}</span>}</div>
                    {item.artifact.powerSource && <p><b>Источник силы:</b> {item.artifact.powerSource}</p>}
                    {item.artifact.operatingPrinciple && <p><b>Принцип действия:</b> {item.artifact.operatingPrinciple}</p>}
                    {item.artifact.canonReference && <p className="canon-note"><b>Каноническая основа:</b> {item.artifact.canonReference}</p>}
                    {item.artifact.sentient && item.artifact.personality && <p><b>Характер:</b> {item.artifact.personality}</p>}
                    {item.artifact.sentient && item.artifact.mood && <p><b>Настроение:</b> {item.artifact.mood}</p>}
                    {item.artifact.sentient && item.artifact.desire && <p><b>Желание:</b> {item.artifact.desire}</p>}
                    {item.artifact.sentient && item.artifact.taboo && <p><b>Табу:</b> {item.artifact.taboo}</p>}
                    {item.artifact.sentient && item.artifact.voice && <p><b>Голос:</b> {item.artifact.voice}</p>}
                    <DetailList title="Требования" values={item.artifact.requirements} />
                    <DetailList title="Пассивные эффекты" values={item.artifact.passiveEffects} />
                    {!!item.artifact.components.length && <div className="artifact-components"><b>Состав и компоненты</b>{item.artifact.components.map((component) => <div className="artifact-component" key={component.id}><header><strong>{component.name}</strong><span>{uiLabel(component.status)}{component.required ? ' · необходим' : ''}</span></header><p>{component.description}</p><em>{component.role}</em><DetailList title="Возможности компонента" values={component.capabilities} /></div>)}</div>}
                    {!!item.artifact.powers.length && <div className="artifact-powers"><b>Полный набор сил · {item.artifact.powers.length}</b>{item.artifact.powers.map((power) => <details key={power.id}><summary><span><strong>{power.name}</strong><small>{uiLabel(power.category, 'Сила')} · {power.mastery}%{canonLabel(power.canonStatus) ? ` · ${canonLabel(power.canonStatus)}` : ''}</small></span><ChevronDown size={13} /></summary><div className="artifact-power-body"><p>{power.description}</p>{power.scale && <p><b>Масштаб:</b> {power.scale}</p>}{power.activation && <p><b>Активация:</b> {power.activation}</p>}{power.trigger && <p><b>Триггер:</b> {power.trigger}</p>}{!!power.costs.length && <p><b>Цена:</b> {power.costs.map((cost) => `${cost.amount} ${resourceUiLabel(cost.resource, campaign.player.resources)}`).join(', ')}</p>}<DetailList title="Конкретные возможности" values={power.capabilities} /><DetailList title="Синергии" values={power.synergies} /><DetailList title="Контрмеры" values={power.counters} /><DetailList title="Ограничения" values={power.limitations} /><DetailList title="Примеры" values={power.examples} />{power.canonReference && <p className="canon-note"><b>Основа:</b> {power.canonReference}</p>}</div></details>)}</div>}
                    <DetailList title="Комбинированные эффекты" values={item.artifact.combinedEffects} />
                    {!!item.artifact.drawbacks.length && <div><b>Цена и недостатки</b><ul>{item.artifact.drawbacks.map((drawback) => <li key={drawback}>{drawback}</li>)}</ul></div>}
                    <DetailList title="Условия отказа и уязвимости" values={item.artifact.failureModes} />
                    {!!item.artifact.evolutionPaths.length && <div className="evolution-list"><b>{item.artifact.sentient ? 'Пробуждения' : 'Развитие'}</b>{item.artifact.evolutionPaths.map((path) => <div className={path.unlocked ? 'is-unlocked' : ''} key={path.id}><strong>{path.name}</strong><span>{path.description}</span><small>{path.unlocked ? 'Открыто' : path.requirement}</small></div>)}</div>}
                  </div>}
                  {!!item.history?.length && <div className="progress-history"><b>История предмета</b>{[...item.history].reverse().slice(0, 8).map((entry) => <div key={entry.id}><strong>{entry.title} · ход {entry.turn}</strong><span>{entry.description}</span></div>)}</div>}
                  <div className="item-actions">
                    {['weapon', 'armor', 'artifact'].includes(item.category) && <button onClick={() => mutate((next) => {
                      const target = next.inventory.find((candidate) => candidate.id === item.id)
                      if (!target) return
                      if (target.equipped) {
                        target.equipped = false
                        target.equippedSlot = undefined
                        return
                      }
                      const slot = system.equipmentSlots.find((candidate) => candidate.accepts.includes(target.category) && !next.inventory.some((item) => item.equipped && item.equippedSlot === candidate.key))
                        ?? system.equipmentSlots.find((candidate) => candidate.accepts.includes(target.category))
                      if (slot) next.inventory.filter((item) => item.equippedSlot === slot.key).forEach((item) => { item.equipped = false; item.equippedSlot = undefined })
                      target.equipped = true
                      target.equippedSlot = slot?.key
                    })}>{item.equipped ? 'Снять' : 'Экипировать'}</button>}
                    <button onClick={() => mutate((next) => { const target = next.inventory.find((candidate) => candidate.id === item.id); if (target) target.quantity = Math.min(999, target.quantity + 1) })}><Plus size={13} /> 1</button>
                    <button disabled={item.quantity <= 1} onClick={() => mutate((next) => { const target = next.inventory.find((candidate) => candidate.id === item.id); if (target) target.quantity -= 1 })}><Minus size={13} /> 1</button>
                    <button className="danger-action" onClick={() => {
                      if (['rare', 'epic', 'legendary'].includes(item.rarity) && !window.confirm(`Удалить редкий предмет «${item.name}»?`)) return
                      mutate((next) => { next.inventory = next.inventory.filter((candidate) => candidate.id !== item.id) })
                    }}><Trash2 size={13} /></button>
                  </div>
                </div>}
              </div>)}
              {!filteredItems.length && <EmptyMini>В рюкзаке ничего не найдено.</EmptyMini>}
            </div>
          </>}

          {tab === 'changes' && <>
            <div className="change-overview">
              <div className={`change-life-state life-${campaign.player.lifeState ?? 'active'}`}><HeartPulse size={18} /><span><small>Состояние героя</small><strong>{lifeStateLabels[campaign.player.lifeState ?? 'active']}</strong></span></div>
              <div className="change-vital-grid">
                {campaign.player.resources.slice(0, 6).map((resource) => <div className={`change-vital ${resource.criticalBelow !== undefined && resource.value <= resource.criticalBelow ? 'is-critical' : ''}`} key={resource.key}>
                  <span>{resource.label}</span><strong>{resource.value}<small>{resource.max !== undefined ? ` / ${resource.max}` : ''}</small></strong>
                  <i><b style={{ width: `${Math.max(0, Math.min(100, resource.max ? resource.value / resource.max * 100 : resource.value))}%`, background: resource.color }} /></i>
                </div>)}
              </div>
              {!!((campaign.player.statusEffects ?? []).filter((effect) => !effect.hidden).length || campaign.player.conditions.length) && <div className="change-active-effects"><ShieldAlert size={14} /><span>{[...(campaign.player.statusEffects ?? []).filter((effect) => !effect.hidden).map((effect) => effect.name), ...campaign.player.conditions].join(' · ')}</span></div>}
            </div>

            <Section title="Журнал последствий" action={<span className="count-badge">{changeMessages.length}</span>}>
              <div className="change-filters" role="group" aria-label="Фильтр изменений">
                {([['all', 'Все'], ['character', 'Герой'], ['inventory', 'Вещи'], ['social', 'Связи'], ['world', 'Мир']] as const).map(([value, label]) => <button className={changeFilter === value ? 'is-active' : ''} key={value} onClick={() => { setChangeFilter(value); setChangeLimit(30) }}>{label}</button>)}
              </div>
              <div className="change-timeline">
                {changeMessages.slice(0, changeLimit).map((message) => {
                  const changes = (message.stateChanges ?? []).filter((change) => changeMatchesFilter(change, changeFilter))
                  return <article className="change-turn" key={message.id}>
                    <header><span>Ход {message.turn}</span><time>{new Date(message.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</time></header>
                    <div className="change-turn-list">
                      {changes.map((change, index) => <StateChangeLine change={change} key={`${change.kind}-${change.entityId ?? change.label}-${index}`} />)}
                      {!changes.length && changeFilter === 'all' && message.changeSummary?.map((change, index) => <div className="state-change-line tone-neutral is-legacy" key={`${change}-${index}`}><span className="state-change-icon"><Activity size={14} /></span><span className="state-change-copy"><strong>{change}</strong></span></div>)}
                    </div>
                  </article>
                })}
                {!changeMessages.length && <EmptyMini>{changeFilter === 'all' ? 'Изменения появятся после следующего хода.' : 'В этой категории изменений пока нет.'}</EmptyMini>}
              </div>
              {changeMessages.length > changeLimit && <button className="load-more-changes" onClick={() => setChangeLimit((value) => value + 30)}>Показать ещё {Math.min(30, changeMessages.length - changeLimit)}</button>}
            </Section>
          </>}

          {tab === 'world' && <>
            <div className="world-card"><div className="eyebrow">{localizeTechnicalText(campaign.world.genre)}</div><h2>{campaign.world.name}</h2><p>{campaign.world.tagline}</p></div>
            <AdaptiveWorldModules campaign={campaign} placement="world" onDesign={onDesignInterface} designing={designingInterface} />
            <Section title="Пульс живого мира" action={<Activity size={15} />}>
              <div className="world-pulse">
                {visibleInitiatives.slice(0, 8).map((npc) => <div className="world-pulse-card" key={npc.id}><header><strong>{npc.name}</strong><span>импульс {npc.initiative!.urgency}%</span></header><p>{npc.initiative!.intent}</p><small>{npc.initiative!.visibility === 'rumored' ? 'Слух: ' : 'Следующий шаг: '}{npc.initiative!.nextMove}</small></div>)}
                {visibleWorldEvents.slice(0, 8).map((event) => <div className={`world-pulse-card event-${event.status}`} key={event.id}><header><strong>{event.title}</strong><span>{event.status === 'due' ? 'созрело' : event.dueTurn ? `к ходу ${event.dueTurn}` : event.dueDay ? `ко дню ${event.dueDay}` : 'развивается'}</span></header><p>{event.description}</p><small>{event.visibility === 'rumored' ? 'Ходят слухи' : 'Известно герою'}</small></div>)}
                {!visibleInitiatives.length && !visibleWorldEvents.length && <EmptyMini>Внешние процессы пока не дали заметных сигналов.</EmptyMini>}
              </div>
            </Section>
            <Section title="Фракции в движении" action={<Users size={15} />}>
              <div className="faction-dynamics-list">
                {campaign.world.factions.map((faction) => <article className={`faction-dynamics-card faction-${faction.status ?? 'active'}`} key={faction.id ?? faction.name}>
                  <header><div><strong>{faction.name}</strong><span>{faction.status === 'dissolved' ? 'распалась' : faction.status === 'dormant' ? 'затаилась' : 'действует'}</span></div>{faction.power !== undefined && <b>{Math.round(faction.power)}<small>/100</small></b>}</header>
                  {faction.power !== undefined && <div className="faction-power" aria-label={`Сила фракции ${Math.round(faction.power)} из 100`}><i style={{ width: `${faction.power}%` }} /></div>}
                  <p>{faction.currentMove || faction.description}</p>
                  {faction.currentMove && <small className="faction-attitude">К герою: {faction.attitude}</small>}
                  {!!faction.goals?.length && <div className="world-tag-row">{faction.goals.slice(0, 3).map((goal) => <span key={goal}>{goal}</span>)}</div>}
                  {Boolean(faction.territory?.length || faction.resources?.length) && <footer><span>{faction.territory?.length ? `Территория: ${faction.territory.slice(0, 3).join(', ')}` : 'Без закреплённой территории'}</span><span>{faction.resources?.length ? `Опора: ${faction.resources.slice(0, 2).join(', ')}` : 'Ресурсы не установлены'}</span></footer>}
                </article>)}
                {!campaign.world.factions.length && <EmptyMini>Устойчивые фракции ещё не сформировались.</EmptyMini>}
              </div>
            </Section>
            <Section title="Действующие законы" action={<Shield size={15} />}>
              <div className="world-law-list">
                {(campaign.world.laws ?? []).filter((law) => law.visibility !== 'hidden').map((law) => <article className={`world-law-card law-${law.status}`} key={law.id}>
                  <header><strong>{law.title}</strong><span>{law.status === 'proposed' ? 'проект' : law.status === 'contested' ? 'оспаривается' : law.status === 'repealed' ? 'отменён' : 'действует'}</span></header>
                  <p>{law.description}</p>
                  <dl><div><dt>Власть</dt><dd>{law.authority}</dd></div><div><dt>Область</dt><dd>{law.scope}</dd></div></dl>
                  {!!law.consequences.length && <div className="world-consequences"><b>Последствия</b>{law.consequences.map((entry) => <span key={entry}>{entry}</span>)}</div>}
                  {law.visibility === 'rumored' && <small className="rumor-mark">Сведения пока известны как слух</small>}
                </article>)}
                {!(campaign.world.laws ?? []).some((law) => law.visibility !== 'hidden') && <EmptyMini>Известные законы пока не оформлены отдельно.</EmptyMini>}
              </div>
            </Section>
            <Section title="Механики мира" action={<CircleGauge size={15} />}>
              <div className="world-mechanic-list">
                {(campaign.world.mechanics ?? []).filter((mechanic) => mechanic.discovered).map((mechanic) => <article className={`world-mechanic-card mechanic-${mechanic.status}`} key={mechanic.id}>
                  <header><div><span>{uiLabel(mechanic.category)}</span><strong>{mechanic.name}</strong></div><b>{mechanic.status === 'emerging' ? 'формируется' : mechanic.status === 'obsolete' ? 'утратила силу' : 'активна'}</b></header>
                  <p>{localizeTechnicalText(mechanic.description)}</p>
                  <div className="mechanic-trigger"><small>Когда срабатывает</small><span>{localizeTechnicalText(mechanic.trigger)}</span></div>
                  {!!mechanic.effects.length && <ul>{mechanic.effects.map((effect) => <li key={effect}>{localizeTechnicalText(effect)}</li>)}</ul>}
                  <footer>Источник: {localizeTechnicalText(mechanic.source)}</footer>
                </article>)}
                {!(campaign.world.mechanics ?? []).some((mechanic) => mechanic.discovered) && <EmptyMini>Устойчивые механики ещё предстоит открыть.</EmptyMini>}
              </div>
            </Section>
            <Section title={system.name}>
              <div className="world-system-card"><p>{localizeTechnicalText(system.summary)}</p><dl><div><dt>Развитие</dt><dd>{localizeTechnicalText(system.progression)}</dd></div><div><dt>Конфликты</dt><dd>{localizeTechnicalText(system.conflictResolution)}</dd></div><div><dt>Последствия</dt><dd>{localizeTechnicalText(system.consequences)}</dd></div></dl></div>
            </Section>
            <Section title="Карта путей" action={<Route size={15} />}>
              <div className="route-map">
                <div className="route-nodes">{campaign.world.locations.map((location) => <span className={location.name === campaign.scene.location ? 'is-current' : ''} key={location.name}><MapPin size={12} />{location.name}<i>{location.danger}%</i></span>)}</div>
                <div className="route-list">{(campaign.world.routes ?? []).filter((route) => route.discovered).map((route) => <div key={route.id}><strong>{route.from} → {route.to}</strong><span>{route.label} · {route.travelTime} · риск {route.danger}%</span></div>)}</div>
              </div>
            </Section>
            <Section title="Связи персонажей" action={<Network size={15} />}>
              <div className="social-list">{(campaign.socialLinks ?? []).filter((link) => !link.secret).map((link) => {
                const from = campaign.npcs.find((npc) => npc.id === link.fromNpcId)?.name ?? link.fromNpcId
                const to = campaign.npcs.find((npc) => npc.id === link.toNpcId)?.name ?? link.toNpcId
                return <div key={link.id}><strong>{from} ↔ {to}</strong><span>{link.label} · {link.score > 0 ? '+' : ''}{link.score}</span></div>
              })}{!(campaign.socialLinks ?? []).some((link) => !link.secret) && <EmptyMini>Открытые связи ещё не проявились.</EmptyMini>}</div>
            </Section>
            <Section title="Персональные арки" action={<Target size={15} />}>
              <div className="arc-list">{(campaign.characterArcs ?? []).filter((arc) => arc.ownerId !== campaign.player.id && !arc.secret).map((arc) => <div className="arc-card" key={arc.id}><div><strong>{arc.title}</strong><span>{entityName(arc.ownerId)} · {arc.progress}%</span></div><p>{arc.currentStage}</p><div className="mini-progress"><i style={{ width: `${arc.progress}%` }} /></div><small>{arc.theme}</small></div>)}
                {!(campaign.characterArcs ?? []).some((arc) => arc.ownerId !== campaign.player.id && !arc.secret) && <EmptyMini>Чужие личные линии пока не стали понятны герою.</EmptyMini>}
              </div>
            </Section>
            <Section title="Честные расследования" action={<Search size={15} />}>
              <div className="mystery-list">{(campaign.mysteryCases ?? []).map((mystery) => {
                const discovered = mystery.clues.filter((clue) => clue.discovered)
                return <div className="mystery-card" key={mystery.id}><div><strong>{mystery.title}</strong><span>{mystery.status === 'solved' ? 'Раскрыто' : `${discovered.length}/${mystery.clues.length} улик`}</span></div><p>{mystery.premise}</p>
                  {!!discovered.length && <ul>{discovered.map((clue) => <li key={clue.id}><b>{clue.title}</b><span>{clue.detail}</span><small>{clue.location} · {clue.source}</small></li>)}</ul>}
                  {mystery.status === 'solved' && <div className="mystery-truth"><b>Установленная истина</b><p>{mystery.truth}</p>{mystery.conclusion && <small>{mystery.conclusion}</small>}</div>}
                </div>
              })}{!(campaign.mysteryCases ?? []).length && <EmptyMini>Активных расследований нет.</EmptyMini>}</div>
            </Section>
            <Section title="Известные планы противников" action={<Swords size={15} />}>
              <div className="plan-list">{(campaign.antagonistPlans ?? []).filter((plan) => !plan.secret).map((plan) => <div className="plan-card" key={plan.id}><div><strong>{plan.title}</strong><span>Давление {plan.pressure}%</span></div><p>{plan.objective}</p><small>{entityName(plan.ownerNpcId)} · этап {Math.min(plan.steps.length, plan.currentStep + 1)} из {plan.steps.length}</small></div>)}
                {!(campaign.antagonistPlans ?? []).some((plan) => !plan.secret) && <EmptyMini>Планы противников ещё не раскрыты.</EmptyMini>}
              </div>
            </Section>
            <Section title="Услуги и влияние" action={<HeartHandshake size={15} />}>
              <div className="influence-list">{(campaign.influenceAssets ?? []).filter((asset) => !asset.secret && asset.status === 'active').map((asset) => <div className="influence-card" key={asset.id}><div><strong>{asset.title}</strong><span>{uiLabel(asset.kind, 'Влияние')} · ценность {asset.value}</span></div><p>{asset.description}</p><small>{entityName(asset.holderId)}{asset.targetId ? ` → ${entityName(asset.targetId)}` : ''} · {asset.source}</small></div>)}
                {!(campaign.influenceAssets ?? []).some((asset) => !asset.secret && asset.status === 'active') && <EmptyMini>Доступных услуг, долгов или рычагов пока нет.</EmptyMini>}
              </div>
            </Section>
            <Section title="Канон-документы" action={<button className="text-action" onClick={() => canonInput.current?.click()}><FileUp size={14} /> Загрузить</button>}>
              <input ref={canonInput} className="visually-hidden" type="file" accept=".txt,.md,.json,text/plain,text/markdown,application/json" onChange={(event) => { void importCanon(event.target.files?.[0]); event.currentTarget.value = '' }} />
              <div className="document-list">{(campaign.documents ?? []).map((document) => <div key={document.id}><span><strong>{document.title}</strong><small>{document.chunks.length} фрагментов</small></span><button aria-label={`Удалить ${document.title}`} onClick={() => mutate((next) => { next.documents = (next.documents ?? []).filter((item) => item.id !== document.id) })}><Trash2 size={13} /></button></div>)}{!(campaign.documents ?? []).length && <EmptyMini>Загрузите TXT, Markdown или JSON — нужные фрагменты будут подбираться по сцене.</EmptyMini>}{canonError && <p className="field-error">{canonError}</p>}</div>
            </Section>
            <Section title="Рентген контекста" action={<Brain size={15} />}>
              <div className="context-xray">
                <div className="context-meter"><span style={{ width: `${Math.min(100, contextPreview.estimatedChars / contextPreview.budgetChars * 100)}%` }} /></div>
                <p>{uiLabel(contextPreview.profileName)} · примерно {Math.round(contextPreview.estimatedChars / 1000)} тыс. знаков из бюджета {Math.round(contextPreview.budgetChars / 1000)} тыс.</p>
                <dl><div><dt>Дословно</dt><dd>{contextPreview.recentMessages.length} сообщений</dd></div><div><dt>Архивы</dt><dd>{contextPreview.archives.length}</dd></div><div><dt>Память</dt><dd>{contextPreview.memories.length}</dd></div><div><dt>Лор</dt><dd>{contextPreview.lore.length}</dd></div><div><dt>Канон</dt><dd>{contextPreview.documents.length} фрагм.</dd></div></dl>
                {!!lastAssistant?.continuityNotes?.length && <div className="continuity-notes"><strong>Последняя проверка</strong>{lastAssistant.continuityNotes.map((note) => <span key={note}>{localizeTechnicalText(note)}</span>)}</div>}
              </div>
            </Section>
            <Section title="Архив сцен и глав" action={<span className="count-badge">{(campaign.archives ?? []).length}</span>}>
              <div className="memory-list">{[...(campaign.archives ?? [])].reverse().slice(0, 30).map((archive) => <div className="memory-card" key={archive.id}><div><span>{uiLabel(archive.kind)} · ходы {archive.startTurn}–{archive.endTurn}</span><strong>{archive.title}</strong><p>{archive.summary}</p></div></div>)}{!(campaign.archives ?? []).length && <EmptyMini>Архивы сцен появятся после четвёртого хода.</EmptyMini>}</div>
            </Section>
            <Section title={labels.lore} action={<button className="text-action" onClick={() => setLoreEditor(true)}><Plus size={14} /> Запись</button>}>
              <div className="lore-list">
                {visibleLore.map((entry) => <div className={`lore-card ${activeLoreIds.has(entry.id) ? 'is-active-context' : ''}`} key={entry.id}>
                  <button className="lore-main" onClick={() => setExpandedLore(expandedLore === entry.id ? undefined : entry.id)}>
                    <span className="lore-type">{uiLabel(entry.type)}</span><strong>{entry.title}</strong>{entry.alwaysOn && <span className="pin-badge">всегда</span>}{activeLoreIds.has(entry.id) && <span className="context-badge">в контексте</span>}<ChevronDown size={14} />
                  </button>
                  {expandedLore === entry.id && <div className="lore-details"><p>{entry.content}</p><small>Триггеры: {entry.keys.join(', ') || 'нет'}</small><div className="lore-actions">
                    <button onClick={() => mutate((next) => { const target = next.lore.find((item) => item.id === entry.id); if (target) target.enabled = !target.enabled })}>{entry.enabled ? 'Отключить' : 'Включить'}</button>
                    <button onClick={() => mutate((next) => { const target = next.lore.find((item) => item.id === entry.id); if (target) target.alwaysOn = !target.alwaysOn })}>{entry.alwaysOn ? 'Не закреплять' : 'Закрепить'}</button>
                  </div></div>}
                </div>)}
              </div>
            </Section>
            <Section title={labels.memories} action={<span className="count-badge">{campaign.memories.length}</span>}>
              <div className="memory-list">
                {[...campaign.memories].reverse().slice(0, 20).map((memory) => <div className={`memory-card ${memory.pinned ? 'is-pinned' : ''}`} key={memory.id}><button className="memory-pin" aria-label="Закрепить воспоминание" onClick={() => mutate((next) => { const target = next.memories.find((item) => item.id === memory.id); if (target) { target.pinned = !target.pinned; target.importance = target.pinned ? 100 : Math.min(90, target.importance) } })}><BookMarked size={14} /></button><div><span>{uiLabel(memory.kind)} · ход {memory.turn}</span><p>{memory.content}</p></div></div>)}
              </div>
            </Section>
            <Section title="Правила мира"><ol className="world-rules">{campaign.world.rules.map((rule) => <li key={rule}>{rule}</li>)}</ol></Section>
          </>}
        </div>
      </aside>
      <ItemEditor open={itemEditor} presentation={presentation} onClose={() => setItemEditor(false)} onSave={(item) => mutate((next) => { item.discoveredTurn = next.turn; next.inventory.push(item) })} />
      <LoreEditor open={loreEditor} onClose={() => setLoreEditor(false)} onSave={(entry) => mutate((next) => { next.lore.push(entry) })} />
    </>
  )
}
