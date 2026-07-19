import type { Ability, AbilityDraft, Campaign, CampaignEditRequest, CampaignEditResponse, InventoryItem, NarrativeEventDecision, OperationProgress, TurnPatch, TurnRequest, TurnResponse, WorkshopEventDirective, WorldCapabilitySystem, WorldCapabilitySystemDraft, WorldGenerationRequest, WorldQuestionRequest, WorldQuestionResponse } from '../shared/types.js'
import { randomUUID } from 'node:crypto'
import { applyNarrativeEventProposal, applyWorkshopEventDirective, defaultEventDirectorSettings, forcedWorkshopEventDecision, narrativeEventComplianceIssues, normalizeEventDirectorState, prepareEventDirectorState, shouldConsultEventDirector, validateNarrativeEventProposal } from '../shared/event-director.js'
import { demoTurn, demoWorld } from './demo.js'
import { completeJson, completeText } from './provider.js'
import { normalizeModelOutput } from './model-normalizer.js'
import { agencyRevisionPrompt, abilityExecutionRepairPrompt, abilityFocusedRepairPrompt, abilityQualityCriticPrompt, artifactFocusedRepairPrompt, artifactQualityCriticPrompt, backgroundSimulatorPrompt, campaignEditorPrompt, canonVerifierPrompt, conceptAnalystPrompt, consequenceAuditorPrompt, continuityCriticPrompt, directorPrompt, eventComplianceRepairPrompt, eventDirectorPrompt, memoryCuratorPrompt, narrativeRepetitionRevisionPrompt, narratorPrompt, playerAgencyAuditorPrompt, progressionAuditPrompt, revisionPrompt, worldGenerationStagePrompt, worldGenerationStageRepairPrompt, worldQualityCriticPrompt, worldQuestionPrompt, type WorldGenerationStage } from './prompts.js'
import { agencyAuditSchema, abilityFocusedRepairSchema, abilityQualityReviewSchema, artifactQualityReviewSchema, artifactRewardRepairSchema, backgroundSimulationSchema, campaignEditResponseSchema, conceptAnalysisSchema, consequenceAuditSchema, continuityReviewSchema, generatedWorldCharactersSchema, generatedWorldCivilizationSchema, generatedWorldCoreSchema, generatedWorldInterfaceSchema, generatedWorldLegendsSchema, generatedWorldNarrativeSchema, generatedWorldSchema, memoryCuratorSchema, narrativeEventDecisionSchema, progressionAuditSchema, turnPatchSchema, turnPlanSchema, worldQualityReviewSchema, type AbilityQualityReview, type AgencyAudit, type ArtifactQualityReview, type ConceptAnalysis, type ConsequenceAudit, type GeneratedWorld, type GeneratedWorldCharacters, type GeneratedWorldCivilization, type GeneratedWorldCore, type GeneratedWorldInterface, type GeneratedWorldLegends, type GeneratedWorldNarrative, type WorldQualityReview } from './schemas.js'
import { assessItemRarity, rarityOrder, rarityRequirementDeficits } from '../shared/rarity.js'
import { artifactNoveltyIssues, artifactNoveltyScore, updateArtifactRegistry } from '../shared/artifacts.js'
import { resolveActionCheck } from './resolution.js'
import { tokenize } from '../shared/context.js'
import { findAgencyViolations, type AgencyViolation } from './agency-guard.js'
import { findNarrativeRepetitionIssues, narrativeRepetitionScore } from '../shared/narrative-repetition.js'
import { abilityExecutionIssues, abilityNoveltyIssues, abilityNoveltyScore, abilityProfileIssues, updateAbilityRegistry } from '../shared/abilities.js'

type ProgressReporter = (progress: OperationProgress) => void

function reportProgress(report: ProgressReporter | undefined, percent: number, stage: string, detail: string, completedSteps?: number, totalSteps?: number) {
  report?.({ percent, stage, detail, completedSteps, totalSteps })
}

function capabilitySystemCandidate(
  draft: WorldCapabilitySystemDraft | undefined,
  current: WorldCapabilitySystem | undefined,
  turn: number,
): WorldCapabilitySystem | undefined {
  if (!draft) return current
  return {
    ...draft,
    id: draft.id ?? '__missing-capability-system-id__',
    groups: draft.groups.map((group, index) => ({ ...group, id: group.id ?? `__missing-group-${index}__` })),
    tiers: draft.tiers.map((tier, index) => ({ ...tier, id: tier.id ?? `__missing-tier-${index}__` })),
    createdTurn: current?.createdTurn ?? draft.createdTurn ?? turn,
    lastChangedTurn: turn,
  }
}

function abilityDraftForSystem(draft: AbilityDraft, system: WorldCapabilitySystem | undefined): AbilityDraft {
  if (!draft.profile || !system) return draft
  const normalizedGroup = draft.profile.nature.groupId.trim().toLocaleLowerCase('ru-RU')
  const groupId = system.groups.find((group) => group.id === draft.profile!.nature.groupId || group.label.trim().toLocaleLowerCase('ru-RU') === normalizedGroup)?.id
    ?? draft.profile.nature.groupId
  const normalizedTier = draft.profile.standing.tierId.trim().toLocaleLowerCase('ru-RU')
  const tierId = system.tiers.find((tier) => tier.id === draft.profile!.standing.tierId || tier.label.trim().toLocaleLowerCase('ru-RU') === normalizedTier)?.id
    ?? draft.profile.standing.tierId
  return {
    ...draft,
    profile: {
      ...draft.profile,
      nature: { ...draft.profile.nature, groupId },
      standing: { ...draft.profile.standing, systemId: system.id, tierId },
    },
  }
}

function abilityStateCandidate(draft: AbilityDraft, turn: number): Ability {
  const techniques = (draft.techniques ?? []).map((technique, index) => ({
    ...technique,
    id: technique.id ?? `candidate-technique-${index}`,
    history: technique.history?.map((entry, historyIndex) => ({ ...entry, id: entry.id ?? `candidate-technique-history-${historyIndex}`, turn: entry.turn ?? turn })),
  }))
  return {
    ...draft,
    id: draft.id ?? 'candidate-ability',
    name: draft.name,
    description: draft.description,
    mastery: draft.mastery ?? 0,
    costs: draft.costs ?? [],
    effects: draft.effects ?? [],
    limitations: draft.limitations ?? [],
    requirements: draft.requirements ?? [],
    evolutionPaths: (draft.evolutionPaths ?? []).map((path, index) => ({ ...path, id: path.id ?? `candidate-path-${index}` })),
    history: (draft.history ?? []).map((entry, index) => ({ ...entry, id: entry.id ?? `candidate-history-${index}`, turn: entry.turn ?? turn })),
    techniques,
    profile: draft.profile ? {
      ...draft.profile,
      discovery: {
        ...draft.profile.discovery,
        evidence: draft.profile.discovery.evidence.map((entry, index) => ({ ...entry, id: entry.id ?? `candidate-evidence-${index}`, learnedTurn: entry.learnedTurn ?? turn })),
        updatedTurn: draft.profile.discovery.updatedTurn ?? turn,
      },
      developmentSeeds: draft.profile.developmentSeeds.map((seed, index) => ({
        ...seed,
        id: seed.id ?? `candidate-seed-${index}`,
        evidence: seed.evidence.map((entry, evidenceIndex) => ({ ...entry, id: entry.id ?? `candidate-seed-evidence-${evidenceIndex}`, turn: entry.turn ?? turn })),
      })),
    } : undefined,
  }
}

function newAbilityQualityIssues(
  draft: AbilityDraft,
  systemDraft: WorldCapabilitySystemDraft | undefined,
  currentSystem: WorldCapabilitySystem | undefined,
  resources: string[],
  registry: NonNullable<Campaign['abilityRegistry']>,
  turn: number,
): string[] {
  const issues = hardAbilityQualityIssues(draft, systemDraft, currentSystem, resources, turn)
  issues.push(...abilityNoveltyIssues(abilityStateCandidate(draft, turn), registry))
  return [...new Set(issues)]
}

function hardAbilityQualityIssues(
  draft: AbilityDraft,
  systemDraft: WorldCapabilitySystemDraft | undefined,
  currentSystem: WorldCapabilitySystem | undefined,
  resources: string[],
  turn: number,
): string[] {
  const issues: string[] = []
  if (!draft.profile) issues.push(`У новой способности «${draft.name}» отсутствует полный profile.`)
  if (!currentSystem && !systemDraft) issues.push('Первая новая способность старого мира требует полного world.capabilitySystem.')
  const system = capabilitySystemCandidate(systemDraft, currentSystem, turn)
  const ability = abilityStateCandidate(abilityDraftForSystem(draft, system), turn)
  issues.push(...abilityProfileIssues(ability, system, resources))
  if (!draft.source?.trim()) issues.push('Новая способность требует конкретный source.')
  if (!draft.activation?.trim()) issues.push('Новая способность требует точную activation.')
  if (!draft.scale?.trim()) issues.push('Новая способность требует реальный scale.')
  if (!(draft.capabilities?.length)) issues.push('capabilities не описывает общий предел возможного.')
  if (!(draft.effects?.length)) issues.push('effects не содержит наблюдаемых результатов.')
  if (!(draft.examples?.length)) issues.push('examples не содержит сценического применения.')
  if (draft.canonStatus === 'canonical' && !draft.canonReference?.trim()) issues.push('Каноническая способность требует canonReference.')
  return [...new Set(issues)]
}

function valueAtPath(value: unknown, path: PropertyKey[]): unknown {
  return path.reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as any)[key] : undefined, value)
}

function compactIssues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }, candidate: unknown) {
  return error.issues.slice(0, 40).map((issue) => {
    const received = valueAtPath(candidate, issue.path)
    const serialized = received === undefined ? '<поле отсутствует>' : JSON.stringify(received)
    const preview = serialized.length > 240 ? `${serialized.slice(0, 237)}...` : serialized
    return `${issue.path.join('.') || '<корень>'}: ${issue.message}; фактически=${preview}`
  }).join('; ')
}

function repairContractHints(issues: Array<{ path: PropertyKey[]; message: string }>): string {
  const paths = issues.map((issue) => issue.path.join('.'))
  if (!paths.some((path) => path === 'statePatch' || path.startsWith('statePatch.') || path.startsWith('abilityChanges') || path.startsWith('artifactChanges'))) return ''
  return `

КАНОНИЧЕСКИЕ ФОРМЫ ДЛЯ PATCH (используй точные имена полей):
- scene: {"title"?:string,"location"?:string,"time"?:string,"weather"?:string,"tension"?:number,"presentNpcIds"?:string[]}; ключ currentScene запрещён.
- factionReputationDeltas: {"точное имя фракции":числовая дельта}; абсолютное состояние: upsertFactionReputation:[{"factionName":string,"value":number,"label"?:string,"notes"?:string[]}].
- abilityChanges:[{"abilityId":string,"mastery"?:absoluteNumber,"masteryDelta"?:deltaNumber,"description"?:string,"costs"?:[{"resource":string,"amount":number}],"capabilities"?:string[],"effects"?:string[],"limitations"?:string[],"history"?:{"title":string,"description":string}}]. Для нескольких записей history повтори mutation с тем же abilityId; не превращай history в массив.
- artifactChanges:[{"itemId":string,"itemDescription"?:string,"itemEffects"?:string[],"mastery"?:absoluteNumber,"masteryDelta"?:deltaNumber,"attunement"?:absoluteNumber,"attunementDelta"?:deltaNumber,"bond"?:absoluteNumber,"bondDelta"?:deltaNumber,"powerChanges"?: [{"powerId":string,"description"?:string,"mastery"?:absoluteNumber,"masteryDelta"?:deltaNumber,"costs"?:[{"resource":string,"amount":number}],"capabilities"?:string[],"limitations"?:string[]}],"powerMasteryDeltas"?:{"exactPowerId":deltaNumber},"history"?:{"title":string,"description":string}}].
- party: {"addNpcIds"?:string[],"removeNpcIds"?:string[],"roles"?:{"точный npcId":"роль в отряде"}}; массив участников запрещён.
- socialLinks создаёт или обновляет полную связь NPC со стабильным id; удаление имеет форму removeSocialLinkIds:["точный linkId"].
- memories:[{"kind":string,"content":string,"tags":string[],"importance":number,"pinned"?:boolean}]; id, turn и createdAt здесь запрещены и назначаются сервером.
- inventory add требует вложенный item с name, description, category, quantity, rarity, equipped и effects; update требует targetId и вложенный item; remove имеет форму {"operation":"remove","targetId":"exactItemId","quantity"?:number,"reason"?:string} БЕЗ item. Редкость не запрещает фактическую потерю. Не возвращай плоские поля предмета.
- quests add требует вложенный quest с title, description, status и objectives; update требует targetId и вложенный quest.
- npcs update требует targetId и вложенный npc; урон/траты NPC записывай в npc.resourceDeltas, изменения параметров — npc.statDeltas, эффекты — npc.upsertStatusEffects, новые силы — npc.upsertAbilities, развитие сил — npc.abilityChanges, мышление и контрпланы — npc.strategy.
- pacing: {"beat":"respite|setup|exploration|rising|challenge|aftermath|climax","intensity":number,"challengeTier":"none|light|standard|hard|severe|legendary|mythic","reason":string}.
- conflict start/update требует полный state с id,kind,title,round,phase,stakes,terrain[],hazards[],tier?,victoryConditions?,failureConsequences?,escapeRoutes?,telegraphs?,momentum,participants[],startedTurn,lastUpdatedTurn; participant содержит entityId,side,objective,position,readiness,morale,intent,lastAction,advantages[],vulnerabilities[],visibility. Завершение: {"operation":"resolve","outcome":"..."}.
- upsertWorldPressures содержит полные причинные реакции мира с id,sourceKind,sourceName,sourceNpcId?,targetIds[],cause,objective,tier,stage,reach,knowledge[],signs[],measures[],counterplay[],escalationTrigger,deescalationConditions[],visibility,createdTurn,lastAdvancedTurn.
- duration статусного эффекта имеет форму {"unit":"turns|scenes|days|until|indefinite","remaining"?:number,"condition"?:string}; ключи amount/count/value запрещены.
- world.upsertPlaces содержит полные места с id,name,kind,description,scale,culture[],notableFacts[],currentSituation,visibility и необязательным точным parentId; world.upsertProcesses содержит полные процессы с id,title,description,scopeIds[],involvedFactionNames[],drivers[],obstacles[],stage,momentum,direction,status,visibility,nextMilestone,consequences[].
- world.interfaceBlueprint.tabs содержит ровно шесть полных записей с уникальными id dashboard,scene,hero,inventory,changes,world; у каждой visible=true. Переименовывать label разрешено, скрывать или удалять основные вкладки запрещено.
- world.legendarium — полный объект с name,summary,recognitionRules[],transmissionChannels[],distortionForces[],memoryKeepers[],erasureForces[],successionRules[],encounterRules[],thresholds[ровно notable,renowned,legendary,mythic]. world.upsertLegends содержит ПОЛНЫЕ легендарные записи с id,characterId?,name,stage,lifeStatus,scope,truthStatus,renown,influence,powerStanding{classification,basis,domains[],evidence[],uncertainties[]},knownFeats[],disputedClaims[],associatedFactionNames[],relatedNpcIds[],successorNpcIds[],deeds[],myths[],legacies[],currentState,emergence,canon,discovery. Для известных фигур classification не ниже capable; notable>=capable, renowned>=dangerous, legendary>=elite, mythic>=legendary. characterId может быть точным id героя или NPC; для living/returned обязателен. Не возвращай серверные turn-поля; deeds/legacies используют только точные placeId/id персонажей/имена фракций.
- cleanup — объект с массивами threads/worldEvents/quests/antagonistPlans/worldPressures/memories; каждый элемент имеет только targetId и reason. Активную сущность сначала переведи в терминальный статус соответствующей мутацией.
Любой ключ, названный валидатором Unrecognized, УДАЛИ из прежнего места после переноса его содержимого в каноническое поле. Не возвращай одновременно старый alias и новый ключ.`
}

function omitNullObjectFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitNullObjectFields)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value)
    .filter(([, entry]) => entry !== null)
    .map(([key, entry]) => [key, omitNullObjectFields(entry)]))
}

function selectCurrentTurnMemories(
  campaign: Campaign,
  input: string,
  narrative: string,
  planned: NonNullable<TurnPatch['memories']>,
  curated: NonNullable<TurnPatch['memories']>,
) {
  const meaningfulTokens = (value: string) => new Set(tokenize(value).filter((token) => token.length >= 4))
  const turnTokens = meaningfulTokens(`${input}\n${narrative}`)
  const acceptedTexts = [...campaign.memories.map((memory) => memory.content), ...planned.map((memory) => memory.content)]
  const similar = (left: string, right: string) => {
    const a = meaningfulTokens(left)
    const b = meaningfulTokens(right)
    if (!a.size || !b.size) return left.trim().toLocaleLowerCase('ru-RU') === right.trim().toLocaleLowerCase('ru-RU')
    const intersection = [...a].filter((token) => b.has(token)).length
    return intersection / Math.min(a.size, b.size) >= 0.6
  }
  const selected: typeof curated = []
  for (const memory of curated) {
    const memoryTokens = meaningfulTokens(memory.content)
    if (![...memoryTokens].some((token) => turnTokens.has(token))) continue
    if (acceptedTexts.some((content) => similar(content, memory.content))) continue
    selected.push(memory)
    acceptedTexts.push(memory.content)
    if (selected.length >= 4) break
  }
  return selected
}

async function parseWithRepair<T>(
  raw: unknown,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } },
  provider: WorldGenerationRequest['provider'],
  context: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  fallback?: (candidate: unknown) => T | undefined,
): Promise<T> {
  let candidate = raw
  let lastIssues = ''

  for (let attempt = 0; attempt < 5; attempt += 1) {
    candidate = omitNullObjectFields(normalizeModelOutput(candidate))
    const parsed = schema.safeParse(candidate)
    if (parsed.success) return parsed.data
    lastIssues = compactIssues(parsed.error, candidate)
    if (attempt === 4) break

    const contractHints = repairContractHints(parsed.error.issues)
    candidate = await completeJson(provider, [
      ...context,
      { role: 'assistant', content: JSON.stringify(candidate) },
      {
        role: 'user',
        content: `Предыдущий JSON не соответствует обязательному контракту. Ниже указаны пути, требования и фактически полученные значения: ${lastIssues}.${contractHints}

Верни заново ВЕСЬ JSON-объект целиком, от первого до последнего поля. Исправь КАЖДЫЙ перечисленный путь, а затем сам перепроверь все остальные поля. Сохрани уже созданные содержательные детали и все последствия. Не добавляй значения-заглушки вроде «неизвестно», «не указано» или пустых строк. Необязательные поля без фактического основания опускай; обязательные заполняй только конкретными установленными деталями контекста. Числа возвращай числами, логические значения — true/false, списки — массивами, словари — объектами. Не сокращай вложенные объекты и массивы. Верни только исправленный JSON.`,
      },
    ])
  }

  const recovered = fallback?.(candidate)
  if (recovered !== undefined) return recovered
  throw new Error(`DeepSeek не смог завершить обязательную структуру после пяти автоматических исправлений: ${lastIssues}`)
}

function salvageTurnPlan(candidate: unknown): ReturnType<typeof turnPlanSchema.parse> | undefined {
  const normalized = omitNullObjectFields(normalizeModelOutput(candidate))
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return undefined
  const record = normalized as Record<string, unknown>
  const outcome = typeof record.outcome === 'string' ? record.outcome.trim() : ''
  const beats = Array.isArray(record.beats) ? record.beats.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim())) : []
  const suggestions = Array.isArray(record.suggestions) ? record.suggestions.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim())).slice(0, 4) : []
  if (!outcome || beats.length === 0 || suggestions.length < 2) return undefined
  const patch = turnPatchSchema.safeParse(record.statePatch)
  if (!patch.success) return undefined
  const salvaged = turnPlanSchema.safeParse({
    outcome,
    beats,
    suggestions,
    abilityExecutions: record.abilityExecutions ?? [],
    statePatch: patch.data,
  })
  return salvaged.success ? salvaged.data : undefined
}

