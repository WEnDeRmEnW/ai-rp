import type {
  Campaign,
  EventDirectorSettings,
  EventDirectorState,
  EventDirectorPermissions,
  NarrativeEventDecision,
  NarrativeEventMagnitude,
  NarrativeEventProposal,
  NarrativeEventRecord,
  NarrativeEventRequirement,
  NarrativeEventSignature,
  TurnPatch,
} from './types.js'

export const defaultEventDirectorSettings: EventDirectorSettings = {
  enabled: true,
  frequency: 'rare',
  maxMagnitude: 'mythic',
  lethality: 'fair',
  miraclePolicy: 'rare',
  canonPolicy: 'follow-campaign',
  storyImpact: 'fate-changing',
  revealMode: 'world-only',
  repetitionPolicy: 'evolving-only',
  permissions: {
    newCharacters: true,
    strongEnemies: true,
    allies: true,
    legends: true,
    powerAwakenings: true,
    powerLoss: true,
    bodyChanges: true,
    artifactCreation: true,
    itemLoss: true,
    politics: true,
    wars: true,
    disasters: true,
    anomalies: true,
    realityChanges: true,
    dimensionalTravel: true,
    temporalEvents: true,
    socialEvents: true,
    miracles: true,
  },
}

export function defaultEventDirectorState(turn = 0): EventDirectorState {
  return {
    surpriseCharge: 0,
    lastEvaluatedTurn: turn,
    miracleCount: 0,
    categoryCooldowns: {},
    recentSignatures: [],
    history: [],
    activeEvents: [],
  }
}

export function normalizeEventDirectorSettings(settings?: Omit<Partial<EventDirectorSettings>, 'permissions'> & {
  permissions?: Partial<EventDirectorPermissions>
}): EventDirectorSettings {
  return {
    ...defaultEventDirectorSettings,
    ...(settings ?? {}),
    permissions: {
      ...defaultEventDirectorSettings.permissions,
      ...(settings?.permissions ?? {}),
    },
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum))
}

export function normalizeEventDirectorState(state: EventDirectorState | undefined, turn: number): EventDirectorState {
  const fallback = defaultEventDirectorState(turn)
  if (!state) return fallback
  return {
    surpriseCharge: clamp(state.surpriseCharge, 0, 100),
    lastEvaluatedTurn: Math.max(0, Math.round(state.lastEvaluatedTurn ?? turn)),
    nextEvaluationTurn: state.nextEvaluationTurn === undefined ? undefined : Math.max(0, Math.round(state.nextEvaluationTurn)),
    lastSeedTurn: state.lastSeedTurn === undefined ? undefined : Math.max(0, Math.round(state.lastSeedTurn)),
    lastManifestedTurn: state.lastManifestedTurn === undefined ? undefined : Math.max(0, Math.round(state.lastManifestedTurn)),
    lastLegendaryTurn: state.lastLegendaryTurn === undefined ? undefined : Math.max(0, Math.round(state.lastLegendaryTurn)),
    lastMiracleTurn: state.lastMiracleTurn === undefined ? undefined : Math.max(0, Math.round(state.lastMiracleTurn)),
    miracleCount: Math.max(0, Math.round(state.miracleCount ?? 0)),
    categoryCooldowns: Object.fromEntries(Object.entries(state.categoryCooldowns ?? {})
      .filter(([, dueTurn]) => Number.isFinite(dueTurn))
      .map(([category, dueTurn]) => [category, Math.max(0, Math.round(dueTurn ?? 0))])),
    recentSignatures: (state.recentSignatures ?? []).slice(-24).map((entry) => ({
      ...entry,
      affectedDomains: [...new Set(entry.affectedDomains ?? [])],
      turn: Math.max(0, Math.round(entry.turn)),
    })),
    history: (state.history ?? []).slice(-160).map((entry) => ({
      ...entry,
      sourceIds: [...new Set(entry.sourceIds ?? [])],
      causeIds: [...new Set(entry.causeIds ?? [])],
      scopeIds: [...new Set(entry.scopeIds ?? [])],
      participantIds: [...new Set(entry.participantIds ?? [])],
      affectedDomains: [...new Set(entry.affectedDomains ?? [])],
      keyConsequences: (entry.keyConsequences ?? []).slice(0, 12),
      turn: Math.max(0, Math.round(entry.turn)),
    })),
    activeEvents: (state.activeEvents ?? []).slice(-12).map((event) => ({
      ...event,
      miracleKind: event.miracleKind ?? 'none',
      sourceIds: [...new Set(event.sourceIds ?? [])],
      causeIds: [...new Set(event.causeIds ?? [])],
      scopeIds: [...new Set(event.scopeIds ?? [])],
      participantIds: [...new Set(event.participantIds ?? [])],
      affectedDomains: [...new Set(event.affectedDomains ?? [])],
      observableSigns: event.observableSigns ?? [],
      immediateEffects: event.immediateEffects ?? [],
      persistentEffects: event.persistentEffects ?? [],
      counterplay: event.counterplay ?? [],
      cancellationConditions: event.cancellationConditions ?? [],
      minimumDelay: Math.max(0, Math.round(event.minimumDelay ?? 0)),
      createdTurn: Math.max(0, Math.round(event.createdTurn)),
      lastAdvancedTurn: Math.max(0, Math.round(event.lastAdvancedTurn)),
      nextEligibleTurn: Math.max(0, Math.round(event.nextEligibleTurn)),
    })),
  }
}

const frequencyMultiplier = { rare: 0.75, balanced: 1, frequent: 1.35 } as const
const dynamicsMultiplier = { quiet: 0.75, living: 1, volatile: 1.25 } as const

