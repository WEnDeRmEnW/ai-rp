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
  WorkshopEventDirective,
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
      workshopDirective: event.workshopDirective ? {
        requestedByOwner: true,
        delivery: 'next-turn',
        requestedTurn: Math.max(0, Math.round(event.workshopDirective.requestedTurn)),
      } : undefined,
    })),
  }
}

/**
 * Normalizes routing metadata that is exactly derivable from the authored event.
 * This never invents a cause, entity or consequence: requirements remain the
 * semantic source of truth, while affectedDomains is their complete index.
 */
export function normalizeNarrativeEventProposal(proposal: NarrativeEventProposal): NarrativeEventProposal {
  const requirements = [...proposal.immediateEffects, ...proposal.persistentEffects]
  const uniqueIds = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))]
  return {
    ...proposal,
    sourceIds: uniqueIds(proposal.sourceIds),
    causeIds: uniqueIds(proposal.causeIds),
    scopeIds: uniqueIds(proposal.scopeIds),
    participantIds: uniqueIds(proposal.participantIds),
    affectedDomains: [...new Set([
      ...proposal.affectedDomains,
      ...requirements.map((requirement) => requirement.domain),
    ])],
  }
}

const frequencyMultiplier = { rare: 0.75, balanced: 1, frequent: 1.35 } as const
const dynamicsMultiplier = { quiet: 0.75, living: 1, volatile: 1.25 } as const