async function optionalStage<T>(label: string, work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[model:${label}] Служебный этап пропущен без прерывания истории: ${message}`)
    return fallback
  }
}

type ConsequenceDomain = ConsequenceAudit['omissions'][number]['domain']

type SanitizationRejection = {
  message: string
  domains: ConsequenceDomain[]
  /** False for an idempotent removal whose target is already absent. */
  blocking: boolean
}

function normalizedReference(value: string | undefined) {
  return (value ?? '')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/[ё]/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim()
}

export function sanitizePlan(campaign: Campaign, plan: ReturnType<typeof turnPlanSchema.parse>) {
  const notes: string[] = []
  const rejections: SanitizationRejection[] = []
  const reject = (message: string, domains: ConsequenceDomain[], blocking = true) => {
    notes.push(message)
    rejections.push({ message, domains, blocking })
  }
  const rejectStaleRemoval = (message: string, domains: ConsequenceDomain[]) => reject(message, domains, false)
  const sanitizeTechniquePatch = (
    existingTechniqueIds: string[],
    change: {
      addTechniques?: Array<{ id?: string }>
      techniqueChanges?: Array<{ techniqueId: string; mastery?: number; masteryDelta?: number }>
      removeTechniqueIds?: string[]
    },
    ownerLabel: string,
  ) => {
    const knownTechniqueIds = new Set([
      ...existingTechniqueIds,
      ...(change.addTechniques ?? []).flatMap((technique) => technique.id ? [technique.id] : []),
    ])
    const beforeChanges = change.techniqueChanges?.length ?? 0
    change.techniqueChanges = change.techniqueChanges?.filter((techniqueChange) => knownTechniqueIds.has(techniqueChange.techniqueId)).map((techniqueChange) => {
      if (techniqueChange.mastery !== undefined && techniqueChange.masteryDelta !== undefined) delete techniqueChange.masteryDelta
      return techniqueChange
    })
    const beforeRemovals = change.removeTechniqueIds?.length ?? 0
    change.removeTechniqueIds = change.removeTechniqueIds?.filter((techniqueId) => knownTechniqueIds.has(techniqueId))
    if ((change.techniqueChanges?.length ?? 0) < beforeChanges) {
      reject(`Отклонено изменение неизвестной подспособности: ${ownerLabel}.`, ['abilities', 'artifacts', 'characters'])
    }
    if ((change.removeTechniqueIds?.length ?? 0) < beforeRemovals) {
      rejectStaleRemoval(`Пропущено снятие уже отсутствующей подспособности: ${ownerLabel}.`, ['abilities', 'artifacts', 'characters'])
    }
  }
  const knownStats = new Set([
    ...campaign.player.stats,
    ...(plan.statePatch.upsertStats ?? []),
  ].flatMap((stat) => [stat.key, stat.label, ...(stat.aliases ?? [])].map((key) => key.toLocaleLowerCase('ru-RU'))))
  const knownResources = new Set([
    ...campaign.player.resources,
    ...(plan.statePatch.upsertResources ?? []),
  ].flatMap((stat) => [stat.key, stat.label, ...(stat.aliases ?? [])].map((key) => key.toLocaleLowerCase('ru-RU'))))
  const knownNpcs = new Set(campaign.npcs.map((npc) => npc.id))
  const knownAbilities = new Set([
    ...campaign.player.abilities.map((ability) => ability.id),
    ...(plan.statePatch.addAbilities ?? []).flatMap((ability) => ability.id ? [ability.id] : []),
  ])
  const knownArtifacts = new Set([
    ...campaign.inventory.filter((item) => item.artifact).map((item) => item.id),
    ...(plan.statePatch.inventory ?? []).flatMap((mutation) => mutation.operation === 'add' && mutation.item?.artifact && mutation.item.id ? [mutation.item.id] : []),
  ])
  const knownFactions = new Set([
    ...campaign.world.factions.map((faction) => faction.name),
    ...(campaign.factionReputation ?? []).map((entry) => entry.factionName),
    ...(plan.statePatch.world?.upsertFactions ?? []).map((faction) => faction.name),
  ].map((name) => name.toLocaleLowerCase('ru-RU')))
  const knownPlaceIds = new Set([
    ...(campaign.world.places ?? []).map((place) => place.id),
    ...(plan.statePatch.world?.upsertPlaces ?? []).map((place) => place.id),
  ])
  const addedNpcIds = new Set(plan.statePatch.npcs?.filter((mutation) => mutation.operation === 'add').map((mutation) => mutation.npc.id) ?? [])
  const usableNpcIds = new Set([...knownNpcs, ...addedNpcIds])

  if (plan.statePatch.inventory) {
    type ParsedInventoryMutation = NonNullable<typeof plan.statePatch.inventory>[number]
    plan.statePatch.inventory = plan.statePatch.inventory.flatMap<ParsedInventoryMutation>((mutation) => {
      if (mutation.operation === 'add') {
        if (mutation.item?.name) return [mutation]
        reject('Отклонено неполное добавление предмета.', ['inventory', 'equipment', 'artifacts'])
        return []
      }
      const exactItem = campaign.inventory.find((item) => item.id === mutation.targetId)
      const normalizedTarget = normalizedReference(mutation.targetId)
      const nameMatches = exactItem ? [] : campaign.inventory.filter((item) => normalizedReference(item.name) === normalizedTarget)
      const resolvedItem = exactItem ?? (nameMatches.length === 1 ? nameMatches[0] : undefined)
      if (resolvedItem) return [{ ...mutation, targetId: resolvedItem.id }]
      if (mutation.operation === 'remove') rejectStaleRemoval('Пропущено удаление уже отсутствующего предмета.', ['inventory', 'equipment', 'artifacts'])
      else reject('Отклонено обновление неизвестного предмета.', ['inventory', 'equipment', 'artifacts'])
      return []
    })
  }
  if (plan.statePatch.statDeltas) {
    const entries = Object.entries(plan.statePatch.statDeltas)
    const accepted = entries.filter(([key]) => knownStats.has(key.toLocaleLowerCase('ru-RU')))
    const rejected = entries.filter(([key]) => !knownStats.has(key.toLocaleLowerCase('ru-RU'))).map(([key]) => key)
    plan.statePatch.statDeltas = Object.fromEntries(accepted)
    if (rejected.length) reject(`Отклонены неизвестные характеристики: ${rejected.join(', ')}.`, ['stats'])
  }
  if (plan.statePatch.resourceDeltas) {
    const entries = Object.entries(plan.statePatch.resourceDeltas)
    const accepted = entries.filter(([key]) => knownResources.has(key.toLocaleLowerCase('ru-RU')))
    const rejected = entries.filter(([key]) => !knownResources.has(key.toLocaleLowerCase('ru-RU'))).map(([key]) => key)
    plan.statePatch.resourceDeltas = Object.fromEntries(accepted)
    if (rejected.length) reject(`Отклонены неизвестные ресурсы: ${rejected.join(', ')}.`, ['health', 'resources'])
  }
  const relationshipCount = plan.statePatch.relationships?.length ?? 0
  plan.statePatch.relationships = plan.statePatch.relationships?.filter((change) => knownNpcs.has(change.npcId))
  if ((plan.statePatch.relationships?.length ?? 0) < relationshipCount) reject('Отклонена связь с неизвестным персонажем.', ['relationships'])
  plan.statePatch.npcs = plan.statePatch.npcs?.map((mutation) => {
    if (mutation.operation !== 'add') return mutation
    const existing = campaign.npcs.find((npc) => npc.id === mutation.npc.id || npc.name.toLocaleLowerCase('ru-RU') === mutation.npc.name.toLocaleLowerCase('ru-RU'))
    if (!existing) return mutation
    const { id: _serverId, ...npc } = mutation.npc
    void _serverId
    notes.push(`Полная карточка существующего NPC «${existing.name}» преобразована в безопасное обновление.`)
    return { operation: 'update' as const, targetId: existing.id, npc }
  })
  const npcMutationCount = plan.statePatch.npcs?.length ?? 0
  plan.statePatch.npcs = plan.statePatch.npcs?.filter((mutation) => mutation.operation === 'add' ? !knownNpcs.has(mutation.npc.id) : knownNpcs.has(mutation.targetId))
  if ((plan.statePatch.npcs?.length ?? 0) < npcMutationCount) reject('Отклонено противоречивое изменение персонажа.', ['characters'])
  plan.statePatch.npcs = plan.statePatch.npcs?.map((mutation) => {
    const threatProfile = mutation.npc.threatProfile
    if (!threatProfile) return mutation
    const tierRank = { minor: 0, capable: 1, dangerous: 2, elite: 3, legendary: 4, mythic: 5 }[threatProfile.tier]
    if (tierRank < 2) return mutation
    const existingAbilities = mutation.operation === 'update' ? campaign.npcs.find((npc) => npc.id === mutation.targetId)?.abilities ?? [] : []
    const authoredAbilities = mutation.operation === 'add'
      ? mutation.npc.abilities ?? []
      : [...(mutation.npc.abilities ?? []), ...(mutation.npc.upsertAbilities ?? [])]
    const masteryChanges = new Map((mutation.operation === 'update' ? mutation.npc.abilityChanges ?? [] : []).map((change) => [change.abilityId, change]))
    const effectiveExistingAbilities = existingAbilities.map((ability) => {
      const change = masteryChanges.get(ability.id)
      if (!change) return ability.mastery ?? 0
      if (change.mastery !== undefined) return change.mastery
      return Math.max(0, Math.min(100, (ability.mastery ?? 0) + (change.masteryDelta ?? 0)))
    })
    const demonstratedMastery = Math.max(...effectiveExistingAbilities, ...authoredAbilities.map((ability) => ability.mastery ?? 0), 0)
    const minimumMastery = { dangerous: 45, elite: 65, legendary: 80, mythic: 90 }[threatProfile.tier as 'dangerous' | 'elite' | 'legendary' | 'mythic']
    const realPowerNames = new Set([...existingAbilities, ...authoredAbilities].flatMap((ability) => [
      ability.name.toLocaleLowerCase('ru-RU'),
      ...(ability.techniques ?? []).map((technique) => technique.name.toLocaleLowerCase('ru-RU')),
    ]))
    const signaturesExist = (threatProfile.signatureAbilities ?? []).every((name) => realPowerNames.has(name.toLocaleLowerCase('ru-RU')))
    if (demonstratedMastery >= minimumMastery && signaturesExist) return mutation
    delete mutation.npc.threatProfile
    reject('Отклонён ранг сильного персонажа, не подкреплённый реальными способностями и буквально совпадающими сигнатурными техниками.', ['characters', 'world_pressure'])
    return mutation
  })
  plan.statePatch.npcs = plan.statePatch.npcs?.map((mutation) => {
    if (mutation.operation !== 'update') return mutation
    const existingNpc = campaign.npcs.find((npc) => npc.id === mutation.targetId)
    if (!existingNpc) return mutation
    const incoming = mutation.npc
    const knownNpcAbilityIds = new Set([
      ...(existingNpc.abilities ?? []).map((ability) => ability.id),
      ...(incoming.abilities ?? []).flatMap((ability) => ability.id ? [ability.id] : []),
      ...(incoming.upsertAbilities ?? []).flatMap((ability) => ability.id ? [ability.id] : []),
    ])
    const rejectedChanges = incoming.abilityChanges?.filter((change) => !knownNpcAbilityIds.has(change.abilityId)).length ?? 0
    const rejectedRemovals = incoming.removeAbilityIds?.filter((abilityId) => !knownNpcAbilityIds.has(abilityId)).length ?? 0
    incoming.abilityChanges = incoming.abilityChanges?.filter((change) => knownNpcAbilityIds.has(change.abilityId)).map((change) => {
      if (change.mastery !== undefined && change.masteryDelta !== undefined) delete change.masteryDelta
      const ability = (existingNpc.abilities ?? []).find((candidate) => candidate.id === change.abilityId)
      sanitizeTechniquePatch((ability?.techniques ?? []).map((technique) => technique.id), change, `${existingNpc.name} · ${ability?.name ?? change.abilityId}`)
      return change
    })
    incoming.removeAbilityIds = incoming.removeAbilityIds?.filter((abilityId) => knownNpcAbilityIds.has(abilityId))
    if (rejectedChanges > 0) reject(`Отклонено изменение неизвестной способности персонажа «${existingNpc.name}».`, ['abilities', 'characters'])
    if (rejectedRemovals > 0) rejectStaleRemoval(`Пропущено удаление уже отсутствующей способности персонажа «${existingNpc.name}».`, ['abilities', 'characters'])

    const metricReferences = (values: Array<{ key: string; label: string; aliases?: string[] }>) => new Set(values
      .flatMap((metric) => [metric.key, metric.label, ...(metric.aliases ?? [])])
      .map(normalizedReference))
    const knownNpcStats = metricReferences([...(existingNpc.stats ?? []), ...(incoming.stats ?? []), ...(incoming.upsertStats ?? [])])
    const knownNpcResources = metricReferences([...(existingNpc.resources ?? []), ...(incoming.resources ?? []), ...(incoming.upsertResources ?? [])])
    const filterDeltas = (values: Record<string, number> | undefined, known: Set<string>) => values
      ? Object.fromEntries(Object.entries(values).filter(([key]) => known.has(normalizedReference(key))))
      : undefined
    const rejectedStatDeltaCount = Object.keys(incoming.statDeltas ?? {}).filter((key) => !knownNpcStats.has(normalizedReference(key))).length
    const rejectedResourceDeltaCount = Object.keys(incoming.resourceDeltas ?? {}).filter((key) => !knownNpcResources.has(normalizedReference(key))).length
    incoming.statDeltas = filterDeltas(incoming.statDeltas, knownNpcStats)
    incoming.resourceDeltas = filterDeltas(incoming.resourceDeltas, knownNpcResources)
    const rejectedStatRemovalCount = incoming.removeStatKeys?.filter((key) => !knownNpcStats.has(normalizedReference(key))).length ?? 0
    const rejectedResourceRemovalCount = incoming.removeResourceKeys?.filter((key) => !knownNpcResources.has(normalizedReference(key))).length ?? 0
    incoming.removeStatKeys = incoming.removeStatKeys?.filter((key) => knownNpcStats.has(normalizedReference(key)))
    incoming.removeResourceKeys = incoming.removeResourceKeys?.filter((key) => knownNpcResources.has(normalizedReference(key)))
    if (rejectedStatDeltaCount > 0) reject(`Отклонено изменение неизвестной характеристики персонажа «${existingNpc.name}».`, ['stats', 'characters'])
    if (rejectedResourceDeltaCount > 0) reject(`Отклонено изменение неизвестного ресурса персонажа «${existingNpc.name}».`, ['health', 'resources', 'characters'])
    if (rejectedStatRemovalCount > 0) rejectStaleRemoval(`Пропущено удаление уже отсутствующей характеристики персонажа «${existingNpc.name}».`, ['stats', 'characters'])
    if (rejectedResourceRemovalCount > 0) rejectStaleRemoval(`Пропущено удаление уже отсутствующего ресурса персонажа «${existingNpc.name}».`, ['health', 'resources', 'characters'])

    if (incoming.removeStatusEffectIds?.length) {
      const npcEffects = existingNpc.statusEffects ?? []
      const requestedNpcEffectRemovals = incoming.removeStatusEffectIds
      const resolvedNpcEffectRemovals = requestedNpcEffectRemovals.flatMap((reference) => {
        const exact = npcEffects.find((effect) => effect.id === reference)
        const matches = exact ? [] : npcEffects.filter((effect) => normalizedReference(effect.name) === normalizedReference(reference))
        const resolved = exact ?? (matches.length === 1 ? matches[0] : undefined)
        return resolved ? [resolved.id] : []
      })
      incoming.removeStatusEffectIds = resolvedNpcEffectRemovals.length ? [...new Set(resolvedNpcEffectRemovals)] : undefined
      if (resolvedNpcEffectRemovals.length < requestedNpcEffectRemovals.length) {
        rejectStaleRemoval(`Пропущено снятие уже отсутствующего эффекта персонажа «${existingNpc.name}».`, ['conditions', 'characters'])
      }
    }
    const knownKnowledgeIds = new Set((existingNpc.knowledge ?? []).map((fact) => fact.id))
    const rejectedKnowledgeRemovals = incoming.removeKnowledgeIds?.filter((knowledgeId) => !knownKnowledgeIds.has(knowledgeId)).length ?? 0
    incoming.removeKnowledgeIds = incoming.removeKnowledgeIds?.filter((knowledgeId) => knownKnowledgeIds.has(knowledgeId))
    if (rejectedKnowledgeRemovals > 0) rejectStaleRemoval(`Пропущено удаление уже отсутствующего знания персонажа «${existingNpc.name}».`, ['knowledge', 'characters'])

    const incomingRecord = incoming as unknown as Record<string, unknown>
    const ensureCompleteNewObject = (
      key: 'relationshipDimensions' | 'initiative' | 'strategy' | 'dossier' | 'voice',
      existingValue: unknown,
      requiredKeys: string[],
      domains: ConsequenceDomain[],
    ) => {
      const value = incomingRecord[key]
      if (!value || existingValue) return
      const record = value as Record<string, unknown>
      if (requiredKeys.every((requiredKey) => record[requiredKey] !== undefined)) return
      delete incomingRecord[key]
      reject(`Отклонён неполный новый раздел «${key}» персонажа «${existingNpc.name}».`, domains)
    }
    if (incoming.initiative && !existingNpc.initiative && incoming.initiative.lastAdvancedTurn === undefined) incoming.initiative.lastAdvancedTurn = campaign.turn + 1
    ensureCompleteNewObject('relationshipDimensions', existingNpc.relationshipDimensions, ['trust', 'respect', 'affection', 'fear', 'suspicion', 'dependence'], ['relationships', 'characters'])
    ensureCompleteNewObject('initiative', existingNpc.initiative, ['intent', 'nextMove', 'trigger', 'urgency', 'blockedBy', 'lastAdvancedTurn', 'visibility'], ['characters', 'world_pressure'])
    ensureCompleteNewObject('strategy', existingNpc.strategy, ['intelligence', 'tacticalSkill', 'strategicSkill', 'predictionSkill', 'adaptability', 'deceptionSkill', 'riskTolerance', 'planningHorizon', 'decisionStyle', 'currentPlan', 'observedPlayerPatterns', 'strengths', 'blindSpots', 'contingencies', 'visibility'], ['characters', 'world_pressure'])
    ensureCompleteNewObject('dossier', existingNpc.dossier, ['familiarity', 'revealedSections', 'revealedStatKeys', 'revealedResourceKeys', 'revealedAbilityIds', 'evidence'], ['characters', 'knowledge'])
    ensureCompleteNewObject('voice', existingNpc.voice, ['style', 'patterns', 'avoids'], ['characters'])
    return mutation
  })
  if (plan.statePatch.world) {
    const worldPatch = plan.statePatch.world
    const finalCharacterIds = new Set([
      campaign.player.id,
      ...knownNpcs,
      ...(plan.statePatch.npcs ?? []).flatMap((mutation) => mutation.operation === 'add' ? [mutation.npc.id] : []),
    ])
    const knownLegendIds = new Set((campaign.world.legends ?? []).map((legend) => legend.id))
    const removedLegendCount = worldPatch.removeLegendIds?.length ?? 0
    worldPatch.removeLegendIds = worldPatch.removeLegendIds?.filter((legendId) => knownLegendIds.has(legendId))
    if ((worldPatch.removeLegendIds?.length ?? 0) < removedLegendCount) rejectStaleRemoval('Пропущено удаление уже отсутствующей легендарной личности.', ['world', 'characters', 'knowledge'])

    const thresholds = new Map((worldPatch.legendarium?.thresholds ?? campaign.world.legendarium?.thresholds ?? []).map((threshold) => [threshold.stage, threshold.minRenown]))
    const legendPowerRank = { noncombatant: -2, unknown: -1, minor: 0, capable: 1, dangerous: 2, elite: 3, legendary: 4, mythic: 5 } as const
    const minimumLegendPower = { notable: 1, renowned: 2, legendary: 3, mythic: 4 } as const
    const replacedLegendIds = new Set(worldPatch.upsertLegends?.map((legend) => legend.id) ?? [])
    const usedPowerBases = new Map(
      (campaign.world.legends ?? [])
        .filter((legend) => !replacedLegendIds.has(legend.id) && legend.powerStanding?.basis)
        .map((legend) => [normalizedReference(legend.powerStanding!.basis), legend.id]),
    )
    const legendMutationCount = worldPatch.upsertLegends?.length ?? 0
    worldPatch.upsertLegends = worldPatch.upsertLegends?.filter((legend) => {
      const characterReferences = [
        ...(legend.characterId ? [legend.characterId] : []),
        ...legend.relatedNpcIds,
        ...legend.successorNpcIds,
        ...legend.legacies.flatMap((legacy) => legacy.holderNpcIds),
      ]
      if (characterReferences.some((characterId) => !finalCharacterIds.has(characterId))) return false
      const placeReferences = [
        ...(legend.currentState.locationId ? [legend.currentState.locationId] : []),
        ...legend.deeds.flatMap((deed) => deed.scopeIds),
        ...legend.legacies.flatMap((legacy) => legacy.scopeIds),
      ]
      if (placeReferences.some((placeId) => !knownPlaceIds.has(placeId))) return false
      const factionReferences = [
        ...legend.associatedFactionNames,
        ...legend.deeds.flatMap((deed) => deed.factionNames),
        ...legend.legacies.flatMap((legacy) => legacy.factionNames),
      ]
      if (factionReferences.some((name) => !knownFactions.has(name.toLocaleLowerCase('ru-RU')))) return false
      const minimumRenown = thresholds.get(legend.stage)
      if (minimumRenown !== undefined && legend.renown < minimumRenown) return false
      if (legendPowerRank[legend.powerStanding.classification] < minimumLegendPower[legend.stage]) return false
      const normalizedPowerBasis = normalizedReference(legend.powerStanding.basis)
      const duplicatePowerBasis = usedPowerBases.get(normalizedPowerBasis)
      if (!normalizedPowerBasis || (duplicatePowerBasis && duplicatePowerBasis !== legend.id)) return false
      usedPowerBases.set(normalizedPowerBasis, legend.id)
      if (['legendary', 'mythic'].includes(legend.stage) && (legend.knownFeats.length < 2 || legend.deeds.length < 2 || legend.myths.length + legend.legacies.length < 2)) return false
      if (['living', 'returned'].includes(legend.lifeStatus) && !legend.characterId) return false
      if (['dead', 'sealed', 'dormant'].includes(legend.lifeStatus) && legend.currentState.encounterReadiness > 0 && legend.currentState.encounterConditions.length === 0) return false
      return true
    })
    if ((worldPatch.upsertLegends?.length ?? 0) < legendMutationCount) {
      reject('Отклонено непричинное или повреждённое изменение легендарной личности.', ['world', 'characters', 'knowledge'])
    }
  }
  const absoluteRelationshipIds = new Set((plan.statePatch.npcs ?? []).flatMap((mutation) => mutation.operation === 'update' && mutation.npc.relationship !== undefined ? [mutation.targetId] : []))
  if (absoluteRelationshipIds.size && plan.statePatch.relationships?.some((change) => absoluteRelationshipIds.has(change.npcId))) {
    plan.statePatch.relationships = plan.statePatch.relationships.filter((change) => !absoluteRelationshipIds.has(change.npcId))
    notes.push('Абсолютное отношение персонажа сохранено, дублирующая относительная поправка отброшена.')
  }
  const unknownRemovedStats = plan.statePatch.removeStatKeys?.filter((key) => !knownStats.has(key.toLocaleLowerCase('ru-RU'))) ?? []
  plan.statePatch.removeStatKeys = plan.statePatch.removeStatKeys?.filter((key) => knownStats.has(key.toLocaleLowerCase('ru-RU')))
  if (unknownRemovedStats.length) rejectStaleRemoval(`Пропущено удаление уже отсутствующих характеристик: ${unknownRemovedStats.join(', ')}.`, ['stats'])
  const unknownRemovedResources = plan.statePatch.removeResourceKeys?.filter((key) => !knownResources.has(key.toLocaleLowerCase('ru-RU'))) ?? []
  plan.statePatch.removeResourceKeys = plan.statePatch.removeResourceKeys?.filter((key) => knownResources.has(key.toLocaleLowerCase('ru-RU')))
  if (unknownRemovedResources.length) rejectStaleRemoval(`Пропущено удаление уже отсутствующих ресурсов: ${unknownRemovedResources.join(', ')}.`, ['health', 'resources'])

  type QuestMutation = NonNullable<typeof plan.statePatch.quests>[number]
  const questReferences: Array<{ id: string; title: string }> = campaign.quests.map((quest) => ({ id: quest.id, title: quest.title }))
  const resolveQuestReference = (...references: Array<string | undefined>) => {
    for (const reference of references) {
      if (!reference) continue
      const exactId = questReferences.find((quest) => quest.id === reference)
      if (exactId) return exactId
      const normalized = normalizedReference(reference)
      if (!normalized) continue
      const titleMatches = questReferences.filter((quest) => normalizedReference(quest.title) === normalized)
      if (titleMatches.length === 1) return titleMatches[0]
    }
    return undefined
  }
  const normalizedQuestMutations: QuestMutation[] = []
  for (const mutation of plan.statePatch.quests ?? []) {
    if (mutation.operation === 'add') {
      const existing = resolveQuestReference(mutation.quest.id, mutation.quest.title)
      if (existing) {
        const { id: _modelId, ...quest } = mutation.quest
        void _modelId
        normalizedQuestMutations.push({ operation: 'update', targetId: existing.id, quest })
        notes.push(`Повторное добавление задания «${existing.title}» преобразовано в безопасное обновление.`)
        continue
      }
      mutation.quest.id ??= randomUUID()
      questReferences.push({ id: mutation.quest.id, title: mutation.quest.title })
      normalizedQuestMutations.push(mutation)
      continue
    }
    const resolved = resolveQuestReference(
      mutation.targetId,
      mutation.operation === 'update' ? mutation.quest.title : undefined,
    )
    if (!resolved) {
      if (mutation.operation === 'complete' || mutation.operation === 'fail') rejectStaleRemoval(`Пропущено завершение уже отсутствующего задания «${mutation.targetId}».`, ['quests'])
      else reject(`Отклонено изменение неизвестного задания «${mutation.targetId}».`, ['quests'])
      continue
    }
    normalizedQuestMutations.push({ ...mutation, targetId: resolved.id })
  }
  plan.statePatch.quests = plan.statePatch.quests ? normalizedQuestMutations : undefined
  const removedAbilityCount = plan.statePatch.removeAbilityIds?.length ?? 0
  plan.statePatch.removeAbilityIds = plan.statePatch.removeAbilityIds?.filter((abilityId) => knownAbilities.has(abilityId))
  if ((plan.statePatch.removeAbilityIds?.length ?? 0) < removedAbilityCount) rejectStaleRemoval('Пропущено удаление уже отсутствующей способности.', ['abilities'])
  const abilityChangeCount = plan.statePatch.abilityChanges?.length ?? 0
  plan.statePatch.abilityChanges = plan.statePatch.abilityChanges?.filter((change) => knownAbilities.has(change.abilityId)).map((change) => {
    if (change.mastery !== undefined && change.masteryDelta !== undefined) {
      delete change.masteryDelta
      notes.push('В развитии способности абсолютное mastery сохранено, дублирующая masteryDelta отброшена.')
    }
    const ability = campaign.player.abilities.find((candidate) => candidate.id === change.abilityId)
    sanitizeTechniquePatch((ability?.techniques ?? []).map((technique) => technique.id), change, ability?.name ?? change.abilityId)
    return change
  })
  if ((plan.statePatch.abilityChanges?.length ?? 0) < abilityChangeCount) reject('Отклонено развитие неизвестной способности.', ['abilities'])
  const artifactChangeCount = plan.statePatch.artifactChanges?.length ?? 0
  plan.statePatch.artifactChanges = plan.statePatch.artifactChanges?.filter((change) => knownArtifacts.has(change.itemId)).map((change) => {
    const artifact = campaign.inventory.find((item) => item.id === change.itemId)?.artifact
    ;([['mastery', 'masteryDelta'], ['attunement', 'attunementDelta'], ['bond', 'bondDelta']] as const).forEach(([absolute, delta]) => {
      if (change[absolute] === undefined || change[delta] === undefined) return
      delete change[delta]
      notes.push(`В развитии предмета абсолютное ${absolute} сохранено, дублирующая ${delta} отброшена.`)
    })
    const knownPowerIds = new Set([
      ...(artifact?.powers.map((power) => power.id) ?? []),
      ...(change.addPowers ?? []).flatMap((power) => power.id ? [power.id] : []),
    ])
    if (change.powerChanges) {
      const powerChangeCount = change.powerChanges.length
      change.powerChanges = change.powerChanges.filter((powerChange) => knownPowerIds.has(powerChange.powerId)).map((powerChange) => {
        if (powerChange.mastery !== undefined && powerChange.masteryDelta !== undefined) delete powerChange.masteryDelta
        const power = artifact?.powers.find((candidate) => candidate.id === powerChange.powerId)
        sanitizeTechniquePatch((power?.techniques ?? []).map((technique) => technique.id), powerChange, power?.name ?? powerChange.powerId)
        return powerChange
      })
      if (change.powerChanges.length < powerChangeCount) reject('Отклонено изменение неизвестной силы особого предмета.', ['artifacts'])
    }
    const knownComponentIds = new Set([
      ...(artifact?.components.map((component) => component.id) ?? []),
      ...(change.addComponents ?? []).flatMap((component) => component.id ? [component.id] : []),
    ])
    if (change.componentChanges) {
      const componentChangeCount = change.componentChanges.length
      change.componentChanges = change.componentChanges.filter((componentChange) => knownComponentIds.has(componentChange.componentId))
      if (change.componentChanges.length < componentChangeCount) reject('Отклонено изменение неизвестного компонента особого предмета.', ['artifacts'])
    }
    if (change.powerMasteryDeltas) {
      const powerChangeIds = new Set((change.powerChanges ?? []).filter((powerChange) => powerChange.mastery !== undefined || powerChange.masteryDelta !== undefined).map((powerChange) => powerChange.powerId))
      change.powerMasteryDeltas = Object.fromEntries(Object.entries(change.powerMasteryDeltas).filter(([powerId]) => knownPowerIds.has(powerId) && !powerChangeIds.has(powerId)))
      if (!Object.keys(change.powerMasteryDeltas).length) delete change.powerMasteryDeltas
    }
    if (artifact?.sentient || change.mood === undefined) return change
    const { mood: _ignoredMood, ...safeChange } = change
    void _ignoredMood
    reject('Отклонено настроение у неразумного предмета.', ['artifacts'])
    return safeChange
  })
  if ((plan.statePatch.artifactChanges?.length ?? 0) < artifactChangeCount) reject('Отклонено изменение неизвестного особого предмета.', ['artifacts'])
  if (plan.statePatch.removeStatusEffectIds?.length) {
    const effects = campaign.player.statusEffects ?? []
    const requested = plan.statePatch.removeStatusEffectIds
    const resolvedRemovals = requested.flatMap((reference) => {
      const exact = effects.find((effect) => effect.id === reference)
      const matches = exact ? [] : effects.filter((effect) => normalizedReference(effect.name) === normalizedReference(reference))
      const resolved = exact ?? (matches.length === 1 ? matches[0] : undefined)
      return resolved ? [resolved.id] : []
    })
    plan.statePatch.removeStatusEffectIds = resolvedRemovals.length ? [...new Set(resolvedRemovals)] : undefined
    if (resolvedRemovals.length < requested.length) {
      rejectStaleRemoval('Пропущено снятие уже отсутствующего статусного эффекта.', ['conditions'])
    }
  }
  if (plan.statePatch.scene?.presentNpcIds) {
    const before = plan.statePatch.scene.presentNpcIds.length
    plan.statePatch.scene.presentNpcIds = plan.statePatch.scene.presentNpcIds.filter((npcId) => usableNpcIds.has(npcId))
    const livingIds = new Set([
      ...campaign.npcs.filter((npc) => npc.status !== 'dead' && npc.status !== 'missing').map((npc) => npc.id),
      ...addedNpcIds,
    ])
    plan.statePatch.scene.presentNpcIds = plan.statePatch.scene.presentNpcIds.filter((npcId) => livingIds.has(npcId))
    if (plan.statePatch.scene.presentNpcIds.length < before) reject('Убрано невозможное присутствие персонажа в сцене.', ['characters', 'scene_time'])
  }
  if (plan.statePatch.conflict) {
    const mutation = plan.statePatch.conflict
    const participantIds = mutation.operation === 'resolve' ? [] : mutation.state.participants.map((participant) => participant.entityId)
    const validParticipantIds = new Set([campaign.player.id, ...usableNpcIds])
    const participantsValid = participantIds.length === new Set(participantIds).size
      && participantIds.includes(campaign.player.id)
      && participantIds.every((entityId) => validParticipantIds.has(entityId))
    const operationValid = mutation.operation === 'start'
      ? !campaign.activeConflict
      : mutation.operation === 'update'
        ? Boolean(campaign.activeConflict && campaign.activeConflict.id === mutation.state.id)
        : Boolean(campaign.activeConflict)
    if ((!participantsValid && mutation.operation !== 'resolve') || !operationValid) {
      plan.statePatch.conflict = undefined
      reject('Отклонено противоречивое состояние противостояния.', ['conflict'])
    }
  }
  const threadCount = plan.statePatch.threads?.length ?? 0
  plan.statePatch.threads = plan.statePatch.threads?.map((mutation) => {
    if (mutation.operation !== 'add' || !mutation.thread?.id || !campaign.threads?.some((thread) => thread.id === mutation.thread?.id)) return mutation
    const { id: targetId, ...thread } = mutation.thread
    notes.push(`Полная карточка существующей сюжетной линии «${thread.title ?? targetId}» преобразована в обновление.`)
    return { operation: 'update' as const, targetId, thread }
  })
  plan.statePatch.threads = plan.statePatch.threads?.filter((mutation) => {
    if (mutation.operation !== 'add') return Boolean(mutation.targetId && campaign.threads?.some((thread) => thread.id === mutation.targetId))
    const thread = mutation.thread
    if (!thread?.title || !thread.type || !thread.detail || !thread.status || thread.secret === undefined || !Array.isArray(thread.participantIds)) return false
    thread.id ??= randomUUID()
    thread.createdTurn ??= campaign.turn + 1
    thread.participantIds = thread.participantIds.filter((npcId) => usableNpcIds.has(npcId) || npcId === campaign.player.id)
    return true
  })
  if ((plan.statePatch.threads?.length ?? 0) < threadCount) reject('Отклонено неполное или неизвестное обязательство.', ['quests', 'relationships', 'world'])
  const worldEventCount = plan.statePatch.worldEvents?.length ?? 0
  plan.statePatch.worldEvents = plan.statePatch.worldEvents?.map((mutation) => {
    if (mutation.operation !== 'add' || !mutation.event?.id || !campaign.worldEvents?.some((event) => event.id === mutation.event?.id)) return mutation
    const { id: targetId, ...event } = mutation.event
    notes.push(`Полная карточка существующего мирового события «${event.title ?? targetId}» преобразована в обновление.`)
    return { operation: 'update' as const, targetId, event }
  })
  plan.statePatch.worldEvents = plan.statePatch.worldEvents?.filter((mutation) => {
    if (mutation.operation !== 'add') return Boolean(mutation.targetId && campaign.worldEvents?.some((event) => event.id === mutation.targetId))
    const event = mutation.event
    if (!event?.title || !event.description || !event.status || !event.visibility || !Array.isArray(event.involvedIds)) return false
    event.id ??= randomUUID()
    event.createdTurn ??= campaign.turn + 1
    event.involvedIds = event.involvedIds.filter((entityId) => usableNpcIds.has(entityId) || entityId === campaign.player.id)
    return true
  })
  if ((plan.statePatch.worldEvents?.length ?? 0) < worldEventCount) reject('Отклонено неполное мировое событие.', ['world'])
  if (plan.statePatch.world?.upsertPlaces) {
    const before = plan.statePatch.world.upsertPlaces.length
    plan.statePatch.world.upsertPlaces = plan.statePatch.world.upsertPlaces.filter((place) => !place.parentId || (place.parentId !== place.id && knownPlaceIds.has(place.parentId)))
    if (plan.statePatch.world.upsertPlaces.length < before) reject('Отклонено место атласа с неизвестным или циклическим родителем.', ['world'])
  }
  if (plan.statePatch.world?.upsertProcesses) {
    const before = plan.statePatch.world.upsertProcesses.length
    plan.statePatch.world.upsertProcesses = plan.statePatch.world.upsertProcesses.filter((process) => (
      process.scopeIds.every((placeId) => knownPlaceIds.has(placeId))
      && process.involvedFactionNames.every((name) => knownFactions.has(name.toLocaleLowerCase('ru-RU')))
    ))
    if (plan.statePatch.world.upsertProcesses.length < before) reject('Отклонён внешний процесс с неизвестной областью или фракцией.', ['world', 'world_pressure'])
  }
  const knownCausalIds = new Set([
    ...(campaign.world.processes ?? []).map((entry) => entry.id),
    ...(campaign.world.legends ?? []).flatMap((entry) => [
      entry.id,
      ...entry.deeds.map((deed) => deed.id),
      ...entry.legacies.map((legacy) => legacy.id),
    ]),
    ...(campaign.world.chronicle ?? []).flatMap((entry) => [entry.id, entry.sourceId]),
    ...(campaign.threads ?? []).map((entry) => entry.id),
    ...(campaign.worldEvents ?? []).map((entry) => entry.id),
    ...campaign.quests.map((entry) => entry.id),
    ...(campaign.antagonistPlans ?? []).map((entry) => entry.id),
    ...(campaign.worldPressures ?? []).map((entry) => entry.id),
    ...(plan.statePatch.world?.upsertProcesses ?? []).map((entry) => entry.id),
    ...(plan.statePatch.world?.upsertLegends ?? []).flatMap((entry) => [
      entry.id,
      ...entry.deeds.map((deed) => deed.id),
      ...entry.legacies.map((legacy) => legacy.id),
    ]),
    ...(plan.statePatch.threads ?? []).flatMap((entry) => entry.operation === 'add' && entry.thread?.id ? [entry.thread.id] : []),
    ...(plan.statePatch.worldEvents ?? []).flatMap((entry) => entry.operation === 'add' && entry.event?.id ? [entry.event.id] : []),
    ...(plan.statePatch.quests ?? []).flatMap((entry) => entry.operation === 'add' && entry.quest.id ? [entry.quest.id] : []),
    ...(plan.statePatch.upsertAntagonistPlans ?? []).map((entry) => entry.id),
    ...(plan.statePatch.upsertWorldPressures ?? []).map((entry) => entry.id),
  ])
  const sanitizeCausalRefs = (ownerId: string | undefined, causeIds: string[] | undefined, path: string) => {
    if (!causeIds?.length) return causeIds
    const accepted = [...new Set(causeIds)].filter((causeId) => causeId !== ownerId && knownCausalIds.has(causeId))
    if (accepted.length < causeIds.length) reject(`Отклонена неизвестная или циклическая причинная ссылка: ${path}.`, ['world'])
    return accepted.length ? accepted : undefined
  }
  const sanitizeScopeRefs = (scopeIds: string[] | undefined, path: string) => {
    if (!scopeIds?.length) return scopeIds
    const accepted = [...new Set(scopeIds)].filter((placeId) => knownPlaceIds.has(placeId))
    if (accepted.length < scopeIds.length) reject(`Отклонена неизвестная область причинного изменения: ${path}.`, ['world'])
    return accepted.length ? accepted : undefined
  }
  plan.statePatch.world?.upsertProcesses?.forEach((process) => {
    process.causeIds = sanitizeCausalRefs(process.id, process.causeIds, `world.processes.${process.id}`)
  })
  plan.statePatch.threads?.forEach((mutation) => {
    if (!mutation.thread) return
    const ownerId = mutation.operation === 'add' ? mutation.thread.id : mutation.targetId
    mutation.thread.scopeIds = sanitizeScopeRefs(mutation.thread.scopeIds, `threads.${ownerId ?? 'unknown'}`)
    mutation.thread.causeIds = sanitizeCausalRefs(ownerId, mutation.thread.causeIds, `threads.${ownerId ?? 'unknown'}`)
  })
  plan.statePatch.worldEvents?.forEach((mutation) => {
    if (!mutation.event) return
    const ownerId = mutation.operation === 'add' ? mutation.event.id : mutation.targetId
    mutation.event.scopeIds = sanitizeScopeRefs(mutation.event.scopeIds, `worldEvents.${ownerId ?? 'unknown'}`)
    mutation.event.causeIds = sanitizeCausalRefs(ownerId, mutation.event.causeIds, `worldEvents.${ownerId ?? 'unknown'}`)
  })
  if (plan.statePatch.world) {
    const worldPatch = plan.statePatch.world
    const keepKnown = <T>(
      values: T[] | undefined,
      exists: (value: T) => boolean,
      message: string,
    ) => {
      if (!values?.length) return values
      const accepted = values.filter(exists)
      if (accepted.length < values.length) rejectStaleRemoval(message, ['world'])
      return accepted.length ? accepted : undefined
    }
    worldPatch.removeRules = keepKnown(
      worldPatch.removeRules,
      (rule) => campaign.world.rules.some((current) => normalizedReference(current) === normalizedReference(rule)),
      'Отклонено удаление неизвестного правила мира.',
    )
    worldPatch.resolveMysteries = keepKnown(
      worldPatch.resolveMysteries,
      (mystery) => campaign.world.mysteries.some((current) => normalizedReference(current) === normalizedReference(mystery)),
      'Отклонено завершение неизвестной тайны мира.',
    )
    worldPatch.removeFactions = keepKnown(
      worldPatch.removeFactions,
      (name) => campaign.world.factions.some((faction) => normalizedReference(faction.name) === normalizedReference(name)),
      'Отклонено удаление неизвестной фракции.',
    )
    worldPatch.removeLocations = keepKnown(
      worldPatch.removeLocations,
      (name) => campaign.world.locations.some((location) => normalizedReference(location.name) === normalizedReference(name)),
      'Отклонено удаление неизвестной локации.',
    )
    worldPatch.removeRouteIds = keepKnown(
      worldPatch.removeRouteIds,
      (routeId) => (campaign.world.routes ?? []).some((route) => route.id === routeId),
      'Отклонено удаление неизвестного маршрута.',
    )
    worldPatch.removePlaceIds = keepKnown(
      worldPatch.removePlaceIds,
      (placeId) => (campaign.world.places ?? []).some((place) => place.id === placeId),
      'Отклонено удаление неизвестного места атласа.',
    )
    worldPatch.retireProcessIds = keepKnown(
      worldPatch.retireProcessIds,
      (processId) => (campaign.world.processes ?? []).some((process) => process.id === processId),
      'Отклонено завершение неизвестного внешнего процесса.',
    )
    worldPatch.removeLawIds = keepKnown(
      worldPatch.removeLawIds,
      (lawId) => (campaign.world.laws ?? []).some((law) => law.id === lawId),
      'Отклонено удаление неизвестного закона мира.',
    )
    worldPatch.removeMechanicIds = keepKnown(
      worldPatch.removeMechanicIds,
      (mechanicId) => (campaign.world.mechanics ?? []).some((mechanic) => mechanic.id === mechanicId),
      'Отклонено удаление неизвестной механики мира.',
    )
    worldPatch.removeInterfaceModuleIds = keepKnown(
      worldPatch.removeInterfaceModuleIds,
      (moduleId) => (campaign.world.interfaceModules ?? []).some((module) => module.id === moduleId),
      'Отклонено удаление неизвестного модуля интерфейса.',
    )
    worldPatch.removeMetricIds = keepKnown(
      worldPatch.removeMetricIds,
      (metricId) => (campaign.world.metrics ?? []).some((metric) => metric.id === metricId),
      'Отклонено удаление неизвестного показателя мира.',
    )

    // Full module upserts are applied before granular changes. Simulate the same order here so
    // a change may safely target a module (or element) created in this very patch.
    const removedModuleIds = new Set(worldPatch.removeInterfaceModuleIds ?? [])
    const resultingModuleElements = new Map((campaign.world.interfaceModules ?? [])
      .filter((module) => !removedModuleIds.has(module.id))
      .map((module) => [module.id, new Set(module.elements.map((element) => element.id))]))
    worldPatch.upsertInterfaceModules?.forEach((module) => {
      resultingModuleElements.set(module.id, new Set(module.elements.map((element) => element.id)))
    })
    if (worldPatch.interfaceModuleChanges?.length) {
      const acceptedChanges: NonNullable<NonNullable<TurnPatch['world']>['interfaceModuleChanges']> = []
      worldPatch.interfaceModuleChanges.forEach((change) => {
        const currentElementIds = resultingModuleElements.get(change.moduleId)
        if (!currentElementIds) {
          reject('Отклонено изменение неизвестного модуля интерфейса.', ['world'])
          return
        }
        const upsertedElementIds = new Set((change.upsertElements ?? []).map((element) => element.id))
        const removableElementIds = new Set([...currentElementIds, ...upsertedElementIds])
        const acceptedRemovals = (change.removeElementIds ?? []).filter((elementId) => removableElementIds.has(elementId))
        if (acceptedRemovals.length < (change.removeElementIds?.length ?? 0)) {
          rejectStaleRemoval('Пропущено удаление неизвестного элемента модуля интерфейса: он уже отсутствует.', ['world'])
        }
        const nextElementIds = new Set([...currentElementIds].filter((elementId) => !acceptedRemovals.includes(elementId)))
        upsertedElementIds.forEach((elementId) => nextElementIds.add(elementId))
        resultingModuleElements.set(change.moduleId, nextElementIds)
        acceptedChanges.push({
          ...change,
          removeElementIds: acceptedRemovals.length ? acceptedRemovals : undefined,
        })
      })
      worldPatch.interfaceModuleChanges = acceptedChanges.length ? acceptedChanges : undefined
    }

    const removedMetricIds = new Set(worldPatch.removeMetricIds ?? [])
    const resultingMetrics = (campaign.world.metrics ?? [])
      .filter((metric) => !removedMetricIds.has(metric.id))
      .map((metric) => ({ ...metric }))
    if (worldPatch.upsertMetrics?.length) {
      const acceptedMetrics: NonNullable<NonNullable<TurnPatch['world']>['upsertMetrics']> = []
      worldPatch.upsertMetrics.forEach((metric) => {
        const existingIndex = resultingMetrics.findIndex((current) => current.id === metric.id)
        const duplicateKey = resultingMetrics.some((current, index) => (
          index !== existingIndex && normalizedReference(current.key) === normalizedReference(metric.key)
        ))
        if (duplicateKey) {
          reject('Отклонен показатель мира с ключом, который уже принадлежит другому показателю.', ['world'])
          return
        }
        if (existingIndex >= 0) resultingMetrics[existingIndex] = { ...metric, lastChangedTurn: metric.lastChangedTurn ?? campaign.turn + 1 }
        else resultingMetrics.push({ ...metric, lastChangedTurn: metric.lastChangedTurn ?? campaign.turn + 1 })
        acceptedMetrics.push(metric)
      })
      worldPatch.upsertMetrics = acceptedMetrics.length ? acceptedMetrics : undefined
    }
    if (worldPatch.metricDeltas) {
      const entries = Object.entries(worldPatch.metricDeltas)
      const accepted = entries.filter(([reference]) => {
        const normalized = normalizedReference(reference)
        const matches = resultingMetrics.filter((metric) => (
          metric.id === reference
          || normalizedReference(metric.key) === normalized
          || normalizedReference(metric.label) === normalized
        ))
        return matches.length === 1
      })
      worldPatch.metricDeltas = accepted.length ? Object.fromEntries(accepted) : undefined
      if (accepted.length < entries.length) reject('Отклонено изменение неизвестного или неоднозначного показателя мира.', ['world'])
    }
  }
  const reputationUpsertCount = plan.statePatch.upsertFactionReputation?.length ?? 0
  plan.statePatch.upsertFactionReputation = plan.statePatch.upsertFactionReputation?.filter((entry) => knownFactions.has(entry.factionName.toLocaleLowerCase('ru-RU')))
  if ((plan.statePatch.upsertFactionReputation?.length ?? 0) < reputationUpsertCount) reject('Отклонено абсолютное изменение репутации неизвестной фракции.', ['relationships', 'world', 'world_pressure'])
  if (plan.statePatch.factionReputationDeltas) {
    const entries = Object.entries(plan.statePatch.factionReputationDeltas)
    const accepted = entries.filter(([factionName]) => knownFactions.has(factionName.toLocaleLowerCase('ru-RU')))
    plan.statePatch.factionReputationDeltas = Object.fromEntries(accepted)
    if (accepted.length < entries.length) reject('Отклонено изменение репутации неизвестной фракции.', ['relationships', 'world', 'world_pressure'])
  }
  const socialLinkCount = plan.statePatch.socialLinks?.length ?? 0
  plan.statePatch.socialLinks = plan.statePatch.socialLinks?.filter((link) => link.fromNpcId !== link.toNpcId && usableNpcIds.has(link.fromNpcId) && usableNpcIds.has(link.toNpcId))
  if ((plan.statePatch.socialLinks?.length ?? 0) < socialLinkCount) reject('Отклонена социальная связь с неизвестным или совпадающим участником.', ['relationships', 'characters'])
  const removedSocialLinkCount = plan.statePatch.removeSocialLinkIds?.length ?? 0
  const knownSocialLinkIds = new Set((campaign.socialLinks ?? []).map((link) => link.id))
  plan.statePatch.removeSocialLinkIds = plan.statePatch.removeSocialLinkIds?.filter((linkId) => knownSocialLinkIds.has(linkId))
  if ((plan.statePatch.removeSocialLinkIds?.length ?? 0) < removedSocialLinkCount) rejectStaleRemoval('Пропущено удаление уже отсутствующей социальной связи.', ['relationships', 'characters'])
  if (plan.statePatch.party) {
    const requestedPartyAdds = plan.statePatch.party.addNpcIds ?? []
    plan.statePatch.party.addNpcIds = requestedPartyAdds.filter((npcId) => {
      if (!usableNpcIds.has(npcId)) return false
      const plannedRecruitment = [...(plan.statePatch.npcs ?? [])].reverse().find((mutation) => mutation.operation === 'update' && mutation.targetId === npcId && mutation.npc.recruitment)?.npc.recruitment
      const recruitment = plannedRecruitment ?? campaign.npcs.find((npc) => npc.id === npcId)?.recruitment
      return Boolean(recruitment && ['invited', 'member'].includes(recruitment.status) && recruitment.willingness >= 50)
    })
    if ((plan.statePatch.party.addNpcIds?.length ?? 0) < requestedPartyAdds.length) reject('Отклонено добавление персонажа без его явного решения и выполненных условий вступления.', ['characters', 'relationships'])
    const resultingPartyIds = new Set([...(campaign.partyMemberIds ?? []), ...(plan.statePatch.party.addNpcIds ?? [])])
    const requestedPartyRemovals = plan.statePatch.party.removeNpcIds ?? []
    plan.statePatch.party.removeNpcIds = requestedPartyRemovals.filter((npcId) => resultingPartyIds.has(npcId))
    if ((plan.statePatch.party.removeNpcIds?.length ?? 0) < requestedPartyRemovals.length) rejectStaleRemoval('Пропущено удаление персонажа, которого уже нет в отряде.', ['characters', 'relationships'])
    plan.statePatch.party.removeNpcIds?.forEach((npcId) => resultingPartyIds.delete(npcId))
    if (plan.statePatch.party.roles) {
      plan.statePatch.party.roles = Object.fromEntries(Object.entries(plan.statePatch.party.roles).filter(([npcId]) => usableNpcIds.has(npcId) && resultingPartyIds.has(npcId)))
    }
  }
  const campaignEntityIds = new Set([campaign.player.id, ...usableNpcIds])
  const characterArcCount = plan.statePatch.upsertCharacterArcs?.length ?? 0
  plan.statePatch.upsertCharacterArcs = plan.statePatch.upsertCharacterArcs?.filter((arc) => campaignEntityIds.has(arc.ownerId))
  if ((plan.statePatch.upsertCharacterArcs?.length ?? 0) < characterArcCount) reject('Отклонена арка неизвестного персонажа.', ['characters'])
  const mysteryCaseCount = plan.statePatch.upsertMysteryCases?.length ?? 0
  plan.statePatch.upsertMysteryCases = plan.statePatch.upsertMysteryCases?.filter((incoming) => {
    const existing = campaign.mysteryCases?.find((mystery) => mystery.id === incoming.id)
    return Boolean(existing || !incoming.culpritId || campaignEntityIds.has(incoming.culpritId))
  })
  if ((plan.statePatch.upsertMysteryCases?.length ?? 0) < mysteryCaseCount) reject('Отклонено расследование со ссылкой на неизвестного виновника.', ['knowledge', 'characters'])
  plan.statePatch.upsertMysteryCases = plan.statePatch.upsertMysteryCases?.flatMap((incoming) => {
    const existing = campaign.mysteryCases?.find((mystery) => mystery.id === incoming.id)
    if (!existing) return [{ ...incoming, createdTurn: campaign.turn + 1 }]
    const incomingClues = new Map(incoming.clues.map((clue) => [clue.id, clue]))
    const existingClueIds = new Set(existing.clues.map((clue) => clue.id))
    const mergeUniqueText = (left: string[], right: string[]) => [...new Map([...left, ...right].map((entry) => [normalizedReference(entry), entry])).values()]
    return [{
      ...incoming,
      id: existing.id,
      title: existing.title,
      premise: existing.premise,
      truth: existing.truth,
      culpritId: existing.culpritId,
      status: incoming.status,
      conclusion: incoming.conclusion,
      solvedTurn: incoming.solvedTurn,
      clues: [
        ...existing.clues.map((clue) => ({
          ...clue,
          discovered: clue.discovered || Boolean(incomingClues.get(clue.id)?.discovered),
        })),
        ...incoming.clues.filter((clue) => !existingClueIds.has(clue.id)),
      ],
      redHerrings: mergeUniqueText(existing.redHerrings, incoming.redHerrings),
      revelationRules: mergeUniqueText(existing.revelationRules, incoming.revelationRules),
      createdTurn: existing.createdTurn,
    }]
  })
  const antagonistPlanCount = plan.statePatch.upsertAntagonistPlans?.length ?? 0
  plan.statePatch.upsertAntagonistPlans = plan.statePatch.upsertAntagonistPlans?.filter((incoming) => usableNpcIds.has(incoming.ownerNpcId)).map((incoming) => {
    const existing = campaign.antagonistPlans?.find((plan) => plan.id === incoming.id)
    if (!existing) return incoming
    const incomingSteps = new Map(incoming.steps.map((step) => [step.id, step]))
    const existingStepIds = new Set(existing.steps.map((step) => step.id))
    const mergeUniqueText = (left: string[], right: string[]) => [...new Map([...left, ...right].map((entry) => [normalizedReference(entry), entry])).values()]
    return {
      ...incoming,
      id: existing.id,
      ownerNpcId: existing.ownerNpcId,
      title: existing.title,
      objective: existing.objective,
      resources: mergeUniqueText(existing.resources, incoming.resources),
      knowledge: mergeUniqueText(existing.knowledge, incoming.knowledge),
      steps: [
        ...existing.steps.map((step) => ({ ...step, status: incomingSteps.get(step.id)?.status ?? step.status })),
        ...incoming.steps.filter((step) => !existingStepIds.has(step.id)),
      ],
      weaknesses: mergeUniqueText(existing.weaknesses, incoming.weaknesses),
    }
  })
  if ((plan.statePatch.upsertAntagonistPlans?.length ?? 0) < antagonistPlanCount) reject('Отклонён план противника с неизвестным владельцем.', ['characters', 'world_pressure'])
  const worldPressureCount = plan.statePatch.upsertWorldPressures?.length ?? 0
  plan.statePatch.upsertWorldPressures = plan.statePatch.upsertWorldPressures?.filter((incoming) => (
    incoming.targetIds.length > 0
    && incoming.targetIds.every((targetId) => campaignEntityIds.has(targetId))
    && (!incoming.sourceNpcId || campaignEntityIds.has(incoming.sourceNpcId))
    && (!['faction', 'corporation'].includes(incoming.sourceKind) || knownFactions.has(incoming.sourceName.toLocaleLowerCase('ru-RU')))
  )).map((incoming) => {
    const existing = campaign.worldPressures?.find((pressure) => pressure.id === incoming.id)
    const measures = incoming.measures.filter((measure, index, all) => all.findIndex((candidate) => candidate.id === measure.id) === index)
    if (!existing) return { ...incoming, measures, createdTurn: campaign.turn + 1, lastAdvancedTurn: campaign.turn + 1 }
    const existingMeasureIds = new Set(existing.measures.map((measure) => measure.id))
    const normalizedMeasures = measures.map((measure) => existingMeasureIds.has(measure.id) ? measure : { ...measure, status: measure.status === 'active' ? 'preparing' as const : measure.status })
    return {
      ...incoming,
      id: existing.id,
      sourceKind: existing.sourceKind,
      sourceName: existing.sourceName,
      sourceNpcId: existing.sourceNpcId,
      cause: existing.cause,
      measures: normalizedMeasures,
      createdTurn: existing.createdTurn,
      lastAdvancedTurn: campaign.turn + 1,
    }
  })
  if ((plan.statePatch.upsertWorldPressures?.length ?? 0) < worldPressureCount) reject('Отклонено давление мира с неизвестным источником или целью.', ['world_pressure', 'world', 'characters'])
  const influenceAssetCount = plan.statePatch.upsertInfluenceAssets?.length ?? 0
  plan.statePatch.upsertInfluenceAssets = plan.statePatch.upsertInfluenceAssets?.filter((asset) => campaignEntityIds.has(asset.holderId) && (!asset.targetId || campaignEntityIds.has(asset.targetId)))
  if ((plan.statePatch.upsertInfluenceAssets?.length ?? 0) < influenceAssetCount) reject('Отклонён ресурс влияния с неизвестным участником.', ['relationships', 'characters'])
  const removedInfluenceCount = plan.statePatch.removeInfluenceAssetIds?.length ?? 0
  plan.statePatch.removeInfluenceAssetIds = plan.statePatch.removeInfluenceAssetIds?.filter((assetId) => campaign.influenceAssets?.some((asset) => asset.id === assetId))
  if ((plan.statePatch.removeInfluenceAssetIds?.length ?? 0) < removedInfluenceCount) rejectStaleRemoval('Пропущено удаление уже отсутствующего ресурса влияния.', ['relationships'])
  if (plan.statePatch.cleanup) {
    plan.statePatch.cleanup.quests = plan.statePatch.cleanup.quests?.map((entry) => {
      const resolved = resolveQuestReference(entry.targetId)
      return resolved ? { ...entry, targetId: resolved.id } : entry
    })
    const validTargets = {
      threads: new Set((campaign.threads ?? []).map((entry) => entry.id)),
      worldEvents: new Set((campaign.worldEvents ?? []).map((entry) => entry.id)),
      quests: new Set(questReferences.map((entry) => entry.id)),
      antagonistPlans: new Set((campaign.antagonistPlans ?? []).map((entry) => entry.id)),
      worldPressures: new Set((campaign.worldPressures ?? []).map((entry) => entry.id)),
      memories: new Set(campaign.memories.map((entry) => entry.id)),
    }
    const cleanupDomains: Record<keyof typeof validTargets, ConsequenceDomain[]> = {
      threads: ['quests', 'relationships', 'world'],
      worldEvents: ['world'],
      quests: ['quests'],
      antagonistPlans: ['characters', 'world_pressure'],
      worldPressures: ['world_pressure'],
      memories: ['knowledge'],
    }
    ;(Object.keys(validTargets) as Array<keyof typeof validTargets>).forEach((key) => {
      const before = plan.statePatch.cleanup?.[key]?.length ?? 0
      if (plan.statePatch.cleanup) plan.statePatch.cleanup[key] = plan.statePatch.cleanup[key]?.filter((entry) => validTargets[key].has(entry.targetId))
      if ((plan.statePatch.cleanup?.[key]?.length ?? 0) < before) rejectStaleRemoval(`Пропущена очистка уже отсутствующей записи: ${key}.`, cleanupDomains[key])
    })
  }
  return { plan, notes, rejections }
}

function blockingRejectionMessages(
  sanitized: ReturnType<typeof sanitizePlan>,
  omissions: ConsequenceAudit['omissions'],
) {
  const requiredDomains = new Set(omissions.map((omission) => omission.domain))
  return [...new Set(sanitized.rejections
    .filter((rejection) => rejection.blocking && rejection.domains.some((domain) => requiredDomains.has(domain)))
    .map((rejection) => rejection.message))]
}

export function mergePatches(backgroundInput: TurnPatch | null | undefined, foregroundInput: TurnPatch | null | undefined): TurnPatch {
  const background = backgroundInput ?? {}
  const foreground = foregroundInput ?? {}
  const sumRecords = (left?: Record<string, number>, right?: Record<string, number>) => {
    const merged = { ...(left ?? {}) }
    Object.entries(right ?? {}).forEach(([key, value]) => { merged[key] = (merged[key] ?? 0) + value })
    return Object.keys(merged).length ? merged : undefined
  }
  const concat = <T>(left?: T[], right?: T[]) => {
    const merged = [...(left ?? []), ...(right ?? [])]
    return merged.length ? merged : undefined
  }
  const unique = (left?: string[], right?: string[]) => {
    const merged = [...new Set([...(left ?? []), ...(right ?? [])])]
    return merged.length ? merged : undefined
  }
  const hasLevelDelta = background.playerProfile?.levelDelta !== undefined || foreground.playerProfile?.levelDelta !== undefined
  const playerProfile = background.playerProfile || foreground.playerProfile ? {
    ...background.playerProfile,
    ...foreground.playerProfile,
    ...(hasLevelDelta ? { levelDelta: (background.playerProfile?.levelDelta ?? 0) + (foreground.playerProfile?.levelDelta ?? 0) } : {}),
  } : undefined
  const scene = background.scene || foreground.scene ? { ...background.scene, ...foreground.scene } : undefined
  const hasCalendarDayDelta = background.world?.calendarDayDelta !== undefined || foreground.world?.calendarDayDelta !== undefined
  const worldSystem = background.world?.system || foreground.world?.system ? {
    ...background.world?.system,
    ...foreground.world?.system,
  } : undefined
  const worldPresentation = background.world?.presentation || foreground.world?.presentation ? {
    ...background.world?.presentation,
    ...foreground.world?.presentation,
    labels: background.world?.presentation?.labels || foreground.world?.presentation?.labels ? {
      ...background.world?.presentation?.labels,
      ...foreground.world?.presentation?.labels,
    } : undefined,
    categoryLabels: background.world?.presentation?.categoryLabels || foreground.world?.presentation?.categoryLabels ? {
      ...background.world?.presentation?.categoryLabels,
      ...foreground.world?.presentation?.categoryLabels,
    } : undefined,
    rarityLabels: background.world?.presentation?.rarityLabels || foreground.world?.presentation?.rarityLabels ? {
      ...background.world?.presentation?.rarityLabels,
      ...foreground.world?.presentation?.rarityLabels,
    } : undefined,
  } : undefined
  const world = background.world || foreground.world ? {
    ...background.world,
    ...foreground.world,
    addRules: unique(background.world?.addRules, foreground.world?.addRules),
    removeRules: unique(background.world?.removeRules, foreground.world?.removeRules),
    upsertFactions: concat(background.world?.upsertFactions, foreground.world?.upsertFactions),
    removeFactions: unique(background.world?.removeFactions, foreground.world?.removeFactions),
    upsertLocations: concat(background.world?.upsertLocations, foreground.world?.upsertLocations),
    removeLocations: unique(background.world?.removeLocations, foreground.world?.removeLocations),
    addMysteries: unique(background.world?.addMysteries, foreground.world?.addMysteries),
    resolveMysteries: unique(background.world?.resolveMysteries, foreground.world?.resolveMysteries),
    upsertRoutes: concat(background.world?.upsertRoutes, foreground.world?.upsertRoutes),
    removeRouteIds: unique(background.world?.removeRouteIds, foreground.world?.removeRouteIds),
    upsertPlaces: concat(background.world?.upsertPlaces, foreground.world?.upsertPlaces),
    removePlaceIds: unique(background.world?.removePlaceIds, foreground.world?.removePlaceIds),
    upsertProcesses: concat(background.world?.upsertProcesses, foreground.world?.upsertProcesses),
    retireProcessIds: unique(background.world?.retireProcessIds, foreground.world?.retireProcessIds),
    legendarium: foreground.world?.legendarium ?? background.world?.legendarium,
    upsertLegends: concat(background.world?.upsertLegends, foreground.world?.upsertLegends),
    removeLegendIds: unique(background.world?.removeLegendIds, foreground.world?.removeLegendIds),
    upsertLaws: concat(background.world?.upsertLaws, foreground.world?.upsertLaws),
    removeLawIds: unique(background.world?.removeLawIds, foreground.world?.removeLawIds),
    upsertMechanics: concat(background.world?.upsertMechanics, foreground.world?.upsertMechanics),
    removeMechanicIds: unique(background.world?.removeMechanicIds, foreground.world?.removeMechanicIds),
    upsertInterfaceModules: concat(background.world?.upsertInterfaceModules, foreground.world?.upsertInterfaceModules),
    interfaceModuleChanges: concat(background.world?.interfaceModuleChanges, foreground.world?.interfaceModuleChanges),
    removeInterfaceModuleIds: unique(background.world?.removeInterfaceModuleIds, foreground.world?.removeInterfaceModuleIds),
    interfaceBlueprint: foreground.world?.interfaceBlueprint ?? background.world?.interfaceBlueprint,
    upsertMetrics: concat(background.world?.upsertMetrics, foreground.world?.upsertMetrics),
    metricDeltas: sumRecords(background.world?.metricDeltas, foreground.world?.metricDeltas),
    removeMetricIds: unique(background.world?.removeMetricIds, foreground.world?.removeMetricIds),
    system: worldSystem,
    presentation: worldPresentation,
    ...(hasCalendarDayDelta ? { calendarDayDelta: (background.world?.calendarDayDelta ?? 0) + (foreground.world?.calendarDayDelta ?? 0) } : {}),
  } : undefined
  const party = background.party || foreground.party ? {
    addNpcIds: unique(background.party?.addNpcIds, foreground.party?.addNpcIds),
    removeNpcIds: unique(background.party?.removeNpcIds, foreground.party?.removeNpcIds),
    roles: { ...(background.party?.roles ?? {}), ...(foreground.party?.roles ?? {}) },
  } : undefined
  const cleanupKeys = ['threads', 'worldEvents', 'quests', 'antagonistPlans', 'worldPressures', 'memories'] as const
  const cleanup = background.cleanup || foreground.cleanup ? Object.fromEntries(cleanupKeys.flatMap((key) => {
    const entries = [...(background.cleanup?.[key] ?? []), ...(foreground.cleanup?.[key] ?? [])]
    const uniqueEntries = entries.filter((entry, index, all) => all.findIndex((candidate) => candidate.targetId === entry.targetId) === index)
    return uniqueEntries.length ? [[key, uniqueEntries]] : []
  })) as TurnPatch['cleanup'] : undefined
  return {
    ...background,
    ...foreground,
    inventory: concat(background.inventory, foreground.inventory),
    playerProfile,
    upsertStats: concat(background.upsertStats, foreground.upsertStats),
    removeStatKeys: unique(background.removeStatKeys, foreground.removeStatKeys),
    upsertResources: concat(background.upsertResources, foreground.upsertResources),
    removeResourceKeys: unique(background.removeResourceKeys, foreground.removeResourceKeys),
    statDeltas: sumRecords(background.statDeltas, foreground.statDeltas),
    resourceDeltas: sumRecords(background.resourceDeltas, foreground.resourceDeltas),
    currencyDeltas: sumRecords(background.currencyDeltas, foreground.currencyDeltas),
    addAbilities: concat(background.addAbilities, foreground.addAbilities),
    removeAbilityIds: unique(background.removeAbilityIds, foreground.removeAbilityIds),
    abilityChanges: concat(background.abilityChanges, foreground.abilityChanges),
    artifactChanges: concat(background.artifactChanges, foreground.artifactChanges),
    addConditions: unique(background.addConditions, foreground.addConditions),
    removeConditions: unique(background.removeConditions, foreground.removeConditions),
    upsertStatusEffects: concat(background.upsertStatusEffects, foreground.upsertStatusEffects),
    removeStatusEffectIds: unique(background.removeStatusEffectIds, foreground.removeStatusEffectIds),
    relationships: concat(background.relationships, foreground.relationships),
    npcs: concat(background.npcs, foreground.npcs),
    quests: concat(background.quests, foreground.quests),
    lore: concat(background.lore, foreground.lore),
    scene,
    pacing: foreground.pacing ?? background.pacing,
    conflict: foreground.conflict ?? background.conflict,
    socialLinks: concat(background.socialLinks, foreground.socialLinks),
    removeSocialLinkIds: unique(background.removeSocialLinkIds, foreground.removeSocialLinkIds),
    threads: concat(background.threads, foreground.threads),
    worldEvents: concat(background.worldEvents, foreground.worldEvents),
    factionReputationDeltas: sumRecords(background.factionReputationDeltas, foreground.factionReputationDeltas),
    upsertFactionReputation: concat(background.upsertFactionReputation, foreground.upsertFactionReputation),
    party,
    upsertCharacterArcs: concat(background.upsertCharacterArcs, foreground.upsertCharacterArcs),
    upsertMysteryCases: concat(background.upsertMysteryCases, foreground.upsertMysteryCases),
    upsertAntagonistPlans: concat(background.upsertAntagonistPlans, foreground.upsertAntagonistPlans),
    upsertWorldPressures: concat(background.upsertWorldPressures, foreground.upsertWorldPressures),
    upsertInfluenceAssets: concat(background.upsertInfluenceAssets, foreground.upsertInfluenceAssets),
    removeInfluenceAssetIds: unique(background.removeInfluenceAssetIds, foreground.removeInfluenceAssetIds),
    cleanup,
    memories: concat(background.memories, foreground.memories),
    events: concat(background.events, foreground.events),
    world,
  }
}

type AbilityChange = NonNullable<TurnPatch['abilityChanges']>[number]
type ArtifactChange = NonNullable<TurnPatch['artifactChanges']>[number]

function changeValueSignature(value: unknown) {
  if (typeof value === 'string') return value.trim().toLocaleLowerCase('ru-RU')
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (record.id !== undefined) return `id:${String(record.id)}`
    if (record.name !== undefined) return `name:${String(record.name).trim().toLocaleLowerCase('ru-RU')}`
  }
  return JSON.stringify(value)
}

function filterSupplementalObjects<T extends Record<string, unknown>>(
  recorded: T[] | undefined,
  candidates: T[] | undefined,
  identityKey: keyof T,
  exclusiveGroups: Array<Array<keyof T>>,
  additiveFields: Partial<Record<keyof T, Array<keyof T>>>,
  preservedFields: Array<keyof T> = [],
): T[] | undefined {
  if (!candidates?.length) return undefined
  const accepted: T[] = []
  for (const candidate of candidates) {
    const next = structuredClone(candidate) as T
    const identity = candidate[identityKey]
    const prior = [...(recorded ?? []), ...accepted].filter((entry) => entry[identityKey] === identity)
    exclusiveGroups.forEach((group) => {
      if (!prior.some((entry) => group.some((key) => Object.hasOwn(entry, key)))) return
      group.forEach((key) => { delete next[key] })
    })
    Object.entries(additiveFields).forEach(([rawKey, comparisonKeys]) => {
      const key = rawKey as keyof T
      const values = next[key]
      if (!Array.isArray(values)) return
      const seen = new Set(prior.flatMap((entry) => (comparisonKeys as Array<keyof T>).flatMap((comparisonKey) => {
        const recordedValues = entry[comparisonKey]
        return Array.isArray(recordedValues) ? recordedValues.map(changeValueSignature) : []
      })))
      const unique = values.filter((value, index, all) => {
        const signature = changeValueSignature(value)
        return !seen.has(signature) && all.findIndex((candidateValue) => changeValueSignature(candidateValue) === signature) === index
      })
      if (unique.length) next[key] = unique as T[keyof T]
      else delete next[key]
    })
    const protectedKeys = new Set<PropertyKey>([identityKey, 'history', ...preservedFields, ...Object.keys(additiveFields)])
    Object.keys(next).forEach((rawKey) => {
      const key = rawKey as keyof T
      if (protectedKeys.has(key) || exclusiveGroups.some((group) => group.includes(key))) return
      if (prior.some((entry) => Object.hasOwn(entry, key))) delete next[key]
    })
    if (next.history && prior.some((entry) => changeValueSignature(entry.history) === changeValueSignature(next.history))) delete next.history
    if (Object.keys(next).some((key) => key !== identityKey)) accepted.push(next)
  }
  return accepted.length ? accepted : undefined
}

function filterSupplementalAbilityChanges(recorded: AbilityChange[] | undefined, candidates: AbilityChange[] | undefined) {
  return filterSupplementalObjects(
    recorded as Array<Record<string, unknown>> | undefined,
    candidates as Array<Record<string, unknown>> | undefined,
    'abilityId',
    [['mastery', 'masteryDelta']],
    {
      addCapabilities: ['capabilities', 'addCapabilities'], addSynergies: ['synergies', 'addSynergies'],
      addCounters: ['counters', 'addCounters'], addExamples: ['examples', 'addExamples'],
      addEffects: ['effects', 'addEffects'], addLimitations: ['limitations', 'addLimitations'],
      addTechniques: ['addTechniques'], techniqueChanges: ['techniqueChanges'], removeTechniqueIds: ['removeTechniqueIds'],
      addEvolutionPaths: ['addEvolutionPaths'], unlockEvolutionPathIds: ['unlockEvolutionPathIds'],
    },
  ) as AbilityChange[] | undefined
}

function filterSupplementalArtifactChanges(recorded: ArtifactChange[] | undefined, candidates: ArtifactChange[] | undefined) {
  if (!candidates?.length) return undefined
  const accepted: ArtifactChange[] = []
  for (const originalCandidate of candidates) {
    const candidate = structuredClone(originalCandidate)
    const prior = [...(recorded ?? []), ...accepted].filter((entry) => entry.itemId === candidate.itemId)
    const recordedPowerChanges = prior.flatMap((entry) => entry.powerChanges ?? [])
    const recordedPowerDeltaIds = new Set(prior.flatMap((entry) => Object.keys(entry.powerMasteryDeltas ?? {})))
    const powerRecordedWithLegacyDelta = [
      ...recordedPowerChanges,
      ...[...recordedPowerDeltaIds].map((powerId) => ({ powerId, masteryDelta: 0 })),
    ]
    candidate.powerChanges = filterSupplementalObjects(
      powerRecordedWithLegacyDelta as Array<Record<string, unknown>>,
      candidate.powerChanges as Array<Record<string, unknown>> | undefined,
      'powerId',
      [['mastery', 'masteryDelta']],
      {
        addCapabilities: ['capabilities', 'addCapabilities'], addSynergies: ['synergies', 'addSynergies'],
        addCounters: ['counters', 'addCounters'], addExamples: ['examples', 'addExamples'],
        addLimitations: ['limitations', 'addLimitations'],
        addTechniques: ['addTechniques'], techniqueChanges: ['techniqueChanges'], removeTechniqueIds: ['removeTechniqueIds'],
      },
    ) as ArtifactChange['powerChanges']
    if (!candidate.powerChanges?.length) delete candidate.powerChanges
    const candidatePowerChangeIds = new Set((candidate.powerChanges ?? [])
      .filter((change) => change.mastery !== undefined || change.masteryDelta !== undefined)
      .map((change) => change.powerId))
    if (candidate.powerMasteryDeltas) {
      candidate.powerMasteryDeltas = Object.fromEntries(Object.entries(candidate.powerMasteryDeltas)
        .filter(([powerId]) => !recordedPowerDeltaIds.has(powerId) && !recordedPowerChanges.some((change) => change.powerId === powerId && (change.mastery !== undefined || change.masteryDelta !== undefined)) && !candidatePowerChangeIds.has(powerId)))
      if (!Object.keys(candidate.powerMasteryDeltas).length) delete candidate.powerMasteryDeltas
    }
    candidate.componentChanges = filterSupplementalObjects(
      prior.flatMap((entry) => entry.componentChanges ?? []) as unknown as Array<Record<string, unknown>>,
      candidate.componentChanges as unknown as Array<Record<string, unknown>> | undefined,
      'componentId',
      [],
      { addCapabilities: ['capabilities', 'addCapabilities'] },
    ) as ArtifactChange['componentChanges']
    if (!candidate.componentChanges?.length) delete candidate.componentChanges
    const filtered = filterSupplementalObjects(
      prior as unknown as Array<Record<string, unknown>>,
      [candidate] as unknown as Array<Record<string, unknown>>,
      'itemId',
      [['mastery', 'masteryDelta'], ['attunement', 'attunementDelta'], ['bond', 'bondDelta']],
      {
        addPassiveEffects: ['passiveEffects', 'addPassiveEffects'], addCombinedEffects: ['combinedEffects', 'addCombinedEffects'],
        addFailureModes: ['failureModes', 'addFailureModes'], addDrawbacks: ['drawbacks', 'addDrawbacks'],
        addPowers: ['addPowers'], addComponents: ['addComponents'], addEvolutionPaths: ['addEvolutionPaths'],
        unlockEvolutionPathIds: ['unlockEvolutionPathIds'],
      },
      ['powerChanges', 'componentChanges', 'powerMasteryDeltas'],
    ) as ArtifactChange[] | undefined
    if (filtered?.[0]) accepted.push(filtered[0])
  }
  return accepted.length ? accepted : undefined
}

/** The consequence auditor is allowed to add only omitted consequences. DeepSeek can still
 * repeat a delta that is already present in the approved plan, so remove overlaps before the
 * ordinary additive merge. This prevents costs, damage and stack losses from being applied twice. */
export function mergeAuditPatch(baseInput: TurnPatch | null | undefined, auditInput: TurnPatch | null | undefined): TurnPatch {
  const base = baseInput ?? {}
  const additional = structuredClone(auditInput ?? {})
  const omitRecordedKeys = (candidate: Record<string, number> | undefined, recorded: Record<string, number> | undefined) => {
    if (!candidate) return undefined
    const filtered = Object.fromEntries(Object.entries(candidate).filter(([key]) => !Object.hasOwn(recorded ?? {}, key)))
    return Object.keys(filtered).length ? filtered : undefined
  }
  const omitRecordedFields = <T extends Record<string, unknown>>(candidate: T | undefined, recorded: Array<Record<string, unknown> | undefined>): T | undefined => {
    if (!candidate) return undefined
    const filtered = Object.fromEntries(Object.entries(candidate).filter(([key]) => !recorded.some((entry) => entry && Object.hasOwn(entry, key)))) as T
    return Object.keys(filtered).length ? filtered : undefined
  }
  const entitySignature = (value: unknown) => {
    if (!value || typeof value !== 'object') return changeValueSignature(value)
    const record = value as Record<string, unknown>
    if (record.id !== undefined) return `id:${String(record.id)}`
    if (record.key !== undefined) return `key:${normalizedReference(String(record.key))}`
    if (record.factionName !== undefined) return `faction:${normalizedReference(String(record.factionName))}`
    if (record.name !== undefined) return `name:${normalizedReference(String(record.name))}`
    if (record.title !== undefined) return `title:${normalizedReference(String(record.title))}`
    if (record.subject !== undefined) return `subject:${normalizedReference(String(record.subject))}`
    return changeValueSignature(value)
  }
  const onlyNewEntities = <T>(recorded: T[] | undefined, candidates: T[] | undefined): T[] | undefined => {
    if (!candidates?.length) return undefined
    const seen = new Set((recorded ?? []).map(entitySignature))
    const filtered = candidates.filter((candidate) => {
      const signature = entitySignature(candidate)
      if (seen.has(signature)) return false
      seen.add(signature)
      return true
    })
    return filtered.length ? filtered : undefined
  }
  const mutationIdentity = (value: Record<string, unknown>, payloadKey: string) => {
    if (value.targetId !== undefined) return `id:${String(value.targetId)}`
    const payload = value[payloadKey]
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return ''
    const record = payload as Record<string, unknown>
    if (record.id !== undefined) return `id:${String(record.id)}`
    if (record.title !== undefined) return `title:${normalizedReference(String(record.title))}`
    return ''
  }
  const onlySupplementalMutations = (
    recorded: unknown[] | undefined,
    candidates: unknown[] | undefined,
    payloadKey: string,
  ) => {
    if (!candidates?.length) return undefined
    const recordedMutations = (recorded ?? []) as Array<Record<string, unknown>>
    const accepted = (candidates as Array<Record<string, unknown>>).flatMap((candidate) => {
      const identity = mutationIdentity(candidate, payloadKey)
      const prior = identity ? recordedMutations.filter((entry) => mutationIdentity(entry, payloadKey) === identity) : []
      if (!prior.length) return [candidate]
      const operation = String(candidate.operation ?? '')
      if (operation === 'add' || prior.some((entry) => !['add', 'update'].includes(String(entry.operation ?? '')))) return []
      if (operation !== 'update') {
        return prior.some((entry) => String(entry.operation ?? '') === operation) ? [] : [candidate]
      }
      if (prior.some((entry) => String(entry.operation ?? '') === 'add')) return []
      const payload = candidate[payloadKey]
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
      const recordedPayloads = prior
        .filter((entry) => String(entry.operation ?? '') === 'update')
        .map((entry) => entry[payloadKey])
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
      const supplemental = omitRecordedFields(payload as Record<string, unknown>, recordedPayloads)
      return supplemental ? [{ ...candidate, [payloadKey]: supplemental }] : []
    })
    return accepted.length ? accepted : undefined
  }
  const onlyNewLore = (recorded: TurnPatch['lore'], candidates: TurnPatch['lore']) => {
    if (!candidates?.length) return undefined
    const ids = new Set((recorded ?? []).flatMap((entry) => entry.id ? [entry.id] : []))
    const titles = new Set((recorded ?? []).map((entry) => normalizedReference(entry.title)))
    const filtered = candidates.filter((entry) => {
      if ((entry.id && ids.has(entry.id)) || titles.has(normalizedReference(entry.title))) return false
      if (entry.id) ids.add(entry.id)
      titles.add(normalizedReference(entry.title))
      return true
    })
    return filtered.length ? filtered : undefined
  }

  additional.playerProfile = omitRecordedFields(
    additional.playerProfile as Record<string, unknown> | undefined,
    [base.playerProfile as Record<string, unknown> | undefined],
  ) as TurnPatch['playerProfile']
  additional.scene = omitRecordedFields(
    additional.scene as Record<string, unknown> | undefined,
    [base.scene as Record<string, unknown> | undefined],
  ) as TurnPatch['scene']
  if (base.pacing) additional.pacing = undefined
  if (base.conflict) additional.conflict = undefined
  additional.upsertStats = onlyNewEntities(base.upsertStats, additional.upsertStats)
  additional.upsertResources = onlyNewEntities(base.upsertResources, additional.upsertResources)
  additional.addAbilities = onlyNewEntities(base.addAbilities, additional.addAbilities)
  additional.upsertFactionReputation = onlyNewEntities(base.upsertFactionReputation, additional.upsertFactionReputation)
  additional.socialLinks = onlyNewEntities(base.socialLinks, additional.socialLinks)
  additional.upsertCharacterArcs = onlyNewEntities(base.upsertCharacterArcs, additional.upsertCharacterArcs)
  additional.upsertMysteryCases = onlyNewEntities(base.upsertMysteryCases, additional.upsertMysteryCases)
  additional.upsertAntagonistPlans = onlyNewEntities(base.upsertAntagonistPlans, additional.upsertAntagonistPlans)
  additional.upsertWorldPressures = onlyNewEntities(base.upsertWorldPressures, additional.upsertWorldPressures)
  additional.upsertInfluenceAssets = onlyNewEntities(base.upsertInfluenceAssets, additional.upsertInfluenceAssets)
  additional.quests = onlySupplementalMutations(base.quests, additional.quests, 'quest') as TurnPatch['quests']
  additional.threads = onlySupplementalMutations(base.threads, additional.threads, 'thread') as TurnPatch['threads']
  additional.worldEvents = onlySupplementalMutations(base.worldEvents, additional.worldEvents, 'event') as TurnPatch['worldEvents']
  additional.lore = onlyNewLore(base.lore, additional.lore)
  additional.statDeltas = omitRecordedKeys(additional.statDeltas, base.statDeltas)
  additional.resourceDeltas = omitRecordedKeys(additional.resourceDeltas, base.resourceDeltas)
  additional.currencyDeltas = omitRecordedKeys(additional.currencyDeltas, base.currencyDeltas)
  additional.factionReputationDeltas = omitRecordedKeys(additional.factionReputationDeltas, base.factionReputationDeltas)

  additional.relationships = additional.relationships?.flatMap((candidate) => {
    const prior = base.relationships?.filter((entry) => entry.npcId === candidate.npcId) ?? []
    if (!prior.length) return [candidate]
    const recordedDimensions = new Set(prior.flatMap((entry) => Object.keys(entry.dimensions ?? {})))
    const dimensions = candidate.dimensions
      ? Object.fromEntries(Object.entries(candidate.dimensions).filter(([key]) => !recordedDimensions.has(key)))
      : undefined
    const note = candidate.note?.trim() && !prior.some((entry) => normalizedReference(entry.note) === normalizedReference(candidate.note))
      ? candidate.note.trim()
      : undefined
    if (!Object.keys(dimensions ?? {}).length && !note) return []
    return [{ npcId: candidate.npcId, delta: 0, ...(Object.keys(dimensions ?? {}).length ? { dimensions } : {}), ...(note ? { note } : {}) }]
  })

  additional.inventory = additional.inventory?.flatMap<NonNullable<TurnPatch['inventory']>[number]>((mutation) => {
    const recorded = base.inventory?.filter((entry) => entry.operation !== 'add' && mutation.operation !== 'add' && entry.targetId === mutation.targetId) ?? []
    if (mutation.operation === 'remove') return recorded.some((entry) => entry.operation === 'remove') ? [] : [mutation]
    if (mutation.operation === 'update') {
      const recordedKeys = new Set(recorded.flatMap((entry) => entry.operation === 'update' ? Object.keys(entry.item) : []))
      const item = Object.fromEntries(Object.entries(mutation.item).filter(([key]) => !recordedKeys.has(key)))
      return Object.keys(item).length ? [{ ...mutation, item }] : []
    }
    const duplicateAdd = mutation.item.name && base.inventory?.some((entry) => entry.operation === 'add' && entry.item.name?.toLocaleLowerCase('ru-RU') === mutation.item.name?.toLocaleLowerCase('ru-RU'))
    return duplicateAdd ? [] : [mutation]
  })

  additional.abilityChanges = filterSupplementalAbilityChanges(base.abilityChanges, additional.abilityChanges)
  additional.artifactChanges = filterSupplementalArtifactChanges(base.artifactChanges, additional.artifactChanges)
  const recordedEffects = new Set(base.upsertStatusEffects?.flatMap((effect) => [effect.id, effect.name.toLocaleLowerCase('ru-RU')].filter(Boolean)) ?? [])
  additional.upsertStatusEffects = additional.upsertStatusEffects?.filter((effect) => !recordedEffects.has(effect.id) && !recordedEffects.has(effect.name.toLocaleLowerCase('ru-RU')))

  additional.npcs = additional.npcs?.flatMap<NonNullable<TurnPatch['npcs']>[number]>((mutation) => {
    if (mutation.operation === 'add') {
      const duplicate = base.npcs?.some((entry) => entry.operation === 'add' && (entry.npc.id === mutation.npc.id || entry.npc.name.toLocaleLowerCase('ru-RU') === mutation.npc.name.toLocaleLowerCase('ru-RU')))
      return duplicate ? [] : [mutation]
    }
    const recordedUpdates = base.npcs?.filter((entry) => entry.operation === 'update' && entry.targetId === mutation.targetId) ?? []
    if (!recordedUpdates.length) return [mutation]
    const npc = { ...mutation.npc }
    const npcRecord = npc as unknown as Record<string, unknown>
    const priorRecords = recordedUpdates.map((entry) => entry.operation === 'update' ? entry.npc as unknown as Record<string, unknown> : {})
    const recordedResourceDeltas = Object.assign({}, ...recordedUpdates.map((entry) => entry.operation === 'update' ? entry.npc.resourceDeltas ?? {} : {}))
    const recordedStatDeltas = Object.assign({}, ...recordedUpdates.map((entry) => entry.operation === 'update' ? entry.npc.statDeltas ?? {} : {}))
    npc.resourceDeltas = omitRecordedKeys(npc.resourceDeltas, recordedResourceDeltas)
    npc.statDeltas = omitRecordedKeys(npc.statDeltas, recordedStatDeltas)
    const recordedNpcAbilityChanges = recordedUpdates.flatMap((entry) => entry.operation === 'update' ? entry.npc.abilityChanges ?? [] : [])
    npc.abilityChanges = filterSupplementalAbilityChanges(recordedNpcAbilityChanges, npc.abilityChanges)
    const recordedNpcEffects = new Set(recordedUpdates.flatMap((entry) => entry.operation === 'update' ? (entry.npc.upsertStatusEffects ?? []).flatMap((effect) => [effect.id, effect.name.toLocaleLowerCase('ru-RU')].filter(Boolean)) : []))
    npc.upsertStatusEffects = npc.upsertStatusEffects?.filter((effect) => !recordedNpcEffects.has(effect.id) && !recordedNpcEffects.has(effect.name.toLocaleLowerCase('ru-RU')))
    const partialObjectKeys = ['relationshipDimensions', 'initiative', 'strategy', 'dossier', 'voice'] as const
    partialObjectKeys.forEach((key) => {
      const value = npcRecord[key]
      if (!value || typeof value !== 'object' || Array.isArray(value)) return
      const recordedObjects = priorRecords.map((record) => {
        const priorValue = record[key]
        return priorValue && typeof priorValue === 'object' && !Array.isArray(priorValue) ? priorValue as Record<string, unknown> : undefined
      })
      const filtered = omitRecordedFields(value as Record<string, unknown>, recordedObjects)
      if (filtered) npcRecord[key] = filtered
      else delete npcRecord[key]
    })
    const arrayGroups: Array<{ keys: string[]; signature: (value: unknown) => string }> = [
      { keys: ['notes'], signature: (value) => normalizedReference(String(value)) },
      { keys: ['stats', 'upsertStats'], signature: entitySignature },
      { keys: ['resources', 'upsertResources'], signature: entitySignature },
      { keys: ['statusEffects', 'upsertStatusEffects'], signature: entitySignature },
      { keys: ['abilities', 'upsertAbilities'], signature: entitySignature },
      { keys: ['knowledge'], signature: entitySignature },
      { keys: ['removeStatKeys'], signature: (value) => normalizedReference(String(value)) },
      { keys: ['removeResourceKeys'], signature: (value) => normalizedReference(String(value)) },
      { keys: ['removeStatusEffectIds'], signature: (value) => String(value) },
      { keys: ['removeAbilityIds'], signature: (value) => String(value) },
      { keys: ['removeKnowledgeIds'], signature: (value) => String(value) },
    ]
    arrayGroups.forEach(({ keys, signature }) => {
      const seen = new Set(priorRecords.flatMap((record) => keys.flatMap((key) => Array.isArray(record[key]) ? (record[key] as unknown[]).map(signature) : [])))
      keys.forEach((key) => {
        const values = npcRecord[key]
        if (!Array.isArray(values)) return
        const filtered = values.filter((value) => {
          const candidateSignature = signature(value)
          if (seen.has(candidateSignature)) return false
          seen.add(candidateSignature)
          return true
        })
        if (filtered.length) npcRecord[key] = filtered
        else delete npcRecord[key]
      })
    })
    const handledKeys = new Set([
      'statDeltas', 'resourceDeltas', 'abilityChanges', 'relationshipDimensions', 'initiative', 'strategy', 'dossier', 'voice',
      ...arrayGroups.flatMap((group) => group.keys),
    ])
    Object.keys(npcRecord).forEach((key) => {
      if (!handledKeys.has(key) && priorRecords.some((record) => Object.hasOwn(record, key))) delete npcRecord[key]
    })
    const arrayKeys = ['abilityChanges', 'upsertStatusEffects', 'removeStatusEffectIds', 'upsertAbilities', 'removeAbilityIds'] as const
    arrayKeys.forEach((key) => { if (npc[key]?.length === 0) delete npc[key] })
    if (Object.keys(npc).length === 0) return []
    return [{ ...mutation, npc }]
  })

  if (additional.world && base.world) {
    const world = additional.world as unknown as Record<string, unknown>
    const recordedWorld = base.world as unknown as Record<string, unknown>
    const scalarWorldKeys = ['name', 'tagline', 'inspiration', 'genre', 'tone', 'overview', 'era', 'calendarDayDelta', 'calendarLabel']
    scalarWorldKeys.forEach((key) => { if (Object.hasOwn(recordedWorld, key)) delete world[key] })
    if (additional.world.system && base.world.system) {
      additional.world.system = omitRecordedFields(
        additional.world.system as Record<string, unknown>,
        [base.world.system as Record<string, unknown>],
      ) as NonNullable<TurnPatch['world']>['system']
    }
    if (additional.world.presentation && base.world.presentation) {
      const presentation = omitRecordedFields(
        additional.world.presentation as Record<string, unknown>,
        [base.world.presentation as Record<string, unknown>],
      ) as Record<string, unknown> | undefined
      const mergedPresentation = { ...(presentation ?? {}) } as NonNullable<TurnPatch['world']>['presentation']
      ;(['labels', 'categoryLabels', 'rarityLabels'] as const).forEach((key) => {
        const candidate = additional.world?.presentation?.[key]
        if (!candidate) return
        const filtered = omitRecordedFields(
          candidate as Record<string, unknown>,
          [base.world?.presentation?.[key] as Record<string, unknown> | undefined],
        )
        if (filtered) mergedPresentation![key] = filtered
        else delete mergedPresentation![key]
      })
      additional.world.presentation = Object.keys(mergedPresentation ?? {}).length ? mergedPresentation : undefined
    }
    if (base.world.interfaceBlueprint) additional.world.interfaceBlueprint = undefined
    additional.world.upsertFactions = onlyNewEntities(base.world.upsertFactions, additional.world.upsertFactions)
    additional.world.upsertLocations = onlyNewEntities(base.world.upsertLocations, additional.world.upsertLocations)
    additional.world.upsertRoutes = onlyNewEntities(base.world.upsertRoutes, additional.world.upsertRoutes)
    additional.world.upsertPlaces = onlyNewEntities(base.world.upsertPlaces, additional.world.upsertPlaces)
    additional.world.upsertProcesses = onlyNewEntities(base.world.upsertProcesses, additional.world.upsertProcesses)
    if (base.world.legendarium) additional.world.legendarium = undefined
    additional.world.upsertLegends = onlyNewEntities(base.world.upsertLegends, additional.world.upsertLegends)
    additional.world.upsertLaws = onlyNewEntities(base.world.upsertLaws, additional.world.upsertLaws)
    additional.world.upsertMechanics = onlyNewEntities(base.world.upsertMechanics, additional.world.upsertMechanics)

    // Interface modules have one identity only: their stable id. A matching title must never
    // overwrite or suppress an unrelated module.
    const baseFullModuleIds = new Set((base.world.upsertInterfaceModules ?? []).map((module) => module.id))
    const baseRemovedModuleIds = new Set(base.world.removeInterfaceModuleIds ?? [])
    const baseModuleChanges = base.world.interfaceModuleChanges ?? []
    const baseChangedModuleIds = new Set(baseModuleChanges.map((change) => change.moduleId))
    const occupiedModuleIds = new Set([...baseFullModuleIds, ...baseRemovedModuleIds, ...baseChangedModuleIds])
    additional.world.upsertInterfaceModules = additional.world.upsertInterfaceModules?.filter((module) => {
      if (occupiedModuleIds.has(module.id)) return false
      occupiedModuleIds.add(module.id)
      return true
    })
    additional.world.interfaceModuleChanges = additional.world.interfaceModuleChanges?.flatMap((change) => {
      if (baseFullModuleIds.has(change.moduleId) || baseRemovedModuleIds.has(change.moduleId)) return []
      const prior = baseModuleChanges.filter((recorded) => recorded.moduleId === change.moduleId)
      if (!prior.length) return [change]
      const recordedModuleFields = new Set(prior.flatMap((recorded) => Object.keys(recorded.module ?? {})))
      const module = change.module
        ? Object.fromEntries(Object.entries(change.module).filter(([key]) => !recordedModuleFields.has(key))) as typeof change.module
        : undefined
      const touchedElementIds = new Set(prior.flatMap((recorded) => [
        ...(recorded.upsertElements ?? []).map((element) => element.id),
        ...(recorded.removeElementIds ?? []),
      ]))
      const upsertElements = change.upsertElements?.filter((element) => !touchedElementIds.has(element.id))
      const removeElementIds = change.removeElementIds?.filter((elementId) => !touchedElementIds.has(elementId))
      if (!Object.keys(module ?? {}).length && !upsertElements?.length && !removeElementIds?.length) return []
      return [{
        ...change,
        module: Object.keys(module ?? {}).length ? module : undefined,
        upsertElements: upsertElements?.length ? upsertElements : undefined,
        removeElementIds: removeElementIds?.length ? removeElementIds : undefined,
      }]
    })

    const auditMetricDefinitions = additional.world.upsertMetrics ?? []
    const metricAliases = new Map<string, Set<string>>()
    ;[...(base.world.upsertMetrics ?? []), ...auditMetricDefinitions].forEach((metric) => {
      ;[metric.id, metric.key, metric.label].forEach((alias) => {
        const normalized = normalizedReference(alias)
        const identities = metricAliases.get(normalized) ?? new Set<string>()
        identities.add(metric.id)
        metricAliases.set(normalized, identities)
      })
    })
    const metricDeltaIdentity = (reference: string) => {
      const normalized = normalizedReference(reference)
      const identities = metricAliases.get(normalized)
      return identities?.size === 1 ? `id:${[...identities][0]}` : `reference:${normalized}`
    }
    const recordedMetricDeltas = new Set(Object.keys(base.world.metricDeltas ?? {}).map(metricDeltaIdentity))
    if (additional.world.metricDeltas) {
      const filtered = Object.fromEntries(Object.entries(additional.world.metricDeltas)
        .filter(([reference]) => !recordedMetricDeltas.has(metricDeltaIdentity(reference))))
      additional.world.metricDeltas = Object.keys(filtered).length ? filtered : undefined
    }
    const occupiedMetricIds = new Set((base.world.upsertMetrics ?? []).map((metric) => metric.id))
    const occupiedMetricKeys = new Set((base.world.upsertMetrics ?? []).map((metric) => normalizedReference(metric.key)))
    additional.world.upsertMetrics = auditMetricDefinitions.filter((metric) => {
      const key = normalizedReference(metric.key)
      if (occupiedMetricIds.has(metric.id) || occupiedMetricKeys.has(key)) return false
      occupiedMetricIds.add(metric.id)
      occupiedMetricKeys.add(key)
      return true
    })
  }

  const recordedMemories = new Set(base.memories?.map((memory) => memory.content.toLocaleLowerCase('ru-RU')) ?? [])
  additional.memories = additional.memories?.filter((memory) => !recordedMemories.has(memory.content.toLocaleLowerCase('ru-RU')))
  const recordedEvents = new Set(base.events?.map((event) => `${event.title}\n${event.description}`.toLocaleLowerCase('ru-RU')) ?? [])
  additional.events = additional.events?.filter((event) => !recordedEvents.has(`${event.title}\n${event.description}`.toLocaleLowerCase('ru-RU')))
  return mergePatches(base, additional)
}

function restrictBackgroundPatch(patchInput: TurnPatch | null | undefined): TurnPatch {
  const patch = patchInput ?? {}
  return {
    npcs: patch.npcs,
    socialLinks: patch.socialLinks,
    removeSocialLinkIds: patch.removeSocialLinkIds,
    threads: patch.threads,
    worldEvents: patch.worldEvents,
    factionReputationDeltas: patch.factionReputationDeltas,
    upsertFactionReputation: patch.upsertFactionReputation,
    world: patch.world,
    upsertCharacterArcs: patch.upsertCharacterArcs,
    upsertAntagonistPlans: patch.upsertAntagonistPlans,
    upsertWorldPressures: patch.upsertWorldPressures,
    upsertInfluenceAssets: patch.upsertInfluenceAssets,
    cleanup: patch.cleanup,
  }
}

/** Memory cleanup runs after the event plan has already been validated. It must not archive an
 * entity that the same manifested event requires to remain active, otherwise prose, state and the
 * hidden event lifecycle diverge at the very end of the turn. Explicit event remove requirements
 * remain authoritative and are therefore never protected here. */
function protectNarrativeEventCleanup(cleanup: TurnPatch['cleanup'], eventDecision: NarrativeEventDecision): TurnPatch['cleanup'] {
  if (!cleanup || eventDecision.mode === 'none' || eventDecision.mode === 'seed') return cleanup
  const protectedTargets = new Map<keyof NonNullable<TurnPatch['cleanup']>, Set<string>>()
  const domainToCleanupKey: Partial<Record<string, keyof NonNullable<TurnPatch['cleanup']>>> = {
    thread: 'threads',
    'world-event': 'worldEvents',
    quest: 'quests',
    'antagonist-plan': 'antagonistPlans',
    'world-pressure': 'worldPressures',
    memory: 'memories',
  }
  ;[...eventDecision.immediateEffects, ...eventDecision.persistentEffects]
    .filter((requirement) => requirement.mandatory && requirement.operation !== 'remove' && requirement.targetId)
    .forEach((requirement) => {
      const key = domainToCleanupKey[requirement.domain]
      if (!key) return
      const ids = protectedTargets.get(key) ?? new Set<string>()
      ids.add(requirement.targetId as string)
      protectedTargets.set(key, ids)
    })
  const result = structuredClone(cleanup)
  ;(Object.keys(result) as Array<keyof NonNullable<TurnPatch['cleanup']>>).forEach((key) => {
    const ids = protectedTargets.get(key)
    if (ids) result[key] = result[key]?.filter((entry) => !ids.has(entry.targetId))
  })
  return result
}

function startingAccessIssues(concept: ConceptAnalysis, world: GeneratedWorld): string[] {
  const threshold = concept.startingAccess === 'complete' ? 100 : concept.startingAccess === 'mastered' ? 80 : undefined
  if (threshold === undefined) return []
  const issues: string[] = []
  world.player.abilities.forEach((ability) => {
    if (ability.mastery < threshold) issues.push(`Способность «${ability.name}» имеет mastery=${ability.mastery}, требуется не ниже ${threshold}.`)
  })
  world.inventory.forEach((item) => {
    const artifact = item.artifact
    if (!artifact) return
    if (concept.startingAccess === 'complete' && !artifact.awakened) issues.push(`«${item.name}» должен быть активирован при startingAccess=complete.`)
    if (artifact.attunement < threshold) issues.push(`«${item.name}» имеет attunement=${artifact.attunement}, требуется не ниже ${threshold}.`)
    artifact.powers.forEach((power) => {
      if (power.mastery < threshold) issues.push(`Сила «${item.name} / ${power.name}» имеет mastery=${power.mastery}, требуется не ниже ${threshold}.`)
    })
    if (concept.startingAccess === 'complete') artifact.components.filter((component) => component.required && component.status !== 'active').forEach((component) => {
      issues.push(`Обязательный компонент «${component.name}» имеет status=${component.status}, хотя startingAccess=complete.`)
    })
  })
  return issues
}

const rarityRequestPatterns: Array<{ rarity: typeof rarityOrder[number]; pattern: RegExp }> = [
  { rarity: 'transcendent', pattern: /трансцендент|transcendent|божественн|сильнейш|сам(?:ый|ого|ую|ое)\s+сильн|высш(?:ий|его|ую|ее)\s+(?:класс|уров)|максимальн\S*\s+(?:класс|уров)/iu },
  { rarity: 'mythic', pattern: /мифическ|mythic/iu },
  { rarity: 'legendary', pattern: /легендарн|legendary/iu },
  { rarity: 'epic', pattern: /эпическ|epic/iu },
  { rarity: 'exceptional', pattern: /исключительн|exceptional/iu },
  { rarity: 'rare', pattern: /\bредк(?:ий|ого|ую|ое|ие)\b|\brare\b/iu },
  { rarity: 'uncommon', pattern: /необычн|uncommon/iu },
  { rarity: 'common', pattern: /обычн|common/iu },
]

export function requestedArtifactRarity(input: string) {
  const artifactIntent = /артефакт|реликви|особ(?:ый|ого|ую)\s+предмет|оружи|artifact|relic/iu.test(input)
  if (!artifactIntent) return undefined
  return rarityRequestPatterns.find((entry) => entry.pattern.test(input))?.rarity
}

type PlannedInventoryMutation = NonNullable<ReturnType<typeof turnPlanSchema.parse>['statePatch']['inventory']>[number]
type PlannedArtifactItem = Extract<PlannedInventoryMutation, { operation: 'add' }>['item']

function plannedArtifactId(item: PlannedArtifactItem): string | undefined {
  return 'id' in item && typeof item.id === 'string' && item.id.trim() ? item.id : undefined
}

function artifactCandidate(item: PlannedArtifactItem, turn = 0): InventoryItem {
  return {
    ...item,
    id: plannedArtifactId(item) ?? `artifact-candidate-${item.name.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 64) || 'unnamed'}`,
    discoveredTurn: item.discoveredTurn ?? turn,
    history: (item.history ?? []).map((entry, index) => ({
      id: `candidate-history-${index}`,
      turn,
      title: entry.title,
      description: entry.description,
    })),
  } as InventoryItem
}

const artifactTierDetail = [
  { applications: 2, powers: 1, singlePowerTechniques: 0 },
  { applications: 3, powers: 1, singlePowerTechniques: 0 },
  { applications: 4, powers: 1, singlePowerTechniques: 1 },
  { applications: 5, powers: 1, singlePowerTechniques: 2 },
  { applications: 7, powers: 2, singlePowerTechniques: 3 },
  { applications: 9, powers: 2, singlePowerTechniques: 4 },
  { applications: 12, powers: 2, singlePowerTechniques: 5 },
  { applications: 15, powers: 3, singlePowerTechniques: 6 },
] as const

function artifactItemQualityIssues(
  item: PlannedArtifactItem,
  requested?: typeof rarityOrder[number],
  registry: Campaign['artifactRegistry'] = [],
): string[] {
  const issues: string[] = []
  const assessment = assessItemRarity({
    category: item.category,
    effects: item.effects ?? [],
    artifact: item.artifact,
    rarity: item.rarity,
    rarityProfile: item.rarityProfile,
  })
  const claimedRank = rarityOrder.indexOf(item.rarity)
  const assessedRank = rarityOrder.indexOf(assessment.rarity)
  const requestedRank = requested ? rarityOrder.indexOf(requested) : -1
  const requiredRank = Math.max(claimedRank, requestedRank)
  const requiredRarity = rarityOrder[requiredRank]
  if (claimedRank >= rarityOrder.indexOf('legendary') && assessedRank < claimedRank) {
    issues.push(`«${item.name}» заявлен как ${item.rarity}, но реальные свойства дают только ${assessment.rarity} (${assessment.score}/100). Исправь свойства и оценки либо честно понизь заявленный класс.`)
  }
  if (requested && requestedRank >= 0 && assessedRank < requestedRank) {
    issues.push(`Игрок запросил класс ${requested}, а «${item.name}» фактически имеет класс ${assessment.rarity}. Если запрос исполнен, создай предмет не ниже ${requested}; одна смена rarity без новых возможностей не подходит.`)
  }
  if (requiredRarity && requiredRank >= rarityOrder.indexOf('legendary')) {
    const deficits = rarityRequirementDeficits(assessment, requiredRarity)
    if (deficits.length) issues.push(`«${item.name}» не достигает класса ${requiredRarity}: ${deficits.join(', ')}.`)
  }
  if (!item.artifact) {
    issues.push(`Особый предмет «${item.name}» не имеет полного artifact-профиля и его силы не попадут во вкладку героя.`)
    return issues
  }
  const artifact = item.artifact
  const canonical = artifact.canonStatus === 'canonical'
  if (!item.origin?.trim()) issues.push(`У «${item.name}» не установлено конкретное происхождение в мире.`)
  if (item.description.trim().length < 80) issues.push(`Описание «${item.name}» слишком краткое для полноценного досье.`)
  if (!artifact.classification?.trim()) issues.push(`У «${item.name}» не указана точная природа/classification.`)
  if (!item.artifact.operatingPrinciple?.trim()) issues.push(`У «${item.name}» не описан уникальный operatingPrinciple, связывающий все силы предмета.`)
  if (!item.artifact.powerSource?.trim()) issues.push(`У «${item.name}» не установлен конкретный powerSource из этого мира.`)
  if (!item.artifact.scale?.trim()) issues.push(`У «${item.name}» не указан реальный масштаб действия.`)
  if (!artifact.creativeIdentity) {
    issues.push(`У «${item.name}» отсутствует полный creativeIdentity.`)
  } else {
    if (artifact.creativeIdentity.differentiation.length < 2) issues.push(`У «${item.name}» должно быть минимум два проверяемых отличия от других предметов.`)
    if (canonical && artifact.creativeIdentity.resemblanceKind !== 'canon') issues.push(`Канонический «${item.name}» должен явно фиксировать resemblanceKind=canon, а не искусственно отличаться от оригинала.`)
    if (artifact.creativeIdentity.resemblanceKind && !artifact.creativeIdentity.resemblanceReason?.trim()) issues.push(`Причинное сходство «${item.name}» не объяснено через resemblanceReason.`)
  }
  if (!artifact.presentation) issues.push(`У «${item.name}» отсутствует безопасный индивидуальный presentation-профиль.`)
  if (!artifact.discovery) {
    issues.push(`У «${item.name}» отсутствует причинный discovery-профиль знаний героя.`)
  } else {
    artifact.powers.forEach((power) => {
      if (!Object.hasOwn(artifact.discovery!.powerKnowledge, power.id)) issues.push(`discovery «${item.name}» не определяет уровень знания силы ${power.id}.`)
    })
    artifact.components.forEach((component) => {
      if (!Object.hasOwn(artifact.discovery!.componentKnowledge, component.id)) issues.push(`discovery «${item.name}» не определяет уровень знания компонента ${component.id}.`)
    })
  }
  if (!artifact.sentient && [artifact.personality, artifact.desire, artifact.taboo, artifact.mood, artifact.voice].some((value) => value?.trim())) {
    issues.push(`Неразумный «${item.name}» получил психологические поля, которые ему не принадлежат.`)
  }
  if (canonical && !artifact.canonReference?.trim()) issues.push(`Для канонического «${item.name}» отсутствует конкретный canonReference.`)
  const powers = item.artifact.powers ?? []
  const concreteApplications = powers.reduce((sum, power) => sum
    + (power.capabilities?.length ?? 0)
    + (power.techniques?.length ?? 0)
    + (power.examples?.length ?? 0), 0)
    + (item.artifact.passiveEffects?.length ?? 0)
    + (item.artifact.combinedEffects?.length ?? 0)
  const tier = artifactTierDetail[Math.max(0, requiredRank)] ?? artifactTierDetail[0]
  const passiveOnlyLowTier = requiredRank <= rarityOrder.indexOf('uncommon') && powers.length === 0 && artifact.passiveEffects.length > 0
  if (!passiveOnlyLowTier && powers.length < tier.powers && !(powers.length === 1 && (powers[0].techniques?.length ?? 0) >= tier.singlePowerTechniques)) {
    issues.push(`«${item.name}» уровня ${requiredRarity} должен иметь минимум ${tier.powers} различимые силы либо одну центральную силу минимум с ${tier.singlePowerTechniques} полноценными приёмами.`)
  }
  if (concreteApplications < tier.applications) issues.push(`«${item.name}» описан слишком поверхностно: нужно минимум ${tier.applications} конкретных возможностей, приёмов, примеров, пассивных и совместных эффектов без повторов.`)
  powers.forEach((power) => {
    if (!power.activation?.trim()) issues.push(`У силы «${item.name} / ${power.name}» не описана настоящая активация.`)
    if (!power.capabilities?.length) issues.push(`У силы «${item.name} / ${power.name}» нет конкретных возможностей.`)
    if (!power.counters?.length) issues.push(`У силы «${item.name} / ${power.name}» не описано причинное противодействие.`)
    if (!power.examples?.length) issues.push(`У силы «${item.name} / ${power.name}» нет понятного примера применения.`)
    if (!power.category) issues.push(`У силы «${item.name} / ${power.name}» не указана категория.`)
    if (!power.scale?.trim()) issues.push(`У силы «${item.name} / ${power.name}» не указан масштаб.`)
    if (!power.canonStatus) issues.push(`У силы «${item.name} / ${power.name}» не указан canonStatus.`)
  })
  if (requiredRank >= rarityOrder.indexOf('transcendent') && !(item.artifact.combinedEffects?.length)) {
    issues.push(`Трансцендентный «${item.name}» должен описывать хотя бы один настоящий combinedEffect своей фундаментальной власти.`)
  }
  if (!canonical) issues.push(...artifactNoveltyIssues(artifactCandidate(item), registry ?? []))
  return [...new Set(issues)]
}

export function artifactPlanQualityIssues(
  input: string,
  plan: ReturnType<typeof turnPlanSchema.parse>,
  registry: Campaign['artifactRegistry'] = [],
): string[] {
  const requested = requestedArtifactRarity(input)
  const additions = (plan.statePatch.inventory ?? []).flatMap((mutation) => (
    mutation.operation === 'add' && mutation.item?.category === 'artifact' ? [mutation.item] : []
  ))
  const issues: string[] = []
  let workingRegistry = [...(registry ?? [])]
  additions.forEach((item) => {
    const candidate = artifactCandidate(item)
    const comparisonRegistry = workingRegistry.filter((entry) => entry.artifactId !== candidate.id)
    issues.push(...artifactItemQualityIssues(item, requested, comparisonRegistry))
    workingRegistry = updateArtifactRegistry(workingRegistry, candidate, 'active', 0)
  })
  return [...new Set(issues)]
}

function generatedWorldArtifactQuality(world: GeneratedWorld) {
  let registry: NonNullable<Campaign['artifactRegistry']> = []
  const issues: string[] = []
  for (const item of world.inventory) {
    if (item.category !== 'artifact' || !item.artifact) continue
    const planned = item as PlannedArtifactItem
    issues.push(...artifactItemQualityIssues(planned, undefined, registry))
    registry = updateArtifactRegistry(registry, artifactCandidate(planned), 'active', 0)
  }
  return { issues: [...new Set(issues)], registry }
}

function generatedWorldAbilityQuality(world: GeneratedWorld) {
  const systemDraft = world.world.capabilitySystem
  const hardIssues: string[] = []
  const noveltyIssues: string[] = []
  if (!systemDraft) return { issues: ['Новый мир не создал собственную capabilitySystem.'], hardIssues: ['Новый мир не создал собственную capabilitySystem.'], noveltyIssues, registry: [] as NonNullable<Campaign['abilityRegistry']> }
  const system = capabilitySystemCandidate(systemDraft, undefined, 0)
  if (!system) return { issues: ['Не удалось материализовать capabilitySystem нового мира.'], hardIssues: ['Не удалось материализовать capabilitySystem нового мира.'], noveltyIssues, registry: [] as NonNullable<Campaign['abilityRegistry']> }
  const groupReference = (value: string) => {
    const normalized = value.trim().toLocaleLowerCase('ru-RU')
    return system.groups.find((group) => group.id === value || group.label.trim().toLocaleLowerCase('ru-RU') === normalized)?.id ?? value
  }
  const tierReference = (value: string) => {
    const normalized = value.trim().toLocaleLowerCase('ru-RU')
    return system.tiers.find((tier) => tier.id === value || tier.label.trim().toLocaleLowerCase('ru-RU') === normalized)?.id ?? value
  }
  let registry: NonNullable<Campaign['abilityRegistry']> = []
  const inspect = (ownerId: string, ownerKind: 'player' | 'npc', resources: string[], draft: AbilityDraft) => {
    const candidateDraft: AbilityDraft = draft.profile ? {
      ...draft,
      profile: {
        ...draft.profile,
        nature: { ...draft.profile.nature, groupId: groupReference(draft.profile.nature.groupId) },
        standing: {
          ...draft.profile.standing,
          systemId: system.id,
          tierId: tierReference(draft.profile.standing.tierId),
        },
      },
    } : draft
    const candidate = abilityStateCandidate(candidateDraft, 0)
    hardIssues.push(...abilityProfileIssues(candidate, system, resources))
    noveltyIssues.push(...abilityNoveltyIssues(candidate, registry))
    if (!draft.profile) hardIssues.push(`Новая способность «${draft.name}» не имеет полного авторского профиля.`)
    registry = updateAbilityRegistry(registry, candidate, ownerId, ownerKind, 'active', 0)
  }
  world.player.abilities.forEach((ability) => inspect('generated-player', 'player', world.player.resources.map((resource) => resource.key), ability as AbilityDraft))
  world.npcs.forEach((npc, npcIndex) => npc.abilities.forEach((ability) => inspect(
    `generated-npc-${npcIndex}`,
    'npc',
    npc.resources.map((resource) => resource.key),
    ability as AbilityDraft,
  )))
  const uniqueHardIssues = [...new Set(hardIssues)]
  const uniqueNoveltyIssues = [...new Set(noveltyIssues)]
  return { issues: [...new Set([...uniqueHardIssues, ...uniqueNoveltyIssues])], hardIssues: uniqueHardIssues, noveltyIssues: uniqueNoveltyIssues, registry }
}

async function repairGeneratedWorldArtifacts(
  source: GeneratedWorld,
  request: WorldGenerationRequest,
  concept: ConceptAnalysis,
  report?: ProgressReporter,
): Promise<GeneratedWorld> {
  const inventory = [...source.inventory]
  let registry = generatedWorldArtifactQuality(source).registry
  const worldContext = {
    title: source.title,
    world: source.world,
    player: source.player,
    inventory: source.inventory.map((item) => ({ id: plannedArtifactId(item as PlannedArtifactItem), name: item.name, rarity: item.rarity, origin: item.origin })),
  }

  for (let index = 0; index < inventory.length; index += 1) {
    const initial = inventory[index]
    if (initial.category !== 'artifact' || !initial.artifact) continue
    let current = initial as PlannedArtifactItem
    const identity = { id: plannedArtifactId(current), name: current.name, origin: current.origin }
    const candidateRegistry = registry.filter((entry) => entry.artifactId !== artifactCandidate(current).id)
    let issues = artifactItemQualityIssues(current, undefined, candidateRegistry)
    let best = current
    let bestIssues = issues
    let bestScore = artifactNoveltyScore(artifactCandidate(current), candidateRegistry) - issues.length * 12

    for (let attempt = 0; attempt < 3 && issues.length; attempt += 1) {
      reportProgress(report, 83 + attempt, 'artifact-design', `Проверяем авторский замысел «${current.name}»: вариант ${attempt + 1} из 3`, 9, 11)
      const repairMessages = artifactFocusedRepairPrompt(worldContext, { source: 'world-generation' }, current, current.rarity, issues)
      try {
        const raw = await completeJson(request.provider, repairMessages)
        const repaired = await parseWithRepair(raw, artifactRewardRepairSchema, request.provider, repairMessages)
        current = {
          ...repaired.item,
          ...(identity.id ? { id: identity.id } : {}),
          name: identity.name,
          ...(identity.origin ? { origin: identity.origin } : {}),
        }
        issues = artifactItemQualityIssues(current, undefined, candidateRegistry)
        const reviewMessages = artifactQualityCriticPrompt(current, candidateRegistry, { world: source.world, concept, canonMode: request.canonMode })
        let criticPenalty = 0
        try {
          const reviewRaw = await completeJson(request.provider, reviewMessages)
          const review = artifactQualityReviewSchema.safeParse(normalizeModelOutput(reviewRaw))
          if (review.success) {
            criticPenalty = review.data.issues.length * 5 + (review.data.verdict === 'rebuild' ? 20 : 0)
            if (review.data.verdict === 'rebuild') issues = [...new Set([...issues, ...review.data.issues])]
          }
        } catch {
          // The deterministic six-axis check remains authoritative if the optional critic times out.
        }
        const score = artifactNoveltyScore(artifactCandidate(current), candidateRegistry) - issues.length * 12 - criticPenalty
        if (score > bestScore) {
          best = current
          bestIssues = issues
          bestScore = score
        }
      } catch (error) {
        console.warn(`[artifact-quality] World artifact variant failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    const assessment = assessItemRarity(best)
    const honestBest = assessment.rarity === best.rarity ? best : { ...best, rarity: assessment.rarity }
    inventory[index] = honestBest as typeof initial
    registry = updateArtifactRegistry(registry, artifactCandidate(honestBest), 'active', 0)
    if (bestIssues.length) console.warn(`[artifact-quality] Best world artifact candidate retained for ${best.name}: ${bestIssues.join(' ')}`)
  }
  return { ...source, inventory }
}