/** Advances only the deterministic readiness clock. No event is invented here. */
export function prepareEventDirectorState(campaign: Campaign): EventDirectorState {
  const settings = normalizeEventDirectorSettings(campaign.settings.eventDirector)
  const turn = campaign.turn + 1
  const state = normalizeEventDirectorState(campaign.eventDirectorState, campaign.turn)
  if (!settings.enabled || state.lastEvaluatedTurn >= turn) return state
  const turns = Math.max(1, turn - state.lastEvaluatedTurn)
  const beat = campaign.pacing?.beat
  const pressureTurns = campaign.pacing?.consecutivePressureTurns ?? 0
  const breathingBonus = beat === 'respite' || beat === 'exploration' ? 1 : 0
  const pressurePenalty = pressureTurns >= 3 || beat === 'climax' ? 2 : 0
  const perTurn = Math.max(1, (4 + breathingBonus - pressurePenalty)
    * frequencyMultiplier[settings.frequency]
    * dynamicsMultiplier[campaign.settings.worldDynamics ?? 'living'])
  return {
    ...state,
    surpriseCharge: clamp(state.surpriseCharge + perTurn * turns, 0, 100),
    lastEvaluatedTurn: turn,
    categoryCooldowns: Object.fromEntries(Object.entries(state.categoryCooldowns)
      .filter(([, dueTurn]) => (dueTurn ?? 0) > turn)),
  }
}

export function shouldConsultEventDirector(campaign: Campaign, state: EventDirectorState) {
  const settings = normalizeEventDirectorSettings(campaign.settings.eventDirector)
  if (!settings.enabled) return false
  if (state.activeEvents.some((event) => event.nextEligibleTurn <= campaign.turn + 1)) return true
  if ((state.nextEvaluationTurn ?? 0) > campaign.turn + 1) return false
  return state.surpriseCharge >= 30
}

const magnitudeRank: Record<NarrativeEventMagnitude, number> = {
  subtle: 0,
  notable: 1,
  major: 2,
  legendary: 3,
  mythic: 4,
}

const stageRank: Record<NarrativeEventRecord['stage'], number> = {
  seeded: 0,
  foreshadowed: 1,
  forming: 2,
  imminent: 3,
  manifested: 4,
  aftermath: 5,
  resolved: 6,
  cancelled: 6,
}