/** Advances only the deterministic readiness clock. No event is invented here. */
export function prepareEventDirectorState(campaign: Campaign): EventDirectorState {
  const settings = normalizeEventDirectorSettings(campaign.settings.eventDirector)
  const turn = campaign.turn + 1
  const normalized = normalizeEventDirectorState(campaign.eventDirectorState, campaign.turn)
  const hadStaleWorkshopDirective = normalized.activeEvents.some((event) => (
    event.workshopDirective?.requestedByOwner
    && event.workshopDirective.requestedTurn + 1 < turn
  ))
  // A workshop command with delivery=next-turn is a one-shot instruction, not a permanent
  // obligation. Old saves may contain a directive whose exact delivery turn already passed
  // after a failed materialization; drop that stale record instead of forcing it forever.
  const state = {
    ...normalized,
    surpriseCharge: hadStaleWorkshopDirective ? Math.min(normalized.surpriseCharge, 24) : normalized.surpriseCharge,
    nextEvaluationTurn: hadStaleWorkshopDirective ? turn + 4 : normalized.nextEvaluationTurn,
    activeEvents: normalized.activeEvents.filter((event) => (
      !event.workshopDirective?.requestedByOwner
      || event.workshopDirective.requestedTurn + 1 >= turn
    )),
  }
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
    surpriseCharge: hadStaleWorkshopDirective
      ? Math.min(24, clamp(state.surpriseCharge + perTurn * turns, 0, 100))
      : clamp(state.surpriseCharge + perTurn * turns, 0, 100),
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

export function narrativeEventKnownIds(campaign: Campaign) {
  return new Set([
    campaign.player.id,
    ...campaign.player.stats.map((stat) => stat.key),
    ...campaign.player.resources.map((resource) => resource.key),
    ...Object.keys(campaign.player.currency ?? {}),
    ...campaign.player.conditions,
    ...(campaign.player.statusEffects ?? []).map((effect) => effect.id),
    ...campaign.inventory.map((item) => item.id),
    ...campaign.player.abilities.map((ability) => ability.id),
    ...campaign.npcs.flatMap((npc) => [
      npc.id,
      ...(npc.stats ?? []).map((stat) => stat.key),
      ...(npc.resources ?? []).map((resource) => resource.key),
      ...(npc.statusEffects ?? []).map((effect) => effect.id),
      ...(npc.abilities ?? []).map((ability) => ability.id),
      ...(npc.knowledge ?? []).map((fact) => fact.id),
    ]),
    ...campaign.quests.flatMap((quest) => [quest.id, ...quest.objectives.map((objective) => objective.id)]),
    ...campaign.lore.map((entry) => entry.id),
    ...campaign.memories.map((entry) => entry.id),
    ...campaign.timeline.map((entry) => entry.id),
    ...(campaign.socialLinks ?? []).map((link) => link.id),
    ...(campaign.threads ?? []).map((thread) => thread.id),
    ...(campaign.worldEvents ?? []).map((event) => event.id),
    ...(campaign.worldPressures ?? []).map((pressure) => pressure.id),
    ...(campaign.characterArcs ?? []).map((arc) => arc.id),
    ...(campaign.mysteryCases ?? []).flatMap((mystery) => [mystery.id, ...mystery.clues.map((clue) => clue.id)]),
    ...(campaign.antagonistPlans ?? []).map((plan) => plan.id),
    ...(campaign.influenceAssets ?? []).map((asset) => asset.id),
    ...(campaign.factionReputation ?? []).map((entry) => entry.factionName),
    ...(campaign.world.factions ?? []).flatMap((faction) => faction.id ? [faction.id, faction.name] : [faction.name]),
    ...(campaign.world.locations ?? []).map((location) => location.name),
    ...(campaign.world.rules ?? []),
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
    ...(campaign.world.metrics ?? []).flatMap((metric) => [metric.id, metric.key]),
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
  const turn = campaign.turn + 1
  if (proposal.mode === 'none') return forcedWorkshopEventDecision(state, turn)
    ? ['Владелец кампании назначил обязательное событие на этот ход; mode=none недопустим.']
    : []
  const settings = normalizeEventDirectorSettings(campaign.settings.eventDirector)
  const issues = permissionIssues(settings, proposal)
  const forcedWorkshopEvent = forcedWorkshopEventDecision(state, turn)
  if (forcedWorkshopEvent && (
    proposal.existingEventId !== forcedWorkshopEvent.existingEventId
    || proposal.mode !== 'manifest'
    || proposal.lifecycleStage !== 'manifested'
  )) {
    issues.push('На этот ход назначено конкретное событие владельца; оно обязано проявиться через mode=manifest и lifecycleStage=manifested без переноса или подмены.')
  }
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
    'npc', 'stat', 'resource', 'currency', 'condition', 'status-effect', 'ability', 'artifact', 'inventory', 'social-link',
    'quest', 'thread', 'character-arc', 'mystery', 'antagonist-plan', 'influence', 'faction', 'place', 'route',
    'process', 'world-rule', 'law', 'mechanic', 'legend', 'lore', 'world-event', 'world-pressure', 'metric',
  ])
  if ([...proposal.immediateEffects, ...proposal.persistentEffects].some((effect) => (
    effect.operation === 'create' && entityCreateDomains.has(effect.domain) && !effect.targetId
  ))) issues.push('Создание постоянной сущности требует заранее выбранного стабильного targetId.')
  const targetRequiredDomains = new Set<NarrativeEventRequirement['domain']>([
    ...entityCreateDomains,
    'relationship', 'party', 'memory', 'conflict', 'faction-reputation',
  ])
  if (requirements.some((effect) => effect.operation !== 'create' && targetRequiredDomains.has(effect.domain) && !effect.targetId)) {
    issues.push('Изменение, удаление, преобразование или раскрытие постоянной сущности требует точного targetId.')
  }
  const canonRestrictedCreateDomains = new Set<NarrativeEventRequirement['domain']>([
    'npc', 'ability', 'artifact', 'faction', 'place', 'route', 'process', 'world-rule', 'law', 'mechanic', 'legend', 'lore',
  ])
  if (settings.canonPolicy === 'established-only' && requirements.some((effect) => effect.operation === 'create' && canonRestrictedCreateDomains.has(effect.domain))) issues.push('Режим установленного канона запрещает создание новой постоянной сущности мира.')
  const unlistedDomains = requirements.filter((effect) => !proposal.affectedDomains.includes(effect.domain))
  if (unlistedDomains.length) issues.push('affectedDomains не перечисляет все области, которые событие требует изменить.')
  if (proposal.affectedDomains.length !== new Set(proposal.affectedDomains).size) issues.push('affectedDomains содержит повторяющиеся области.')
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
  const known = narrativeEventKnownIds(campaign)
  const createdTargets = new Set(requirements
    .filter((effect) => effect.operation === 'create' && effect.targetId)
    .map((effect) => effect.targetId as string))
  const referenceIds = [...proposal.sourceIds, ...proposal.causeIds, ...proposal.scopeIds, ...proposal.participantIds]
  if (referenceIds.some((id) => !known.has(id) && !createdTargets.has(id))) issues.push('Событие содержит ссылку на неизвестную сущность; новые сущности должны создаваться через требования, а не притворяться существующими.')
  const unknownMutationTarget = requirements.some((effect) => (
    effect.operation !== 'create'
    && effect.targetId
    && !known.has(effect.targetId)
    && !createdTargets.has(effect.targetId)
  ))
  if (unknownMutationTarget) issues.push('Изменение, удаление или раскрытие ссылается на неизвестный targetId.')
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

/** Returns the exact checked proposal that the owner explicitly scheduled for this turn. */
export function forcedWorkshopEventDecision(state: EventDirectorState, turn: number): NarrativeEventProposal | undefined {
  const event = state.activeEvents.find((entry) => (
    entry.workshopDirective?.requestedByOwner
    && entry.workshopDirective.delivery === 'next-turn'
    // The owner's command is guaranteed on exactly one RP turn. A failed or missed attempt
    // must never turn it into a compulsory event on every later turn.
    && entry.workshopDirective.requestedTurn + 1 === turn
  ))
  if (!event) return undefined
  const {
    id,
    signature: _signature,
    stage: _stage,
    createdTurn: _createdTurn,
    lastAdvancedTurn: _lastAdvancedTurn,
    nextEligibleTurn: _nextEligibleTurn,
    workshopDirective: _workshopDirective,
    ...proposal
  } = event
  void _signature
  void _stage
  void _createdTurn
  void _lastAdvancedTurn
  void _nextEligibleTurn
  void _workshopDirective
  return {
    ...proposal,
    mode: 'manifest',
    existingEventId: id,
    lifecycleStage: 'manifested',
  }
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

const aftermathDelay: Record<NarrativeEventMagnitude, number> = {
  subtle: 3,
  notable: 4,
  major: 6,
  legendary: 10,
  mythic: 14,
}

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
    const spentWorkshopAttempt = state.activeEvents.some((event) => (
      event.workshopDirective?.requestedByOwner
      && event.workshopDirective.requestedTurn + 1 <= turn
    ))
    return {
      ...state,
      surpriseCharge: spentWorkshopAttempt
        ? Math.min(state.surpriseCharge, 24)
        : clamp(state.surpriseCharge - 4, 0, 100),
      nextEvaluationTurn: turn + evaluationDelay,
      activeEvents: state.activeEvents
        // A due workshop directive has spent its single mandatory attempt. If materialization
        // failed, remove the unmanifested record; the UI may offer a deliberate retry later.
        .filter((event) => !(
          event.workshopDirective?.requestedByOwner
          && event.workshopDirective.requestedTurn + 1 <= turn
        ))
        .map((event) => (
          event.nextEligibleTurn <= turn
            ? { ...event, nextEligibleTurn: turn + evaluationDelay }
            : event
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
    workshopDirective: proposal.mode === 'manifest' ? undefined : existing?.workshopDirective,
  }
  const stage = proposal.lifecycleStage ?? nextRecord.stage
  if (proposal.mode === 'manifest' || stage === 'manifested') {
    nextRecord.nextEligibleTurn = turn + Math.max(aftermathDelay[proposal.magnitude], proposal.minimumDelay)
  }
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

const workshopChargeFloor: Record<NarrativeEventMagnitude, number> = {
  subtle: 45,
  notable: 60,
  major: 75,
  legendary: 90,
  mythic: 100,
}

/**
 * Stores an owner-authored event without exposing direct writes to eventDirectorState.
 * The event can remain a hidden seed, be guaranteed for the next RP turn, or be
 * recorded as already materialized alongside a mechanically complete state patch.
 */
export function applyWorkshopEventDirective(
  campaign: Campaign,
  preparedState: EventDirectorState,
  directive: WorkshopEventDirective,
  createId: () => string,
): EventDirectorState {
  const state = normalizeEventDirectorState(preparedState, campaign.turn)
  const proposal = directive.proposal
  const currentTurn = campaign.turn
  const existingIndex = proposal.existingEventId
    ? state.activeEvents.findIndex((event) => event.id === proposal.existingEventId)
    : -1
  const existing = existingIndex >= 0 ? state.activeEvents[existingIndex] : undefined
  const id = existing?.id ?? createId()
  const baseRecord = {
    ...toRecord(proposal, id, existing?.createdTurn ?? currentTurn, currentTurn),
    createdTurn: existing?.createdTurn ?? currentTurn,
    lastAdvancedTurn: currentTurn,
  }
  const activeEvents = [...state.activeEvents]

  if (directive.delivery === 'seed') {
    const record: NarrativeEventRecord = {
      ...baseRecord,
      stage: 'seeded',
      nextEligibleTurn: currentTurn + Math.max(1, proposal.minimumDelay),
      workshopDirective: undefined,
    }
    if (existingIndex >= 0) activeEvents[existingIndex] = record
    else activeEvents.push(record)
    return {
      ...state,
      surpriseCharge: Math.max(state.surpriseCharge, 30),
      lastSeedTurn: currentTurn,
      nextEvaluationTurn: Math.min(record.nextEligibleTurn, currentTurn + 2),
      activeEvents: activeEvents.slice(-12),
    }
  }

  if (directive.delivery === 'next-turn') {
    const record: NarrativeEventRecord = {
      ...baseRecord,
      stage: 'imminent',
      nextEligibleTurn: currentTurn + 1,
      workshopDirective: {
        requestedByOwner: true,
        delivery: 'next-turn',
        requestedTurn: currentTurn,
      },
    }
    if (existingIndex >= 0) activeEvents[existingIndex] = record
    else activeEvents.push(record)
    return {
      ...state,
      surpriseCharge: Math.max(state.surpriseCharge, workshopChargeFloor[proposal.magnitude]),
      nextEvaluationTurn: currentTurn + 1,
      activeEvents: activeEvents.slice(-12),
    }
  }

  const record: NarrativeEventRecord = {
    ...baseRecord,
    stage: 'manifested',
    nextEligibleTurn: currentTurn + Math.max(aftermathDelay[proposal.magnitude], proposal.minimumDelay),
    workshopDirective: undefined,
  }
  if (existingIndex >= 0) activeEvents[existingIndex] = record
  else activeEvents.push(record)
  const signature: NarrativeEventSignature = {
    signature: narrativeEventSignature(proposal),
    category: proposal.category,
    magnitude: proposal.magnitude,
    originKind: proposal.originKind,
    affectedDomains: proposal.affectedDomains,
    turn: currentTurn,
    outcome: 'manifested',
  }
  const historyEntry = {
    ...signature,
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
  }
  const history = [...state.history]
  const previousHistoryIndex = history.findIndex((entry) => entry.id === id)
  if (previousHistoryIndex >= 0) history[previousHistoryIndex] = historyEntry
  else history.push(historyEntry)
  return {
    ...state,
    surpriseCharge: 0,
    lastManifestedTurn: currentTurn,
    lastLegendaryTurn: ['legendary', 'mythic'].includes(proposal.magnitude) ? currentTurn : state.lastLegendaryTurn,
    lastMiracleTurn: proposal.miracleKind === 'intervention' ? currentTurn : state.lastMiracleTurn,
    miracleCount: state.miracleCount + (proposal.miracleKind === 'intervention' ? 1 : 0),
    categoryCooldowns: {
      ...state.categoryCooldowns,
      [proposal.category]: currentTurn + (proposal.magnitude === 'mythic' ? 40 : proposal.magnitude === 'legendary' ? 18 : 10),
    },
    recentSignatures: [...state.recentSignatures, signature].slice(-24),
    history: history.slice(-160),
    activeEvents: activeEvents.slice(-12),
    nextEvaluationTurn: currentTurn + 1,
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
  const matches = (candidate: string | undefined) => !targetId || candidate === targetId
  const npcUpdates = (patch.npcs ?? []).filter((entry) => entry.operation === 'update')
  const npcAdds = (patch.npcs ?? []).filter((entry) => entry.operation === 'add')
  const recordHasTarget = (record: Record<string, number> | undefined) => Object.entries(record ?? {}).some(([key, value]) => matches(key) && value !== 0)
  const hasWorldProfileChange = Boolean(patch.world && [
    patch.world.name, patch.world.tagline, patch.world.inspiration, patch.world.genre, patch.world.tone,
    patch.world.overview, patch.world.era, patch.world.system, patch.world.presentation,
  ].some((value) => value !== undefined))
  switch (requirement.domain) {
    case 'player':
      return Boolean(patch.playerProfile || patch.upsertStats?.length || patch.removeStatKeys?.length || patch.upsertResources?.length
        || patch.removeResourceKeys?.length || Object.keys(patch.statDeltas ?? {}).length || Object.keys(patch.resourceDeltas ?? {}).length
        || Object.keys(patch.currencyDeltas ?? {}).length || patch.addConditions?.length || patch.removeConditions?.length
        || patch.upsertStatusEffects?.length || patch.removeStatusEffectIds?.length)
    case 'npc':
      return Boolean(patch.npcs?.some((entry) => (
        requirement.operation === 'create'
          ? entry.operation === 'add' && (!targetId || entry.npc.id === targetId) && isCompleteEventNpc(entry.npc)
          : requirement.operation === 'remove'
            ? entry.operation === 'update' && matches(entry.targetId) && ['absent', 'missing', 'dead'].includes(entry.npc.status ?? '')
            : requirement.operation === 'reveal'
              ? entry.operation === 'update' && matches(entry.targetId) && Boolean(entry.npc.dossier)
              : entry.operation === 'update' && matches(entry.targetId)
      )))
    case 'stat': {
      const upserted = patch.upsertStats?.some((stat) => matches(stat.key))
        || npcAdds.some((entry) => entry.npc.stats?.some((stat) => matches(stat.key)))
        || npcUpdates.some((entry) => [...(entry.npc.stats ?? []), ...(entry.npc.upsertStats ?? [])].some((stat) => matches(stat.key)))
      const removed = patch.removeStatKeys?.some(matches)
        || npcUpdates.some((entry) => entry.npc.removeStatKeys?.some(matches))
      const changed = recordHasTarget(patch.statDeltas)
        || npcUpdates.some((entry) => recordHasTarget(entry.npc.statDeltas))
      if (requirement.operation === 'remove') return Boolean(removed)
      return Boolean(upserted || changed)
    }
    case 'resource': {
      const upserted = patch.upsertResources?.some((resource) => matches(resource.key))
        || npcAdds.some((entry) => entry.npc.resources?.some((resource) => matches(resource.key)))
        || npcUpdates.some((entry) => [...(entry.npc.resources ?? []), ...(entry.npc.upsertResources ?? [])].some((resource) => matches(resource.key)))
      const removed = patch.removeResourceKeys?.some(matches)
        || npcUpdates.some((entry) => entry.npc.removeResourceKeys?.some(matches))
      const changed = recordHasTarget(patch.resourceDeltas)
        || npcUpdates.some((entry) => recordHasTarget(entry.npc.resourceDeltas))
      if (requirement.operation === 'remove') return Boolean(removed)
      return Boolean(upserted || changed)
    }
    case 'currency': {
      const entries = Object.entries(patch.currencyDeltas ?? {}).filter(([key]) => matches(key))
      if (requirement.operation === 'remove') return entries.some(([, value]) => value < 0)
      if (requirement.operation === 'create') return entries.some(([, value]) => value > 0)
      return entries.some(([, value]) => value !== 0)
    }
    case 'condition':
      if (requirement.operation === 'remove') return Boolean(patch.removeConditions?.some(matches))
      if (requirement.operation === 'transform') return Boolean(patch.removeConditions?.length && patch.addConditions?.length)
      return Boolean(patch.addConditions?.some(matches))
    case 'status-effect': {
      const upserted = patch.upsertStatusEffects?.some((effect) => matches(effect.id))
        || npcAdds.some((entry) => entry.npc.statusEffects?.some((effect) => matches(effect.id)))
        || npcUpdates.some((entry) => [...(entry.npc.statusEffects ?? []), ...(entry.npc.upsertStatusEffects ?? [])].some((effect) => matches(effect.id)))
      const removed = patch.removeStatusEffectIds?.some(matches)
        || npcUpdates.some((entry) => entry.npc.removeStatusEffectIds?.some(matches))
      return requirement.operation === 'remove' ? Boolean(removed) : Boolean(upserted)
    }
    case 'ability':
      if (requirement.operation === 'create') return Boolean(patch.addAbilities?.some((ability) => (!targetId || ability.id === targetId) && isCompleteEventAbility(ability))
        || npcAdds.some((entry) => entry.npc.abilities?.some((ability) => matches(ability.id) && isCompleteEventAbility(ability)))
        || npcUpdates.some((entry) => [...(entry.npc.abilities ?? []), ...(entry.npc.upsertAbilities ?? [])].some((ability) => matches(ability.id) && isCompleteEventAbility(ability))))
      if (requirement.operation === 'remove') return Boolean(
        (!targetId ? patch.removeAbilityIds?.length : patch.removeAbilityIds?.includes(targetId))
        || npcUpdates.some((entry) => (!targetId ? entry.npc.removeAbilityIds?.length : entry.npc.removeAbilityIds?.includes(targetId))),
      )
      return Boolean(patch.abilityChanges?.some((entry) => !targetId || entry.abilityId === targetId)
        || npcUpdates.some((entry) => entry.npc.abilityChanges?.some((change) => !targetId || change.abilityId === targetId)))
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
      return Boolean(patch.relationships?.some((entry) => matches(entry.npcId)))
    case 'social-link':
      if (requirement.operation === 'remove') return Boolean(patch.removeSocialLinkIds?.some(matches))
      return Boolean(patch.socialLinks?.some((entry) => matches(entry.id)))
    case 'party':
      if (requirement.operation === 'remove') return Boolean(patch.party?.removeNpcIds?.some((id) => !targetId || id === targetId))
      if (requirement.operation === 'create') return Boolean(patch.party?.addNpcIds?.some((id) => matches(id)))
      return Boolean(patch.party?.addNpcIds?.some((id) => matches(id)) || (targetId && patch.party?.roles?.[targetId]))
    case 'quest':
      return Boolean(patch.quests?.some((entry) => (
        requirement.operation === 'create'
          ? entry.operation === 'add' && (!targetId || entry.quest?.id === targetId)
          : requirement.operation === 'remove'
            ? ['complete', 'fail'].includes(entry.operation) && (!targetId || entry.targetId === targetId)
              : entry.operation === 'update' && (!targetId || entry.targetId === targetId)
      )))
    case 'thread':
      if (requirement.operation === 'create') return Boolean(patch.threads?.some((entry) => entry.operation === 'add' && matches(entry.thread?.id)))
      if (requirement.operation === 'remove') return Boolean(
        patch.threads?.some((entry) => ['resolve', 'break'].includes(entry.operation) && matches(entry.targetId))
        || patch.cleanup?.threads?.some((entry) => matches(entry.targetId)),
      )
      if (requirement.operation === 'reveal') return Boolean(patch.threads?.some((entry) => entry.operation === 'update' && matches(entry.targetId) && entry.thread?.secret === false))
      return Boolean(patch.threads?.some((entry) => entry.operation === 'update' && matches(entry.targetId)))
    case 'character-arc':
      return Boolean(patch.upsertCharacterArcs?.some((arc) => matches(arc.id) && (
        requirement.operation !== 'remove' || ['completed', 'broken'].includes(arc.status)
      )))
    case 'mystery':
      return Boolean(patch.upsertMysteryCases?.some((mystery) => matches(mystery.id) && (
        requirement.operation === 'remove'
          ? ['solved', 'failed'].includes(mystery.status)
          : requirement.operation === 'reveal'
            ? mystery.clues.some((clue) => clue.discovered) || Boolean(mystery.conclusion)
            : true
      )))
    case 'antagonist-plan':
      if (requirement.operation === 'remove') return Boolean(
        patch.upsertAntagonistPlans?.some((plan) => matches(plan.id) && ['completed', 'failed', 'abandoned'].includes(plan.status))
        || patch.cleanup?.antagonistPlans?.some((entry) => matches(entry.targetId)),
      )
      if (requirement.operation === 'reveal') return Boolean(patch.upsertAntagonistPlans?.some((plan) => matches(plan.id) && !plan.secret))
      return Boolean(patch.upsertAntagonistPlans?.some((plan) => matches(plan.id)))
    case 'influence':
      if (requirement.operation === 'remove') return Boolean(patch.removeInfluenceAssetIds?.some(matches))
      if (requirement.operation === 'reveal') return Boolean(patch.upsertInfluenceAssets?.some((asset) => matches(asset.id) && !asset.secret))
      return Boolean(patch.upsertInfluenceAssets?.some((asset) => matches(asset.id)))
    case 'memory':
      if (requirement.operation === 'remove') return Boolean(patch.cleanup?.memories?.some((entry) => matches(entry.targetId)))
      if (['update', 'transform'].includes(requirement.operation)) return Boolean(patch.memories?.length && patch.cleanup?.memories?.some((entry) => matches(entry.targetId)))
      return Boolean(patch.memories?.length)
    case 'conflict':
      if (requirement.operation === 'create') return patch.conflict?.operation === 'start' && matches(patch.conflict.state.id)
      if (requirement.operation === 'remove') return patch.conflict?.operation === 'resolve'
      return patch.conflict?.operation === 'update' && matches(patch.conflict.state.id)
    case 'scene':
      return Boolean(patch.scene)
    case 'pacing':
      return Boolean(patch.pacing)
    case 'faction':
      if (requirement.operation === 'remove') return Boolean(patch.world?.removeFactions?.some(matches))
      return Boolean(patch.world?.upsertFactions?.some((entry) => (matches(entry.id) || matches(entry.name)) && (
        requirement.operation !== 'reveal' || entry.visibility !== 'hidden'
      )))
    case 'faction-reputation':
      return Boolean(patch.upsertFactionReputation?.some((entry) => matches(entry.factionName)) || recordHasTarget(patch.factionReputationDeltas))
    case 'place':
      if (requirement.operation === 'remove') return Boolean(patch.world?.removePlaceIds?.some(matches))
      return Boolean(patch.world?.upsertPlaces?.some((entry) => matches(entry.id) && (
        requirement.operation !== 'reveal' || entry.visibility !== 'hidden'
      )))
    case 'route':
      if (requirement.operation === 'remove') return Boolean(patch.world?.removeRouteIds?.some(matches))
      return Boolean(patch.world?.upsertRoutes?.some((entry) => matches(entry.id) && (
        requirement.operation !== 'reveal' || entry.discovered
      )))
    case 'process':
      if (requirement.operation === 'remove') return Boolean(patch.world?.retireProcessIds?.some(matches))
      return Boolean(patch.world?.upsertProcesses?.some((entry) => matches(entry.id) && (
        requirement.operation !== 'reveal' || entry.visibility !== 'hidden'
      )))
    case 'world-rule':
      if (requirement.operation === 'remove') return Boolean(patch.world?.removeRules?.some(matches))
      if (['update', 'transform'].includes(requirement.operation)) return Boolean(patch.world?.removeRules?.some(matches) && patch.world?.addRules?.length)
      return Boolean(patch.world?.addRules?.some(matches))
    case 'world-profile':
      return hasWorldProfileChange
    case 'law':
      if (requirement.operation === 'remove') return Boolean(patch.world?.removeLawIds?.some(matches))
      return Boolean(patch.world?.upsertLaws?.some((entry) => matches(entry.id) && (
        requirement.operation !== 'reveal' || entry.visibility !== 'hidden'
      )))
    case 'mechanic':
      if (requirement.operation === 'remove') return Boolean(patch.world?.removeMechanicIds?.some(matches))
      return Boolean(patch.world?.upsertMechanics?.some((entry) => matches(entry.id) && (
        requirement.operation !== 'reveal' || entry.discovered
      )))
    case 'legend':
      if (requirement.operation === 'remove') return Boolean(patch.world?.removeLegendIds?.some(matches))
      if (!targetId && patch.world?.legendarium) return true
      return Boolean(patch.world?.upsertLegends?.some((entry) => matches(entry.id) && (
        requirement.operation !== 'reveal'
        || entry.discovery.awareness > 0
        || entry.discovery.revealedSections.length > 0
        || entry.discovery.evidence.length > 0
      )))
    case 'lore':
      if (requirement.operation === 'remove') return Boolean(patch.lore?.some((entry) => matches(entry.id) && !entry.enabled))
      if (requirement.operation === 'reveal') return Boolean(patch.lore?.some((entry) => matches(entry.id) && entry.discovered))
      return Boolean(patch.lore?.some((entry) => matches(entry.id)))
    case 'world-event':
      if (requirement.operation === 'remove') return Boolean(
        patch.worldEvents?.some((entry) => ['resolve', 'cancel'].includes(entry.operation) && matches(entry.targetId))
        || patch.cleanup?.worldEvents?.some((cleanup) => matches(cleanup.targetId)),
      )
      return Boolean(patch.worldEvents?.some((entry) => (
        requirement.operation === 'create'
          ? entry.operation === 'add' && matches(entry.event?.id)
          : requirement.operation === 'reveal'
            ? entry.operation === 'update' && matches(entry.targetId) && entry.event?.visibility !== 'hidden'
            : entry.operation === 'update' && matches(entry.targetId)
      )))
    case 'world-pressure':
      if (requirement.operation === 'remove') return Boolean(
        patch.cleanup?.worldPressures?.some((entry) => matches(entry.targetId))
        || patch.upsertWorldPressures?.some((entry) => matches(entry.id) && entry.stage === 'resolved'),
      )
      return Boolean(patch.upsertWorldPressures?.some((entry) => matches(entry.id) && (
        requirement.operation !== 'reveal' || entry.visibility !== 'hidden'
      )))
    case 'time':
      return Boolean(patch.scene?.time || patch.world?.calendarDayDelta !== undefined || patch.world?.calendarLabel)
    case 'metric':
      if (requirement.operation === 'remove') return Boolean(patch.world?.removeMetricIds?.some(matches))
      return Boolean(patch.world?.upsertMetrics?.some((entry) => (matches(entry.id) || matches(entry.key)) && (
        requirement.operation !== 'reveal' || entry.visibility !== 'hidden'
      )) || recordHasTarget(patch.world?.metricDeltas))
    case 'interface':
      if (requirement.operation === 'remove') return Boolean(patch.world?.removeInterfaceModuleIds?.some((id) => !targetId || id === targetId)
        )
      return Boolean(patch.world?.interfaceBlueprint || patch.world?.upsertInterfaceModules?.some((entry) => !targetId || entry.id === targetId)
        || patch.world?.interfaceModuleChanges?.some((entry) => !targetId || entry.moduleId === targetId))
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