export async function runTurn(request: TurnRequest, report?: ProgressReporter): Promise<TurnResponse> {
  reportProgress(report, 3, 'preparing', 'Проверяем ввод и собираем актуальное состояние', 1, 11)
  const check = resolveActionCheck(request.campaign, request.input, request.actionType)
  const preparedEventState = prepareEventDirectorState(request.campaign)
  if (request.provider.provider === 'demo') {
    reportProgress(report, 80, 'narrating', 'Собираем демонстрационный ответ', 11, 11)
    const response = demoTurn(request.campaign, request.input)
    response.statePatch.eventDirectorState = preparedEventState
    return { ...response, check }
  }

  reportProgress(report, 8, 'world-simulation', 'Персонажи и мир делают свои независимые шаги', 2, 11)
  const backgroundMessages = backgroundSimulatorPrompt(request.campaign, request.input)
  const emptyBackground: ReturnType<typeof backgroundSimulationSchema.parse> = { signals: [], statePatch: {} }
  const background = await optionalStage<ReturnType<typeof backgroundSimulationSchema.parse>>('background', async () => {
    const rawBackground = await completeJson(request.provider, backgroundMessages)
    return parseWithRepair(rawBackground, backgroundSimulationSchema, request.provider, backgroundMessages, () => ({ signals: [], statePatch: {} }))
  }, emptyBackground)
  let eventDecision: NarrativeEventDecision = { mode: 'none', reason: 'История ещё не накопила готовность к отдельному повороту.' }
  let eventDirectorConsulted = false
  if (shouldConsultEventDirector(request.campaign, preparedEventState)) {
    eventDirectorConsulted = true
    reportProgress(report, 17, 'event-director', 'Проверяем, созрело ли редкое необычное событие', 3, 11)
    const eventMessages = eventDirectorPrompt(request.campaign, request.input, background, preparedEventState)
    eventDecision = await optionalStage<NarrativeEventDecision>('event-director', async () => {
      const rawDecision = await completeJson(request.provider, eventMessages)
      let decision = await parseWithRepair<NarrativeEventDecision>(rawDecision, narrativeEventDecisionSchema, request.provider, eventMessages)
      let issues = validateNarrativeEventProposal(request.campaign, preparedEventState, decision)
      if (decision.mode !== 'none' && issues.length) {
        const retryMessages = [
          ...eventMessages,
          { role: 'assistant' as const, content: JSON.stringify(decision) },
          {
            role: 'user' as const,
            content: `Предложение отклонено программной проверкой:\n${issues.map((issue) => `- ${issue}`).join('\n')}\n\nВерни полностью исправленное предложение либо честный {"mode":"none","reason":"..."}. Не спорь с ограничениями и не отвечай пояснением.`,
          },
        ]
        const retryRaw = await completeJson(request.provider, retryMessages)
        decision = await parseWithRepair<NarrativeEventDecision>(retryRaw, narrativeEventDecisionSchema, request.provider, retryMessages)
        issues = validateNarrativeEventProposal(request.campaign, preparedEventState, decision)
      }
      if (decision.mode !== 'none' && issues.length) {
        console.warn(`[event-director] Предложение безопасно отложено: ${issues.join(' ')}`)
        return { mode: 'none', reason: `Предложение отложено программной проверкой: ${issues.join(' ')}` }
      }
      return decision
    }, { mode: 'none', reason: 'Этап необычного события не завершился и был безопасно пропущен.' })
  }
  const forcedWorkshopEvent = forcedWorkshopEventDecision(preparedEventState, request.campaign.turn + 1)
  if (forcedWorkshopEvent && (
    eventDecision.mode === 'none'
    || eventDecision.existingEventId !== forcedWorkshopEvent.existingEventId
  )) {
    eventDecision = forcedWorkshopEvent
    eventDirectorConsulted = true
  }

  reportProgress(report, 26, 'directing', 'Режиссёр строит причинный план и последствия', 4, 11)
  let director = directorPrompt(request.campaign, request.input, request.actionType, check, background, eventDecision)
  const createPlan = async () => {
    const rawPlan = await completeJson(request.provider, director.messages)
    return parseWithRepair(rawPlan, turnPlanSchema, request.provider, director.messages, salvageTurnPlan)
  }
  let validPlan = await createPlan()

  const enforceArtifactQuality = async (initialPlan: ReturnType<typeof turnPlanSchema.parse>) => {
    let plan = initialPlan
    const requested = requestedArtifactRarity(request.input)
    if (!plan.statePatch.inventory?.some((mutation) => mutation.operation === 'add' && mutation.item.category === 'artifact')) return plan
    let workingRegistry = [...(request.campaign.artifactRegistry ?? [])]
    const inventory = [...plan.statePatch.inventory]
    const worldContext = {
      name: request.campaign.world.name,
      inspiration: request.campaign.world.inspiration,
      era: request.campaign.world.era,
      rules: request.campaign.world.rules,
      system: request.campaign.world.system,
      canonMode: request.campaign.settings.canonMode,
    }

    const fallbackReview = (item: PlannedArtifactItem, issues: string[], registry: NonNullable<Campaign['artifactRegistry']>): ArtifactQualityReview => {
      const novelty = artifactNoveltyScore(artifactCandidate(item, request.campaign.turn), registry)
      const base = Math.max(0, 90 - issues.length * 7)
      return {
        scores: {
          idea: novelty,
          form: novelty,
          mechanics: base,
          origin: base,
          interaction: base,
          development: base,
          presentation: item.artifact?.presentation ? base : 0,
          canonAccuracy: item.artifact?.canonStatus === 'canonical' ? base : 100,
        },
        strengths: [],
        issues: [],
        verdict: issues.length > 2 ? 'rebuild' : issues.length ? 'good' : 'excellent',
      }
    }

    const reviewCandidate = async (item: PlannedArtifactItem, deterministicIssues: string[], registry: NonNullable<Campaign['artifactRegistry']>) => {
      try {
        const messages = artifactQualityCriticPrompt(item, registry, worldContext)
        const raw = await completeJson(request.provider, messages)
        const parsed = artifactQualityReviewSchema.safeParse(normalizeModelOutput(raw))
        if (parsed.success) return parsed.data
        console.warn(`[artifact-quality] Compact critic returned an invalid review: ${compactIssues(parsed.error, raw)}`)
      } catch (error) {
        console.warn(`[artifact-quality] Compact critic was skipped: ${error instanceof Error ? error.message : String(error)}`)
      }
      return fallbackReview(item, deterministicIssues, registry)
    }

    const candidateScore = (item: PlannedArtifactItem, issues: string[], review: ArtifactQualityReview, registry: NonNullable<Campaign['artifactRegistry']>) => {
      const assessment = assessItemRarity(item)
      const assessedRank = Math.max(0, rarityOrder.indexOf(assessment.rarity))
      const requestedRank = requested ? Math.max(0, rarityOrder.indexOf(requested)) : assessedRank
      const rarityFulfilment = Math.min(1, assessedRank / Math.max(1, requestedRank)) * 160
      const reviewAverage = Object.values(review.scores).reduce((sum, value) => sum + value, 0) / Object.values(review.scores).length
      return assessedRank * 35 + rarityFulfilment + reviewAverage + artifactNoveltyScore(artifactCandidate(item, request.campaign.turn), registry) - issues.length * 12 - review.issues.length * 5
    }

    for (let index = 0; index < inventory.length; index += 1) {
      const mutation = inventory[index]
      if (mutation?.operation !== 'add' || mutation.item.category !== 'artifact') continue
      let current = mutation.item
      const identity = { id: plannedArtifactId(current), name: current.name, origin: current.origin }
      const currentCandidateId = artifactCandidate(current, request.campaign.turn).id
      const registry = workingRegistry.filter((entry) => entry.artifactId !== currentCandidateId)
      const claimedRank = rarityOrder.indexOf(current.rarity)
      const requestedRank = requested ? rarityOrder.indexOf(requested) : -1
      const requiredRarity = rarityOrder[Math.max(claimedRank, requestedRank)] ?? current.rarity
      let currentIssues = artifactItemQualityIssues(current, requested, registry)
      let currentReview = await reviewCandidate(current, currentIssues, registry)
      let best = current
      let bestIssues = currentIssues
      let bestReview = currentReview
      let bestScore = candidateScore(current, currentIssues, currentReview, registry)

      for (let focusedAttempt = 0; focusedAttempt < 3; focusedAttempt += 1) {
        const criticIssues = currentReview.verdict === 'rebuild' ? currentReview.issues : []
        const repairIssues = [...new Set([...currentIssues, ...criticIssues])]
        if (!repairIssues.length && currentReview.verdict !== 'rebuild') break
        reportProgress(report, 33 + focusedAttempt * 2, 'artifact-quality', `Создаём уникальный артефакт класса ${requiredRarity}: вариант ${focusedAttempt + 1} из 3`, 5, 11)
        const repairMessages = artifactFocusedRepairPrompt({ world: worldContext, input: request.input }, plan, current, requiredRarity, repairIssues)
        try {
          const repairedRaw = await completeJson(request.provider, repairMessages)
          const repaired = await parseWithRepair(repairedRaw, artifactRewardRepairSchema, request.provider, repairMessages)
          current = {
            ...repaired.item,
            ...(identity.id ? { id: identity.id } : {}),
            name: identity.name,
            ...(identity.origin ? { origin: identity.origin } : {}),
          }
          currentIssues = artifactItemQualityIssues(current, requested, registry)
          currentReview = await reviewCandidate(current, currentIssues, registry)
          const score = candidateScore(current, currentIssues, currentReview, registry)
          if (score > bestScore) {
            best = current
            bestIssues = currentIssues
            bestReview = currentReview
            bestScore = score
          }
        } catch (error) {
          console.warn(`[artifact-quality] Focused variant failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      const assessment = assessItemRarity(best)
      if (assessment.rarity !== best.rarity) best = { ...best, rarity: assessment.rarity }
      if (bestIssues.length || bestReview.verdict === 'rebuild') {
        console.warn(`[artifact-quality] Applied the strongest honest candidate for ${best.name}; remaining issues: ${[...bestIssues, ...bestReview.issues].join(' ')}`)
      }
      inventory[index] = { operation: 'add', item: best }
      workingRegistry = updateArtifactRegistry(workingRegistry, artifactCandidate(best, request.campaign.turn), 'active', request.campaign.turn)
    }

    plan = turnPlanSchema.parse({ ...plan, statePatch: { ...plan.statePatch, inventory } })
    return plan
  }

  const enforceAbilityQuality = async (initialPlan: ReturnType<typeof turnPlanSchema.parse>) => {
    const plan = initialPlan
    type AbilityRef = {
      ownerKind: 'player' | 'npc'
      ownerId: string
      ownerName: string
      resources: string[]
      ability: AbilityDraft
      replace: (ability: AbilityDraft) => void
    }
    const refs: AbilityRef[] = []
    const playerKnown = request.campaign.player.abilities ?? []
    ;(plan.statePatch.addAbilities ?? []).forEach((ability, index, collection) => {
      const existing = playerKnown.some((entry) => entry.id === ability.id || entry.name.trim().toLocaleLowerCase('ru-RU') === ability.name.trim().toLocaleLowerCase('ru-RU'))
      if (!existing) refs.push({
        ownerKind: 'player', ownerId: request.campaign.player.id, ownerName: request.campaign.player.name,
        resources: request.campaign.player.resources.map((resource) => resource.key), ability,
        replace: (next) => { collection[index] = next },
      })
    })
    ;(plan.statePatch.npcs ?? []).forEach((mutation) => {
      if (mutation.operation === 'add') {
        ;(mutation.npc.abilities ?? []).forEach((ability, index, collection) => refs.push({
          ownerKind: 'npc', ownerId: mutation.npc.id, ownerName: mutation.npc.name,
          resources: (mutation.npc.resources ?? []).map((resource) => resource.key), ability,
          replace: (next) => { collection[index] = abilityStateCandidate({ ...next, id: ability.id }, request.campaign.turn) },
        }))
        return
      }
      const owner = request.campaign.npcs.find((npc) => npc.id === mutation.targetId)
      if (!owner) return
      const collections = [mutation.npc.abilities ?? [], mutation.npc.upsertAbilities ?? []]
      collections.forEach((collection) => collection.forEach((ability, index) => {
        const existing = (owner.abilities ?? []).some((entry) => entry.id === ability.id || entry.name.trim().toLocaleLowerCase('ru-RU') === ability.name.trim().toLocaleLowerCase('ru-RU'))
        if (!existing) refs.push({
          ownerKind: 'npc', ownerId: owner.id, ownerName: owner.name,
          resources: (owner.resources ?? []).map((resource) => resource.key), ability,
          replace: (next) => { collection[index] = next },
        })
      }))
    })
    if (!refs.length) return plan

    let systemDraft = plan.statePatch.world?.capabilitySystem
    let workingRegistry = [...(request.campaign.abilityRegistry ?? [])]
    const worldContext = {
      name: request.campaign.world.name,
      era: request.campaign.world.era,
      rules: request.campaign.world.rules,
      system: request.campaign.world.system,
      capabilitySystem: request.campaign.world.capabilitySystem ?? systemDraft,
      canonMode: request.campaign.settings.canonMode,
    }
    const fallbackReview = (issues: string[]): AbilityQualityReview => ({
      scores: { identity: issues.length ? 55 : 90, mechanics: issues.length ? 55 : 90, worldFit: issues.length ? 55 : 90, ownerExpression: issues.length ? 55 : 90, counterplay: issues.length ? 55 : 90, presentation: issues.length ? 55 : 90 },
      strengths: [], issues: [], verdict: issues.length ? 'repair' : 'good',
    })
    const processRef = async (ref: AbilityRef, registry: NonNullable<Campaign['abilityRegistry']>) => {
      let current = ref.ability
      let issues = newAbilityQualityIssues(current, systemDraft, request.campaign.world.capabilitySystem, ref.resources, registry, request.campaign.turn)
      let review = fallbackReview(issues)
      try {
        const criticMessages = abilityQualityCriticPrompt({ world: worldContext, owner: { id: ref.ownerId, name: ref.ownerName, resources: ref.resources }, ability: current, registry })
        const criticRaw = await completeJson(request.provider, criticMessages)
        const parsedReview = abilityQualityReviewSchema.safeParse(normalizeModelOutput(criticRaw))
        if (parsedReview.success) review = parsedReview.data
        else console.warn(`[ability-quality] Invalid compact review: ${compactIssues(parsedReview.error, criticRaw)}`)
      } catch (error) {
        console.warn(`[ability-quality] Compact critic skipped: ${error instanceof Error ? error.message : String(error)}`)
      }
      let best = current
      let bestIssues = issues
      let bestScore = abilityNoveltyScore(abilityStateCandidate(current, request.campaign.turn), registry) - issues.length * 20
      for (let attempt = 0; attempt < 2 && (issues.length || review.verdict === 'repair'); attempt += 1) {
        reportProgress(report, 36 + attempt * 2, 'ability-quality', `Уточняем авторскую механику «${current.name}»: вариант ${attempt + 1} из 2`, 5, 11)
        const repairMessages = abilityFocusedRepairPrompt({
          world: worldContext,
          owner: { id: ref.ownerId, name: ref.ownerName, resources: ref.resources },
          ability: current,
          registry,
          issues: [...new Set([...issues, ...review.issues])],
        })
        try {
          const repairRaw = await completeJson(request.provider, repairMessages)
          const repaired = await parseWithRepair(repairRaw, abilityFocusedRepairSchema, request.provider, repairMessages)
          if (repaired.capabilitySystem) systemDraft = repaired.capabilitySystem
          current = { ...repaired.ability, id: ref.ability.id, name: ref.ability.name, source: ref.ability.source ?? repaired.ability.source }
          issues = newAbilityQualityIssues(current, systemDraft, request.campaign.world.capabilitySystem, ref.resources, registry, request.campaign.turn)
          const score = abilityNoveltyScore(abilityStateCandidate(current, request.campaign.turn), registry) - issues.length * 20
          if (score >= bestScore) { best = current; bestIssues = issues; bestScore = score }
        } catch (error) {
          console.warn(`[ability-quality] Focused repair failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      if (bestIssues.length) console.warn(`[ability-quality] Best structurally safe variant retained for ${best.name}: ${bestIssues.join(' ')}`)
      const remainingHardIssues = hardAbilityQualityIssues(best, systemDraft, request.campaign.world.capabilitySystem, ref.resources, request.campaign.turn)
      if (remainingHardIssues.length) throw new Error(`Новая способность «${best.name}» не прошла обязательную механическую проверку: ${remainingHardIssues.join(' ')}`)
      return { ref, ability: best }
    }

    // The first capability in a legacy world establishes the shared taxonomy. Afterwards
    // independent owners are reviewed in bounded parallel batches without touching normal turns.
    let start = 0
    if (!request.campaign.world.capabilitySystem && !systemDraft && refs.length) {
      const first = await processRef(refs[0], workingRegistry)
      first.ref.replace(first.ability)
      workingRegistry = updateAbilityRegistry(workingRegistry, abilityStateCandidate(first.ability, request.campaign.turn), first.ref.ownerId, first.ref.ownerKind, 'active', request.campaign.turn)
      start = 1
    }
    const ownerGroups = [...refs.slice(start).reduce((groups, ref) => {
      const key = `${ref.ownerKind}:${ref.ownerId}`
      const current = groups.get(key) ?? []
      current.push(ref)
      groups.set(key, current)
      return groups
    }, new Map<string, AbilityRef[]>()).values()]
    for (let index = 0; index < ownerGroups.length; index += 3) {
      const completedGroups = await Promise.all(ownerGroups.slice(index, index + 3).map(async (ownerRefs) => {
        let ownerRegistry = [...workingRegistry]
        const completed: Array<Awaited<ReturnType<typeof processRef>>> = []
        // Abilities of one owner form a package: each next draft sees the owner's earlier
        // fingerprints. Only independent owners are allowed to run in parallel.
        for (const ref of ownerRefs) {
          const result = await processRef(ref, ownerRegistry)
          completed.push(result)
          ownerRegistry = updateAbilityRegistry(ownerRegistry, abilityStateCandidate(result.ability, request.campaign.turn), ref.ownerId, ref.ownerKind, 'active', request.campaign.turn)
        }
        return completed
      }))
      completedGroups.flat().forEach(({ ref, ability }) => {
        ref.replace(ability)
        workingRegistry = updateAbilityRegistry(workingRegistry, abilityStateCandidate(ability, request.campaign.turn), ref.ownerId, ref.ownerKind, 'active', request.campaign.turn)
      })
    }
    if (systemDraft) plan.statePatch.world = { ...(plan.statePatch.world ?? {}), capabilitySystem: systemDraft }
    return turnPlanSchema.parse(plan)
  }

  validPlan = await enforceArtifactQuality(validPlan)

  if (eventDecision.mode !== 'none' && eventDecision.mode !== 'seed') {
    const complianceIssues = narrativeEventComplianceIssues(eventDecision, validPlan.statePatch)
    if (complianceIssues.length) {
      reportProgress(report, 34, 'event-compliance', 'Связываем событие с настоящими данными мира', 5, 11)
      try {
        const repairMessages = eventComplianceRepairPrompt(director.messages, eventDecision, validPlan, complianceIssues)
        const repairedRaw = await completeJson(request.provider, repairMessages)
        const repaired = await parseWithRepair(repairedRaw, turnPlanSchema, request.provider, repairMessages, salvageTurnPlan)
        const remaining = narrativeEventComplianceIssues(eventDecision, repaired.statePatch)
        if (remaining.length) throw new Error(remaining.join(' '))
        validPlan = repaired
      } catch (error) {
        console.warn(`[event-director] Событие отложено после неполной материализации: ${error instanceof Error ? error.message : String(error)}`)
        eventDecision = { mode: 'none', reason: 'Событие отложено: основной план не смог безопасно применить все обязательные последствия.' }
        director = directorPrompt(request.campaign, request.input, request.actionType, check, background, eventDecision)
        validPlan = await createPlan()
      }
    }
  }

  const applyProgressionAudit = async (plan: ReturnType<typeof turnPlanSchema.parse>) => {
    const progressionMessages = progressionAuditPrompt(request.campaign, request.input, plan)
    if (!progressionMessages) return plan
    reportProgress(report, 41, 'progression', 'Сверяем развитие способностей, предметов и персонажей', 5, 11)
    const emptyProgression: ReturnType<typeof progressionAuditSchema.parse> = {}
    const progression = await optionalStage<ReturnType<typeof progressionAuditSchema.parse>>('progression', async () => {
      const rawProgression = await completeJson(request.provider, progressionMessages)
      return parseWithRepair(rawProgression, progressionAuditSchema, request.provider, progressionMessages, () => ({}))
    }, emptyProgression)
    const supplementalAbilityChanges = filterSupplementalAbilityChanges(plan.statePatch.abilityChanges, progression.abilityChanges)
    const supplementalArtifactChanges = filterSupplementalArtifactChanges(plan.statePatch.artifactChanges, progression.artifactChanges)
    plan.statePatch.abilityChanges = [...(plan.statePatch.abilityChanges ?? []), ...(supplementalAbilityChanges ?? [])]
    plan.statePatch.artifactChanges = [...(plan.statePatch.artifactChanges ?? []), ...(supplementalArtifactChanges ?? [])]
    for (const npcAudit of progression.npcAbilityChanges ?? []) {
      const alreadyTracked = (plan.statePatch.npcs ?? [])
        .filter((mutation) => mutation.operation === 'update' && mutation.targetId === npcAudit.npcId)
        .flatMap((mutation) => mutation.operation === 'update' ? mutation.npc.abilityChanges ?? [] : [])
      const abilityChanges = filterSupplementalAbilityChanges(alreadyTracked, npcAudit.abilityChanges)
      if (abilityChanges?.length) {
        plan.statePatch.npcs = [
          ...(plan.statePatch.npcs ?? []),
          { operation: 'update', targetId: npcAudit.npcId, npc: { abilityChanges } },
        ]
      }
    }
    return plan
  }

  validPlan = await applyProgressionAudit(validPlan)
  // The foreground plan already owns every consequence of the current input. Background
  // simulation may contribute only non-overlapping off-screen changes, never repeat the same
  // NPC cost/damage after seeing the user's upcoming intention.
  validPlan.statePatch = mergeAuditPatch(validPlan.statePatch, restrictBackgroundPatch(background.statePatch)) as typeof validPlan.statePatch
  let sanitized = sanitizePlan(request.campaign, validPlan)
  let finalEventIssues = narrativeEventComplianceIssues(eventDecision, sanitized.plan.statePatch)
  if (eventDecision.mode !== 'none' && eventDecision.mode !== 'seed' && finalEventIssues.length) {
    try {
      const repairMessages = eventComplianceRepairPrompt(director.messages, eventDecision, sanitized.plan, finalEventIssues)
      const repairedRaw = await completeJson(request.provider, repairMessages)
      let repaired = await parseWithRepair(repairedRaw, turnPlanSchema, request.provider, repairMessages, salvageTurnPlan)
      repaired = await applyProgressionAudit(repaired)
      repaired.statePatch = mergeAuditPatch(repaired.statePatch, restrictBackgroundPatch(background.statePatch)) as typeof repaired.statePatch
      const repairedAndSanitized = sanitizePlan(request.campaign, repaired)
      finalEventIssues = narrativeEventComplianceIssues(eventDecision, repairedAndSanitized.plan.statePatch)
      if (finalEventIssues.length) throw new Error(finalEventIssues.join(' '))
      sanitized = repairedAndSanitized
      validPlan = repaired
    } catch (error) {
      console.warn(`[event-director] Событие отложено после проверки ссылок: ${error instanceof Error ? error.message : String(error)}`)
      eventDecision = { mode: 'none', reason: 'Событие отложено после проверки ссылок и целостности состояния.' }
      director = directorPrompt(request.campaign, request.input, request.actionType, check, background, eventDecision)
      validPlan = await createPlan()
      validPlan = await applyProgressionAudit(validPlan)
      validPlan.statePatch = mergeAuditPatch(validPlan.statePatch, restrictBackgroundPatch(background.statePatch)) as typeof validPlan.statePatch
      sanitized = sanitizePlan(request.campaign, validPlan)
    }
  }
  validPlan = await enforceArtifactQuality(sanitized.plan)
  validPlan = await enforceAbilityQuality(validPlan)
  sanitized = sanitizePlan(request.campaign, validPlan)
  const executionIssues = abilityExecutionIssues(request.campaign, sanitized.plan.abilityExecutions, sanitized.plan.statePatch)
  if (executionIssues.length) {
    reportProgress(report, 47, 'ability-execution', 'Сверяем применение способностей, условия и фактически оплаченную цену', 5, 11)
    const repairMessages = abilityExecutionRepairPrompt(director.messages, request.campaign, sanitized.plan, executionIssues)
    const repairedRaw = await completeJson(request.provider, repairMessages)
    let repaired = await parseWithRepair(repairedRaw, turnPlanSchema, request.provider, repairMessages, salvageTurnPlan)
    repaired = await enforceArtifactQuality(repaired)
    repaired = await enforceAbilityQuality(repaired)
    const repairedSanitized = sanitizePlan(request.campaign, repaired)
    const remainingExecutionIssues = abilityExecutionIssues(request.campaign, repairedSanitized.plan.abilityExecutions, repairedSanitized.plan.statePatch)
    if (remainingExecutionIssues.length) {
      throw new Error(`DeepSeek не смог безопасно согласовать применение способностей с механикой: ${remainingExecutionIssues.join(' ')}`)
    }
    sanitized = repairedSanitized
  }
  reportProgress(report, 50, 'drafting', request.campaign.settings.qualityMode === 'balanced' ? 'Пишем сцену по утверждённому плану' : 'Пишем два независимых варианта сцены', 6, 11)
  const firstDraft = completeText(request.provider, narratorPrompt(request.campaign, request.input, request.actionType, sanitized.plan, check, 'grounded'))
  const [draftAResult, draftBResult] = request.campaign.settings.qualityMode === 'balanced'
    ? await firstDraft.then((draft) => [{ status: 'fulfilled' as const, value: draft }, { status: 'fulfilled' as const, value: draft }])
    : await Promise.allSettled([firstDraft, completeText(request.provider, narratorPrompt(request.campaign, request.input, request.actionType, sanitized.plan, check, 'dramatic'))])
  if (draftAResult.status === 'rejected' && draftBResult.status === 'rejected') throw draftAResult.reason
  const draftA = draftAResult.status === 'fulfilled' ? draftAResult.value : (draftBResult as PromiseFulfilledResult<string>).value
  const draftB = draftBResult.status === 'fulfilled' ? draftBResult.value : draftA
  const repetitionA = findNarrativeRepetitionIssues(draftA, request.campaign.messages)
  const repetitionB = findNarrativeRepetitionIssues(draftB, request.campaign.messages)
  reportProgress(report, 65, 'critic', 'Критик выбирает сильнейший непротиворечивый вариант', 7, 11)
  const criticMessages = continuityCriticPrompt(request.campaign, request.input, request.actionType, sanitized.plan, draftA, draftB, repetitionA, repetitionB)
  const review = await optionalStage('critic', async () => {
    const rawReview = await completeJson(request.provider, criticMessages)
    return parseWithRepair(rawReview, continuityReviewSchema, request.provider, criticMessages, () => ({ chosen: 'a' as const, pass: true, issues: [], rewriteInstructions: '' }))
  }, { chosen: 'a' as const, pass: true, issues: [], rewriteInstructions: '' })
  const reviewerChoice = review.chosen
  const reviewerIssues = reviewerChoice === 'a' ? repetitionA : repetitionB
  const alternateIssues = reviewerChoice === 'a' ? repetitionB : repetitionA
  const chosen = narrativeRepetitionScore(alternateIssues) < narrativeRepetitionScore(reviewerIssues)
    ? (reviewerChoice === 'a' ? 'b' : 'a')
    : reviewerChoice
  const chosenDraft = chosen === 'a' ? draftA : draftB
  const chosenRepetitionIssues = chosen === 'a' ? repetitionA : repetitionB
  const repetitionInstructions = chosenRepetitionIssues.map((issue) => issue.instruction).join('\n')
  const rewriteInstructions = [review.pass ? '' : review.rewriteInstructions, repetitionInstructions].filter(Boolean).join('\n')
  let narrative = review.pass && chosenRepetitionIssues.length === 0 ? chosenDraft : await optionalStage(
    'revision',
    () => chosenRepetitionIssues.length
      ? completeText(request.provider, narrativeRepetitionRevisionPrompt(request.campaign, request.input, sanitized.plan, chosenDraft, chosenRepetitionIssues, review.pass ? '' : review.rewriteInstructions))
      : completeText(request.provider, revisionPrompt(request.campaign, request.input, sanitized.plan, chosenDraft, rewriteInstructions)),
    chosenDraft,
  )

  const agencyAuditNotes: string[] = []
  let agencyPassed = false
  for (let agencyAttempt = 0; agencyAttempt < 3; agencyAttempt += 1) {
    const deterministicViolations = findAgencyViolations({
      playerName: request.campaign.player.name,
      input: request.input,
      actionType: request.actionType,
      narrative,
      agencyMode: request.campaign.settings.playerAgency,
    })
    reportProgress(report, 70 + agencyAttempt * 2, 'agency-audit', agencyAttempt === 0
      ? 'Проверяем, что герой принадлежит только игроку'
      : `Убираем присвоенные герою решения: попытка ${agencyAttempt + 1}`, 8, 11)
    const auditMessages = playerAgencyAuditorPrompt(
      request.campaign,
      request.input,
      request.actionType,
      sanitized.plan,
      narrative,
      deterministicViolations,
    )
    const fallbackAgencyAudit: AgencyAudit = {
      pass: deterministicViolations.length === 0,
      violations: deterministicViolations,
    }
    const agencyAudit = await optionalStage<AgencyAudit>('agency-audit', async () => {
      const rawAgencyAudit = await completeJson(request.provider, auditMessages)
      return parseWithRepair<AgencyAudit>(rawAgencyAudit, agencyAuditSchema, request.provider, auditMessages)
    }, fallbackAgencyAudit)
    const violations = [...deterministicViolations, ...agencyAudit.violations].filter((violation, index, all) => (
      all.findIndex((candidate) => candidate.kind === violation.kind && candidate.evidence === violation.evidence) === index
    ))
    agencyAuditNotes.push(...violations.map((violation) => `Агентность ${violation.kind}: ${violation.reason}`))
    if (agencyAudit.pass && violations.length === 0) {
      agencyPassed = true
      break
    }
    if (agencyAttempt === 2) break
    narrative = await completeText(request.provider, agencyRevisionPrompt(
      request.campaign,
      request.input,
      request.actionType,
      sanitized.plan,
      narrative,
      violations as AgencyViolation[],
    ))
  }
  if (!agencyPassed) {
    throw new Error(`DeepSeek не смог сохранить свободу героя после трёх обязательных исправлений. Ход не применён, чтобы ИИ не решил за ${request.campaign.player.name}.`)
  }

  const repairedOmissions: ConsequenceAudit['omissions'] = []
  const narrativeAuditNotes: string[] = []
  let consequenceAudit: ConsequenceAudit | undefined
  const eventCompliantPatch = eventDecision.mode !== 'none' && eventDecision.mode !== 'seed'
    ? structuredClone(sanitized.plan.statePatch)
    : undefined
  let reconciled = sanitized

  // Audit state and prose together. If the model replaced a binding story direction with its
  // own scene, rewrite the prose and audit the corrected result again before committing anything.
  for (let narrativeAttempt = 0; narrativeAttempt < 3; narrativeAttempt += 1) {
    reportProgress(report, 76 + narrativeAttempt * 5, 'consequence-audit', narrativeAttempt === 0 ? 'Проверяем все 17 областей состояния' : `Исправляем пропущенные последствия: попытка ${narrativeAttempt + 1}`, 9, 11)
    const auditMessages = consequenceAuditorPrompt(request.campaign, request.input, request.actionType, reconciled.plan, narrative, check)
    const rawAudit = await completeJson(request.provider, auditMessages)
    consequenceAudit = await parseWithRepair<ConsequenceAudit>(rawAudit, consequenceAuditSchema, request.provider, auditMessages)
    repairedOmissions.push(...consequenceAudit.omissions)
    narrativeAuditNotes.push(...consequenceAudit.narrativeIssues.map((issue) => `${issue.severity}: ${issue.requirement}`))
    reconciled.plan.statePatch = mergeAuditPatch(reconciled.plan.statePatch, consequenceAudit.statePatch) as typeof reconciled.plan.statePatch
    reconciled = sanitizePlan(request.campaign, reconciled.plan)

    // A structurally valid patch can still reference an entity that no longer exists. Make the
    // model repair that exact consequence rather than silently dropping it. Only rejections in
    // the same audited domain are blocking: an unrelated harmless normalization must not cancel
    // the entire turn.
    let blockingNotes = blockingRejectionMessages(reconciled, consequenceAudit.omissions)
    for (let referenceAttempt = 1; blockingNotes.length > 0 && referenceAttempt < 3; referenceAttempt += 1) {
      const retryMessages = consequenceAuditorPrompt(
        request.campaign,
        request.input,
        request.actionType,
        { ...reconciled.plan, rejectedConsequenceNotes: blockingNotes },
        narrative,
        check,
      )
      const retryRaw = await completeJson(request.provider, retryMessages)
      const retryAudit = await parseWithRepair<ConsequenceAudit>(retryRaw, consequenceAuditSchema, request.provider, retryMessages)
      consequenceAudit = retryAudit
      repairedOmissions.push(...retryAudit.omissions)
      narrativeAuditNotes.push(...retryAudit.narrativeIssues.map((issue) => `${issue.severity}: ${issue.requirement}`))
      reconciled.plan.statePatch = mergeAuditPatch(reconciled.plan.statePatch, retryAudit.statePatch) as typeof reconciled.plan.statePatch
      reconciled = sanitizePlan(request.campaign, reconciled.plan)
      blockingNotes = blockingRejectionMessages(reconciled, consequenceAudit.omissions)
    }
    if (blockingNotes.length > 0) {
      throw new Error(`DeepSeek не смог безопасно привязать обязательное последствие к текущему состоянию: ${blockingNotes.join(' ')}`)
    }
    const repetitionIssues = findNarrativeRepetitionIssues(narrative, request.campaign.messages)
    narrativeAuditNotes.push(...repetitionIssues.map((issue) => `Повтор ${issue.severity}: ${issue.candidateExcerpt}`))
    if (consequenceAudit.narrativePass && repetitionIssues.length === 0) break
    if (narrativeAttempt === 2) {
      if (repetitionIssues.length) {
        throw new Error(`DeepSeek трижды повторил уже использованное описание: ${repetitionIssues.map((issue) => issue.candidateExcerpt).join(' | ')}`)
      }
      throw new Error(`DeepSeek трижды не выполнил обязательные факты ввода: ${consequenceAudit.narrativeIssues.map((issue) => issue.requirement).join(' ')}`)
    }
    if (repetitionIssues.length) {
      reportProgress(report, 86 + narrativeAttempt * 2, 'style-audit', `Убираем повторяющиеся абзацы: попытка ${narrativeAttempt + 1}`, 9, 11)
      const otherInstructions = consequenceAudit.narrativePass ? '' : consequenceAudit.narrativeIssues.map((issue) => issue.instruction).join('\n')
      narrative = await completeText(request.provider, narrativeRepetitionRevisionPrompt(request.campaign, request.input, reconciled.plan, narrative, repetitionIssues, otherInstructions))
      const postRevisionAgencyIssues = findAgencyViolations({
        playerName: request.campaign.player.name,
        input: request.input,
        actionType: request.actionType,
        narrative,
        agencyMode: request.campaign.settings.playerAgency,
      })
      if (postRevisionAgencyIssues.length) {
        narrative = await completeText(request.provider, agencyRevisionPrompt(
          request.campaign,
          request.input,
          request.actionType,
          reconciled.plan,
          narrative,
          postRevisionAgencyIssues,
        ))
      }
      continue
    }
    const consequenceRewriteInstructions = consequenceAudit.narrativeIssues.map((issue) => issue.instruction).join('\n')
    narrative = await completeText(request.provider, revisionPrompt(request.campaign, request.input, reconciled.plan, narrative, consequenceRewriteInstructions))
  }
  if (!consequenceAudit) throw new Error('Не удалось выполнить обязательную сверку последствий.')

  const finalRepetitionIssues = findNarrativeRepetitionIssues(narrative, request.campaign.messages)
  if (finalRepetitionIssues.length) {
    throw new Error(`Финальная проверка остановила повтор уже использованной прозы: ${finalRepetitionIssues.map((issue) => issue.candidateExcerpt).join(' | ')}`)
  }
  const finalAgencyIssues = findAgencyViolations({
    playerName: request.campaign.player.name,
    input: request.input,
    actionType: request.actionType,
    narrative,
    agencyMode: request.campaign.settings.playerAgency,
  })
  if (finalAgencyIssues.length) {
    throw new Error(`Финальная редактура нарушила свободу героя: ${finalAgencyIssues.map((issue) => issue.evidence).join(' | ')}`)
  }

  reportProgress(report, 93, 'memory', 'Закрепляем факты и долгую память истории', 10, 11)
  const curatorMessages = memoryCuratorPrompt(request.campaign, request.input, narrative, reconciled.plan)
  const curator = await optionalStage('memory', async () => {
    const rawCurator = await completeJson(request.provider, curatorMessages)
    return parseWithRepair(rawCurator, memoryCuratorSchema, request.provider, curatorMessages, () => ({ memories: [], archives: [] }))
  }, { memories: [], archives: [] })
  if (curator.cleanup) {
    const safeCleanup = protectNarrativeEventCleanup(curator.cleanup, eventDecision)
    reconciled.plan.statePatch = mergePatches(reconciled.plan.statePatch, { cleanup: safeCleanup }) as typeof reconciled.plan.statePatch
    reconciled = sanitizePlan(request.campaign, reconciled.plan)
  }
  const plannedMemories = reconciled.plan.statePatch.memories ?? []
  reconciled.plan.statePatch.memories = [
    ...plannedMemories,
    ...selectCurrentTurnMemories(request.campaign, request.input, narrative, plannedMemories, curator.memories),
  ]
  const nextTurn = request.campaign.turn + 1
  const archives = curator.archives.filter((archive) => archive.kind === 'scene' ? nextTurn % 4 === 0 : archive.kind === 'chapter' ? nextTurn % 16 === 0 : nextTurn % 64 === 0)
  const reviewNotes = review.issues.map((issue) => `${issue.severity}: ${issue.detail}`)
  const auditNotes = repairedOmissions.map((omission) => `Автосверка ${omission.domain}: ${omission.requiredChange}`)

  let postAuditEventIssues = narrativeEventComplianceIssues(eventDecision, reconciled.plan.statePatch)
  if (postAuditEventIssues.length && eventCompliantPatch) {
    reconciled.plan.statePatch = mergeAuditPatch(reconciled.plan.statePatch, eventCompliantPatch) as typeof reconciled.plan.statePatch
    reconciled = sanitizePlan(request.campaign, reconciled.plan)
    postAuditEventIssues = narrativeEventComplianceIssues(eventDecision, reconciled.plan.statePatch)
  }
  if (eventDecision.mode !== 'none' && eventDecision.mode !== 'seed' && postAuditEventIssues.length) {
    try {
      const repairMessages = eventComplianceRepairPrompt(director.messages, eventDecision, reconciled.plan, postAuditEventIssues)
      const repairedRaw = await completeJson(request.provider, repairMessages)
      const repaired = await parseWithRepair(repairedRaw, turnPlanSchema, request.provider, repairMessages, salvageTurnPlan)
      const repairedAndSanitized = sanitizePlan(request.campaign, repaired)
      const remaining = narrativeEventComplianceIssues(eventDecision, repairedAndSanitized.plan.statePatch)
      if (remaining.length) throw new Error(remaining.join(' '))
      reconciled = repairedAndSanitized
      postAuditEventIssues = []
    } catch (error) {
      console.warn(`[event-director] Финальное восстановление события не прошло, возвращаем уже проверенный атомарный патч: ${error instanceof Error ? error.message : String(error)}`)
      if (eventCompliantPatch) {
        const knownGood = sanitizePlan(request.campaign, { ...reconciled.plan, statePatch: structuredClone(eventCompliantPatch) })
        const fallbackIssues = narrativeEventComplianceIssues(eventDecision, knownGood.plan.statePatch)
        if (fallbackIssues.length) throw new Error(`Не удалось восстановить ранее проверенное событие: ${fallbackIssues.join(' ')}`)
        reconciled = knownGood
        postAuditEventIssues = []
      }
    }
  }
  ;(reconciled.plan.statePatch as TurnPatch).eventDirectorState = eventDirectorConsulted
    ? applyNarrativeEventProposal(request.campaign, preparedEventState, eventDecision, randomUUID)
    : preparedEventState

  const finalArtifactIssues = artifactPlanQualityIssues(request.input, reconciled.plan)
  if (requestedArtifactRarity(request.input) && finalArtifactIssues.length) {
    throw new Error(`Финальная сверка остановила более слабую подмену запрошенного артефакта: ${finalArtifactIssues.join(' ')}`)
  }

  reportProgress(report, 98, 'finalizing', 'Формируем атомарный ответ и изменения', 11, 11)
  return {
    narrative,
    suggestions: reconciled.plan.suggestions,
    statePatch: reconciled.plan.statePatch,
    activeLoreIds: director.selection.activeLoreIds,
    recalledMemoryIds: director.selection.recalledMemoryIds,
    activeDocumentChunkIds: director.selection.activeDocumentChunkIds,
    continuityNotes: [...new Set([...sanitized.notes, ...reconciled.notes, ...reviewNotes, ...agencyAuditNotes, ...narrativeAuditNotes, ...auditNotes])],
    check,
    archives,
  }
}

async function repairCampaignEditorArtifacts(
  request: CampaignEditRequest,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  source: ReturnType<typeof turnPlanSchema.parse>,
  report?: ProgressReporter,
) {
  if (!source.statePatch.inventory?.length) return source
  const inventory = [...source.statePatch.inventory]
  const requested = requestedArtifactRarity(request.instruction)
  let workingRegistry = [...(request.campaign.artifactRegistry ?? [])]
  for (let index = 0; index < inventory.length; index += 1) {
    const mutation = inventory[index]
    const existing = mutation.operation === 'update'
      ? request.campaign.inventory.find((item) => item.id === mutation.targetId)
      : undefined
    const merged = mutation.operation === 'add'
      ? mutation.item
      : mutation.operation === 'update' && existing && mutation.item.artifact
        ? { ...existing, ...mutation.item, artifact: mutation.item.artifact }
        : undefined
    if (!merged || merged.category !== 'artifact' || !merged.artifact) continue
    let current = merged as PlannedArtifactItem
    const identity = { id: plannedArtifactId(current), name: current.name, origin: current.origin }
    const candidateRegistry = workingRegistry.filter((entry) => entry.artifactId !== artifactCandidate(current).id)
    let issues = artifactItemQualityIssues(current, requested, candidateRegistry)
    let best = current
    let bestScore = artifactNoveltyScore(artifactCandidate(current, request.campaign.turn), candidateRegistry) - issues.length * 12
    const requiredRank = Math.max(rarityOrder.indexOf(current.rarity), requested ? rarityOrder.indexOf(requested) : -1)
    const requiredRarity = rarityOrder[requiredRank] ?? current.rarity

    for (let attempt = 0; attempt < 3 && issues.length; attempt += 1) {
      reportProgress(report, 72 + attempt * 5, 'artifact-quality', `Перепроверяем артефакт «${current.name}»: вариант ${attempt + 1} из 3`, 3, 4)
      const repairMessages = artifactFocusedRepairPrompt({ world: request.campaign.world, instruction: request.instruction }, source, current, requiredRarity, issues)
      try {
        const raw = await completeJson(request.provider, repairMessages)
        const repaired = await parseWithRepair(raw, artifactRewardRepairSchema, request.provider, repairMessages)
        current = {
          ...repaired.item,
          ...(identity.id ? { id: identity.id } : {}),
          name: identity.name,
          ...(identity.origin ? { origin: identity.origin } : {}),
        }
        issues = artifactItemQualityIssues(current, requested, candidateRegistry)
        try {
          const criticMessages = artifactQualityCriticPrompt(current, candidateRegistry, request.campaign.world)
          const criticRaw = await completeJson(request.provider, criticMessages)
          const critic = artifactQualityReviewSchema.safeParse(normalizeModelOutput(criticRaw))
          if (critic.success && critic.data.verdict === 'rebuild') issues = [...new Set([...issues, ...critic.data.issues])]
        } catch {
          // Deterministic validation is sufficient when the optional critic is unavailable.
        }
        const score = artifactNoveltyScore(artifactCandidate(current, request.campaign.turn), candidateRegistry) - issues.length * 12
        if (score > bestScore) {
          best = current
          bestScore = score
        }
      } catch (error) {
        console.warn(`[artifact-quality] Editor artifact variant failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    const assessment = assessItemRarity(best)
    const honestBest = assessment.rarity === best.rarity ? best : { ...best, rarity: assessment.rarity }
    inventory[index] = mutation.operation === 'update'
      ? { operation: 'update', targetId: mutation.targetId, item: honestBest }
      : { operation: 'add', item: honestBest }
    workingRegistry = updateArtifactRegistry(workingRegistry, artifactCandidate(honestBest, request.campaign.turn), 'active', request.campaign.turn)
  }
  return turnPlanSchema.parse({ ...source, statePatch: { ...source.statePatch, inventory } })
}

async function repairCampaignEditorAbilities(
  request: CampaignEditRequest,
  source: ReturnType<typeof turnPlanSchema.parse>,
  report?: ProgressReporter,
) {
  type AbilityRef = {
    ownerKind: 'player' | 'npc'
    ownerId: string
    ownerName: string
    resources: string[]
    ability: AbilityDraft
    replace: (ability: AbilityDraft) => void
  }
  const refs: AbilityRef[] = []
  ;(source.statePatch.addAbilities ?? []).forEach((ability, index, collection) => {
    const exists = request.campaign.player.abilities.some((current) => current.id === ability.id || normalizedReference(current.name) === normalizedReference(ability.name))
    if (!exists) refs.push({
      ownerKind: 'player', ownerId: request.campaign.player.id, ownerName: request.campaign.player.name,
      resources: request.campaign.player.resources.map((resource) => resource.key), ability,
      replace: (next) => { collection[index] = next },
    })
  })
  ;(source.statePatch.npcs ?? []).forEach((mutation) => {
    if (mutation.operation === 'add') {
      ;(mutation.npc.abilities ?? []).forEach((ability, index, collection) => refs.push({
        ownerKind: 'npc', ownerId: mutation.npc.id, ownerName: mutation.npc.name,
        resources: (mutation.npc.resources ?? []).map((resource) => resource.key), ability,
        replace: (next) => { collection[index] = abilityStateCandidate({ ...next, id: ability.id }, request.campaign.turn) },
      }))
      return
    }
    const owner = request.campaign.npcs.find((npc) => npc.id === mutation.targetId)
    if (!owner) return
    ;[mutation.npc.abilities ?? [], mutation.npc.upsertAbilities ?? []].forEach((collection) => collection.forEach((ability, index) => {
      const exists = (owner.abilities ?? []).some((current) => current.id === ability.id || normalizedReference(current.name) === normalizedReference(ability.name))
      if (!exists) refs.push({
        ownerKind: 'npc', ownerId: owner.id, ownerName: owner.name,
        resources: (owner.resources ?? []).map((resource) => resource.key), ability,
        replace: (next) => { collection[index] = next },
      })
    }))
  })
  if (!refs.length) return source

  let systemDraft = source.statePatch.world?.capabilitySystem
  let registry = [...(request.campaign.abilityRegistry ?? [])]
  for (let index = 0; index < refs.length; index += 1) {
    const ref = refs[index]
    let current = ref.ability
    let issues = newAbilityQualityIssues(current, systemDraft, request.campaign.world.capabilitySystem, ref.resources, registry, request.campaign.turn)
    let criticIssues: string[] = []
    try {
      const criticMessages = abilityQualityCriticPrompt({
        world: request.campaign.world,
        owner: { id: ref.ownerId, name: ref.ownerName, resources: ref.resources },
        ability: current,
        registry,
      })
      const raw = await completeJson(request.provider, criticMessages)
      const critic = abilityQualityReviewSchema.safeParse(normalizeModelOutput(raw))
      if (critic.success && critic.data.verdict === 'repair') criticIssues = critic.data.issues
    } catch {
      // The deterministic checks remain authoritative if the compact critic is unavailable.
    }
    let best = current
    let bestIssues = issues
    let bestScore = abilityNoveltyScore(abilityStateCandidate(current, request.campaign.turn), registry) - issues.length * 20
    for (let attempt = 0; attempt < 2 && (issues.length || criticIssues.length); attempt += 1) {
      reportProgress(report, 72 + attempt * 7, 'ability-quality', `Уточняем новую способность «${current.name}»: вариант ${attempt + 1} из 2`, 3, 4)
      const repairMessages = abilityFocusedRepairPrompt({
        world: request.campaign.world,
        owner: { id: ref.ownerId, name: ref.ownerName, resources: ref.resources },
        ability: current,
        registry,
        issues: [...new Set([...issues, ...criticIssues])],
      })
      const raw = await completeJson(request.provider, repairMessages)
      const repaired = await parseWithRepair(raw, abilityFocusedRepairSchema, request.provider, repairMessages)
      if (repaired.capabilitySystem) systemDraft = repaired.capabilitySystem
      current = { ...repaired.ability, id: ref.ability.id, name: ref.ability.name, source: ref.ability.source ?? repaired.ability.source }
      issues = newAbilityQualityIssues(current, systemDraft, request.campaign.world.capabilitySystem, ref.resources, registry, request.campaign.turn)
      const score = abilityNoveltyScore(abilityStateCandidate(current, request.campaign.turn), registry) - issues.length * 20
      if (score >= bestScore) { best = current; bestIssues = issues; bestScore = score }
      criticIssues = []
    }
    const hardIssues = hardAbilityQualityIssues(best, systemDraft, request.campaign.world.capabilitySystem, ref.resources, request.campaign.turn)
    if (hardIssues.length) throw new Error(`ИИ-корректор не смог создать механически полную способность «${best.name}»: ${hardIssues.join(' ')}`)
    if (bestIssues.length) console.warn(`[ability-quality] Editor retained the strongest valid version for ${best.name}: ${bestIssues.join(' ')}`)
    ref.replace(best)
    registry = updateAbilityRegistry(registry, abilityStateCandidate(abilityDraftForSystem(best, capabilitySystemCandidate(systemDraft, request.campaign.world.capabilitySystem, request.campaign.turn)), request.campaign.turn), ref.ownerId, ref.ownerKind, 'active', request.campaign.turn)
  }
  if (systemDraft) source.statePatch.world = { ...(source.statePatch.world ?? {}), capabilitySystem: systemDraft }
  return turnPlanSchema.parse(source)
}

function workshopEventResponseIssues(request: CampaignEditRequest, response: CampaignEditResponse) {
  const directive = response.eventDirective
  if (request.eventOptions && !directive) return ['Режим события выбран, но eventDirective отсутствует.']
  if (!directive) return []
  const issues: string[] = []
  const options = request.eventOptions
  if (options && directive.delivery !== options.delivery) {
    issues.push(`delivery должен быть ${options.delivery}, получено ${directive.delivery}.`)
  }
  if (options?.magnitude !== undefined && options.magnitude !== 'auto' && directive.proposal.magnitude !== options.magnitude) {
    issues.push(`Масштаб должен быть ${options.magnitude}, получено ${directive.proposal.magnitude}.`)
  }
  if (options?.category !== undefined && options.category !== 'auto' && directive.proposal.category !== options.category) {
    issues.push(`Категория должна быть ${options.category}, получено ${directive.proposal.category}.`)
  }
  if (directive.delivery === 'seed') {
    if (directive.proposal.mode !== 'seed' || directive.proposal.lifecycleStage !== 'seeded') {
      issues.push('Скрытое зерно требует proposal.mode=seed и lifecycleStage=seeded.')
    }
    if (directive.proposal.immediateEffects.some((effect) => effect.mandatory)) {
      issues.push('Скрытое зерно не может немедленно материализовать обязательное последствие.')
    }
  } else if (directive.proposal.mode !== 'manifest' || directive.proposal.lifecycleStage !== 'manifested') {
    issues.push('Событие следующего хода или немедленное событие требует proposal.mode=manifest и lifecycleStage=manifested.')
  }
  const prematurePatchKeys = Object.entries(response.statePatch).filter(([key, value]) => {
    if (key === 'eventDirectorState' || value === undefined) return false
    if (Array.isArray(value)) return value.length > 0
    if (value && typeof value === 'object') return Object.keys(value).length > 0
    return true
  }).map(([key]) => key)
  if (directive.delivery !== 'apply-now' && prematurePatchKeys.length > 0) {
    issues.push(`Отложенное событие не должно применять statePatch до своего сюжетного хода: ${prematurePatchKeys.join(', ')}.`)
  }

  const manualCampaign: Campaign = {
    ...request.campaign,
    settings: {
      ...request.campaign.settings,
      eventDirector: {
        ...defaultEventDirectorSettings,
        enabled: true,
        maxMagnitude: 'mythic',
        lethality: 'ruthless',
        miraclePolicy: 'rare',
        canonPolicy: 'free',
        storyImpact: 'fate-changing',
        repetitionPolicy: 'unrestricted',
        permissions: { ...defaultEventDirectorSettings.permissions },
      },
    },
  }
  const manualState = {
    ...normalizeEventDirectorState(request.campaign.eventDirectorState, request.campaign.turn),
    surpriseCharge: 100,
    categoryCooldowns: {},
    lastMiracleTurn: undefined,
  }
  issues.push(...validateNarrativeEventProposal(manualCampaign, manualState, directive.proposal)
    .filter((issue) => issue !== 'Фундаментальное изменение мира требует ранее заложенной арки минимум в три хода.'))
  if (directive.delivery === 'apply-now') {
    issues.push(...narrativeEventComplianceIssues(directive.proposal, response.statePatch))
  }
  return [...new Set(issues)]
}

async function repairWorkshopEventResponse(
  request: CampaignEditRequest,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  initial: CampaignEditResponse,
) {
  let response = initial
  let issues = workshopEventResponseIssues(request, response)
  if (!issues.length) return response
  const repairMessages = [
    ...messages,
    { role: 'assistant' as const, content: JSON.stringify(response) },
    {
      role: 'user' as const,
      content: `Программная проверка команды события отклонила результат:\n${issues.map((issue) => `- ${issue}`).join('\n')}\n\nВерни весь JSON ответа редактора заново. Сохрани точный выбранный delivery, масштаб и категорию. Для seed/next-turn не применяй последствия заранее; для apply-now полностью реализуй каждое mandatory-требование через настоящий statePatch. Не отвечай пояснением.`,
    },
  ]
  const repairedRaw = await completeJson(request.provider, repairMessages)
  response = await parseWithRepair<CampaignEditResponse>(repairedRaw, campaignEditResponseSchema, request.provider, repairMessages)
  issues = workshopEventResponseIssues(request, response)
  if (issues.length) throw new Error(`Мастерская не смогла безопасно подготовить выбранное событие: ${issues.join(' ')}`)
  return response
}

export async function editCampaign(request: CampaignEditRequest, report?: ProgressReporter): Promise<CampaignEditResponse> {
  if (request.provider.provider === 'demo') throw new Error('ИИ-корректор требует подключённую модель. Выберите DeepSeek V4 Flash в настройках.')
  reportProgress(report, 8, 'reading-state', 'Изучаем выбранную кампанию и точные идентификаторы', 1, 4)
  const messages = campaignEditorPrompt(request.campaign, request.instruction, request.eventOptions)
  reportProgress(report, 28, 'planning-edit', 'ИИ проектирует минимальную корректировку без сюжетного хода', 2, 4)
  const raw = await completeJson(request.provider, messages)
  reportProgress(report, 68, 'validating-edit', 'Проверяем структуру, ссылки и допустимые изменения', 3, 4)
  const parsedInitial = await parseWithRepair<CampaignEditResponse>(raw, campaignEditResponseSchema, request.provider, messages)
  const parsed = await repairWorkshopEventResponse(request, messages, parsedInitial)
  const plan = turnPlanSchema.parse({ outcome: parsed.summary, beats: [parsed.summary], suggestions: ['Продолжить', 'Осмотреть изменения'], statePatch: parsed.statePatch })
  const sanitized = sanitizePlan(request.campaign, plan)
  const repairedPlan = await repairCampaignEditorArtifacts(request, messages, sanitized.plan, report)
  const abilitySafePlan = await repairCampaignEditorAbilities(request, repairedPlan, report)
  const finalSanitized = sanitizePlan(request.campaign, abilitySafePlan)
  reportProgress(report, 96, 'finalizing-edit', 'Подготавливаем безопасное применение корректировки', 4, 4)
  const finalResponse: CampaignEditResponse = {
    ...parsed,
    summary: [...sanitized.notes, ...finalSanitized.notes].length ? `${parsed.summary} Часть небезопасных ссылок отклонена: ${[...sanitized.notes, ...finalSanitized.notes].join(' ')}` : parsed.summary,
    statePatch: finalSanitized.plan.statePatch,
  }
  const finalEventIssues = workshopEventResponseIssues(request, finalResponse)
  if (finalEventIssues.length) throw new Error(`Финальная проверка события остановила неполное изменение: ${finalEventIssues.join(' ')}`)
  if (parsed.eventDirective) {
    finalResponse.statePatch.eventDirectorState = applyWorkshopEventDirective(
      request.campaign,
      normalizeEventDirectorState(request.campaign.eventDirectorState, request.campaign.turn),
      parsed.eventDirective as WorkshopEventDirective,
      randomUUID,
    )
  }
  return finalResponse
}

export async function answerWorldQuestion(request: WorldQuestionRequest, report?: ProgressReporter): Promise<WorldQuestionResponse> {
  if (request.provider.provider === 'demo') throw new Error('Справочник мира требует подключённую модель. Выберите DeepSeek V4 Flash в настройках.')
  reportProgress(report, 12, 'reading-context', 'Собираем факты, относящиеся к вопросу', 1, 3)
  const messages = worldQuestionPrompt(request.campaign, request.question, request.scope, request.history)
  reportProgress(report, 38, 'answering-question', request.scope === 'known' ? 'ИИ отвечает без раскрытия неизвестных герою сведений' : 'ИИ сверяет полное состояние кампании', 2, 3)
  const answer = (await completeText(request.provider, messages, { stage: 'service', maxOutputTokens: 8_192 })).trim()
  if (!answer) throw new Error('ИИ вернул пустой ответ. Состояние кампании не изменено.')
  reportProgress(report, 96, 'finalizing-answer', 'Проверяем и оформляем справку', 3, 3)
  return {
    answer: answer.slice(0, 40_000),
    scope: request.scope,
    generatedAt: new Date().toISOString(),
  }
}

export interface GeneratedWorldSections {
  core: GeneratedWorldCore
  civilization: GeneratedWorldCivilization
  characters: GeneratedWorldCharacters
  legends: GeneratedWorldLegends
  narrative: GeneratedWorldNarrative
  interface: GeneratedWorldInterface
}

export function assembleGeneratedWorldSections(sections: GeneratedWorldSections): GeneratedWorld {
  return {
    title: sections.core.title,
    world: {
      ...sections.core.world,
      ...sections.civilization.world,
      ...sections.legends.world,
      ...sections.narrative.world,
      ...sections.interface.world,
    },
    player: sections.core.player,
    inventory: sections.core.inventory,
    ...sections.characters,
    worldEvents: sections.narrative.worldEvents,
    factionReputation: sections.narrative.factionReputation,
    threads: sections.narrative.threads,
    mysteryCases: sections.narrative.mysteryCases,
    quests: sections.narrative.quests,
    lore: sections.legends.lore,
    opening: sections.narrative.opening,
  }
}

function worldStageForIssue(path: PropertyKey[]): WorldGenerationStage {
  const [root, child] = path.map(String)
  if (root === 'player' || root === 'inventory' || root === 'title') return 'core'
  if (root === 'npcs' || root === 'socialLinks' || root === 'characterArcs' || root === 'antagonistPlans' || root === 'worldPressures' || root === 'influenceAssets') return 'characters'
  if (root === 'lore') return 'legends'
  if (root === 'worldEvents' || root === 'factionReputation' || root === 'threads' || root === 'mysteryCases' || root === 'quests' || root === 'opening') return 'narrative'
  if (root === 'world') {
    if (child === 'legends' || child === 'legendarium') return 'legends'
    if (child === 'processes' || child === 'mysteries') return 'narrative'
    if (child === 'interfaceModules' || child === 'interfaceBlueprint' || child === 'metrics') return 'interface'
    if (child === 'factions' || child === 'locations' || child === 'places' || child === 'routes' || child === 'laws' || child === 'mechanics') return 'civilization'
  }
  return 'core'
}

/**
 * Request identity and an already-established place name are facts, not model-authored content.
 * Canonicalizing those references avoids spending a full repair pass on "Акира" vs "Акира " or
 * on "Токио-3 (предположительно)" when the atlas key is exactly "Токио-3".
 */
export function normalizeGeneratedWorldReferences(source: GeneratedWorld, requestedPlayerName: string): GeneratedWorld {
  const world = structuredClone(source)
  const exactPlayerName = requestedPlayerName.trim()
  const generatedPlayerName = world.player.name
  const renamePlayerReference = (value: string | undefined) => (
    value !== undefined && normalizedReference(value) === normalizedReference(generatedPlayerName)
      ? exactPlayerName
      : value
  )
  const renamePlayerReferences = (values: string[]) => values.map((value) => renamePlayerReference(value) ?? value)

  world.player.name = exactPlayerName
  world.characterArcs.forEach((arc) => { arc.ownerName = renamePlayerReference(arc.ownerName) ?? arc.ownerName })
  world.mysteryCases.forEach((mystery) => { mystery.culpritName = renamePlayerReference(mystery.culpritName) })
  world.worldEvents.forEach((event) => { event.involvedNpcNames = renamePlayerReferences(event.involvedNpcNames) })
  world.threads.forEach((thread) => { thread.participantNames = renamePlayerReferences(thread.participantNames) })
  world.worldPressures.forEach((pressure) => {
    pressure.sourceNpcName = renamePlayerReference(pressure.sourceNpcName)
    pressure.targetNames = renamePlayerReferences(pressure.targetNames)
  })
  world.influenceAssets.forEach((asset) => {
    asset.holderName = renamePlayerReference(asset.holderName) ?? asset.holderName
    asset.targetName = renamePlayerReference(asset.targetName)
  })
  world.world.legends.forEach((legend) => {
    legend.characterName = renamePlayerReference(legend.characterName)
    legend.relatedNpcNames = renamePlayerReferences(legend.relatedNpcNames)
    legend.successorNpcNames = renamePlayerReferences(legend.successorNpcNames)
    legend.legacies.forEach((legacy) => { legacy.holderNpcNames = renamePlayerReferences(legacy.holderNpcNames) })
  })

  const atlas = world.world.places
    .map((place) => ({ name: place.name, normalized: normalizedReference(place.name) }))
    .filter((place) => place.normalized)
    .sort((left, right) => right.normalized.length - left.normalized.length)
  const explicitlyUnlocated = /^(неизвест|местонахождение не установлено|место не установлено|unknown|location unknown)/i
  world.world.legends.forEach((legend) => {
    const rawLocation = legend.currentState.locationName
    if (!rawLocation) return
    const normalizedLocation = normalizedReference(rawLocation)
    const exact = atlas.find((place) => place.normalized === normalizedLocation)
    const embedded = exact ?? atlas.find((place) => normalizedLocation.includes(place.normalized))
    if (embedded) legend.currentState.locationName = embedded.name
    else if (explicitlyUnlocated.test(rawLocation.trim())) delete legend.currentState.locationName
  })

  return world
}

export function splitGeneratedWorldSections(world: GeneratedWorld): GeneratedWorldSections {
  const {
    factions, locations, places, processes, legendarium, legends, mysteries, routes, laws, mechanics,
    interfaceModules, interfaceBlueprint, metrics, ...coreWorld
  } = world.world
  return {
    core: { title: world.title, world: coreWorld, player: world.player, inventory: world.inventory },
    civilization: { world: { factions, locations, places, routes, laws, mechanics } },
    characters: {
      npcs: world.npcs,
      socialLinks: world.socialLinks,
      characterArcs: world.characterArcs,
      antagonistPlans: world.antagonistPlans,
      worldPressures: world.worldPressures,
      influenceAssets: world.influenceAssets,
    },
    legends: { world: { legendarium, legends }, lore: world.lore },
    narrative: {
      world: { processes, mysteries },
      worldEvents: world.worldEvents,
      factionReputation: world.factionReputation,
      threads: world.threads,
      mysteryCases: world.mysteryCases,
      quests: world.quests,
      opening: world.opening,
    },
    interface: { world: { interfaceModules, interfaceBlueprint, metrics } },
  }
}

function establishedFactsForStage(sections: Partial<GeneratedWorldSections>, stage: WorldGenerationStage) {
  return Object.fromEntries(Object.entries(sections).filter(([key]) => key !== stage))
}

async function generateWorldSection<T>(
  request: WorldGenerationRequest,
  concept: ConceptAnalysis,
  sections: Partial<GeneratedWorldSections>,
  stage: WorldGenerationStage,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } },
  issues?: string,
): Promise<T> {
  const establishedFacts = establishedFactsForStage(sections, stage)
  const currentSection = sections[stage]
  const messages = issues && currentSection
    ? worldGenerationStageRepairPrompt(request, concept, stage, establishedFacts, currentSection, issues)
    : worldGenerationStagePrompt(request, concept, stage, establishedFacts)
  const maxOutputTokens = stage === 'characters' || stage === 'legends' ? 65_536 : 49_152
  const raw = await completeJson(request.provider, messages, { stage: 'world', maxOutputTokens })
  return parseWithRepair<T>(raw, schema, request.provider, messages)
}

async function regenerateOwnedWorldSection(
  stage: WorldGenerationStage,
  sections: GeneratedWorldSections,
  request: WorldGenerationRequest,
  concept: ConceptAnalysis,
  issues: string,
): Promise<GeneratedWorldSections> {
  const next = { ...sections }
  if (stage === 'core') next.core = await generateWorldSection(request, concept, sections, stage, generatedWorldCoreSchema, issues)
  else if (stage === 'civilization') next.civilization = await generateWorldSection(request, concept, sections, stage, generatedWorldCivilizationSchema, issues)
  else if (stage === 'characters') next.characters = await generateWorldSection(request, concept, sections, stage, generatedWorldCharactersSchema, issues)
  else if (stage === 'legends') next.legends = await generateWorldSection(request, concept, sections, stage, generatedWorldLegendsSchema, issues)
  else if (stage === 'narrative') next.narrative = await generateWorldSection(request, concept, sections, stage, generatedWorldNarrativeSchema, issues)
  else next.interface = await generateWorldSection(request, concept, sections, stage, generatedWorldInterfaceSchema, issues)
  return next
}

async function ensureGeneratedWorldIntegrity(
  source: GeneratedWorldSections,
  request: WorldGenerationRequest,
  concept: ConceptAnalysis,
  report?: ProgressReporter,
): Promise<{ world: GeneratedWorld; sections: GeneratedWorldSections }> {
  let sections = source
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const world = normalizeGeneratedWorldReferences(assembleGeneratedWorldSections(sections), request.characterName)
    sections = splitGeneratedWorldSections(world)
    const strict = generatedWorldSchema.safeParse(world)
    if (strict.success) return { world: strict.data, sections: splitGeneratedWorldSections(strict.data) }

    const grouped = new Map<WorldGenerationStage, typeof strict.error.issues>()
    strict.error.issues.forEach((issue) => {
      const stage = worldStageForIssue(issue.path)
      grouped.set(stage, [...(grouped.get(stage) ?? []), issue])
    })
    const orderedStages: WorldGenerationStage[] = ['core', 'civilization', 'characters', 'legends', 'narrative', 'interface']
    for (const stage of orderedStages.filter((entry) => grouped.has(entry))) {
      const ownedIssues = grouped.get(stage) ?? []
      reportProgress(report, 80 + attempt * 2, 'world-integrity', `Исправляем только раздел «${stage}», не пересоздавая остальной мир`, 9, 11)
      sections = await regenerateOwnedWorldSection(
        stage,
        sections,
        request,
        concept,
        compactIssues({ issues: ownedIssues }, assembleGeneratedWorldSections(sections)),
      )
    }
  }

  const world = normalizeGeneratedWorldReferences(assembleGeneratedWorldSections(sections), request.characterName)
  const finalCheck = generatedWorldSchema.safeParse(world)
  if (finalCheck.success) return { world: finalCheck.data, sections: splitGeneratedWorldSections(finalCheck.data) }
  throw new Error(`DeepSeek не смог связать разделы мира после четырёх точечных исправлений: ${compactIssues(finalCheck.error, world)}`)
}

function qualityRepairStages(review: WorldQualityReview): WorldGenerationStage[] {
  const stages = new Set<WorldGenerationStage>()
  const locations = [...review.coverageAudit.map((entry) => entry.location), ...review.constraintAudit.map((entry) => entry.location)]
  locations.filter(Boolean).forEach((location) => stages.add(worldStageForIssue(String(location).replaceAll('[', '.').replaceAll(']', '').split('.').filter(Boolean))))
  const text = JSON.stringify(review).toLocaleLowerCase('ru-RU')
  const addWhen = (pattern: RegExp, stage: WorldGenerationStage) => { if (pattern.test(text)) stages.add(stage) }
  addWhen(/abilit|capabilitysystem/, 'characters')
  addWhen(/player|hero|inventory|artifact|abilit|startingaccess|геро|инвентар|артеф|способност|предмет/, 'core')
  addWhen(/faction|location|place|route|law|mechanic|географ|фракц|локац|маршрут|закон|механик/, 'civilization')
  addWhen(/npc|character|threatprofile|sociallink|worldpressure|персонаж|нпс|угроз|давлен/, 'characters')
  addWhen(/legend|legendarium|lore|миф|легенд|предан/, 'legends')
  addWhen(/opening|process|worldevent|thread|quest|mystery|сцен|процесс|событ|нить|квест|тайн/, 'narrative')
  addWhen(/interface|blueprint|metric|binding|интерфейс|метрик|привяз/, 'interface')
  return stages.size ? [...stages] : ['core', 'civilization', 'characters', 'legends', 'narrative', 'interface']
}

export async function generateWorld(request: WorldGenerationRequest, report?: ProgressReporter): Promise<GeneratedWorld> {
  reportProgress(report, 3, 'concept', 'Разбираем замысел, героя и ограничения', 1, 11)
  if (request.provider.provider === 'demo') {
    reportProgress(report, 96, 'assembling', 'Собираем адаптивный демонстрационный мир', 10, 11)
    return demoWorld(request)
  }
  const analysisMessages = conceptAnalystPrompt(request)
  const rawAnalysis = await completeJson(request.provider, analysisMessages)
  let concept = await parseWithRepair<ConceptAnalysis>(rawAnalysis, conceptAnalysisSchema, request.provider, analysisMessages)
  if (concept.recognizedCanon) {
    reportProgress(report, 10, 'canon', 'Сверяем канон, эпоху и заявленные силы', 2, 11)
    const verifierMessages = canonVerifierPrompt(request, concept)
    concept = await optionalStage<ConceptAnalysis>('canon-verifier', async () => {
      const verified = await completeJson(request.provider, verifierMessages)
      return parseWithRepair<ConceptAnalysis>(verified, conceptAnalysisSchema, request.provider, verifierMessages)
    }, concept)
  }

  const sections: Partial<GeneratedWorldSections> = {}
  reportProgress(report, 18, 'world-core', 'Создаём фундамент мира, героя, способности и предметы', 3, 11)
  sections.core = await generateWorldSection(request, concept, sections, 'core', generatedWorldCoreSchema)
  reportProgress(report, 30, 'world-civilization', 'Строим географию, общества, законы и механику мира', 4, 11)
  sections.civilization = await generateWorldSection(request, concept, sections, 'civilization', generatedWorldCivilizationSchema)
  reportProgress(report, 42, 'world-characters', 'Населяем мир самостоятельными и сильными персонажами', 5, 11)
  sections.characters = await generateWorldSection(request, concept, sections, 'characters', generatedWorldCharactersSchema)
  reportProgress(report, 55, 'world-legends', 'Создаём эпохи, легендарных личностей и глубокий лор', 6, 11)
  sections.legends = await generateWorldSection(request, concept, sections, 'legends', generatedWorldLegendsSchema)
  reportProgress(report, 67, 'world-narrative', 'Запускаем автономные процессы и готовим первую сцену', 7, 11)
  sections.narrative = await generateWorldSection(request, concept, sections, 'narrative', generatedWorldNarrativeSchema)
  reportProgress(report, 76, 'world-interface', 'Проектируем интерфейс по уже созданным фактам мира', 8, 11)
  sections.interface = await generateWorldSection(request, concept, sections, 'interface', generatedWorldInterfaceSchema)

  reportProgress(report, 80, 'world-integrity', 'Проверяем все связи между разделами мира', 9, 11)
  let integrity = await ensureGeneratedWorldIntegrity(sections as GeneratedWorldSections, request, concept, report)
  let world = integrity.world
  let completeSections = integrity.sections
  if (world.inventory.some((item) => item.category === 'artifact' && item.artifact)) {
    world = await repairGeneratedWorldArtifacts(world, request, concept, report)
    completeSections = splitGeneratedWorldSections(world)
    integrity = await ensureGeneratedWorldIntegrity(completeSections, request, concept, report)
    world = integrity.world
    completeSections = integrity.sections
  }
  const maxRewrites = 2

  for (let attempt = 0; attempt <= maxRewrites; attempt += 1) {
    reportProgress(report, 88 + attempt * 3, 'quality', attempt === 0 ? 'Проверяем полноту, канон и глубину мира' : `Перепроверяем точечно улучшенные разделы: проход ${attempt + 1}`, 10, 11)
    const reviewMessages = worldQualityCriticPrompt(request, concept, world)
    const fallbackReview: WorldQualityReview = {
      pass: true,
      coverage: 100,
      issues: [],
      missingCapabilities: [],
      coverageAudit: [],
      constraintAudit: [],
      rewriteInstructions: '',
    }
    const review = await optionalStage<WorldQualityReview>('world-quality', async () => {
      const rawReview = await completeJson(request.provider, reviewMessages)
      return parseWithRepair<WorldQualityReview>(rawReview, worldQualityReviewSchema, request.provider, reviewMessages)
    }, fallbackReview)
    const artifactQuality = generatedWorldArtifactQuality(world)
    const artifactCriticIssues = (await Promise.all(world.inventory
      .filter((item) => item.category === 'artifact' && item.artifact)
      .map(async (item) => {
        try {
          const messages = artifactQualityCriticPrompt(
            item,
            artifactQuality.registry.filter((entry) => entry.artifactId !== artifactCandidate(item as PlannedArtifactItem).id),
            { world: world.world, concept, canonMode: request.canonMode },
          )
          const raw = await completeJson(request.provider, messages)
          const parsed = artifactQualityReviewSchema.safeParse(normalizeModelOutput(raw))
          if (!parsed.success) return []
          return parsed.data.verdict === 'rebuild' ? parsed.data.issues : []
        } catch {
          return []
        }
      }))).flat()
    const accessIssues = startingAccessIssues(concept, world)
    const artifactIssues = [...new Set([...artifactQuality.issues, ...artifactCriticIssues])]
    const abilityQuality = generatedWorldAbilityQuality(world)
    const abilityIssues = abilityQuality.issues
    const mechanicalIssues = [...accessIssues, ...artifactIssues, ...abilityIssues]
    const effectiveReview: WorldQualityReview = mechanicalIssues.length ? {
      ...review,
      pass: false,
      issues: [...review.issues, {
        type: 'mechanics',
        entity: abilityIssues.length ? 'Система способностей мира' : artifactIssues.length ? 'Стартовые артефакты мира' : world.player.name,
        detail: mechanicalIssues.join(' '),
        severity: 'high',
      }],
      rewriteInstructions: `${review.rewriteInstructions} Исправь startingAccess, артефакты и способности без изменения пользовательского замысла: ${mechanicalIssues.join(' ')}`.trim(),
    } : review
    const hasBlockingIssue = effectiveReview.issues.some((issue) => issue.severity === 'high' && ['canon', 'completeness', 'mechanics', 'consistency'].includes(issue.type))
      || effectiveReview.coverageAudit.some((entry) => entry.importance !== 'minor' && entry.status !== 'covered')
      || effectiveReview.constraintAudit.some((entry) => entry.verdict === 'unsupported' || entry.verdict === 'wrong-continuity')
    const requiredCoverage = concept.recognizedCanon ? 95 : 90
    if (effectiveReview.pass && effectiveReview.coverage >= requiredCoverage && !hasBlockingIssue) {
      reportProgress(report, 97, 'finalizing', 'Все разделы мира проверены и готовы к сохранению', 11, 11)
      return world
    }
    if (attempt === maxRewrites) {
      if (abilityQuality.hardIssues.length) {
        throw new Error(`DeepSeek не смог механически завершить новые способности после двух точечных пересборок: ${abilityQuality.hardIssues.join(' ')}`)
      }
      console.warn(`[model:world-quality] Мир возвращён после ${maxRewrites} точечных содержательных переработок; итоговое покрытие ${effectiveReview.coverage}%.`)
      reportProgress(report, 97, 'finalizing', 'Завершаем лучший проверенный вариант мира', 11, 11)
      return world
    }

    const repairSummary = JSON.stringify(effectiveReview)
    for (const stage of qualityRepairStages(effectiveReview)) {
      reportProgress(report, 90 + attempt * 3, 'world-section-rewrite', `Улучшаем только раздел «${stage}» по замечаниям редактора`, 10, 11)
      completeSections = await regenerateOwnedWorldSection(stage, completeSections, request, concept, repairSummary)
    }
    integrity = await ensureGeneratedWorldIntegrity(completeSections, request, concept, report)
    world = integrity.world
    completeSections = integrity.sections
  }

  reportProgress(report, 97, 'finalizing', 'Мир готов к сохранению', 11, 11)
  return world
}