function normalizedText(value: string) {
  return value.trim().toLocaleLowerCase('ru-RU').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export function narrativeEventSignature(proposal: NarrativeEventProposal) {
  const dominantDomain = proposal.affectedDomains[0] ?? 'scene'
  const origin = proposal.sourceIds[0] ?? proposal.originKind
  const scope = proposal.scopeIds[0] ?? 'unspecified'
  const arrival = normalizedText(proposal.arrivalMethod).split(' ').slice(0, 4).join('-')
  return [proposal.category, proposal.magnitude, origin, dominantDomain, scope, arrival].join('|')
}

function knownIds(campaign: Campaign) {
  return new Set([
    campaign.player.id,
    ...campaign.inventory.map((item) => item.id),
    ...campaign.player.abilities.map((ability) => ability.id),
    ...campaign.npcs.flatMap((npc) => [npc.id, ...(npc.abilities ?? []).map((ability) => ability.id)]),
    ...campaign.quests.map((quest) => quest.id),
    ...campaign.lore.map((entry) => entry.id),
    ...campaign.memories.map((entry) => entry.id),
    ...(campaign.socialLinks ?? []).map((link) => link.id),
    ...(campaign.threads ?? []).map((thread) => thread.id),
    ...(campaign.worldEvents ?? []).map((event) => event.id),
    ...(campaign.worldPressures ?? []).map((pressure) => pressure.id),
    ...(campaign.characterArcs ?? []).map((arc) => arc.id),
    ...(campaign.mysteryCases ?? []).flatMap((mystery) => [mystery.id, ...mystery.clues.map((clue) => clue.id)]),
    ...(campaign.antagonistPlans ?? []).map((plan) => plan.id),
    ...(campaign.influenceAssets ?? []).map((asset) => asset.id),
    ...(campaign.world.factions ?? []).flatMap((faction) => faction.id ? [faction.id] : []),
    ...(campaign.world.routes ?? []).map((route) => route.id),
    ...(campaign.world.places ?? []).map((place) => place.id),
    ...(campaign.world.processes ?? []).map((process) => process.id),
    ...(campaign.world.legends ?? []).flatMap((legend) => [
      legend.id,
      ...legend.deeds.map((deed) => deed.id),
      ...legend.legacies.map((legacy) => legacy.id),
    ]),
    ...(campaign.world.laws ?? []).map((law) => law.id),
    ...(campaign.world.mechanics ?? []).map((mechanic) => mechanic.id),
    ...(campaign.world.interfaceModules ?? []).map((module) => module.id),
    ...(campaign.world.metrics ?? []).map((metric) => metric.id),
    ...(campaign.world.chronicle ?? []).flatMap((entry) => [entry.id, entry.sourceId]),
    ...(campaign.documents ?? []).flatMap((document) => [document.id, ...document.chunks.map((chunk) => chunk.id)]),
    ...(campaign.activeConflict ? [campaign.activeConflict.id, ...campaign.activeConflict.participants.map((participant) => participant.entityId)] : []),
    ...(campaign.eventDirectorState?.activeEvents ?? []).map((event) => event.id),
    ...(campaign.eventDirectorState?.history ?? []).map((event) => event.id),
  ])
}

function permissionIssues(settings: EventDirectorSettings, proposal: NarrativeEventProposal) {
  const permissions = settings.permissions
  const requirements = [...proposal.immediateEffects, ...proposal.persistentEffects]
  const semanticText = normalizedText([
    proposal.concept,
    proposal.trigger,
    proposal.arrivalMethod,
    ...requirements.map((entry) => entry.requirement),
  ].join(' '))
  const issues: string[] = []
  if (proposal.originKind === 'new_npc' && !permissions.newCharacters) issues.push('Создание новых персонажей отключено.')
  if (proposal.category === 'legend' && !permissions.legends) issues.push('События легенд отключены.')
  if (proposal.category === 'power_shift' && requirements.some((entry) => entry.operation === 'create') && !permissions.powerAwakenings) issues.push('Пробуждение новых сил отключено.')
  if (proposal.category === 'power_shift' && requirements.some((entry) => entry.operation === 'remove') && !permissions.powerLoss) issues.push('Утрата сил отключена.')
  if (proposal.category === 'artifact_shift' && requirements.some((entry) => entry.operation === 'create') && !permissions.artifactCreation) issues.push('Создание артефактов отключено.')
  if (requirements.some((entry) => entry.domain === 'inventory' && entry.operation === 'remove') && !permissions.itemLoss) issues.push('Потеря предметов отключена.')
  if (proposal.category === 'faction_move' && !permissions.politics) issues.push('Политические события отключены.')
  if (proposal.category === 'disaster' && !permissions.disasters) issues.push('Катастрофы отключены.')
  if (proposal.category === 'anomaly' && !permissions.anomalies) issues.push('Аномалии отключены.')
  if (proposal.category === 'law_change' && !permissions.realityChanges) issues.push('Изменение фундаментальных законов отключено.')
  if (proposal.category === 'dimensional' && !permissions.dimensionalTravel) issues.push('Межпространственные события отключены.')
  if (proposal.category === 'temporal' && !permissions.temporalEvents) issues.push('Временные события отключены.')
  if (proposal.category === 'social_reversal' && !permissions.socialEvents) issues.push('Социальные события отключены.')
  if (proposal.miracleKind !== 'none' && !permissions.miracles) issues.push('Чудеса и чудесные знаки отключены.')
  if (proposal.category === 'encounter' && proposal.magnitude !== 'subtle' && !permissions.strongEnemies && requirements.some((entry) => entry.domain === 'conflict')) issues.push('Сильные противники отключены.')
  if (!permissions.allies && requirements.some((entry) => entry.domain === 'party' && ['create', 'update'].includes(entry.operation))) issues.push('Добавление новых союзников отключено.')
  if (!permissions.wars && /(?:^|\s)(?:войн|вторжен|военн|мобилизац|фронт|осад)\p{L}*/iu.test(semanticText)) issues.push('Войны и большие военные конфликты отключены.')
  if (requirements.some((entry) => entry.domain === 'player' && entry.operation === 'transform') && !permissions.bodyChanges) issues.push('Телесные изменения героя отключены.')
  return issues
}

const agencyViolation = /(?:^|[\s,.;:!?])(?:герой\s+)?(?:решил|решила|согласил(?:ся|ась)|полюбил|полюбила|возненавидел|возненавидела|простил|простила|почувствовал(?:а)?\s+(?:любовь|ненависть)|выбрал(?:а)?\s+сторону)(?=$|[\s,.;:!?])/iu

export function validateNarrativeEventProposal(campaign: Campaign, state: EventDirectorState, proposal: NarrativeEventDecision) {
  if (proposal.mode === 'none') return []
  const turn = campaign.turn + 1
  const settings = normalizeEventDirectorSettings(campaign.settings.eventDirector)
  const issues = permissionIssues(settings, proposal)
  const requirements = [...proposal.immediateEffects, ...proposal.persistentEffects]
  const active = proposal.existingEventId ? state.activeEvents.find((event) => event.id === proposal.existingEventId) : undefined
  if (proposal.existingEventId && !active) issues.push('Указано неизвестное внутреннее событие.')
  if (active && active.nextEligibleTurn > turn) issues.push('Выбранная скрытая линия ещё не достигла срока следующего причинного этапа.')
  if (active && proposal.lifecycleStage && stageRank[proposal.lifecycleStage] < stageRank[active.stage]) issues.push('Жизненный цикл события не может перейти на более раннюю стадию.')
  if (magnitudeRank[proposal.magnitude] > magnitudeRank[settings.maxMagnitude]) issues.push('Масштаб события выше разрешённого в настройках.')
  if (proposal.mode === 'seed' && proposal.existingEventId) issues.push('Новое зерно не может ссылаться на существующее событие.')
  if (proposal.mode === 'seed' && proposal.immediateEffects.some((effect) => effect.mandatory)) issues.push('Скрытое зерно не может требовать немедленной материализации в состоянии мира.')
  if (proposal.mode !== 'seed' && !proposal.existingEventId && proposal.lifecycleStage !== 'manifested') issues.push('Продвижение скрытой линии требует точного existingEventId.')
  if (proposal.mode === 'advance' && !proposal.existingEventId) issues.push('Продвижение события требует точного existingEventId.')
  if (proposal.mode === 'advance' && proposal.lifecycleStage && !['forming', 'imminent', 'aftermath', 'resolved', 'cancelled'].includes(proposal.lifecycleStage)) issues.push('advance допускает только forming, imminent, aftermath, resolved или cancelled.')
  if (!proposal.lifecycleStage) issues.push('Для события не указана стадия жизненного цикла.')
  if (proposal.mode === 'manifest' && proposal.lifecycleStage !== 'manifested') issues.push('Проявленное событие должно иметь lifecycleStage=manifested.')
  if (proposal.mode === 'foreshadow' && proposal.lifecycleStage !== 'foreshadowed') issues.push('Предвестник должен иметь lifecycleStage=foreshadowed.')
  if (proposal.mode === 'seed' && proposal.lifecycleStage !== 'seeded') issues.push('Новое зерно должно иметь lifecycleStage=seeded.')
  if (!proposal.affectedDomains.length) issues.push('Событие не затрагивает ни одной области состояния.')
  const entityCreateDomains = new Set<NarrativeEventRequirement['domain']>([
    'npc', 'ability', 'artifact', 'inventory', 'quest', 'faction', 'place', 'route', 'process', 'law', 'mechanic', 'legend', 'lore', 'world-event', 'world-pressure',
  ])
  if ([...proposal.immediateEffects, ...proposal.persistentEffects].some((effect) => (
    effect.operation === 'create' && entityCreateDomains.has(effect.domain) && !effect.targetId
  ))) issues.push('Создание постоянной сущности требует заранее выбранного стабильного targetId.')
  if (settings.canonPolicy === 'established-only' && requirements.some((effect) => effect.operation === 'create' && entityCreateDomains.has(effect.domain))) issues.push('Режим установленного канона запрещает создание новой постоянной сущности.')
  const unlistedDomains = requirements.filter((effect) => !proposal.affectedDomains.includes(effect.domain))
  if (unlistedDomains.length) issues.push('affectedDomains не перечисляет все области, которые событие требует изменить.')
  if (proposal.originKind === 'new_npc' && !requirements.some((effect) => effect.domain === 'npc' && effect.operation === 'create' && effect.mandatory)) issues.push('Источник new_npc требует обязательного создания полного NPC.')
  if (proposal.category === 'power_shift' && !requirements.some((effect) => effect.domain === 'ability')) issues.push('Изменение силы требует семантического требования домена ability.')
  if (proposal.category === 'artifact_shift' && !requirements.some((effect) => ['artifact', 'inventory'].includes(effect.domain))) issues.push('Изменение артефакта требует фактического изменения artifact или inventory.')
  if (proposal.category === 'law_change' && !requirements.some((effect) => ['law', 'mechanic'].includes(effect.domain))) issues.push('Изменение закона реальности требует изменения law или mechanic.')
  if (proposal.category === 'faction_move' && !requirements.some((effect) => ['faction', 'process', 'world-event', 'world-pressure'].includes(effect.domain))) issues.push('Действие фракции требует постоянного изменения фракции, процесса, события или давления мира.')
  if (!proposal.trigger.trim()) issues.push('У события отсутствует проверяемый триггер.')
  if (proposal.mode === 'manifest' && !proposal.arrivalMethod.trim()) issues.push('Не объяснён способ появления события в сцене.')
  if (proposal.mode === 'foreshadow' && !proposal.observableSigns.length) issues.push('Предвестник не содержит ни одного наблюдаемого признака.')
  if (proposal.mode === 'manifest' && ![...proposal.immediateEffects, ...proposal.persistentEffects].some((effect) => effect.mandatory)) issues.push('Проявленное событие не содержит ни одного обязательного фактического последствия.')
  if (proposal.mode === 'manifest' && magnitudeRank[proposal.magnitude] >= magnitudeRank.major && !proposal.counterplay.length) issues.push('У крупного события отсутствует доступное противодействие или путь пережить его.')
  if (proposal.mode === 'manifest' && magnitudeRank[proposal.magnitude] >= magnitudeRank.major && !proposal.causeIds.length && !proposal.existingEventId) issues.push('Крупное событие требует существующей причины либо ранее заложенной линии.')
  if (settings.lethality === 'cinematic' && proposal.mode === 'manifest' && [...proposal.immediateEffects, ...proposal.persistentEffects].some((effect) => (
    effect.domain === 'player' && effect.mandatory && /(?:неизбежн\p{L}*\s+смерт|герой\s+(?:убит|погиб)|смерть\s+геро)/iu.test(effect.requirement)
  ))) issues.push('Кинематографичный режим запрещает обязательную неизбежную гибель героя.')
  if (settings.storyImpact === 'scene-only' && proposal.persistentEffects.some((effect) => effect.mandatory)) issues.push('Настройки разрешают влияние только на текущую сцену.')
  if (settings.storyImpact === 'side-arcs' && ['law_change', 'disaster'].includes(proposal.category) && magnitudeRank[proposal.magnitude] >= magnitudeRank.legendary) issues.push('Настройки запрещают судьбоносное изменение основной истории.')
  if (settings.canonPolicy === 'established-only' && proposal.originKind === 'new_npc') issues.push('Режим использует только уже установленные сущности.')
  if (settings.canonPolicy !== 'free' && campaign.settings.canonMode === 'faithful' && ['law_change', 'divine'].includes(proposal.category) && !proposal.causeIds.length) issues.push('В строгом каноне фундаментальному событию нужна существующая причинная опора.')
  if (proposal.category === 'law_change' && proposal.mode === 'manifest' && magnitudeRank[proposal.magnitude] >= magnitudeRank.major && (!active || turn - active.createdTurn < 3)) issues.push('Фундаментальное изменение мира требует ранее заложенной арки минимум в три хода.')
  if (proposal.miracleKind === 'sign' && settings.miraclePolicy === 'off') issues.push('Чудесные знаки запрещены выбранным режимом.')
  if (proposal.miracleKind === 'intervention' && proposal.mode === 'manifest') {
    if (settings.miraclePolicy !== 'rare') issues.push('Прямое чудо запрещено выбранным режимом.')
    if (state.surpriseCharge < 98) issues.push('Для прямого чуда ещё не накоплена исключительная готовность истории.')
    if (state.lastMiracleTurn !== undefined && turn - state.lastMiracleTurn < 40) issues.push('После предыдущего чуда не прошло 40 ходов.')
    const miracleText = normalizedText([
      proposal.concept,
      proposal.trigger,
      ...requirements.map((effect) => effect.requirement),
    ].join(' '))
    if (!/(?:гибел|смертел|смерт|полный тупик|невозможност\p{L}* действовать|немедленн\p{L}* уничтож)/iu.test(miracleText)) issues.push('Прямое чудо допустимо только при непосредственной гибели или полном тупике.')
    if (requirements.some((effect) => (
      effect.mandatory && (
        (effect.domain === 'npc' && effect.operation === 'remove')
        || (effect.domain === 'relationship' && ['create', 'update', 'transform'].includes(effect.operation))
        || (effect.domain === 'inventory' && effect.operation === 'create' && /восстанов|вернут|воскрес/iu.test(effect.requirement))
        || /(?:уничтож\p{L}* враг|автоматическ\p{L}* побед|стерет\p{L}* последств|полностью исцел|отмен\p{L}* потер)/iu.test(effect.requirement)
      )
    ))) issues.push('Прямое чудо пытается превратить спасение в победу либо стереть уже произошедшие последствия.')
  }
  const known = knownIds(campaign)
  const referenceIds = [...proposal.sourceIds, ...proposal.causeIds, ...proposal.scopeIds, ...proposal.participantIds]
  if (referenceIds.some((id) => !known.has(id))) issues.push('Событие содержит ссылку на неизвестную сущность; новые сущности должны создаваться через требования, а не притворяться существующими.')
  if ([...proposal.immediateEffects, ...proposal.persistentEffects].some((effect) => effect.domain === 'player' && agencyViolation.test(effect.requirement))) issues.push('Событие пытается назначить герою внутреннее решение или чувство.')
  const cooldown = state.categoryCooldowns[proposal.category] ?? 0
  if (!proposal.existingEventId && cooldown > turn) issues.push('Категория ещё находится на перерыве после недавнего события.')
  const signature = narrativeEventSignature(proposal)
  if (!proposal.existingEventId && settings.repetitionPolicy !== 'unrestricted') {
    const recentWindow = settings.repetitionPolicy === 'evolving-only' ? 16 : 10
    const duplicate = state.recentSignatures.some((entry) => (
      turn - entry.turn <= recentWindow
      && (entry.signature === signature || (
        entry.category === proposal.category
        && entry.originKind === proposal.originKind
        && entry.affectedDomains[0] === proposal.affectedDomains[0]
      ))
    ))
    if (duplicate) issues.push('Событие слишком похоже на недавний сюжетный рисунок и не является развитием прежней линии.')
  }
  const threshold = proposal.mode === 'seed'
    ? 30
    : proposal.mode === 'foreshadow'
      ? 45
      : proposal.mode === 'manifest'
        ? proposal.magnitude === 'mythic' ? 98 : proposal.magnitude === 'legendary' ? 90 : proposal.magnitude === 'major' ? 75 : proposal.magnitude === 'notable' ? 60 : 45
        : 0
  if (!proposal.existingEventId && state.surpriseCharge < threshold) issues.push('История ещё не накопила готовность к событию такого масштаба.')
  return [...new Set(issues)]
}

const stageForMode = {
  seed: 'seeded',
  foreshadow: 'foreshadowed',
  advance: 'forming',
  manifest: 'manifested',
} as const

const chargeCost: Record<NarrativeEventModeCostKey, number> = {
  seed: 8,
  foreshadow: 15,
  advance: 10,
  subtle: 28,
  notable: 40,
  major: 65,
  legendary: 85,
  mythic: 100,
}
type NarrativeEventModeCostKey = Exclude<NarrativeEventProposal['mode'], 'manifest'> | NarrativeEventMagnitude

function toRecord(proposal: NarrativeEventProposal, id: string, createdTurn: number, currentTurn: number): NarrativeEventRecord {
  const { mode: _mode, existingEventId: _existing, lifecycleStage, ...content } = proposal
  void _mode
  void _existing
  return {
    ...content,
    id,
    stage: lifecycleStage ?? stageForMode[proposal.mode as Exclude<NarrativeEventProposal['mode'], 'none'>],
    signature: narrativeEventSignature(proposal),
    createdTurn,
    lastAdvancedTurn: currentTurn,
    nextEligibleTurn: currentTurn + Math.max(1, proposal.minimumDelay),
  }
}

export function applyNarrativeEventProposal(
  campaign: Campaign,
  preparedState: EventDirectorState,
  proposal: NarrativeEventDecision,
  createId: () => string,
): EventDirectorState {
  const turn = campaign.turn + 1
  const state = normalizeEventDirectorState(preparedState, campaign.turn)
  if (proposal.mode === 'none') {
    const frequency = normalizeEventDirectorSettings(campaign.settings.eventDirector).frequency
    const evaluationDelay = frequency === 'rare' ? 4 : frequency === 'balanced' ? 3 : 2
    return {
      ...state,
      surpriseCharge: clamp(state.surpriseCharge - 4, 0, 100),
      nextEvaluationTurn: turn + evaluationDelay,
      activeEvents: state.activeEvents.map((event) => (
        event.nextEligibleTurn <= turn ? { ...event, nextEligibleTurn: turn + evaluationDelay } : event
      )),
      lastEvaluatedTurn: turn,
    }
  }
  const existingIndex = proposal.existingEventId
    ? state.activeEvents.findIndex((event) => event.id === proposal.existingEventId)
    : -1
  const existing = existingIndex >= 0 ? state.activeEvents[existingIndex] : undefined
  const id = existing?.id ?? createId()
  const nextRecord = {
    ...toRecord(proposal, id, existing?.createdTurn ?? turn, turn),
    createdTurn: existing?.createdTurn ?? turn,
  }
  const stage = proposal.lifecycleStage ?? nextRecord.stage
  const terminal = stage === 'resolved' || stage === 'cancelled'
  const activeEvents = [...state.activeEvents]
  if (terminal) {
    if (existingIndex >= 0) activeEvents.splice(existingIndex, 1)
  } else if (existingIndex >= 0) {
    activeEvents[existingIndex] = { ...existing, ...nextRecord, stage, lastAdvancedTurn: turn }
  } else {
    activeEvents.push({ ...nextRecord, stage })
  }
  const manifested = proposal.mode === 'manifest' || stage === 'manifested'
  const historyEntry: NarrativeEventSignature | undefined = manifested || terminal ? {
    signature: narrativeEventSignature(proposal),
    category: proposal.category,
    magnitude: proposal.magnitude,
    originKind: proposal.originKind,
    affectedDomains: proposal.affectedDomains,
    turn,
    outcome: stage === 'cancelled' ? 'cancelled' : stage === 'resolved' ? 'resolved' : 'manifested',
  } : undefined
  const compactHistoryEntry = historyEntry ? {
    ...historyEntry,
    id,
    concept: proposal.concept,
    sourceIds: proposal.sourceIds,
    causeIds: proposal.causeIds,
    scopeIds: proposal.scopeIds,
    participantIds: proposal.participantIds,
    keyConsequences: [...proposal.immediateEffects, ...proposal.persistentEffects]
      .filter((effect) => effect.mandatory)
      .map((effect) => effect.requirement)
      .slice(0, 12),
    previousEventId: proposal.existingEventId,
  } : undefined
  const history = [...state.history]
  if (compactHistoryEntry) {
    const previousIndex = history.findIndex((entry) => entry.id === id)
    if (previousIndex >= 0) history[previousIndex] = compactHistoryEntry
    else history.push(compactHistoryEntry)
  }
  const costKey: NarrativeEventModeCostKey = manifested ? proposal.magnitude : proposal.mode as NarrativeEventModeCostKey
  const categoryDelay = manifested
    ? proposal.magnitude === 'mythic' ? 40 : proposal.magnitude === 'legendary' ? 18 : 10
    : 4
  return {
    ...state,
    surpriseCharge: clamp(state.surpriseCharge - chargeCost[costKey], 0, 100),
    lastSeedTurn: proposal.mode === 'seed' ? turn : state.lastSeedTurn,
    lastManifestedTurn: manifested ? turn : state.lastManifestedTurn,
    lastLegendaryTurn: manifested && (proposal.magnitude === 'legendary' || proposal.magnitude === 'mythic') ? turn : state.lastLegendaryTurn,
    lastMiracleTurn: manifested && proposal.miracleKind === 'intervention' ? turn : state.lastMiracleTurn,
    miracleCount: state.miracleCount + (manifested && proposal.miracleKind === 'intervention' ? 1 : 0),
    categoryCooldowns: {
      ...state.categoryCooldowns,
      [proposal.category]: turn + categoryDelay,
    },
    recentSignatures: historyEntry ? [...state.recentSignatures, historyEntry].slice(-24) : state.recentSignatures,
    history: history.slice(-160),
    activeEvents: activeEvents.slice(-12),
    nextEvaluationTurn: turn + (proposal.mode === 'seed' ? 2 : 1),
    lastEvaluatedTurn: turn,
  }
}

function isCompleteEventAbility(ability: NonNullable<TurnPatch['addAbilities']>[number] | undefined) {
  if (!ability) return false
  return Boolean(
    ability.name?.trim()
    && ability.description?.trim()
    && ability.source?.trim()
    && ability.kind
    && Number.isFinite(ability.mastery)
    && Array.isArray(ability.costs)
    && Array.isArray(ability.effects) && ability.effects.length > 0
    && Array.isArray(ability.limitations)
    && Array.isArray(ability.requirements)
    && ability.progression?.trim()
    && Array.isArray(ability.evolutionPaths)
    && Array.isArray(ability.history) && ability.history.length > 0
    && Array.isArray(ability.tags) && ability.tags.length > 0
    && ability.category
    && ability.scale?.trim()
    && ability.activation?.trim()
    && Array.isArray(ability.capabilities) && ability.capabilities.length > 0
    && Array.isArray(ability.synergies)
    && Array.isArray(ability.counters)
    && Array.isArray(ability.examples) && ability.examples.length > 0
    && Array.isArray(ability.techniques)
    && ability.canonStatus
  )
}

function isCompleteEventNpc(npc: Extract<NonNullable<TurnPatch['npcs']>[number], { operation: 'add' }>['npc'] | undefined) {
  if (!npc) return false
  return Boolean(
    npc.personality?.trim()
    && Array.isArray(npc.stats)
    && Array.isArray(npc.resources)
    && Array.isArray(npc.abilities)
    && npc.abilities.every((ability) => isCompleteEventAbility(ability))
    && Array.isArray(npc.knowledge)
    && npc.relationshipDimensions
    && npc.initiative
    && npc.strategy
    && npc.recruitment
    && npc.dossier
    && npc.voice
  )
}

function isCompleteStrongEnemy(npc: Extract<NonNullable<TurnPatch['npcs']>[number], { operation: 'add' }>['npc'] | undefined) {
  return Boolean(
    isCompleteEventNpc(npc)
    && npc?.abilities?.length
    && npc.threatProfile
    && npc.threatProfile.whyDangerous.length
    && npc.threatProfile.constraints.length
    && npc.threatProfile.defeatRequirements.length
    && npc.strategy?.countermeasures?.length
    && npc.strategy.retreatConditions?.length
    && npc.strategy.ethicalLimits?.length
    && npc.strategy.blindSpots.length
    && npc.strategy.contingencies.length
  )
}

function isCompleteCreatedArtifact(item: Extract<NonNullable<TurnPatch['inventory']>[number], { operation: 'add' }>['item'] | undefined) {
  const artifact = item?.artifact
  return Boolean(
    item?.id
    && item.origin?.trim()
    && item.rarityProfile
    && item.history?.length
    && artifact
    && artifact.classification?.trim()
    && artifact.powerSource?.trim()
    && artifact.operatingPrinciple?.trim()
    && artifact.scale?.trim()
    && artifact.canonStatus
    && (artifact.powers.length > 0 || artifact.passiveEffects.length > 0 || artifact.combinedEffects.length > 0)
    && artifact.powers.every((power) => (
      power.description.trim()
      && Number.isFinite(power.mastery)
      && Array.isArray(power.costs)
      && Array.isArray(power.limitations)
      && power.activation?.trim()
      && power.scale?.trim()
      && power.category
      && power.capabilities?.length
      && Array.isArray(power.synergies)
      && Array.isArray(power.counters)
      && power.examples?.length
      && Array.isArray(power.techniques)
      && power.canonStatus
    ))
  )
}

function requirementSatisfied(requirement: NarrativeEventRequirement, patch: TurnPatch) {
  const targetId = requirement.targetId
  switch (requirement.domain) {
    case 'player':
      return Boolean(patch.playerProfile || patch.upsertStats?.length || patch.removeStatKeys?.length || patch.upsertResources?.length
        || patch.removeResourceKeys?.length || Object.keys(patch.statDeltas ?? {}).length || Object.keys(patch.resourceDeltas ?? {}).length
        || patch.addConditions?.length || patch.removeConditions?.length || patch.upsertStatusEffects?.length || patch.removeStatusEffectIds?.length)
    case 'npc':
      return Boolean(patch.npcs?.some((entry) => (
        requirement.operation === 'create'
          ? entry.operation === 'add' && (!targetId || entry.npc.id === targetId) && isCompleteEventNpc(entry.npc)
          : entry.operation === 'update' && (!targetId || entry.targetId === targetId)
      )))
    case 'ability':
      if (requirement.operation === 'create') return Boolean(patch.addAbilities?.some((ability) => (!targetId || ability.id === targetId) && isCompleteEventAbility(ability))
        || patch.npcs?.some((entry) => entry.operation === 'update' && entry.npc.upsertAbilities?.some((ability) => (!targetId || ability.id === targetId) && isCompleteEventAbility(ability))))
      if (requirement.operation === 'remove') return Boolean(
        (!targetId ? patch.removeAbilityIds?.length : patch.removeAbilityIds?.includes(targetId))
        || patch.npcs?.some((entry) => entry.operation === 'update' && (!targetId ? entry.npc.removeAbilityIds?.length : entry.npc.removeAbilityIds?.includes(targetId))),
      )
      return Boolean(patch.abilityChanges?.some((entry) => !targetId || entry.abilityId === targetId)
        || patch.npcs?.some((entry) => entry.operation === 'update' && entry.npc.abilityChanges?.some((change) => !targetId || change.abilityId === targetId)))
    case 'artifact':
      if (requirement.operation === 'create') return Boolean(patch.inventory?.some((entry) => (
        entry.operation === 'add' && (!targetId || entry.item.id === targetId) && isCompleteCreatedArtifact(entry.item)
      )))
      if (requirement.operation === 'remove') return Boolean(patch.inventory?.some((entry) => entry.operation === 'remove' && (!targetId || entry.targetId === targetId)))
      return Boolean(patch.artifactChanges?.some((entry) => !targetId || entry.itemId === targetId)
        || patch.inventory?.some((entry) => entry.operation === 'update' && (!targetId || entry.targetId === targetId) && entry.item.artifact))
    case 'inventory':
      return Boolean(patch.inventory?.some((entry) => (
        requirement.operation === 'create' ? entry.operation === 'add' && (!targetId || entry.item.id === targetId)
          : requirement.operation === 'remove' ? entry.operation === 'remove' && (!targetId || entry.targetId === targetId)
            : entry.operation === 'update' && (!targetId || entry.targetId === targetId)
      )))
    case 'relationship':
      return Boolean(patch.relationships?.some((entry) => !targetId || entry.npcId === targetId) || patch.socialLinks?.length)
    case 'party':
      if (requirement.operation === 'remove') return Boolean(patch.party?.removeNpcIds?.some((id) => !targetId || id === targetId))
      return Boolean(patch.party?.addNpcIds?.some((id) => !targetId || id === targetId) || (targetId && patch.party?.roles?.[targetId]))
    case 'quest':
      return Boolean(patch.quests?.some((entry) => (
        requirement.operation === 'create'
          ? entry.operation === 'add' && (!targetId || entry.quest?.id === targetId)
          : requirement.operation === 'remove'
            ? ['complete', 'fail'].includes(entry.operation) && (!targetId || entry.targetId === targetId)
            : entry.operation === 'update' && (!targetId || entry.targetId === targetId)
      )))
    case 'conflict':
      if (requirement.operation === 'create') return patch.conflict?.operation === 'start'
      if (requirement.operation === 'remove') return patch.conflict?.operation === 'resolve'
      return patch.conflict?.operation === 'update'
    case 'scene':
      return Boolean(patch.scene)
    case 'faction':
      if (requirement.operation === 'remove') return Boolean(patch.world?.removeFactions?.length)
      return Boolean(patch.world?.upsertFactions?.some((entry) => !targetId || entry.id === targetId)
        || patch.upsertFactionReputation?.length || Object.keys(patch.factionReputationDeltas ?? {}).length)
    case 'place':
      return Boolean(patch.world?.upsertPlaces?.some((entry) => !targetId || entry.id === targetId)
        || (!targetId ? patch.world?.removePlaceIds?.length : patch.world?.removePlaceIds?.includes(targetId)))
    case 'route':
      return Boolean(patch.world?.upsertRoutes?.some((entry) => !targetId || entry.id === targetId)
        || (!targetId ? patch.world?.removeRouteIds?.length : patch.world?.removeRouteIds?.includes(targetId)))
    case 'process':
      return Boolean(patch.world?.upsertProcesses?.some((entry) => !targetId || entry.id === targetId)
        || (!targetId ? patch.world?.retireProcessIds?.length : patch.world?.retireProcessIds?.includes(targetId)))
    case 'law':
      return Boolean(patch.world?.upsertLaws?.some((entry) => !targetId || entry.id === targetId)
        || (!targetId ? patch.world?.removeLawIds?.length : patch.world?.removeLawIds?.includes(targetId)))
    case 'mechanic':
      return Boolean(patch.world?.upsertMechanics?.some((entry) => !targetId || entry.id === targetId)
        || (!targetId ? patch.world?.removeMechanicIds?.length : patch.world?.removeMechanicIds?.includes(targetId)))
    case 'legend':
      return Boolean(patch.world?.legendarium || patch.world?.upsertLegends?.some((entry) => !targetId || entry.id === targetId)
        || (!targetId ? patch.world?.removeLegendIds?.length : patch.world?.removeLegendIds?.includes(targetId)))
    case 'lore':
      if (requirement.operation === 'remove') return false
      return Boolean(patch.lore?.some((entry) => !targetId || entry.id === targetId))
    case 'world-event':
      return Boolean(patch.worldEvents?.some((entry) => (
        requirement.operation === 'create'
          ? entry.operation === 'add' && (!targetId || entry.event?.id === targetId)
          : requirement.operation === 'remove'
            ? ['resolve', 'cancel'].includes(entry.operation) && (!targetId || entry.targetId === targetId)
            : entry.operation === 'update' && (!targetId || entry.targetId === targetId)
      )))
    case 'world-pressure':
      if (requirement.operation === 'remove') return Boolean(patch.cleanup?.worldPressures?.some((entry) => !targetId || entry.targetId === targetId))
      return Boolean(patch.upsertWorldPressures?.some((entry) => !targetId || entry.id === targetId))
    case 'time':
      return Boolean(patch.scene?.time || patch.world?.calendarDayDelta !== undefined || patch.world?.calendarLabel)
    case 'interface':
      if (requirement.operation === 'remove') return Boolean(patch.world?.removeInterfaceModuleIds?.some((id) => !targetId || id === targetId)
        || patch.world?.removeMetricIds?.some((id) => !targetId || id === targetId))
      return Boolean(patch.world?.interfaceBlueprint || patch.world?.upsertInterfaceModules?.some((entry) => !targetId || entry.id === targetId)
        || patch.world?.interfaceModuleChanges?.some((entry) => !targetId || entry.moduleId === targetId)
        || patch.world?.upsertMetrics?.some((entry) => !targetId || entry.id === targetId) || Object.keys(patch.world?.metricDeltas ?? {}).length)
    default:
      return false
  }
}

export function narrativeEventComplianceIssues(proposal: NarrativeEventDecision, patch: TurnPatch) {
  if (proposal.mode === 'none' || proposal.mode === 'seed') return []
  const materialized = proposal.mode === 'manifest' || ['manifested', 'aftermath', 'resolved'].includes(proposal.lifecycleStage ?? '')
  const requirements = [
    ...proposal.immediateEffects,
    ...(materialized ? proposal.persistentEffects : []),
  ].filter((entry) => entry.mandatory)
  const issues = requirements
    .filter((requirement) => !requirementSatisfied(requirement, patch))
    .map((requirement) => `${requirement.domain}/${requirement.operation}: ${requirement.requirement}`)
  if (
    proposal.mode === 'manifest'
    && proposal.category === 'encounter'
    && ['major', 'legendary', 'mythic'].includes(proposal.magnitude)
    && proposal.immediateEffects.some((effect) => effect.domain === 'npc' && effect.operation === 'create')
  ) {
    const strongNpcIds = proposal.immediateEffects
      .filter((effect) => effect.domain === 'npc' && effect.operation === 'create')
      .map((effect) => effect.targetId)
    const hasCompleteStrongEnemy = patch.npcs?.some((entry) => (
      entry.operation === 'add'
      && strongNpcIds.some((targetId) => !targetId || entry.npc.id === targetId)
      && isCompleteStrongEnemy(entry.npc)
    ))
    if (!hasCompleteStrongEnemy) issues.push('npc/create: сильный новый противник требует полного профиля сил, ресурсов, стратегии, контрмер, ограничений, слепых зон, отступления и условий поражения')
  }
  return [...new Set(issues)]
}
