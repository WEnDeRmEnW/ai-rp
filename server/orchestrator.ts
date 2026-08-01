import type { Ability, AbilityDraft, AbilityProfileDraft, Campaign, CampaignEditRequest, CampaignEditResponse, InventoryItem, NarrativeEventDecision, NarrativeEventProposal, NarrativeEventRequirement, OperationProgress, TurnPatch, TurnRequest, TurnResponse, WorkshopEventDirective, WorldCapabilitySystem, WorldCapabilitySystemDraft, WorldGenerationRequest, WorldQuestionRequest, WorldQuestionResponse } from '../shared/types.js'
import { randomUUID } from 'node:crypto'
import { applyNarrativeEventProposal, applyWorkshopEventDirective, defaultEventDirectorSettings, forcedWorkshopEventDecision, narrativeEventComplianceIssues, narrativeEventKnownIds, normalizeEventDirectorState, normalizeNarrativeEventProposal, prepareEventDirectorState, shouldConsultEventDirector, validateNarrativeEventProposal } from '../shared/event-director.js'
import { demoTurn, demoWorld } from './demo.js'
import { completeAuxiliaryJson, completeJson, completeText, completionScopeStats } from './provider.js'
import { normalizeModelOutput, normalizeTurnPlan } from './model-normalizer.js'
import { abilityExecutionRepairPrompt, abilityFocusedRepairPrompt, abilityProfileAuthoringPrompt, abilityQualityCriticPrompt, artifactFocusedRepairPrompt, artifactQualityCriticPrompt, backgroundSimulatorPrompt, campaignEditorPrompt, canonVerifierPrompt, conceptAnalystPrompt, consequenceAuditorPrompt, continuityCriticPrompt, directorPrompt, eventComplianceRepairPrompt, eventDirectorPrompt, memoryCuratorPrompt, narrativeRepetitionRevisionPrompt, narratorPrompt, progressionAuditPrompt, revisionPrompt, worldGenerationCharacterTopologyPrompt, worldGenerationManifestOriginalityRepairPrompt, worldGenerationManifestPrompt, worldGenerationNpcBatchPrompt, worldGenerationStagePrompt, worldGenerationStageRepairPrompt, worldQualityCriticPrompt, worldQuestionPrompt, type WorldGenerationStage } from './prompts.js'
import { abilityFocusedRepairSchema, abilityProfileAuthoringSchema, abilityQualityReviewSchema, artifactQualityReviewSchema, artifactRewardRepairSchema, backgroundSimulationSchema, campaignEditResponseSchema, conceptAnalysisSchema, consequenceAuditSchema, continuityReviewSchema, generatedWorldCharactersSchema, generatedWorldCharacterTopologySchema, generatedWorldCivilizationSchema, generatedWorldCoreSchema, generatedWorldDraftSchema, generatedWorldInterfaceSchema, generatedWorldLegendsSchema, generatedWorldNarrativeSchema, generatedWorldNpcBatchSchema, generatedWorldSchema, memoryCuratorSchema, narrativeEventDecisionSchema, progressionAuditSchema, turnPatchSchema, turnPlanSchema, worldGenerationManifestSchema, worldQualityReviewSchema, type AbilityProfileAuthoringResponse, type AbilityQualityReview, type ArtifactQualityReview, type ConceptAnalysis, type ConsequenceAudit, type GeneratedWorld, type GeneratedWorldCharacters, type GeneratedWorldCharacterTopology, type GeneratedWorldCivilization, type GeneratedWorldCore, type GeneratedWorldInterface, type GeneratedWorldLegends, type GeneratedWorldNarrative, type GeneratedWorldNpcBatch, type WorldGenerationManifest, type WorldQualityReview } from './schemas.js'
import { assessItemRarity, rarityOrder, rarityRequirementDeficits } from '../shared/rarity.js'
import { artifactNoveltyIssues, artifactNoveltyScore, updateArtifactRegistry } from '../shared/artifacts.js'
import { resolveActionCheck } from './resolution.js'
import { tokenize } from '../shared/context.js'
import { sanitizePlayerAgency } from './agency-guard.js'
import { findNarrativeRepetitionIssues, narrativeRepetitionScore, removeNarrativeRepetitionParagraphs } from '../shared/narrative-repetition.js'
import { abilityExecutionIssues, abilityNoveltyIssues, abilityNoveltyScore, abilityProfileIssues, reconcileAbilityExecutionCosts, updateAbilityRegistry } from '../shared/abilities.js'
import { grantedItemAbilities } from '../shared/effective-abilities.js'
import { workshopStateResponseIssues } from './workshop-intent.js'
import { generatedWorldOriginalityIssues, worldManifestOriginalityIssues } from './world-originality.js'
import { requestedArtifactRarity } from './artifact-intent.js'
import { analyzeWorldRequestIntent } from './world-intent.js'
import { itemOwnedAbilityMatch } from '../shared/ability-ownership.js'

export { requestedArtifactRarity } from './artifact-intent.js'

type ProgressReporter = (progress: OperationProgress) => void

interface ProgressClock {
  startedAt: number
  lastReportedAt: number
}

const progressClocks = new WeakMap<ProgressReporter, ProgressClock>()

function reportProgress(
  report: ProgressReporter | undefined,
  percent: number,
  stage: string,
  detail: string,
  completedSteps?: number,
  totalSteps?: number,
  parallelTasks?: string[],
  previewNarrative?: string,
) {
  if (!report) return
  const now = performance.now()
  const clock = progressClocks.get(report) ?? { startedAt: now, lastReportedAt: now }
  const providerStats = completionScopeStats()
  report({
    percent,
    stage,
    detail,
    completedSteps,
    totalSteps,
    elapsedMs: Math.round(now - clock.startedAt),
    stageElapsedMs: Math.round(now - clock.lastReportedAt),
    parallelTasks,
    cacheHits: providerStats?.cacheHits,
    providerCalls: providerStats?.providerCalls,
    providerTimeMs: providerStats?.providerTimeMs,
    providerWallMs: providerStats?.providerWallMs,
    peakProviderConcurrency: providerStats?.peakProviderConcurrency,
    previewNarrative,
  })
  clock.lastReportedAt = now
  progressClocks.set(report, clock)
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
  const group = system.groups.find((entry) => entry.id === draft.profile!.nature.groupId || entry.label.trim().toLocaleLowerCase('ru-RU') === normalizedGroup)
  const groupId = group?.id ?? draft.profile.nature.groupId
  const normalizedTier = draft.profile.standing.tierId.trim().toLocaleLowerCase('ru-RU')
  const tier = system.tiers.find((entry) => entry.id === draft.profile!.standing.tierId || entry.label.trim().toLocaleLowerCase('ru-RU') === normalizedTier)
  const tierId = tier?.id ?? draft.profile.standing.tierId
  return {
    ...draft,
    profile: {
      ...draft.profile,
      nature: { ...draft.profile.nature, groupId, ...(group ? { label: group.label } : {}) },
      standing: { ...draft.profile.standing, systemId: system.id, tierId, ...(tier ? { tierLabel: tier.label } : {}) },
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
  adaptCandidate?: (candidate: unknown) => unknown,
  policy: { maxAttempts?: number; fallbackBeforeRepair?: boolean } = {},
): Promise<T> {
  let candidate = raw
  let lastIssues = ''
  const maxAttempts = Math.max(1, Math.min(5, Math.round(policy.maxAttempts ?? 3)))
  const fallbackBeforeRepair = policy.fallbackBeforeRepair !== false

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    candidate = omitNullObjectFields(normalizeModelOutput(candidate))
    if (adaptCandidate) candidate = adaptCandidate(candidate)
    const parsed = schema.safeParse(candidate)
    if (parsed.success) return parsed.data
    lastIssues = compactIssues(parsed.error, candidate)
    if (fallbackBeforeRepair) {
      const recovered = fallback?.(candidate)
      if (recovered !== undefined) return recovered
    }
    if (attempt === maxAttempts - 1) break

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
  throw new Error(`DeepSeek не смог завершить обязательную структуру после ${maxAttempts} точечных попыток: ${lastIssues}`)
}

function asModelRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/**
 * Keeps every independently valid mutation instead of rejecting a whole turn because one
 * optional array entry or nested world field is malformed. Nothing is invented here: accepted
 * values must still pass the canonical TurnPatch schema on their own and in the final aggregate.
 */
export function salvageTurnPatch(candidate: unknown): ReturnType<typeof turnPatchSchema.parse> {
  const complete = turnPatchSchema.safeParse(candidate)
  if (complete.success) return complete.data
  const source = asModelRecord(omitNullObjectFields(normalizeModelOutput(candidate)))
  if (!source) return turnPatchSchema.parse({})
  let accepted: ReturnType<typeof turnPatchSchema.parse> = turnPatchSchema.parse({})

  const accept = (key: string, value: unknown) => {
    const next = turnPatchSchema.safeParse({ ...accepted, [key]: value })
    if (!next.success) return false
    accepted = next.data
    return true
  }

  for (const [key, rawValue] of Object.entries(source)) {
    if (accept(key, rawValue)) continue

    if (Array.isArray(rawValue)) {
      const validEntries: unknown[] = []
      for (const entry of rawValue) {
        const candidateEntries = [...validEntries, entry]
        const parsed = turnPatchSchema.safeParse({ ...accepted, [key]: candidateEntries })
        if (parsed.success) validEntries.push(entry)
      }
      if (validEntries.length) accept(key, validEntries)
      continue
    }

    const nested = asModelRecord(rawValue)
    if (!nested) continue
    let acceptedNested: Record<string, unknown> = {}
    for (const [nestedKey, nestedValue] of Object.entries(nested)) {
      const parsed = turnPatchSchema.safeParse({ ...accepted, [key]: { ...acceptedNested, [nestedKey]: nestedValue } })
      if (parsed.success) acceptedNested = { ...acceptedNested, [nestedKey]: nestedValue }
    }
    if (Object.keys(acceptedNested).length) accept(key, acceptedNested)
  }
  return accepted
}

export function salvageTurnPlan(candidate: unknown): ReturnType<typeof turnPlanSchema.parse> | undefined {
  const normalized = omitNullObjectFields(normalizeTurnPlan(candidate))
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return undefined
  const record = normalized as Record<string, unknown>
  const authoredBeats = Array.isArray(record.beats) ? record.beats.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim())).slice(0, 8) : []
  const outcome = typeof record.outcome === 'string' && record.outcome.trim()
    ? record.outcome.trim()
    : authoredBeats[0]?.trim() ?? ''
  const beats = authoredBeats.length ? authoredBeats : outcome ? [outcome] : []
  const suggestions = Array.isArray(record.suggestions) ? record.suggestions.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim())).slice(0, 4) : []
  if (!outcome || beats.length === 0) return undefined
  const patch = salvageTurnPatch(record.statePatch)
  const rawExecutions = Array.isArray(record.abilityExecutions) ? record.abilityExecutions : []
  const abilityExecutions: unknown[] = []
  for (const execution of rawExecutions) {
    const parsed = turnPlanSchema.safeParse({ outcome, beats, suggestions, abilityExecutions: [...abilityExecutions, execution], statePatch: patch })
    if (parsed.success) abilityExecutions.push(execution)
  }
  const salvaged = turnPlanSchema.safeParse({
    outcome,
    beats,
    suggestions,
    abilityExecutions,
    statePatch: patch,
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

const CONSEQUENCE_DOMAINS: ConsequenceDomain[] = [
  'health', 'resources', 'stats', 'conditions', 'inventory', 'equipment', 'abilities', 'artifacts',
  'currency', 'relationships', 'quests', 'characters', 'conflict', 'scene_time', 'world', 'world_pressure', 'knowledge',
]

const consequenceSignal = /(?:ран(?:а|ен|ил)|кров|урон|удар|убил|погиб|смерт|леч|исцел|отрав|ожог|перелом|потерял|лишил|украл|забрал|получил|наш[её]л|купил|продал|заплат|потрат|экипир|снял|улучш|пробуд|разблок|изучил|научил|отношени|довер|страх|репутац|задани|квест|вступил|покинул|телепорт|перемест|прошл[оа]\s+врем|день|час|войн|катастроф|закон|фракц|артефакт|способност|техник)/iu
const backgroundSignal = /(?:отправля|путешеств|еду\b|лечу\b|плыву\b|перехожу|прибыва|покида|жду\b|сплю\b|несколько\s+(?:час|дн|нед)|проходит\s+(?:время|час|день)|тем временем|перенес[иите]+\s+сцен)/iu

type RuntimeQualityMode = NonNullable<Campaign['settings']['qualityMode']>

function runtimeQualityMode(campaign: Campaign): RuntimeQualityMode {
  return campaign.settings.qualityMode ?? 'balanced'
}

const RUNTIME_POLICIES = {
  fast: {
    schemaAttempts: 2,
    providerAttempts: 1,
    transportAttempts: 1,
    backgroundCadence: 8,
    artifactRepairs: 1,
    abilityRepairs: 1,
    semanticCritics: 'never' as const,
    consequenceAudit: 'exceptional' as const,
    auditRounds: 1,
    referenceRepairs: 0,
    memoryCadence: 12,
  },
  balanced: {
    schemaAttempts: 2,
    providerAttempts: 2,
    transportAttempts: 2,
    backgroundCadence: 5,
    artifactRepairs: 2,
    abilityRepairs: 1,
    semanticCritics: 'on-issue' as const,
    consequenceAudit: 'missing-signal' as const,
    auditRounds: 1,
    referenceRepairs: 1,
    memoryCadence: 8,
  },
  deep: {
    schemaAttempts: 3,
    providerAttempts: 3,
    transportAttempts: 3,
    backgroundCadence: 3,
    artifactRepairs: 3,
    abilityRepairs: 2,
    semanticCritics: 'always' as const,
    consequenceAudit: 'always-on-risk' as const,
    auditRounds: 3,
    referenceRepairs: 2,
    memoryCadence: 4,
  },
} as const

const WORLD_GENERATION_POLICIES = {
  fast: {
    schemaAttempts: 2,
    providerAttempts: 1,
    transportAttempts: 1,
    originalityRepairs: 1,
    manifestRepairs: 1,
    artifactRepairs: 1,
    qualityRewrites: 1,
    semanticCritics: false,
    stageAttempts: 3,
  },
  balanced: {
    schemaAttempts: 2,
    providerAttempts: 2,
    transportAttempts: 2,
    originalityRepairs: 1,
    manifestRepairs: 1,
    artifactRepairs: 2,
    qualityRewrites: 1,
    semanticCritics: false,
    stageAttempts: 4,
  },
  deep: {
    schemaAttempts: 3,
    providerAttempts: 3,
    transportAttempts: 3,
    originalityRepairs: 2,
    manifestRepairs: 2,
    artifactRepairs: 3,
    qualityRewrites: 2,
    semanticCritics: true,
    stageAttempts: 5,
  },
} as const

function backgroundSimulationDue(campaign: Campaign, input: string, actionType: TurnRequest['actionType'], mode = runtimeQualityMode(campaign)) {
  const nextTurn = campaign.turn + 1
  const baseCadence = RUNTIME_POLICIES[mode].backgroundCadence
  const cadence = campaign.settings.worldDynamics === 'volatile'
    ? Math.max(2, baseCadence - 2)
    : campaign.settings.worldDynamics === 'quiet'
      ? baseCadence + 2
      : baseCadence
  if (nextTurn % cadence === 0 || actionType === 'story' || backgroundSignal.test(input)) return true
  if ((campaign.worldEvents ?? []).some((event) => event.status === 'due' || (event.dueTurn !== undefined && event.dueTurn <= nextTurn))) return true
  if ((campaign.threads ?? []).some((thread) => thread.status === 'active' && thread.dueTurn !== undefined && thread.dueTurn <= nextTurn)) return true
  if ((campaign.world.processes ?? []).some((process) => process.status === 'active' && process.dueTurn !== undefined && process.dueTurn <= nextTurn)) return true
  return campaign.npcs.some((npc) => npc.initiative?.urgency !== undefined && npc.initiative.urgency >= 85 && npc.initiative.lastAdvancedTurn < campaign.turn)
}

function parseOptionalModelOutput<T>(
  raw: unknown,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } },
): T {
  const parsed = schema.safeParse(raw)
  if (parsed.success) return parsed.data
  throw new Error(compactIssues(parsed.error, raw))
}

function patchNeedsConsequenceAudit(patch: TurnPatch) {
  const highRiskKeys: Array<keyof TurnPatch> = [
    'inventory', 'playerProfile', 'upsertStats', 'removeStatKeys', 'upsertResources', 'removeResourceKeys',
    'statDeltas', 'resourceDeltas', 'upsertCurrency', 'currencyDeltas', 'addAbilities', 'removeAbilityIds', 'abilityChanges',
    'artifactChanges', 'addConditions', 'removeConditions', 'upsertStatusEffects', 'removeStatusEffectIds',
    'relationships', 'npcs', 'quests', 'conflict', 'world', 'socialLinks', 'party', 'factionReputationDeltas',
    'upsertFactionReputation', 'upsertCharacterArcs', 'upsertMysteryCases', 'upsertAntagonistPlans',
    'upsertWorldPressures', 'upsertInfluenceAssets', 'removeInfluenceAssetIds',
  ]
  return highRiskKeys.some((key) => {
    const value = patch[key]
    if (Array.isArray(value)) return value.length > 0
    return Boolean(value && (typeof value !== 'object' || Object.keys(value).length > 0))
  })
}

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
  const itemOwnedAbilityIds = new Set<string>()
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
  if (plan.statePatch.addAbilities?.length) {
    const ownershipInventory = [
      ...campaign.inventory,
      ...(plan.statePatch.inventory ?? []).flatMap((mutation) => mutation.operation === 'add' ? [mutation.item] : []),
    ]
    plan.statePatch.addAbilities = plan.statePatch.addAbilities.filter((ability) => {
      const itemOwned = itemOwnedAbilityMatch(ability, ownershipInventory)
      if (!itemOwned) return true
      if (ability.id && !campaign.player.abilities.some((current) => current.id === ability.id)) {
        knownAbilities.delete(ability.id)
        itemOwnedAbilityIds.add(ability.id)
      }
      notes.push(`Сила «${ability.name}» сохранена только у предмета «${itemOwned.itemName}» и не продублирована как личная способность героя.`)
      return false
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
  const unknownAbilityChangeCount = plan.statePatch.abilityChanges?.filter((change) => !knownAbilities.has(change.abilityId) && !itemOwnedAbilityIds.has(change.abilityId)).length ?? 0
  plan.statePatch.abilityChanges = plan.statePatch.abilityChanges?.filter((change) => knownAbilities.has(change.abilityId)).map((change) => {
    if (change.mastery !== undefined && change.masteryDelta !== undefined) {
      delete change.masteryDelta
      notes.push('В развитии способности абсолютное mastery сохранено, дублирующая masteryDelta отброшена.')
    }
    const ability = campaign.player.abilities.find((candidate) => candidate.id === change.abilityId)
    sanitizeTechniquePatch((ability?.techniques ?? []).map((technique) => technique.id), change, ability?.name ?? change.abilityId)
    return change
  })
  if ((plan.statePatch.abilityChanges?.length ?? 0) < abilityChangeCount && unknownAbilityChangeCount > 0) reject('Отклонено развитие неизвестной способности.', ['abilities'])
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
      ...(plan.statePatch.npcs ?? []).flatMap((mutation) => (
        mutation.operation === 'update' && mutation.npc.status && !['dead', 'missing'].includes(mutation.npc.status)
          ? [mutation.targetId]
          : []
      )),
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
    upsertCurrency: { ...(background.upsertCurrency ?? {}), ...(foreground.upsertCurrency ?? {}) },
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
  additional.upsertCurrency = omitRecordedKeys(additional.upsertCurrency, base.upsertCurrency)
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

function artifactMeetsRequestedRarity(item: PlannedArtifactItem, requested: typeof rarityOrder[number] | undefined) {
  if (!requested) return true
  const assessment = assessItemRarity(item)
  return rarityOrder.indexOf(assessment.rarity) >= rarityOrder.indexOf(requested)
    && rarityRequirementDeficits(assessment, requested).length === 0
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
  const repairableHardIssues: string[] = []
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
    const profileIssues = abilityProfileIssues(candidate, system, resources)
    hardIssues.push(...profileIssues)
    if (draft.profile) {
      repairableHardIssues.push(...profileIssues)
      noveltyIssues.push(...abilityNoveltyIssues(candidate, registry))
    } else {
      hardIssues.push(`Новая способность «${draft.name}» не имеет полного авторского профиля.`)
    }
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
  const uniqueRepairableHardIssues = [...new Set(repairableHardIssues)]
  const uniqueNoveltyIssues = [...new Set(noveltyIssues)]
  return { issues: [...new Set([...uniqueRepairableHardIssues, ...uniqueNoveltyIssues])], hardIssues: uniqueHardIssues, noveltyIssues: uniqueNoveltyIssues, registry }
}

async function repairGeneratedWorldArtifacts(
  source: GeneratedWorld,
  request: WorldGenerationRequest,
  concept: ConceptAnalysis,
  report?: ProgressReporter,
): Promise<GeneratedWorld> {
  const generationPolicy = WORLD_GENERATION_POLICIES[request.generationMode ?? 'balanced']
  const inventory = [...source.inventory]
  const initialRegistry = generatedWorldArtifactQuality(source).registry
  const worldContext = {
    title: source.title,
    world: source.world,
    player: source.player,
    inventory: source.inventory.map((item) => ({ id: plannedArtifactId(item as PlannedArtifactItem), name: item.name, rarity: item.rarity, origin: item.origin })),
  }

  const repairOne = async (
    initial: GeneratedWorld['inventory'][number],
    candidateRegistry: NonNullable<Campaign['artifactRegistry']>,
  ): Promise<GeneratedWorld['inventory'][number]> => {
    let current = initial as PlannedArtifactItem
    const identity = { id: plannedArtifactId(current), name: current.name, origin: current.origin }
    let issues = artifactItemQualityIssues(current, undefined, candidateRegistry)
    let best = current
    let bestIssues = issues
    let bestScore = artifactNoveltyScore(artifactCandidate(current), candidateRegistry) - issues.length * 12

    for (let attempt = 0; attempt < generationPolicy.artifactRepairs && issues.length; attempt += 1) {
      reportProgress(report, 83 + attempt, 'artifact-design', `Точечно улучшаем «${current.name}»: попытка ${attempt + 1} из ${generationPolicy.artifactRepairs}`, 9, 11)
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
        let criticPenalty = 0
        if (generationPolicy.semanticCritics) {
          const reviewMessages = artifactQualityCriticPrompt(current, candidateRegistry, { world: source.world, concept, canonMode: request.canonMode })
          try {
            const reviewRaw = await completeAuxiliaryJson(request.provider, reviewMessages, { maxOutputTokens: 4_096 }, (value) => artifactQualityReviewSchema.safeParse(normalizeModelOutput(value)).success)
            const review = artifactQualityReviewSchema.safeParse(normalizeModelOutput(reviewRaw))
            if (review.success) {
              criticPenalty = review.data.issues.length * 5 + (review.data.verdict === 'rebuild' ? 20 : 0)
              if (review.data.verdict === 'rebuild') issues = [...new Set([...issues, ...review.data.issues])]
            }
          } catch {
            // The deterministic six-axis check remains authoritative if the optional critic times out.
          }
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
    if (bestIssues.length) console.warn(`[artifact-quality] Best world artifact candidate retained for ${best.name}: ${bestIssues.join(' ')}`)
    return honestBest as GeneratedWorld['inventory'][number]
  }

  const artifactIndices = inventory.flatMap((item, index) => item.category === 'artifact' && item.artifact ? [index] : [])
  const repaired = await mapWithConcurrency(artifactIndices, Math.min(3, Math.max(1, artifactIndices.length)), async (index) => {
    const initial = inventory[index]
    const candidateRegistry = initialRegistry.filter((entry) => entry.artifactId !== artifactCandidate(initial as PlannedArtifactItem).id)
    return [index, await repairOne(initial, candidateRegistry)] as const
  })
  repaired.forEach(([index, item]) => { inventory[index] = item })

  // Independent drafts can rarely converge on the same new idea. Recheck the assembled set and
  // rerun only the colliding item against the already improved full registry.
  for (const index of artifactIndices) {
    const current = inventory[index]
    const plannedCurrent = current as PlannedArtifactItem
    const assembledRegistry = generatedWorldArtifactQuality({ ...source, inventory }).registry
      .filter((entry) => entry.artifactId !== artifactCandidate(plannedCurrent).id)
    if (!artifactNoveltyIssues(artifactCandidate(plannedCurrent), assembledRegistry).length) continue
    inventory[index] = await repairOne(current, assembledRegistry)
  }
  return { ...source, inventory }
}

export async function runTurn(request: TurnRequest, report?: ProgressReporter): Promise<TurnResponse> {
  reportProgress(report, 3, 'preparing', 'Проверяем ввод и собираем актуальное состояние', 1, 11)
  const check = resolveActionCheck(request.campaign, request.input, request.actionType)
  const qualityMode = runtimeQualityMode(request.campaign)
  const runtimePolicy = RUNTIME_POLICIES[qualityMode]
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
  const runBackgroundSimulation = backgroundSimulationDue(request.campaign, request.input, request.actionType, qualityMode)
  const backgroundPromise = runBackgroundSimulation
    ? optionalStage<ReturnType<typeof backgroundSimulationSchema.parse>>('background', async () => {
      const rawBackground = await completeJson(request.provider, backgroundMessages, {
        maxAttempts: 1,
        transportAttempts: 1,
        timeoutMs: 45_000,
      })
      return parseOptionalModelOutput(rawBackground, backgroundSimulationSchema)
    }, emptyBackground)
    : Promise.resolve(emptyBackground)
  const quietEventDecision: NarrativeEventDecision = { mode: 'none', reason: 'История ещё не накопила готовность к отдельному повороту.' }
  const forcedWorkshopEvent = forcedWorkshopEventDecision(preparedEventState, request.campaign.turn + 1)
  const eventConsultationNeeded = Boolean(forcedWorkshopEvent) || shouldConsultEventDirector(request.campaign, preparedEventState)
  const requestEventDecision = async (eventMessages: ReturnType<typeof eventDirectorPrompt>) => optionalStage<NarrativeEventDecision>('event-director', async () => {
    const rawDecision = await completeJson(request.provider, eventMessages, {
      maxAttempts: 1,
      transportAttempts: 1,
      timeoutMs: 45_000,
    })
    let decision = await parseWithRepair<NarrativeEventDecision>(rawDecision, narrativeEventDecisionSchema, request.provider, eventMessages, undefined, undefined, { maxAttempts: runtimePolicy.schemaAttempts })
    if (decision.mode !== 'none') decision = normalizeNarrativeEventProposal(decision)
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
      const retryRaw = await completeJson(request.provider, retryMessages, {
        maxAttempts: 1,
        transportAttempts: 1,
        timeoutMs: 45_000,
      })
      decision = await parseWithRepair<NarrativeEventDecision>(retryRaw, narrativeEventDecisionSchema, request.provider, retryMessages, undefined, undefined, { maxAttempts: runtimePolicy.schemaAttempts })
      if (decision.mode !== 'none') decision = normalizeNarrativeEventProposal(decision)
      issues = validateNarrativeEventProposal(request.campaign, preparedEventState, decision)
    }
    if (decision.mode !== 'none' && issues.length) {
      console.warn(`[event-director] Предложение безопасно отложено: ${issues.join(' ')}`)
      return { mode: 'none', reason: `Предложение отложено программной проверкой: ${issues.join(' ')}` }
    }
    return decision
  }, { mode: 'none', reason: 'Этап необычного события не завершился и был безопасно пропущен.' })
  const requestDirectorPlan = async (candidate: ReturnType<typeof directorPrompt>) => {
    const rawPlan = await completeJson(request.provider, candidate.messages, {
      maxAttempts: runtimePolicy.providerAttempts,
      transportAttempts: runtimePolicy.transportAttempts,
      timeoutMs: 120_000,
    })
    return parseWithRepair(rawPlan, turnPlanSchema, request.provider, candidate.messages, salvageTurnPlan, undefined, { maxAttempts: runtimePolicy.schemaAttempts })
  }
  // Speculation is useful only on the common quiet path. When background simulation or an event
  // consultation is already due, starting a plan early usually wastes a full provider call because
  // those results change the authoritative prompt.
  const canSpeculatePlan = !runBackgroundSimulation && !eventConsultationNeeded
  const speculativeEventMessages = eventConsultationNeeded && !forcedWorkshopEvent && !runBackgroundSimulation
    ? eventDirectorPrompt(request.campaign, request.input, emptyBackground, preparedEventState)
    : undefined
  const speculativeEventPromise = speculativeEventMessages
    ? requestEventDecision(speculativeEventMessages)
      .then((decision) => ({ ok: true as const, decision }))
      .catch((error: unknown) => ({ ok: false as const, error }))
    : undefined
  const speculativeDirector = directorPrompt(request.campaign, request.input, request.actionType, check, emptyBackground, quietEventDecision)
  const speculativePlanPromise = canSpeculatePlan
    ? requestDirectorPlan(speculativeDirector)
      .then((plan) => ({ ok: true as const, plan, director: speculativeDirector }))
      .catch((error: unknown) => ({ ok: false as const, error }))
    : undefined
  const background = await backgroundPromise
  const exactEmptyBackground = background.signals.length === 0 && Object.keys(background.statePatch).length === 0
  let eventDecision: NarrativeEventDecision = forcedWorkshopEvent ?? quietEventDecision
  let eventDirectorConsulted = Boolean(forcedWorkshopEvent)
  if (eventConsultationNeeded && !forcedWorkshopEvent) {
    eventDirectorConsulted = true
    reportProgress(report, 17, 'event-director', 'Проверяем, созрело ли редкое необычное событие', 3, 11)
    const speculativeEvent = exactEmptyBackground ? await speculativeEventPromise : undefined
    if (speculativeEvent && !speculativeEvent.ok) console.warn('[orchestrator:speculative-event] ignored', speculativeEvent.error)
    eventDecision = speculativeEvent?.ok
      ? speculativeEvent.decision
      : await requestEventDecision(eventDirectorPrompt(request.campaign, request.input, background, preparedEventState))
  }
  reportProgress(report, 26, 'directing', 'Режиссёр строит причинный план и последствия', 4, 11)
  let director = directorPrompt(request.campaign, request.input, request.actionType, check, background, eventDecision)
  const speculativeResult = exactEmptyBackground && eventDecision.mode === 'none' && speculativePlanPromise
    ? await speculativePlanPromise
    : undefined
  if (speculativeResult && !speculativeResult.ok) console.warn('[orchestrator:speculative-plan] falling back to the authoritative plan', speculativeResult.error)
  const speculative = speculativeResult?.ok ? speculativeResult : undefined
  if (speculative) director = speculative.director
  const createPlan = () => requestDirectorPlan(director)
  let validPlan = speculative?.plan ?? await createPlan()
  const reviewedArtifactSignatures = new Set<string>()
  const reviewedAbilitySignatures = new Set<string>()

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
      const shouldUseCritic = runtimePolicy.semanticCritics === 'always'
        || (runtimePolicy.semanticCritics === 'on-issue' && deterministicIssues.length > 0)
      if (!shouldUseCritic) return fallbackReview(item, deterministicIssues, registry)
      try {
        const messages = artifactQualityCriticPrompt(item, registry, worldContext)
        const raw = await completeAuxiliaryJson(request.provider, messages, { maxOutputTokens: 4_096 }, (value) => artifactQualityReviewSchema.safeParse(normalizeModelOutput(value)).success)
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
      const initialSignature = JSON.stringify(artifactCandidate(current, request.campaign.turn))
      if (reviewedArtifactSignatures.has(initialSignature)) {
        workingRegistry = updateArtifactRegistry(workingRegistry, artifactCandidate(current, request.campaign.turn), 'active', request.campaign.turn)
        continue
      }
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
      let bestRequested = artifactMeetsRequestedRarity(current, requested)
        ? { item: current, issues: currentIssues, review: currentReview, score: bestScore }
        : undefined

      for (let focusedAttempt = 0; focusedAttempt < runtimePolicy.artifactRepairs; focusedAttempt += 1) {
        const criticIssues = currentReview.verdict === 'rebuild' ? currentReview.issues : []
        const repairIssues = [...new Set([...currentIssues, ...criticIssues])]
        if (!repairIssues.length && currentReview.verdict !== 'rebuild') break
        reportProgress(report, 33 + focusedAttempt * 2, 'artifact-quality', `Точечно улучшаем артефакт класса ${requiredRarity}: попытка ${focusedAttempt + 1} из ${runtimePolicy.artifactRepairs}`, 5, 11)
        const repairMessages = artifactFocusedRepairPrompt({ world: worldContext, input: request.input }, plan, current, requiredRarity, repairIssues)
        try {
          const repairedRaw = await completeJson(request.provider, repairMessages, {
            maxAttempts: runtimePolicy.providerAttempts,
            transportAttempts: runtimePolicy.transportAttempts,
            timeoutMs: 90_000,
          })
          const repaired = await parseWithRepair(repairedRaw, artifactRewardRepairSchema, request.provider, repairMessages, undefined, undefined, { maxAttempts: runtimePolicy.schemaAttempts })
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
          if (artifactMeetsRequestedRarity(current, requested) && (!bestRequested || score > bestRequested.score)) {
            bestRequested = { item: current, issues: currentIssues, review: currentReview, score }
          }
        } catch (error) {
          console.warn(`[artifact-quality] Focused variant failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      if (bestRequested) {
        best = bestRequested.item
        bestIssues = bestRequested.issues
        bestReview = bestRequested.review
      }

      const assessment = assessItemRarity(best)
      if (assessment.rarity !== best.rarity) best = { ...best, rarity: assessment.rarity }
      if (bestIssues.length || bestReview.verdict === 'rebuild') {
        console.warn(`[artifact-quality] Applied the strongest honest candidate for ${best.name}; remaining issues: ${[...bestIssues, ...bestReview.issues].join(' ')}`)
      }
      inventory[index] = { operation: 'add', item: best }
      workingRegistry = updateArtifactRegistry(workingRegistry, artifactCandidate(best, request.campaign.turn), 'active', request.campaign.turn)
      reviewedArtifactSignatures.add(JSON.stringify(artifactCandidate(best, request.campaign.turn)))
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
      const initialSignature = JSON.stringify({
        ownerKind: ref.ownerKind,
        ownerId: ref.ownerId,
        ability: abilityStateCandidate(ref.ability, request.campaign.turn),
      })
      if (reviewedAbilitySignatures.has(initialSignature)) return { ref, ability: ref.ability }
      let current = ref.ability
      let issues = newAbilityQualityIssues(current, systemDraft, request.campaign.world.capabilitySystem, ref.resources, registry, request.campaign.turn)
      let review = fallbackReview(issues)
      const shouldUseCritic = runtimePolicy.semanticCritics === 'always'
        || (runtimePolicy.semanticCritics === 'on-issue' && issues.length > 0)
      try {
        if (!shouldUseCritic) throw new Error('deterministic-review-is-sufficient')
        const criticMessages = abilityQualityCriticPrompt({ world: worldContext, owner: { id: ref.ownerId, name: ref.ownerName, resources: ref.resources }, ability: current, registry })
        const criticRaw = await completeAuxiliaryJson(request.provider, criticMessages, { maxOutputTokens: 4_096 }, (value) => abilityQualityReviewSchema.safeParse(normalizeModelOutput(value)).success)
        const parsedReview = abilityQualityReviewSchema.safeParse(normalizeModelOutput(criticRaw))
        if (parsedReview.success) review = parsedReview.data
        else console.warn(`[ability-quality] Invalid compact review: ${compactIssues(parsedReview.error, criticRaw)}`)
      } catch (error) {
        if (shouldUseCritic) console.warn(`[ability-quality] Compact critic skipped: ${error instanceof Error ? error.message : String(error)}`)
      }
      let best = current
      let bestIssues = issues
      let bestScore = abilityNoveltyScore(abilityStateCandidate(current, request.campaign.turn), registry) - issues.length * 20
      for (let attempt = 0; attempt < runtimePolicy.abilityRepairs && (issues.length || review.verdict === 'repair'); attempt += 1) {
        reportProgress(report, 36 + attempt * 2, 'ability-quality', `Уточняем механику «${current.name}»: попытка ${attempt + 1} из ${runtimePolicy.abilityRepairs}`, 5, 11)
        const repairMessages = abilityFocusedRepairPrompt({
          world: worldContext,
          owner: { id: ref.ownerId, name: ref.ownerName, resources: ref.resources },
          ability: current,
          registry,
          issues: [...new Set([...issues, ...review.issues])],
        })
        try {
          const repairRaw = await completeJson(request.provider, repairMessages, {
            maxAttempts: runtimePolicy.providerAttempts,
            transportAttempts: runtimePolicy.transportAttempts,
            timeoutMs: 90_000,
          })
          const repaired = await parseWithRepair(repairRaw, abilityFocusedRepairSchema, request.provider, repairMessages, undefined, undefined, { maxAttempts: runtimePolicy.schemaAttempts })
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
      if (remainingHardIssues.length) console.warn(`[ability-quality] «${best.name}» сохранена с замечаниями вместо отмены всего хода: ${remainingHardIssues.join(' ')}`)
      reviewedAbilitySignatures.add(JSON.stringify({
        ownerKind: ref.ownerKind,
        ownerId: ref.ownerId,
        ability: abilityStateCandidate(best, request.campaign.turn),
      }))
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
        const repairedRaw = await completeJson(request.provider, repairMessages, {
          maxAttempts: 1,
          transportAttempts: 2,
          timeoutMs: 90_000,
        })
        const repaired = await parseWithRepair(repairedRaw, turnPlanSchema, request.provider, repairMessages, salvageTurnPlan, undefined, { maxAttempts: runtimePolicy.schemaAttempts })
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

  const requestNarrativeDrafts = async (plan: ReturnType<typeof turnPlanSchema.parse>) => {
    const grounded = completeText(request.provider, narratorPrompt(request.campaign, request.input, request.actionType, plan, check, 'grounded', eventDecision))
    const [draftAResult, draftBResult] = qualityMode !== 'deep'
      ? await grounded.then((draft) => [{ status: 'fulfilled' as const, value: draft }, { status: 'fulfilled' as const, value: draft }])
      : await Promise.allSettled([grounded, completeText(request.provider, narratorPrompt(request.campaign, request.input, request.actionType, plan, check, 'dramatic', eventDecision))])
    if (draftAResult.status === 'rejected' && draftBResult.status === 'rejected') throw draftAResult.reason
    const draftA = draftAResult.status === 'fulfilled' ? draftAResult.value : (draftBResult as PromiseFulfilledResult<string>).value
    const draftB = draftBResult.status === 'fulfilled' ? draftBResult.value : draftA
    return { draftA, draftB }
  }
  const canSpeculateNarrative = validPlan.abilityExecutions.length === 0
    && !progressionAuditPrompt(request.campaign, request.input, validPlan)
  const speculativeNarrativePlan = structuredClone(validPlan)
  speculativeNarrativePlan.statePatch = mergeAuditPatch(
    speculativeNarrativePlan.statePatch,
    restrictBackgroundPatch(background.statePatch),
  ) as typeof speculativeNarrativePlan.statePatch
  const speculativeNarrativeSanitized = sanitizePlan(request.campaign, speculativeNarrativePlan).plan
  const speculativeNarrativeFingerprint = JSON.stringify(narratorPrompt(
    request.campaign,
    request.input,
    request.actionType,
    speculativeNarrativeSanitized,
    check,
    'grounded',
    eventDecision,
  ))
  const speculativeNarrativesPromise = canSpeculateNarrative
    ? requestNarrativeDrafts(speculativeNarrativeSanitized)
      .then((drafts) => ({ ok: true as const, drafts }))
      .catch((error: unknown) => ({ ok: false as const, error }))
    : undefined

  const applyProgressionAudit = async (plan: ReturnType<typeof turnPlanSchema.parse>) => {
    const playerSupplements: AbilityChange[] = []
    const artifactSupplements: ArtifactChange[] = []
    const npcSupplements = new Map<string, AbilityChange[]>()
    const itemAbilities = grantedItemAbilities(request.campaign)
    for (const receipt of plan.abilityExecutions) {
      const masteryDelta = receipt.outcome === 'success' || receipt.outcome === 'partial' ? 1 : undefined
      const history = {
        title: receipt.techniqueId ? 'Подтверждённое применение техники' : 'Подтверждённое применение способности',
        description: receipt.evidence,
      }
      if (receipt.ownerKind === 'player') {
        const itemAbility = itemAbilities.find((entry) => entry.ability.id === receipt.abilityId)
        if (itemAbility) {
          const powerId = receipt.abilityId.startsWith(`item-power:${itemAbility.itemId}:`)
            ? receipt.abilityId.slice(`item-power:${itemAbility.itemId}:`.length)
            : undefined
          artifactSupplements.push({
            itemId: itemAbility.itemId,
            ...(masteryDelta && powerId ? { powerMasteryDeltas: { [powerId]: masteryDelta } } : {}),
            history,
          })
          continue
        }
        const ability = request.campaign.player.abilities.find((entry) => entry.id === receipt.abilityId)
        if (!ability) continue
        playerSupplements.push({
          abilityId: ability.id,
          ...(masteryDelta && (ability.mastery ?? 0) < 100 ? { masteryDelta } : {}),
          ...(receipt.techniqueId ? {
            techniqueChanges: [{ techniqueId: receipt.techniqueId, ...(masteryDelta ? { masteryDelta } : {}), history }],
          } : {}),
          history,
        })
        continue
      }
      const npc = request.campaign.npcs.find((entry) => entry.id === receipt.ownerId)
      const ability = npc?.abilities?.find((entry) => entry.id === receipt.abilityId)
      if (!npc || !ability) continue
      const changes = npcSupplements.get(npc.id) ?? []
      changes.push({
        abilityId: ability.id,
        ...(masteryDelta && (ability.mastery ?? 0) < 100 ? { masteryDelta } : {}),
        ...(receipt.techniqueId ? {
          techniqueChanges: [{ techniqueId: receipt.techniqueId, ...(masteryDelta ? { masteryDelta } : {}), history }],
        } : {}),
        history,
      })
      npcSupplements.set(npc.id, changes)
    }
    const deterministicAbilities = filterSupplementalAbilityChanges(plan.statePatch.abilityChanges, playerSupplements)
    const deterministicArtifacts = filterSupplementalArtifactChanges(plan.statePatch.artifactChanges, artifactSupplements)
    plan.statePatch.abilityChanges = [...(plan.statePatch.abilityChanges ?? []), ...(deterministicAbilities ?? [])]
    plan.statePatch.artifactChanges = [...(plan.statePatch.artifactChanges ?? []), ...(deterministicArtifacts ?? [])]
    for (const [npcId, candidates] of npcSupplements) {
      const recorded = (plan.statePatch.npcs ?? [])
        .filter((mutation) => mutation.operation === 'update' && mutation.targetId === npcId)
        .flatMap((mutation) => mutation.operation === 'update' ? mutation.npc.abilityChanges ?? [] : [])
      const additions = filterSupplementalAbilityChanges(recorded, candidates)
      if (additions?.length) plan.statePatch.npcs = [
        ...(plan.statePatch.npcs ?? []),
        { operation: 'update', targetId: npcId, npc: { abilityChanges: additions } },
      ]
    }

    const progressionMessages = progressionAuditPrompt(request.campaign, request.input, plan)
    if (!progressionMessages) return plan
    reportProgress(report, 41, 'progression', 'Сверяем развитие способностей, предметов и персонажей', 5, 11)
    const emptyProgression: ReturnType<typeof progressionAuditSchema.parse> = {}
    const progression = await optionalStage<ReturnType<typeof progressionAuditSchema.parse>>('progression', async () => {
      const rawProgression = await completeJson(request.provider, progressionMessages, {
        maxAttempts: 1,
        transportAttempts: 1,
        timeoutMs: 45_000,
      })
      return parseOptionalModelOutput(rawProgression, progressionAuditSchema)
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
      const repairedRaw = await completeJson(request.provider, repairMessages, {
        maxAttempts: 1,
        transportAttempts: 2,
        timeoutMs: 90_000,
      })
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
  const reconciledExecutionCosts = reconcileAbilityExecutionCosts(
    request.campaign,
    sanitized.plan.abilityExecutions,
    sanitized.plan.statePatch,
  )
  sanitized.plan.abilityExecutions = reconciledExecutionCosts.receipts
  sanitized.plan.statePatch = reconciledExecutionCosts.patch as typeof sanitized.plan.statePatch
  if (reconciledExecutionCosts.corrections.length) sanitized.notes.push(...reconciledExecutionCosts.corrections)
  const quarantineInvalidExecutions = (candidate: typeof sanitized) => {
    const accepted = candidate.plan.abilityExecutions.filter((receipt) => (
      abilityExecutionIssues(request.campaign, [receipt], candidate.plan.statePatch).length === 0
    ))
    const removed = candidate.plan.abilityExecutions.length - accepted.length
    if (removed) {
      candidate.plan.abilityExecutions = accepted
      candidate.notes.push(`${removed} некорректных служебных квитанций способности исключено без отмены сцены и остальных изменений.`)
    }
    return candidate
  }
  const executionIssues = abilityExecutionIssues(request.campaign, sanitized.plan.abilityExecutions, sanitized.plan.statePatch)
  if (executionIssues.length) {
    reportProgress(report, 47, 'ability-execution', 'Сверяем применение способностей, условия и фактически оплаченную цену', 5, 11)
    try {
      const repairMessages = abilityExecutionRepairPrompt(director.messages, request.campaign, sanitized.plan, executionIssues)
      const repairedRaw = await completeJson(request.provider, repairMessages, { maxAttempts: 1, transportAttempts: 2 })
      let repaired = await parseWithRepair(repairedRaw, turnPlanSchema, request.provider, repairMessages, salvageTurnPlan, undefined, { maxAttempts: 2 })
      repaired = await enforceArtifactQuality(repaired)
      repaired = await enforceAbilityQuality(repaired)
      const repairedSanitized = sanitizePlan(request.campaign, repaired)
      const repairedCosts = reconcileAbilityExecutionCosts(
        request.campaign,
        repairedSanitized.plan.abilityExecutions,
        repairedSanitized.plan.statePatch,
      )
      repairedSanitized.plan.abilityExecutions = repairedCosts.receipts
      repairedSanitized.plan.statePatch = repairedCosts.patch as typeof repairedSanitized.plan.statePatch
      repairedSanitized.notes.push(...repairedCosts.corrections)
      sanitized = quarantineInvalidExecutions(repairedSanitized)
    } catch (error) {
      console.warn(`[ability-execution] Точечное исправление пропущено; сохраняем остальную сцену: ${error instanceof Error ? error.message : String(error)}`)
      sanitized = quarantineInvalidExecutions(sanitized)
    }
  }

  const requestConsequenceAudit = async (
    plan: ReturnType<typeof turnPlanSchema.parse>,
    candidateNarrative: string,
  ) => {
    const fallback: ConsequenceAudit = {
      pass: true,
      narrativePass: true,
      narrativeIssues: [],
      verifiedDomains: [...CONSEQUENCE_DOMAINS],
      omissions: [],
      statePatch: {},
    }
    const exceptionalRisk = request.actionType === 'story'
      || check?.outcome === 'failure'
      || check?.outcome === 'mixed'
      || (eventDecision.mode !== 'none' && eventDecision.mode !== 'seed')
    const signalWithoutState = consequenceSignal.test(`${request.input}\n${candidateNarrative}`)
      && !patchNeedsConsequenceAudit(plan.statePatch)
    const fullRisk = exceptionalRisk
      || plan.abilityExecutions.length > 0
      || patchNeedsConsequenceAudit(plan.statePatch)
      || consequenceSignal.test(`${request.input}\n${candidateNarrative}`)
    const needsAudit = runtimePolicy.consequenceAudit === 'always-on-risk'
      ? fullRisk
      : runtimePolicy.consequenceAudit === 'missing-signal'
        ? exceptionalRisk || signalWithoutState
        : exceptionalRisk
    if (!needsAudit) return fallback
    const auditMessages = consequenceAuditorPrompt(request.campaign, request.input, request.actionType, plan, candidateNarrative, check)
    return optionalStage('consequence-audit', async () => {
      const rawAudit = await completeJson(request.provider, auditMessages, {
        maxAttempts: 1,
        transportAttempts: 1,
        timeoutMs: 45_000,
      })
      return parseOptionalModelOutput<ConsequenceAudit>(rawAudit, consequenceAuditSchema)
    }, fallback)
  }

  const requestMemoryCurator = async (
    plan: ReturnType<typeof turnPlanSchema.parse>,
    candidateNarrative: string,
  ) => {
    const emptyCurator: ReturnType<typeof memoryCuratorSchema.parse> = { memories: [], archives: [] }
    const shouldCurate = (request.campaign.turn + 1) % runtimePolicy.memoryCadence === 0
      || request.actionType === 'story'
      || Boolean(plan.statePatch.cleanup && Object.values(plan.statePatch.cleanup).some((entries) => entries?.length))
    if (!shouldCurate) return emptyCurator
    const curatorMessages = memoryCuratorPrompt(request.campaign, request.input, candidateNarrative, plan)
    return optionalStage('memory', async () => {
      const rawCurator = await completeJson(request.provider, curatorMessages, {
        maxAttempts: 1,
        transportAttempts: 1,
        timeoutMs: 45_000,
      })
      return parseOptionalModelOutput(rawCurator, memoryCuratorSchema)
    }, emptyCurator)
  }

  const requestAuditBundle = async (candidateNarrative: string) => {
    const [consequence, curator] = await Promise.all([
      requestConsequenceAudit(sanitized.plan, candidateNarrative),
      requestMemoryCurator(sanitized.plan, candidateNarrative),
    ])
    return { consequence, curator }
  }

  const agencyAuditNotes: string[] = []
  const protectPlayerAgency = (candidateNarrative: string, recordNotes = true) => {
    const protect = (value: string) => sanitizePlayerAgency({
      playerName: request.campaign.player.name,
      input: request.input,
      actionType: request.actionType,
      narrative: value,
      agencyMode: request.campaign.settings.playerAgency,
    })
    let result = protect(candidateNarrative)
    if (recordNotes && result.violations.length) {
      agencyAuditNotes.push(...result.violations.map((violation) => `Агентность ${violation.kind}: ${violation.reason}`))
    }
    if (!result.narrative.trim()) {
      result = protect([sanitized.plan.outcome, ...sanitized.plan.beats].filter(Boolean).join('\n\n'))
    }
    if (!result.narrative.trim()) {
      result = protect('Окружение отвечает на уже заявленное действие конкретным изменением обстановки. Реакции других персонажей становятся заметны, но следующий выбор остаётся за игроком.')
    }
    return result.narrative.trim()
  }

  reportProgress(report, 50, 'drafting', qualityMode === 'deep' ? 'Пишем два независимых варианта сцены' : 'Пишем один полноценный вариант сцены без лишнего дубля', 6, 11)
  const exactSpeculativeNarrative = JSON.stringify(narratorPrompt(
    request.campaign,
    request.input,
    request.actionType,
    sanitized.plan,
    check,
    'grounded',
    eventDecision,
  )) === speculativeNarrativeFingerprint
  const speculativeNarratives = exactSpeculativeNarrative && speculativeNarrativesPromise
    ? await speculativeNarrativesPromise
    : undefined
  if (speculativeNarratives && !speculativeNarratives.ok) console.warn('[orchestrator:speculative-narrative] falling back to the authoritative draft', speculativeNarratives.error)
  const { draftA, draftB } = speculativeNarratives?.ok
    ? speculativeNarratives.drafts
    : await requestNarrativeDrafts(sanitized.plan)
  const repetitionA = findNarrativeRepetitionIssues(draftA, request.campaign.messages)
  const repetitionB = findNarrativeRepetitionIssues(draftB, request.campaign.messages)
  reportProgress(report, 65, 'critic', 'Критик выбирает сильнейший непротиворечивый вариант', 7, 11)
  const preferredDraft = protectPlayerAgency(
    narrativeRepetitionScore(repetitionA) <= narrativeRepetitionScore(repetitionB) ? draftA : draftB,
    false,
  )
  const speculativeAuditPromise = requestAuditBundle(preferredDraft)
    .then((bundle) => ({ ok: true as const, bundle }))
    .catch((error: unknown) => {
      console.warn('[orchestrator:speculative-audit] ignored', error)
      return { ok: false as const }
    })
  const review = draftA === draftB
    ? { chosen: 'a' as const, pass: true, issues: [], rewriteInstructions: '' }
    : await optionalStage('critic', async () => {
      const criticMessages = continuityCriticPrompt(request.campaign, request.input, request.actionType, sanitized.plan, draftA, draftB, repetitionA, repetitionB)
      const rawReview = await completeJson(request.provider, criticMessages, {
        maxAttempts: 1,
        transportAttempts: 1,
        timeoutMs: 45_000,
      })
      return parseOptionalModelOutput(rawReview, continuityReviewSchema)
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

  reportProgress(report, 70, 'agency-audit', 'Программно сохраняем за игроком все решения, реплики и мысли', 8, 11)
  narrative = protectPlayerAgency(narrative)

  // Speculative audits began at the same time as the critic. Reuse is allowed only for the
  // exact unchanged narrative and plan; any revision receives a fresh complete audit bundle.
  const initiallyAuditedNarrative = narrative
  const initiallyAuditedPlanFingerprint = JSON.stringify(sanitized.plan)
  reportProgress(report, 72, 'parallel-audit', 'Сцену уже можно читать — состояние и память синхронизируются в фоне', 8, 11, ['Свобода героя', 'Состояние мира', 'Долгая память'], narrative)
  const speculativeAudit = await speculativeAuditPromise
  const initialAuditBundle = initiallyAuditedNarrative === preferredDraft && speculativeAudit.ok
    ? speculativeAudit.bundle
    : await requestAuditBundle(initiallyAuditedNarrative)
  const initialConsequenceAudit = initialAuditBundle.consequence
  const initialCurator = initialAuditBundle.curator

  const repairedOmissions: ConsequenceAudit['omissions'] = []
  const narrativeAuditNotes: string[] = []
  let consequenceAudit: ConsequenceAudit = initialConsequenceAudit
  const eventCompliantPatch = eventDecision.mode !== 'none' && eventDecision.mode !== 'seed'
    ? structuredClone(sanitized.plan.statePatch)
    : undefined
  let reconciled = sanitized

  // Audit state and prose together. If the model replaced a binding story direction with its
  // own scene, rewrite the prose and audit the corrected result again before committing anything.
  for (let narrativeAttempt = 0; narrativeAttempt < runtimePolicy.auditRounds; narrativeAttempt += 1) {
    reportProgress(report, 76 + narrativeAttempt * 5, 'consequence-audit', narrativeAttempt === 0 ? 'Проверяем только значимые риски состояния' : `Исправляем пропущенные последствия: попытка ${narrativeAttempt + 1}`, 9, 11)
    consequenceAudit = narrativeAttempt === 0 && narrative === initiallyAuditedNarrative
      ? initialConsequenceAudit
      : await requestConsequenceAudit(reconciled.plan, narrative)
    const planBeforeAuditPatch = structuredClone(reconciled.plan)
    repairedOmissions.push(...consequenceAudit.omissions)
    narrativeAuditNotes.push(...consequenceAudit.narrativeIssues.map((issue) => `${issue.severity}: ${issue.requirement}`))
    reconciled.plan.statePatch = mergeAuditPatch(reconciled.plan.statePatch, consequenceAudit.statePatch) as typeof reconciled.plan.statePatch
    reconciled = sanitizePlan(request.campaign, reconciled.plan)

    // A structurally valid patch can still reference an entity that no longer exists. Make the
    // model repair that exact consequence rather than silently dropping it. Only rejections in
    // the same audited domain are blocking: an unrelated harmless normalization must not cancel
    // the entire turn.
    let blockingNotes = blockingRejectionMessages(reconciled, consequenceAudit.omissions)
    for (let referenceAttempt = 0; blockingNotes.length > 0 && referenceAttempt < runtimePolicy.referenceRepairs; referenceAttempt += 1) {
      const retryMessages = consequenceAuditorPrompt(
        request.campaign,
        request.input,
        request.actionType,
        { ...reconciled.plan, rejectedConsequenceNotes: blockingNotes },
        narrative,
        check,
      )
      const retryAudit = await optionalStage<ConsequenceAudit>('consequence-reference-repair', async () => {
        const retryRaw = await completeJson(request.provider, retryMessages, {
          maxAttempts: 1,
          transportAttempts: 1,
          timeoutMs: 45_000,
        })
        return parseOptionalModelOutput<ConsequenceAudit>(retryRaw, consequenceAuditSchema)
      }, consequenceAudit)
      consequenceAudit = retryAudit
      repairedOmissions.push(...retryAudit.omissions)
      narrativeAuditNotes.push(...retryAudit.narrativeIssues.map((issue) => `${issue.severity}: ${issue.requirement}`))
      reconciled.plan.statePatch = mergeAuditPatch(reconciled.plan.statePatch, retryAudit.statePatch) as typeof reconciled.plan.statePatch
      reconciled = sanitizePlan(request.campaign, reconciled.plan)
      blockingNotes = blockingRejectionMessages(reconciled, consequenceAudit.omissions)
    }
    if (blockingNotes.length > 0) {
      narrativeAuditNotes.push(`Отклонён небезопасный дополнительный патч аудита: ${blockingNotes.join(' ')}`)
      reconciled = sanitizePlan(request.campaign, planBeforeAuditPatch)
      consequenceAudit = {
        ...consequenceAudit,
        pass: true,
        omissions: [],
        statePatch: {},
      }
    }
    const repetitionIssues = findNarrativeRepetitionIssues(narrative, request.campaign.messages)
    narrativeAuditNotes.push(...repetitionIssues.map((issue) => `Повтор ${issue.severity}: ${issue.candidateExcerpt}`))
    if (consequenceAudit.narrativePass && repetitionIssues.length === 0) break
    if (narrativeAttempt === runtimePolicy.auditRounds - 1) {
      if (repetitionIssues.length) {
        narrative = removeNarrativeRepetitionParagraphs(narrative, repetitionIssues)
        narrativeAuditNotes.push('Финальные повторяющиеся абзацы удалены программно без повторного обращения к модели.')
      } else if (!consequenceAudit.narrativePass) {
        const instructions = consequenceAudit.narrativeIssues.map((issue) => issue.instruction).join('\n')
        narrative = await optionalStage(
          'final-risk-revision',
          () => completeText(request.provider, revisionPrompt(request.campaign, request.input, reconciled.plan, narrative, instructions), { maxAttempts: 1, transportAttempts: 2 }),
          narrative,
        )
      }
      narrative = protectPlayerAgency(narrative)
      break
    }
    if (repetitionIssues.length) {
      reportProgress(report, 86 + narrativeAttempt * 2, 'style-audit', `Убираем повторяющиеся абзацы: попытка ${narrativeAttempt + 1}`, 9, 11)
      const otherInstructions = consequenceAudit.narrativePass ? '' : consequenceAudit.narrativeIssues.map((issue) => issue.instruction).join('\n')
      narrative = await completeText(request.provider, narrativeRepetitionRevisionPrompt(request.campaign, request.input, reconciled.plan, narrative, repetitionIssues, otherInstructions))
      narrative = protectPlayerAgency(narrative)
      continue
    }
    const consequenceRewriteInstructions = consequenceAudit.narrativeIssues.map((issue) => issue.instruction).join('\n')
    narrative = await completeText(request.provider, revisionPrompt(request.campaign, request.input, reconciled.plan, narrative, consequenceRewriteInstructions))
    narrative = protectPlayerAgency(narrative)
  }
  const finalRepetitionIssues = findNarrativeRepetitionIssues(narrative, request.campaign.messages)
  if (finalRepetitionIssues.length) {
    narrative = removeNarrativeRepetitionParagraphs(narrative, finalRepetitionIssues)
    narrativeAuditNotes.push('Повторяющиеся финальные абзацы удалены программно.')
  }
  narrative = protectPlayerAgency(narrative)

  reportProgress(report, 93, 'memory', 'Закрепляем факты и долгую память истории', 10, 11)
  const curator = narrative === initiallyAuditedNarrative && JSON.stringify(reconciled.plan) === initiallyAuditedPlanFingerprint
    ? initialCurator
    : await requestMemoryCurator(reconciled.plan, narrative)
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
      const repairedRaw = await completeJson(request.provider, repairMessages, {
        maxAttempts: 1,
        transportAttempts: 2,
        timeoutMs: 90_000,
      })
      const repaired = await parseWithRepair(repairedRaw, turnPlanSchema, request.provider, repairMessages, salvageTurnPlan, undefined, { maxAttempts: runtimePolicy.schemaAttempts })
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
    reconciled.notes.push(`Артефакт сохранён без отмены всего хода; редактор качества отметил: ${finalArtifactIssues.join(' ')}`)
    console.warn(`[artifact-quality] ${finalArtifactIssues.join(' ')}`)
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
    let bestIssues = issues
    let bestScore = artifactNoveltyScore(artifactCandidate(current, request.campaign.turn), candidateRegistry) - issues.length * 12
    const requiredRank = Math.max(rarityOrder.indexOf(current.rarity), requested ? rarityOrder.indexOf(requested) : -1)
    const requiredRarity = rarityOrder[requiredRank] ?? current.rarity
    let bestRequested = artifactMeetsRequestedRarity(current, requested)
      ? { item: current, issues, score: bestScore }
      : undefined

    const maxAttempts = requested ? 5 : 3
    for (let attempt = 0; attempt < maxAttempts && issues.length; attempt += 1) {
      reportProgress(report, 72 + attempt * 4, 'artifact-quality', `Перепроверяем артефакт «${current.name}»: вариант ${attempt + 1} из ${maxAttempts}`, 3, 4)
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
          const criticRaw = await completeAuxiliaryJson(request.provider, criticMessages, { maxOutputTokens: 4_096 }, (value) => artifactQualityReviewSchema.safeParse(normalizeModelOutput(value)).success)
          const critic = artifactQualityReviewSchema.safeParse(normalizeModelOutput(criticRaw))
          if (critic.success && critic.data.verdict === 'rebuild') issues = [...new Set([...issues, ...critic.data.issues])]
        } catch {
          // Deterministic validation is sufficient when the optional critic is unavailable.
        }
        const score = artifactNoveltyScore(artifactCandidate(current, request.campaign.turn), candidateRegistry) - issues.length * 12
        if (score > bestScore) {
          best = current
          bestIssues = issues
          bestScore = score
        }
        if (artifactMeetsRequestedRarity(current, requested) && (!bestRequested || score > bestRequested.score)) {
          bestRequested = { item: current, issues, score }
        }
      } catch (error) {
        console.warn(`[artifact-quality] Editor artifact variant failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (bestRequested) {
      best = bestRequested.item
      bestIssues = bestRequested.issues
    }
    const assessment = assessItemRarity(best)
    const honestBest = assessment.rarity === best.rarity ? best : { ...best, rarity: assessment.rarity }
    if (requested && (!artifactMeetsRequestedRarity(honestBest, requested) || bestIssues.some((issue) => issue.includes('фактически имеет класс') || issue.includes('не достигает класса')))) {
      throw new Error(`Кузница не смогла создать реальный артефакт запрошенного класса ${requested}; более слабая подмена не будет применена.`)
    }
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
      const raw = await completeAuxiliaryJson(request.provider, criticMessages, { maxOutputTokens: 4_096 }, (value) => abilityQualityReviewSchema.safeParse(normalizeModelOutput(value)).success)
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

type EventTargetCandidate = { id: string; terms: string[] }

const workshopCreateTargetDomains = new Set<NarrativeEventRequirement['domain']>([
  'npc', 'stat', 'resource', 'currency', 'condition', 'status-effect', 'ability', 'artifact', 'inventory', 'social-link',
  'quest', 'thread', 'character-arc', 'mystery', 'antagonist-plan', 'influence', 'faction', 'place', 'route',
  'process', 'world-rule', 'law', 'mechanic', 'legend', 'lore', 'world-event', 'world-pressure', 'metric',
])

const workshopMutationTargetDomains = new Set<NarrativeEventRequirement['domain']>([
  ...workshopCreateTargetDomains,
  'relationship', 'party', 'memory', 'conflict', 'faction-reputation',
])

function workshopReferenceText(value: string) {
  return value.trim().toLocaleLowerCase('ru-RU').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function workshopRelatedTargetDomains(domain: NarrativeEventRequirement['domain']): NarrativeEventRequirement['domain'][] {
  if (domain === 'artifact' || domain === 'inventory') return ['artifact', 'inventory']
  if (domain === 'relationship' || domain === 'party') return [domain, 'npc']
  if (domain === 'faction-reputation') return ['faction-reputation', 'faction']
  return [domain]
}

function uniqueEventCandidates(candidates: EventTargetCandidate[]) {
  const merged = new Map<string, EventTargetCandidate>()
  candidates.filter((candidate) => candidate.id).forEach((candidate) => {
    const current = merged.get(candidate.id)
    merged.set(candidate.id, {
      id: candidate.id,
      terms: [...new Set([...(current?.terms ?? []), candidate.id, ...candidate.terms].filter(Boolean))],
    })
  })
  return [...merged.values()]
}

function workshopCampaignTargets(campaign: Campaign, domain: NarrativeEventRequirement['domain']): EventTargetCandidate[] {
  const named = (entries: Array<{ id: string; name?: string; title?: string; label?: string }>) => entries.map((entry) => ({
    id: entry.id,
    terms: [entry.name, entry.title, entry.label].filter((value): value is string => Boolean(value)),
  }))
  switch (domain) {
    case 'npc': return named(campaign.npcs)
    case 'stat': return uniqueEventCandidates([
      ...campaign.player.stats.map((entry) => ({ id: entry.key, terms: [entry.label] })),
      ...campaign.npcs.flatMap((npc) => (npc.stats ?? []).map((entry) => ({ id: entry.key, terms: [entry.label, npc.name] }))),
    ])
    case 'resource': return uniqueEventCandidates([
      ...campaign.player.resources.map((entry) => ({ id: entry.key, terms: [entry.label] })),
      ...campaign.npcs.flatMap((npc) => (npc.resources ?? []).map((entry) => ({ id: entry.key, terms: [entry.label, npc.name] }))),
    ])
    case 'currency': return Object.keys(campaign.player.currency ?? {}).map((id) => ({ id, terms: [id] }))
    case 'condition': return campaign.player.conditions.map((id) => ({ id, terms: [id] }))
    case 'status-effect': return named([
      ...(campaign.player.statusEffects ?? []),
      ...campaign.npcs.flatMap((npc) => npc.statusEffects ?? []),
    ])
    case 'ability': return named([
      ...campaign.player.abilities,
      ...campaign.npcs.flatMap((npc) => npc.abilities ?? []),
    ])
    case 'artifact': return named(campaign.inventory.filter((item) => item.category === 'artifact'))
    case 'inventory': return named(campaign.inventory)
    case 'relationship':
    case 'party': return named(campaign.npcs)
    case 'social-link': return named((campaign.socialLinks ?? []).map((entry) => ({ ...entry, name: `${entry.fromNpcId} ${entry.toNpcId}` })))
    case 'quest': return named(campaign.quests)
    case 'thread': return named(campaign.threads ?? [])
    case 'character-arc': return named(campaign.characterArcs ?? [])
    case 'mystery': return named(campaign.mysteryCases ?? [])
    case 'antagonist-plan': return named(campaign.antagonistPlans ?? [])
    case 'influence': return named(campaign.influenceAssets ?? [])
    case 'memory': return named(campaign.memories.map((entry) => ({ ...entry, title: entry.content })))
    case 'conflict': return campaign.activeConflict ? named([{ id: campaign.activeConflict.id, title: campaign.activeConflict.title }]) : []
    case 'faction-reputation': return (campaign.factionReputation ?? []).map((entry) => ({ id: entry.factionName, terms: [entry.factionName, entry.label ?? ''] }))
    case 'faction': return (campaign.world.factions ?? []).map((entry) => ({ id: entry.id ?? entry.name, terms: [entry.name] }))
    case 'place': return uniqueEventCandidates([
      ...(campaign.world.places ?? []).map((entry) => ({ id: entry.id, terms: [entry.name] })),
      ...(campaign.world.locations ?? []).map((entry) => ({ id: entry.name, terms: [entry.name] })),
    ])
    case 'route': return named((campaign.world.routes ?? []).map((entry) => ({ ...entry, name: `${entry.from} ${entry.to}` })))
    case 'process': return named(campaign.world.processes ?? [])
    case 'world-rule': return (campaign.world.rules ?? []).map((id) => ({ id, terms: [id] }))
    case 'law': return named(campaign.world.laws ?? [])
    case 'mechanic': return named(campaign.world.mechanics ?? [])
    case 'legend': return named(campaign.world.legends ?? [])
    case 'lore': return named(campaign.lore)
    case 'world-event': return named(campaign.worldEvents ?? [])
    case 'world-pressure': return named(campaign.worldPressures ?? [])
    case 'metric': return (campaign.world.metrics ?? []).map((entry) => ({ id: entry.id, terms: [entry.key, entry.label] }))
    case 'interface': return named(campaign.world.interfaceModules ?? [])
    default: return []
  }
}

function workshopPatchTargets(patch: TurnPatch, domain: NarrativeEventRequirement['domain']): string[] {
  switch (domain) {
    case 'npc': return (patch.npcs ?? []).map((entry) => entry.operation === 'add' ? entry.npc.id : entry.targetId)
    case 'stat': return [...(patch.upsertStats ?? []).map((entry) => entry.key), ...Object.keys(patch.statDeltas ?? {}), ...(patch.removeStatKeys ?? [])]
    case 'resource': return [...(patch.upsertResources ?? []).map((entry) => entry.key), ...Object.keys(patch.resourceDeltas ?? {}), ...(patch.removeResourceKeys ?? [])]
    case 'currency': return [...Object.keys(patch.upsertCurrency ?? {}), ...Object.keys(patch.currencyDeltas ?? {})]
    case 'condition': return [...(patch.addConditions ?? []), ...(patch.removeConditions ?? [])]
    case 'status-effect': return [...(patch.upsertStatusEffects ?? []).flatMap((entry) => entry.id ? [entry.id] : []), ...(patch.removeStatusEffectIds ?? [])]
    case 'ability': return [...(patch.addAbilities ?? []).flatMap((entry) => entry.id ? [entry.id] : []), ...(patch.abilityChanges ?? []).map((entry) => entry.abilityId), ...(patch.removeAbilityIds ?? [])]
    case 'artifact': return [...(patch.artifactChanges ?? []).map((entry) => entry.itemId), ...(patch.inventory ?? []).flatMap((entry) => entry.operation === 'add' ? entry.item.id ? [entry.item.id] : [] : [entry.targetId])]
    case 'inventory': return (patch.inventory ?? []).flatMap((entry) => entry.operation === 'add' ? entry.item.id ? [entry.item.id] : [] : [entry.targetId])
    case 'relationship': return (patch.relationships ?? []).map((entry) => entry.npcId)
    case 'party': return [...(patch.party?.addNpcIds ?? []), ...(patch.party?.removeNpcIds ?? []), ...Object.keys(patch.party?.roles ?? {})]
    case 'social-link': return [...(patch.socialLinks ?? []).map((entry) => entry.id), ...(patch.removeSocialLinkIds ?? [])]
    case 'quest': return (patch.quests ?? []).flatMap((entry) => entry.operation === 'add' ? entry.quest?.id ? [entry.quest.id] : [] : entry.targetId ? [entry.targetId] : [])
    case 'thread': return (patch.threads ?? []).flatMap((entry) => entry.operation === 'add' ? entry.thread?.id ? [entry.thread.id] : [] : entry.targetId ? [entry.targetId] : [])
    case 'character-arc': return (patch.upsertCharacterArcs ?? []).map((entry) => entry.id)
    case 'mystery': return (patch.upsertMysteryCases ?? []).map((entry) => entry.id)
    case 'antagonist-plan': return (patch.upsertAntagonistPlans ?? []).map((entry) => entry.id)
    case 'influence': return [...(patch.upsertInfluenceAssets ?? []).map((entry) => entry.id), ...(patch.removeInfluenceAssetIds ?? [])]
    case 'conflict': return patch.conflict && patch.conflict.operation !== 'resolve' ? [patch.conflict.state.id] : []
    case 'faction-reputation': return [...Object.keys(patch.factionReputationDeltas ?? {}), ...(patch.upsertFactionReputation ?? []).map((entry) => entry.factionName)]
    case 'faction': return [...(patch.world?.upsertFactions ?? []).map((entry) => entry.id ?? entry.name), ...(patch.world?.removeFactions ?? [])]
    case 'place': return [...(patch.world?.upsertPlaces ?? []).map((entry) => entry.id), ...(patch.world?.removePlaceIds ?? [])]
    case 'route': return [...(patch.world?.upsertRoutes ?? []).map((entry) => entry.id), ...(patch.world?.removeRouteIds ?? [])]
    case 'process': return [...(patch.world?.upsertProcesses ?? []).map((entry) => entry.id), ...(patch.world?.retireProcessIds ?? [])]
    case 'world-rule': return [...(patch.world?.addRules ?? []), ...(patch.world?.removeRules ?? [])]
    case 'law': return [...(patch.world?.upsertLaws ?? []).map((entry) => entry.id), ...(patch.world?.removeLawIds ?? [])]
    case 'mechanic': return [...(patch.world?.upsertMechanics ?? []).map((entry) => entry.id), ...(patch.world?.removeMechanicIds ?? [])]
    case 'legend': return [...(patch.world?.upsertLegends ?? []).map((entry) => entry.id), ...(patch.world?.removeLegendIds ?? [])]
    case 'lore': return (patch.lore ?? []).flatMap((entry) => entry.id ? [entry.id] : [])
    case 'world-event': return (patch.worldEvents ?? []).flatMap((entry) => entry.operation === 'add' ? entry.event?.id ? [entry.event.id] : [] : entry.targetId ? [entry.targetId] : [])
    case 'world-pressure': return (patch.upsertWorldPressures ?? []).map((entry) => entry.id)
    case 'metric': return [...(patch.world?.upsertMetrics ?? []).map((entry) => entry.id), ...Object.keys(patch.world?.metricDeltas ?? {}), ...(patch.world?.removeMetricIds ?? [])]
    case 'interface': return [...(patch.world?.upsertInterfaceModules ?? []).map((entry) => entry.id), ...(patch.world?.interfaceModuleChanges ?? []).map((entry) => entry.moduleId), ...(patch.world?.removeInterfaceModuleIds ?? [])]
    default: return []
  }
}

function workshopStableEventId(proposal: NarrativeEventProposal, requirement: NarrativeEventRequirement, index: number, reserved: Set<string>) {
  const source = `${proposal.concept}|${requirement.domain}|${requirement.requirement}|${index}`
  let hash = 2166136261
  for (let cursor = 0; cursor < source.length; cursor += 1) {
    hash ^= source.charCodeAt(cursor)
    hash = Math.imul(hash, 16777619)
  }
  const prefix = requirement.domain.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'entity'
  const base = `event-${prefix}-${(hash >>> 0).toString(36)}`
  let candidate = base
  let suffix = 2
  while (reserved.has(candidate)) candidate = `${base}-${suffix++}`
  reserved.add(candidate)
  return candidate
}

function workshopRequirementCreatesSomething(requirement: NarrativeEventRequirement) {
  if (!['update', 'transform'].includes(requirement.operation)) return false
  return /(?:нов\p{L}*|созда\p{L}*|появ\p{L}*|возник\p{L}*|основа\p{L}*|учред\p{L}*|откры\p{L}*|пробуд\p{L}*|родил\p{L}*|сформир\p{L}*|new|create|spawn|establish|awaken)/iu.test(requirement.requirement)
}

function stabilizeWorkshopEventProposal(
  request: CampaignEditRequest,
  patch: TurnPatch,
  source: NarrativeEventProposal,
): NarrativeEventProposal {
  const normalized = normalizeNarrativeEventProposal(source)
  const immediateEffects = normalized.immediateEffects.map((effect) => ({ ...effect }))
  const persistentEffects = normalized.persistentEffects.map((effect) => ({ ...effect }))
  const requirements = [...immediateEffects, ...persistentEffects]
  const known = narrativeEventKnownIds(request.campaign)
  const originalReferences = [...new Set([
    ...normalized.sourceIds,
    ...normalized.causeIds,
    ...normalized.scopeIds,
    ...normalized.participantIds,
  ])]
  const unknownReferences = originalReferences.filter((id) => !known.has(id))
  const reserved = new Set([...known, ...requirements.flatMap((effect) => effect.targetId ? [effect.targetId] : [])])
  const idRemap = new Map<string, string>()

  requirements.forEach((effect, index) => {
    if (effect.operation !== 'create' || !workshopCreateTargetDomains.has(effect.domain)) return
    const patchTargets = [...new Set(workshopPatchTargets(patch, effect.domain))]
    if (patchTargets.length === 1 && effect.targetId !== patchTargets[0]) {
      if (effect.targetId) idRemap.set(effect.targetId, patchTargets[0])
      effect.targetId = patchTargets[0]
      reserved.add(patchTargets[0])
      return
    }
    if (effect.targetId) return
    const unclaimedReference = unknownReferences.find((id) => !reserved.has(id))
    effect.targetId = unclaimedReference ?? workshopStableEventId(normalized, effect, index, reserved)
    reserved.add(effect.targetId)
  })

  const indexCreatedTargets = () => {
    const result = new Map<NarrativeEventRequirement['domain'], string[]>()
    requirements.forEach((effect) => {
      if (effect.operation !== 'create' || !effect.targetId) return
      result.set(effect.domain, [...(result.get(effect.domain) ?? []), effect.targetId])
    })
    return result
  }
  let createdByDomain = indexCreatedTargets()

  requirements.forEach((effect, index) => {
    if (effect.operation === 'create' || effect.targetId || !workshopMutationTargetDomains.has(effect.domain)) return
    const relatedDomains = workshopRelatedTargetDomains(effect.domain)
    const patchTargets = [...new Set(relatedDomains.flatMap((domain) => workshopPatchTargets(patch, domain)))]
    const createdTargets = [...new Set(relatedDomains.flatMap((domain) => createdByDomain.get(domain) ?? []))]
    const candidates = workshopCampaignTargets(request.campaign, effect.domain)
    const routingIds = new Set([
      ...normalized.sourceIds,
      ...normalized.causeIds,
      ...normalized.scopeIds,
      ...normalized.participantIds,
    ])
    const routedCandidates = candidates.filter((candidate) => routingIds.has(candidate.id))
    const hint = workshopReferenceText(`${request.instruction} ${normalized.concept} ${effect.requirement}`)
    const namedCandidates = candidates.filter((candidate) => candidate.terms.some((term) => {
      const normalizedTerm = workshopReferenceText(term)
      return normalizedTerm.length >= 3 && hint.includes(normalizedTerm)
    }))
    const exact = [patchTargets, createdTargets, routedCandidates.map((entry) => entry.id), namedCandidates.map((entry) => entry.id), candidates.map((entry) => entry.id)]
      .map((entries) => [...new Set(entries)])
      .find((entries) => entries.length === 1)
    if (exact) {
      effect.targetId = exact[0]
      return
    }

    // DeepSeek sometimes describes a genuinely new permanent entity correctly but labels the
    // semantic operation as update/transform. If no existing target can be identified, promote
    // that authored creation intent instead of spending three identical repair requests.
    if (workshopCreateTargetDomains.has(effect.domain) && workshopRequirementCreatesSomething(effect)) {
      const unclaimedReference = unknownReferences.find((id) => !reserved.has(id))
      effect.operation = 'create'
      effect.targetId = unclaimedReference ?? workshopStableEventId(normalized, effect, requirements.length + index, reserved)
      reserved.add(effect.targetId)
    }
  })

  // A model can provide an explicit unknown target for the same new-entity intent. It is the
  // same structural alias as the missing-target case above and is safe to canonicalize because
  // the authored requirement itself says that the entity is being created.
  const alreadyCreatedTargets = new Set(requirements.flatMap((effect) => (
    effect.operation === 'create' && effect.targetId ? [effect.targetId] : []
  )))
  requirements.forEach((effect) => {
    if (effect.operation === 'create' || !effect.targetId || known.has(effect.targetId) || alreadyCreatedTargets.has(effect.targetId)) return
    if (!workshopCreateTargetDomains.has(effect.domain) || !workshopRequirementCreatesSomething(effect)) return
    effect.operation = 'create'
    reserved.add(effect.targetId)
  })
  createdByDomain = indexCreatedTargets()

  const createdTargets = new Set(requirements.flatMap((effect) => effect.operation === 'create' && effect.targetId ? [effect.targetId] : []))
  const preferredCreated = (() => {
    const preferredDomains: NarrativeEventRequirement['domain'][] = normalized.originKind === 'new_npc'
      ? ['npc']
      : normalized.category === 'power_shift'
        ? ['ability']
        : normalized.category === 'artifact_shift'
          ? ['artifact', 'inventory']
          : normalized.category === 'faction_move'
            ? ['faction']
            : []
    const preferred = preferredDomains.flatMap((domain) => createdByDomain.get(domain) ?? [])
    return preferred.length === 1 ? preferred[0] : createdTargets.size === 1 ? [...createdTargets][0] : undefined
  })()
  const safeReferences = (values: string[], createdFallback?: string) => [...new Set(values
    .map((id) => idRemap.get(id) ?? id)
    .map((id) => known.has(id) || createdTargets.has(id) ? id : createdFallback)
    .filter((id): id is string => Boolean(id)))]
  const miracleText = workshopReferenceText([
    normalized.concept,
    normalized.trigger,
    ...requirements.map((effect) => effect.requirement),
  ].join(' '))
  const instructionText = workshopReferenceText(request.instruction)
  const immediateMortalDanger = /(?:гибел|смертел|смерт|полный тупик|невозможност\p{L}* действовать|немедленн\p{L}* уничтож)/iu.test(miracleText)
  const ownerRequestedEmergency = /(?:чуд|божествен\p{L}* спас|спаси|спасен|вмешательств)/iu.test(instructionText)
    && /(?:гибел|смертел|смерт|полный тупик|невозможност\p{L}* действовать|уничтож)/iu.test(instructionText)
  const directMiracleAllowed = immediateMortalDanger && ownerRequestedEmergency
  const miracleKind = normalized.miracleKind === 'intervention' && !directMiracleAllowed
    ? normalized.category === 'divine' || normalized.originKind === 'deity' ? 'sign' : 'none'
    : normalized.miracleKind

  return normalizeNarrativeEventProposal({
    ...normalized,
    miracleKind,
    sourceIds: safeReferences(normalized.sourceIds, preferredCreated),
    causeIds: safeReferences(normalized.causeIds),
    scopeIds: safeReferences(normalized.scopeIds, (createdByDomain.get('place') ?? []).length === 1 ? createdByDomain.get('place')?.[0] : undefined),
    participantIds: safeReferences(normalized.participantIds, preferredCreated),
    immediateEffects,
    persistentEffects,
  })
}

function normalizeWorkshopEventResponse(request: CampaignEditRequest, response: CampaignEditResponse): CampaignEditResponse {
  if (!response.eventDirective) return response
  const requestedOptions = request.eventOptions
  const delivery = requestedOptions?.delivery ?? response.eventDirective.delivery
  const stabilized = stabilizeWorkshopEventProposal(request, response.statePatch, response.eventDirective.proposal)
  const proposal = normalizeNarrativeEventProposal({
    ...stabilized,
    mode: delivery === 'seed' ? 'seed' : 'manifest',
    lifecycleStage: delivery === 'seed' ? 'seeded' : 'manifested',
    magnitude: requestedOptions?.magnitude && requestedOptions.magnitude !== 'auto'
      ? requestedOptions.magnitude
      : stabilized.magnitude,
    category: requestedOptions?.category && requestedOptions.category !== 'auto'
      ? requestedOptions.category
      : stabilized.category,
  })
  return {
    ...response,
    eventDirective: {
      ...response.eventDirective,
      delivery,
      proposal,
    },
  }
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
        maxMagnitude: 'transcendent',
        lethality: 'ruthless',
        miraclePolicy: 'rare',
        canonPolicy: 'free',
        storyImpact: 'fate-changing',
        repetitionPolicy: 'unrestricted',
        permissions: { ...defaultEventDirectorSettings.permissions },
      },
    },
  }
  const currentState = normalizeEventDirectorState(request.campaign.eventDirectorState, request.campaign.turn)
  const manualState = {
    ...currentState,
    surpriseCharge: 100,
    categoryCooldowns: {},
    lastMiracleTurn: undefined,
    // A workshop request is validated independently from an already queued owner event.
    // Keeping the records preserves valid existingEventId references, while clearing only
    // the scheduling marker prevents validateNarrativeEventProposal from mistaking the new
    // directive for an attempted substitution of the previously guaranteed event.
    activeEvents: currentState.activeEvents.map((event) => ({
      ...event,
      workshopDirective: undefined,
    })),
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
  let response = normalizeWorkshopEventResponse(request, initial)
  let issues = workshopEventResponseIssues(request, response)
  if (!issues.length) return response
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const repairMessages = [
      ...messages,
      { role: 'assistant' as const, content: JSON.stringify(response) },
      {
        role: 'user' as const,
        content: `Программная проверка команды события отклонила результат:\n${issues.map((issue) => `- ${issue}`).join('\n')}\n\nВерни весь JSON ответа редактора заново. Сохрани точный выбранный delivery, масштаб и категорию. affectedDomains перечисли для каждого домена immediateEffects и persistentEffects. Если новая сущность участвует в sourceIds/causeIds/scopeIds/participantIds, создай её обязательным requirement с тем же стабильным targetId. Для seed/next-turn не применяй последствия заранее; для apply-now полностью реализуй каждое mandatory-требование через настоящий statePatch. Не отвечай пояснением.`,
      },
    ]
    const repairedRaw = await completeJson(request.provider, repairMessages)
    const repaired = await parseWithRepair<CampaignEditResponse>(repairedRaw, campaignEditResponseSchema, request.provider, repairMessages)
    response = normalizeWorkshopEventResponse(request, repaired)
    issues = workshopEventResponseIssues(request, response)
    if (!issues.length) return response
  }
  throw new Error(`Мастерская не смогла безопасно подготовить выбранное событие после трёх точечных исправлений: ${issues.join(' ')}`)
}

async function repairWorkshopStateResponse(
  request: CampaignEditRequest,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  initial: CampaignEditResponse,
) {
  let response = initial
  let issues = workshopStateResponseIssues(request.campaign, request.instruction, response)
  if (!issues.length) return response
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const repairMessages = [
      ...messages,
      { role: 'assistant' as const, content: JSON.stringify(response) },
      {
        role: 'user' as const,
        content: `Программная проверка смысла корректировки установила, что главный запрос владельца фактически не выполнен:\n${issues.map((issue) => `- ${issue}`).join('\n')}\n\nВерни весь JSON ответа редактора заново. Исправь именно постоянное состояние через точные существующие id. Не заменяй обязательное изменение summary, ресурсами другого персонажа, обещанием будущего события или записью в прозе. Сохрани уже правильные части ответа и не удаляй исторически верные записи о прежних событиях.`,
      },
    ]
    const repairedRaw = await completeJson(request.provider, repairMessages)
    const repaired = await parseWithRepair<CampaignEditResponse>(repairedRaw, campaignEditResponseSchema, request.provider, repairMessages)
    response = normalizeWorkshopEventResponse(request, repaired)
    issues = workshopStateResponseIssues(request.campaign, request.instruction, response)
    if (!issues.length) return response
  }
  throw new Error(`Мастерская не выполнила обязательный смысл корректировки после трёх точечных исправлений: ${issues.join(' ')}`)
}

export async function editCampaign(request: CampaignEditRequest, report?: ProgressReporter): Promise<CampaignEditResponse> {
  if (request.provider.provider === 'demo') throw new Error('ИИ-корректор требует подключённую модель. Выберите DeepSeek V4 Flash в настройках.')
  reportProgress(report, 8, 'reading-state', 'Изучаем выбранную кампанию и точные идентификаторы', 1, 4)
  const messages = campaignEditorPrompt(request.campaign, request.instruction, request.eventOptions)
  reportProgress(report, 28, 'planning-edit', 'ИИ проектирует минимальную корректировку без сюжетного хода', 2, 4)
  const raw = await completeJson(request.provider, messages)
  reportProgress(report, 68, 'validating-edit', 'Проверяем структуру, ссылки и допустимые изменения', 3, 4)
  const parsedInitial = await parseWithRepair<CampaignEditResponse>(raw, campaignEditResponseSchema, request.provider, messages)
  const eventSafe = await repairWorkshopEventResponse(request, messages, parsedInitial)
  const stateSafe = await repairWorkshopStateResponse(request, messages, eventSafe)
  const parsed = await repairWorkshopEventResponse(request, messages, stateSafe)
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
  const finalStateIssues = workshopStateResponseIssues(request.campaign, request.instruction, finalResponse)
  if (finalStateIssues.length) throw new Error(`Финальная проверка смысла остановила неполную корректировку: ${finalStateIssues.join(' ')}`)
  const finalArtifactIssues = artifactPlanQualityIssues(request.instruction, finalSanitized.plan, request.campaign.artifactRegistry)
  if (requestedArtifactRarity(request.instruction) && finalArtifactIssues.length) {
    throw new Error(`Финальная сверка Кузницы отклонила более слабую подмену артефакта: ${finalArtifactIssues.join(' ')}`)
  }
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
  const pressureTargetAliases = new Map<string, string>()
  const registerPressureTarget = (canonical: string, aliases: Array<string | undefined> = []) => {
    [canonical, ...aliases].forEach((alias) => {
      const normalized = alias ? normalizedReference(alias) : ''
      if (normalized && !pressureTargetAliases.has(normalized)) pressureTargetAliases.set(normalized, canonical)
    })
  }
  registerPressureTarget(exactPlayerName, [generatedPlayerName])
  world.npcs.forEach((npc) => registerPressureTarget(npc.name))
  world.world.factions.forEach((faction) => registerPressureTarget(faction.name))
  world.world.places.forEach((place) => registerPressureTarget(place.name))
  world.world.processes.forEach((process) => registerPressureTarget(process.title))
  world.world.legends.forEach((legend) => registerPressureTarget(legend.name, [...legend.aliases, ...legend.titles, legend.epithet]))

  world.worldPressures = world.worldPressures.flatMap((pressure) => {
    pressure.sourceNpcName = renamePlayerReference(pressure.sourceNpcName)
    pressure.targetNames = [...new Set(renamePlayerReferences(pressure.targetNames).flatMap((name) => {
      const canonical = pressureTargetAliases.get(normalizedReference(name))
      return canonical ? [canonical] : []
    }))]
    return pressure.targetNames.length ? [pressure] : []
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

/**
 * Adaptive interface modules are an optional projection of the generated world. A stale or
 * undisclosed live binding must never force the provider to regenerate an otherwise complete
 * world (or, worse, disclose hidden state). Structural binding mistakes are handled by the
 * generated-interface schema; this pass removes only elements rejected by the full cross-world
 * binding audit. Runtime interface edits remain strict and continue to surface bad references.
 */
export function sanitizeGeneratedWorldInterfaceBindings(source: GeneratedWorld): GeneratedWorld {
  const world = structuredClone(source)

  for (let pass = 0; pass < 3; pass += 1) {
    const parsed = generatedWorldSchema.safeParse(world)
    if (parsed.success) return world

    const rejectedByModule = new Map<number, Set<number>>()
    parsed.error.issues.forEach((issue) => {
      const [root, collection, moduleIndex, child, elementIndex, field] = issue.path
      if (
        root !== 'world'
        || collection !== 'interfaceModules'
        || child !== 'elements'
        || field !== 'binding'
        || typeof moduleIndex !== 'number'
        || typeof elementIndex !== 'number'
      ) return
      rejectedByModule.set(moduleIndex, new Set([
        ...(rejectedByModule.get(moduleIndex) ?? []),
        elementIndex,
      ]))
    })
    if (!rejectedByModule.size) break

    world.world.interfaceModules = world.world.interfaceModules.flatMap((module, moduleIndex) => {
      const rejected = rejectedByModule.get(moduleIndex)
      if (!rejected?.size) return [module]
      const elements = module.elements.filter((_, elementIndex) => !rejected.has(elementIndex))
      if (!elements.length) return []
      const survivingIds = new Set(elements.map((element) => element.id))
      elements.forEach((element) => {
        if (element.links) element.links = element.links.filter((link) => link !== element.id && survivingIds.has(link))
      })
      return [{ ...module, elements }]
    })
  }

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

const WORLD_STAGE_ROOT_FIELDS: Record<WorldGenerationStage, readonly string[]> = {
  core: ['title', 'player', 'inventory'],
  civilization: [],
  characters: ['npcs', 'socialLinks', 'characterArcs', 'antagonistPlans', 'worldPressures', 'influenceAssets'],
  legends: ['lore'],
  narrative: ['worldEvents', 'factionReputation', 'threads', 'mysteryCases', 'quests', 'opening'],
  interface: [],
}

const WORLD_STAGE_WORLD_FIELDS: Record<WorldGenerationStage, readonly string[]> = {
  core: ['name', 'tagline', 'inspiration', 'genre', 'tone', 'era', 'overview', 'rules', 'capabilitySystem', 'system', 'presentation'],
  civilization: ['factions', 'locations', 'places', 'routes', 'laws', 'mechanics'],
  characters: [],
  legends: ['legendarium', 'legends'],
  narrative: ['processes', 'mysteries'],
  interface: ['interfaceModules', 'interfaceBlueprint', 'metrics'],
}

function worldGenerationRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function pickPresentFields(source: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(fields.flatMap((field) => Object.hasOwn(source, field) ? [[field, source[field]]] : []))
}

/**
 * DeepSeek sometimes answers a section request with a complete generated world or wraps it in
 * transport-like objects. Select only the requested ownership slice before strict validation.
 * This changes structure only: no missing field or authored fact is fabricated.
 */
export function extractGeneratedWorldStageCandidate(value: unknown, stage: WorldGenerationStage): unknown {
  let candidate = value
  const stageWrappers = [stage, `${stage}Section`, `${stage}_section`]
  const transportWrappers = ['section', 'data', 'result', 'response', 'payload', 'output', 'generatedWorld', 'generated_world', 'campaign']

  for (let depth = 0; depth < 8; depth += 1) {
    const record = worldGenerationRecord(candidate)
    if (!record) return candidate
    const wrapperKey = [...stageWrappers, ...transportWrappers]
      .find((key) => worldGenerationRecord(record[key]) !== undefined)
    if (!wrapperKey) break
    candidate = record[wrapperKey]
  }

  const record = worldGenerationRecord(candidate)
  if (!record) return candidate
  const world = worldGenerationRecord(record.world) ?? {}
  const rootFields = WORLD_STAGE_ROOT_FIELDS[stage]
  const worldFields = WORLD_STAGE_WORLD_FIELDS[stage]
  const hasOwnedRoot = rootFields.some((field) => Object.hasOwn(record, field))
  const hasOwnedWorld = worldFields.some((field) => Object.hasOwn(world, field))
  const resemblesGeneratedWorld = Object.hasOwn(record, 'world')
    && (Object.hasOwn(record, 'player') || Object.hasOwn(record, 'inventory') || Object.hasOwn(record, 'npcs') || Object.hasOwn(record, 'title'))
  if (!hasOwnedRoot && !hasOwnedWorld && !resemblesGeneratedWorld) return candidate

  const section = pickPresentFields(record, rootFields)
  if (worldFields.length) section.world = pickPresentFields(world, worldFields)
  return section
}

export function extractGeneratedWorldNpcBatchCandidate(value: unknown): unknown {
  const candidate = extractGeneratedWorldStageCandidate(value, 'characters')
  if (Array.isArray(candidate)) return { npcs: candidate }
  const record = worldGenerationRecord(candidate)
  return record && Object.hasOwn(record, 'npcs') ? { npcs: record.npcs } : candidate
}

export function extractGeneratedWorldCharacterTopologyCandidate(value: unknown): unknown {
  const candidate = extractGeneratedWorldStageCandidate(value, 'characters')
  const record = worldGenerationRecord(candidate)
  if (!record) return candidate
  return pickPresentFields(record, ['socialLinks', 'characterArcs', 'antagonistPlans', 'worldPressures', 'influenceAssets'])
}

/** Deterministically restores manifest order and rejects silent omissions or invented NPCs. */
export function assembleGeneratedWorldCharacters(
  batches: GeneratedWorldNpcBatch[],
  topology: GeneratedWorldCharacterTopology,
  plannedNames: string[],
): GeneratedWorldCharacters {
  const normalizeName = (name: string) => name.trim().toLocaleLowerCase('ru-RU')
  const byName = new Map<string, GeneratedWorldCharacters['npcs'][number]>()
  for (const npc of batches.flatMap((batch) => batch.npcs)) {
    const key = normalizeName(npc.name)
    if (byName.has(key)) throw new Error(`NPC-пакеты повторили персонажа: ${npc.name}`)
    byName.set(key, npc)
  }
  const plannedKeys = new Set(plannedNames.map(normalizeName))
  const invented = [...byName.values()].filter((npc) => !plannedKeys.has(normalizeName(npc.name)))
  if (invented.length) throw new Error(`NPC-пакет создал незапланированные имена: ${invented.map((npc) => npc.name).join(', ')}`)
  const missing = plannedNames.filter((name) => !byName.has(normalizeName(name)))
  if (missing.length) throw new Error(`NPC-пакеты пропустили персонажей: ${missing.join(', ')}`)
  return {
    npcs: plannedNames.map((name) => byName.get(normalizeName(name))!),
    ...topology,
  }
}

async function generateWorldSection<T>(
  request: WorldGenerationRequest,
  concept: ConceptAnalysis,
  sections: Partial<GeneratedWorldSections>,
  stage: WorldGenerationStage,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } },
  issues?: string,
  manifest?: WorldGenerationManifest,
): Promise<T> {
  const establishedFacts = establishedFactsForStage(sections, stage)
  const currentSection = sections[stage]
  const messages = issues && currentSection
    ? worldGenerationStageRepairPrompt(request, concept, stage, establishedFacts, currentSection, issues, manifest)
    : worldGenerationStagePrompt(request, concept, stage, establishedFacts, manifest)
  const maxOutputTokens = stage === 'characters' || stage === 'legends'
    ? 131_072
    : stage === 'core' || stage === 'civilization' || stage === 'narrative'
      ? 98_304
      : 49_152
  const policy = WORLD_GENERATION_POLICIES[request.generationMode ?? 'balanced']
  const raw = await completeJson(request.provider, messages, {
    stage: 'world',
    maxOutputTokens,
    maxAttempts: policy.providerAttempts,
    transportAttempts: policy.transportAttempts,
    timeoutMs: 180_000,
  })
  return parseWithRepair<T>(raw, schema, request.provider, messages, undefined, (candidate) => extractGeneratedWorldStageCandidate(candidate, stage), { maxAttempts: policy.schemaAttempts })
}

async function generateWorldCharactersInBatches(
  request: WorldGenerationRequest,
  concept: ConceptAnalysis,
  manifest: WorldGenerationManifest,
): Promise<GeneratedWorldCharacters> {
  const policy = WORLD_GENERATION_POLICIES[request.generationMode ?? 'balanced']
  const plannedBatches = Array.from(
    { length: Math.ceil(manifest.npcs.length / 4) },
    (_, index) => manifest.npcs.slice(index * 4, index * 4 + 4),
  )
  const maxFocusedAttempts = Math.max(2, policy.schemaAttempts)
  const authorBatch = async (batchIndex: number, attempt: number): Promise<GeneratedWorldNpcBatch> => {
    const plannedNpcs = plannedBatches[batchIndex]
    const baseMessages = worldGenerationNpcBatchPrompt(request, concept, manifest, plannedNpcs)
    const messages = attempt === 0 ? baseMessages : [
      ...baseMessages,
      {
        role: 'user' as const,
        content: `ТОЧЕЧНЫЙ ПОВТОР NPC_BATCH ${batchIndex + 1}, попытка ${attempt + 1}, nonce=${randomUUID()}. Предыдущий ответ этого пакета не прошёл проверку. Верни заново только полный JSON {"npcs":[...]} для тех же имён; не меняй другие пакеты.`,
      },
    ]
    const raw = await completeJson(request.provider, messages, {
      stage: 'world',
      maxOutputTokens: 32_768,
      maxAttempts: policy.providerAttempts,
      // Focused retries below replace the old nested transport × whole-stage retry cascade.
      transportAttempts: 1,
      timeoutMs: 180_000,
    })
    const batch = await parseWithRepair<GeneratedWorldNpcBatch>(
      raw,
      generatedWorldNpcBatchSchema,
      request.provider,
      messages,
      undefined,
      extractGeneratedWorldNpcBatchCandidate,
      { maxAttempts: Math.min(2, policy.schemaAttempts) },
    )
    assembleGeneratedWorldCharacters([batch], {
      socialLinks: [], characterArcs: [], antagonistPlans: [], worldPressures: [], influenceAssets: [],
    }, plannedNpcs.map((npc) => npc.name))
    return batch
  }

  const batches: Array<GeneratedWorldNpcBatch | undefined> = Array(plannedBatches.length)
  let pending = plannedBatches.map((_, index) => index)
  let lastBatchErrors = new Map<number, unknown>()
  for (let attempt = 0; pending.length && attempt < maxFocusedAttempts; attempt += 1) {
    const settled = await Promise.allSettled(pending.map((batchIndex) => authorBatch(batchIndex, attempt)))
    const failed: number[] = []
    const errors = new Map<number, unknown>()
    settled.forEach((result, resultIndex) => {
      const batchIndex = pending[resultIndex]
      if (result.status === 'fulfilled') batches[batchIndex] = result.value
      else {
        failed.push(batchIndex)
        errors.set(batchIndex, result.reason)
      }
    })
    pending = failed
    lastBatchErrors = errors
  }
  if (pending.length) {
    throw new Error(`Не завершены NPC-пакеты ${pending.map((index) => index + 1).join(', ')}: ${pending.map((index) => {
      const reason = lastBatchErrors.get(index)
      return reason instanceof Error ? reason.message : String(reason)
    }).join('; ')}`)
  }

  const completeBatches = batches as GeneratedWorldNpcBatch[]
  const orderedNpcs = assembleGeneratedWorldCharacters(completeBatches, {
    socialLinks: [], characterArcs: [], antagonistPlans: [], worldPressures: [], influenceAssets: [],
  }, manifest.npcs.map((npc) => npc.name)).npcs

  let topology: GeneratedWorldCharacterTopology | undefined
  let topologyError: unknown
  for (let attempt = 0; !topology && attempt < maxFocusedAttempts; attempt += 1) {
    const baseMessages = worldGenerationCharacterTopologyPrompt(request, concept, manifest, orderedNpcs)
    const messages = attempt === 0 ? baseMessages : [
      ...baseMessages,
      {
        role: 'user' as const,
        content: `ТОЧЕЧНЫЙ ПОВТОР CHARACTER_TOPOLOGY, попытка ${attempt + 1}, nonce=${randomUUID()}. Верни заново только пять topology-массивов, не повторяй npcs.`,
      },
    ]
    try {
      const rawTopology = await completeJson(request.provider, messages, {
        stage: 'world',
        maxOutputTokens: 24_576,
        maxAttempts: policy.providerAttempts,
        transportAttempts: 1,
        timeoutMs: 120_000,
      })
      topology = await parseWithRepair<GeneratedWorldCharacterTopology>(
        rawTopology,
        generatedWorldCharacterTopologySchema,
        request.provider,
        messages,
        undefined,
        extractGeneratedWorldCharacterTopologyCandidate,
        { maxAttempts: Math.min(2, policy.schemaAttempts) },
      )
    } catch (error) {
      topologyError = error
    }
  }
  if (!topology) {
    console.warn(`[world-generation:characters] Необязательный граф связей пропущен после точечных попыток; полные NPC сохранены: ${topologyError instanceof Error ? topologyError.message : String(topologyError)}`)
    topology = { socialLinks: [], characterArcs: [], antagonistPlans: [], worldPressures: [], influenceAssets: [] }
  }

  const assembled = assembleGeneratedWorldCharacters(completeBatches, topology, manifest.npcs.map((npc) => npc.name))
  const parsed = generatedWorldCharactersSchema.safeParse(assembled)
  if (!parsed.success) throw new Error(compactIssues(parsed.error, assembled))
  return parsed.data
}

/**
 * A full legend dossier is one of the densest objects in the world contract. Asking DeepSeek to
 * author 10-18 of them plus lore in one response can exceed Ollama Cloud's absolute 131k output
 * limit. Author immutable manifest figures in independent groups of three, then assemble them in
 * manifest order. This changes only transport granularity: every figure still uses the complete
 * legend schema and keeps all deeds, myths, legacies, discovery and encounter fields.
 */
async function generateWorldLegendsInBatches(
  request: WorldGenerationRequest,
  concept: ConceptAnalysis,
  manifest: WorldGenerationManifest,
): Promise<GeneratedWorldLegends> {
  const policy = WORLD_GENERATION_POLICIES[request.generationMode ?? 'balanced']
  const plannedBatches = Array.from(
    { length: Math.ceil(manifest.legends.length / 3) },
    (_, index) => manifest.legends.slice(index * 3, index * 3 + 3),
  )
  if (!plannedBatches.length) {
    return generateWorldSection(request, concept, {}, 'legends', generatedWorldLegendsSchema, undefined, manifest)
  }

  const authorBatch = async (batchIndex: number, attempt: number): Promise<GeneratedWorldLegends> => {
    const planned = plannedBatches[batchIndex]
    const scopedManifest: WorldGenerationManifest = { ...manifest, legends: planned }
    const messages = worldGenerationStagePrompt(request, concept, 'legends', undefined, scopedManifest)
    messages.splice(1, 0, {
      role: 'system' as const,
      content: `LEGEND_BATCH ${batchIndex + 1}/${plannedBatches.length}. Это транспортная часть единого легендариума. Требование создать минимум десять фигур относится к сумме всех пакетов, а не к этому ответу. В world.legends верни ровно ${planned.length} полных досье и только для этих имён: ${planned.map((entry) => entry.name).join(', ')}. Не сокращай ни одно досье. world.legendarium верни полностью и согласованно с миром. lore содержит не более шести самых важных записей именно этого пакета.`,
    })
    if (attempt > 0) messages.push({
      role: 'user' as const,
      content: `Повтори только пакет ${batchIndex + 1}; nonce=${randomUUID()}. Верни законченный JSON одного пакета без Markdown и без фигур из других пакетов.`,
    })
    const raw = await completeJson(request.provider, messages, {
      stage: 'world',
      maxOutputTokens: 49_152,
      maxAttempts: policy.providerAttempts,
      transportAttempts: 1,
      timeoutMs: 180_000,
    })
    const parsed = await parseWithRepair<GeneratedWorldLegends>(
      raw,
      generatedWorldLegendsSchema,
      request.provider,
      messages,
      undefined,
      (candidate) => extractGeneratedWorldStageCandidate(candidate, 'legends'),
      { maxAttempts: Math.min(2, policy.schemaAttempts) },
    )
    const expected = new Set(planned.map((entry) => normalizedReference(entry.name)))
    parsed.world.legends = parsed.world.legends.filter((entry) => expected.has(normalizedReference(entry.name)))
    const returned = new Set(parsed.world.legends.map((entry) => normalizedReference(entry.name)))
    const missing = planned.filter((entry) => !returned.has(normalizedReference(entry.name)))
    if (missing.length) throw new Error(`Пакет легенд пропустил фигуры: ${missing.map((entry) => entry.name).join(', ')}`)
    return parsed
  }

  const batches: Array<GeneratedWorldLegends | undefined> = Array(plannedBatches.length)
  let pending = plannedBatches.map((_, index) => index)
  let lastErrors = new Map<number, unknown>()
  const maxAttempts = Math.max(2, policy.schemaAttempts)
  for (let attempt = 0; pending.length && attempt < maxAttempts; attempt += 1) {
    const attempted = [...pending]
    // The six world owners already run in parallel. Keep legend packets sequential inside their
    // owner so this split does not raise provider concurrency above the previous proven ceiling.
    const settled: PromiseSettledResult<GeneratedWorldLegends>[] = []
    for (const batchIndex of attempted) {
      settled.push((await Promise.allSettled([authorBatch(batchIndex, attempt)]))[0])
    }
    const failed: number[] = []
    const errors = new Map<number, unknown>()
    settled.forEach((result, index) => {
      const batchIndex = attempted[index]
      if (result.status === 'fulfilled') batches[batchIndex] = result.value
      else {
        failed.push(batchIndex)
        errors.set(batchIndex, result.reason)
      }
    })
    pending = failed
    lastErrors = errors
  }
  if (pending.length) throw new Error(`Не завершены пакеты легенд ${pending.map((index) => index + 1).join(', ')}: ${pending.map((index) => {
    const reason = lastErrors.get(index)
    return reason instanceof Error ? reason.message : String(reason)
  }).join('; ')}`)

  const completed = batches as GeneratedWorldLegends[]
  const byName = new Map(completed.flatMap((batch) => batch.world.legends).map((entry) => [normalizedReference(entry.name), entry]))
  const loreByTitle = new Map(completed.flatMap((batch) => batch.lore).map((entry) => [normalizedReference(entry.title), entry]))
  const assembled: GeneratedWorldLegends = {
    world: {
      legendarium: completed[0].world.legendarium,
      legends: manifest.legends.map((entry) => byName.get(normalizedReference(entry.name))!).filter(Boolean),
    },
    lore: [...loreByTitle.values()].slice(0, 30),
  }
  const final = generatedWorldLegendsSchema.safeParse(assembled)
  if (!final.success) throw new Error(compactIssues(final.error, assembled))
  return final.data
}

async function regenerateOwnedWorldSection(
  stage: WorldGenerationStage,
  sections: GeneratedWorldSections,
  request: WorldGenerationRequest,
  concept: ConceptAnalysis,
  issues: string,
  manifest?: WorldGenerationManifest,
): Promise<GeneratedWorldSections> {
  const next = { ...sections }
  if (stage === 'core') next.core = await generateWorldSection(request, concept, sections, stage, generatedWorldCoreSchema, issues, manifest)
  else if (stage === 'civilization') next.civilization = await generateWorldSection(request, concept, sections, stage, generatedWorldCivilizationSchema, issues, manifest)
  else if (stage === 'characters' && manifest) next.characters = await generateWorldCharactersInBatches(request, concept, manifest)
  else if (stage === 'characters') next.characters = await generateWorldSection(request, concept, sections, stage, generatedWorldCharactersSchema, issues)
  else if (stage === 'legends' && manifest) next.legends = await generateWorldLegendsInBatches(request, concept, manifest)
  else if (stage === 'legends') next.legends = await generateWorldSection(request, concept, sections, stage, generatedWorldLegendsSchema, issues)
  else if (stage === 'narrative') next.narrative = await generateWorldSection(request, concept, sections, stage, generatedWorldNarrativeSchema, issues, manifest)
  else next.interface = await generateWorldSection(request, concept, sections, stage, generatedWorldInterfaceSchema, issues, manifest)
  return next
}

async function ensureGeneratedWorldIntegrity(
  source: GeneratedWorldSections,
  request: WorldGenerationRequest,
  _concept: ConceptAnalysis,
  report?: ProgressReporter,
  _manifest?: WorldGenerationManifest,
): Promise<{ world: GeneratedWorld; sections: GeneratedWorldSections }> {
  const world = sanitizeGeneratedWorldInterfaceBindings(
    normalizeGeneratedWorldReferences(assembleGeneratedWorldSections(source), request.characterName),
  )
  const strict = generatedWorldSchema.safeParse(world)
  if (strict.success) return { world: strict.data, sections: splitGeneratedWorldSections(strict.data) }

  // Every owned section has already passed its full schema before this function runs. Remaining
  // failures are cross-section quality assertions (for example, a legend/NPC strength mismatch),
  // not a malformed world. Reprinting an entire 50k-130k token section at 80% repeatedly caused
  // DeepSeek/Ollama Cloud to hit its hard output ceiling and discarded six completed sections.
  // Keep the structurally complete candidate instead; normalizeWorld resolves names to stable IDs
  // and filters dangling optional links while preserving all authored lore, characters and items.
  const structural = generatedWorldDraftSchema.safeParse(world)
  if (!structural.success) {
    throw new Error(`Собранный мир содержит незавершённый обязательный раздел: ${compactIssues(structural.error, world)}`)
  }
  console.warn(`[world-integrity] Сохранён полный структурно корректный мир без повторной печати больших разделов: ${compactIssues(strict.error, world)}`)
  reportProgress(report, 86, 'world-integrity', 'Основные разделы готовы; необязательные перекрёстные замечания сохранены без повторной генерации', 9, 11)
  const preserved = structural.data as GeneratedWorld
  return { world: preserved, sections: splitGeneratedWorldSections(preserved) }
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

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (!items.length) return []
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

type MissingGeneratedAbilityProfile = {
  requestId: string
  ownerKind: 'player' | 'npc'
  ownerId: string
  ownerName: string
  ownerContext: unknown
  resources: string[]
  ability: AbilityDraft
  siblingAbilities: Array<Pick<AbilityDraft, 'name' | 'description' | 'source' | 'capabilities' | 'effects'>>
  apply: (profile: AbilityProfileDraft) => void
}

type AuthoredProfileResult = {
  target: MissingGeneratedAbilityProfile
  profile?: AbilityProfileDraft
  issues: string[]
}

function generatedProfileBatches<T>(values: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}

/**
 * DeepSeek can finish a large core/character section while omitting the heaviest nested profile
 * objects. Re-author those profiles in small parallel batches instead of discarding and repeating
 * the complete world section. A failed profile remains on the legacy card; the valid world itself
 * is never lost because an auxiliary presentation layer timed out.
 */
export async function authorGeneratedWorldAbilityProfiles(
  source: GeneratedWorld,
  request: WorldGenerationRequest,
  concept: ConceptAnalysis,
  report?: ProgressReporter,
): Promise<GeneratedWorld> {
  const world = structuredClone(source)
  const system = capabilitySystemCandidate(world.world.capabilitySystem, undefined, 0)
  if (!system) return world

  const targets: MissingGeneratedAbilityProfile[] = []
  const playerSiblings = world.player.abilities.map((ability) => ({
    name: ability.name,
    description: ability.description,
    source: ability.source,
    capabilities: ability.capabilities,
    effects: ability.effects,
  }))
  world.player.abilities.forEach((ability, abilityIndex) => {
    if (ability.profile) return
    targets.push({
      requestId: `player-${abilityIndex}`,
      ownerKind: 'player',
      ownerId: 'generated-player',
      ownerName: world.player.name,
      ownerContext: { characterConcept: request.characterConcept, personality: world.player.personality, goal: world.player.goal, stats: world.player.stats },
      resources: world.player.resources.map((resource) => resource.key),
      ability,
      siblingAbilities: playerSiblings,
      apply: (profile) => { ability.profile = profile },
    })
  })
  world.npcs.forEach((npc, npcIndex) => {
    const siblingAbilities = npc.abilities.map((ability) => ({
      name: ability.name,
      description: ability.description,
      source: ability.source,
      capabilities: ability.capabilities,
      effects: ability.effects,
    }))
    npc.abilities.forEach((ability, abilityIndex) => {
      if (ability.profile) return
      targets.push({
        requestId: `npc-${npcIndex}-${abilityIndex}`,
        ownerKind: 'npc',
        ownerId: `generated-npc-${npcIndex}`,
        ownerName: npc.name,
        ownerContext: { role: npc.role, personality: npc.personality, goal: npc.currentGoal, strategy: npc.strategy },
        resources: npc.resources.map((resource) => resource.key),
        ability,
        siblingAbilities,
        apply: (profile) => { ability.profile = profile },
      })
    })
  })
  if (!targets.length) return world

  reportProgress(
    report,
    77,
    'ability-profiles',
    `Отдельно дописываем авторские карточки способностей: ${targets.length}`,
    8,
    11,
    generatedProfileBatches(targets, 3).map((batch) => batch.map((target) => target.ability.name).join(' · ')),
  )

  let registry: NonNullable<Campaign['abilityRegistry']> = []
  const registerExisting = (ownerId: string, ownerKind: 'player' | 'npc', ability: AbilityDraft, abilityId: string) => {
    if (!ability.profile) return
    const candidate = abilityStateCandidate(abilityDraftForSystem({ ...ability, id: abilityId }, system), 0)
    registry = updateAbilityRegistry(registry, candidate, ownerId, ownerKind, 'active', 0)
  }
  world.player.abilities.forEach((ability, index) => registerExisting('generated-player', 'player', ability, `generated-player-ability-${index}`))
  world.npcs.forEach((npc, npcIndex) => npc.abilities.forEach((ability, abilityIndex) => (
    registerExisting(`generated-npc-${npcIndex}`, 'npc', ability, `generated-npc-${npcIndex}-ability-${abilityIndex}`)
  )))

  const generationPolicy = WORLD_GENERATION_POLICIES[request.generationMode ?? 'balanced']
  const worldContext = {
    name: world.world.name,
    genre: world.world.genre,
    tone: world.world.tone,
    era: world.world.era,
    rules: world.world.rules,
    system: world.world.system,
    capabilitySystem: world.world.capabilitySystem,
  }
  const compactRegistry = () => registry.slice(-64).map((entry) => ({
    abilityId: entry.abilityId,
    ownerKind: entry.ownerKind,
    ownerId: entry.ownerId,
    name: entry.name,
    lineageId: entry.lineageId,
    canonStatus: entry.canonStatus,
    fingerprint: entry.fingerprint,
  }))

  const authorBatch = async (
    batch: MissingGeneratedAbilityProfile[],
    priorIssues: Record<string, string[]> = {},
  ): Promise<AuthoredProfileResult[]> => {
    const messages = abilityProfileAuthoringPrompt({
      world: worldContext,
      concept,
      canonMode: request.canonMode,
      targets: batch.map((target) => ({
        requestId: target.requestId,
        owner: { kind: target.ownerKind, id: target.ownerId, name: target.ownerName, context: target.ownerContext, resources: target.resources },
        ability: { ...target.ability, profile: undefined },
        siblingAbilities: target.siblingAbilities,
      })),
      registry: compactRegistry(),
      ...(Object.keys(priorIssues).length ? { issues: priorIssues } : {}),
    })
    try {
      const raw = await completeJson(request.provider, messages, {
        stage: 'world',
        maxOutputTokens: Math.min(32_768, Math.max(8_192, batch.length * 8_192)),
        maxAttempts: generationPolicy.providerAttempts,
        transportAttempts: generationPolicy.transportAttempts,
        timeoutMs: 120_000,
      })
      const authored = await parseWithRepair<AbilityProfileAuthoringResponse>(
        raw,
        abilityProfileAuthoringSchema,
        request.provider,
        messages,
        undefined,
        undefined,
        { maxAttempts: generationPolicy.schemaAttempts },
      )
      const responseById = new Map(authored.profiles.map((entry) => [entry.requestId, entry.profile]))
      return batch.map((target, batchIndex) => {
        const profile = responseById.get(target.requestId)
        if (!profile) return { target, issues: [`Ответ не содержит profile для requestId=${target.requestId}.`] }
        const normalizedDraft = abilityDraftForSystem({ ...target.ability, id: `generated-profile-${target.requestId}-${batchIndex}`, profile }, system)
        const normalizedProfile = normalizedDraft.profile
        if (!normalizedProfile) return { target, issues: ['Авторский profile отсутствует после структурной проверки.'] }
        // Cost references and duplicate technique names belong to the base ability and are repaired
        // by cross-world integrity. They must not invalidate a correctly authored profile.
        const issues = abilityProfileIssues(abilityStateCandidate(normalizedDraft, 0), system, target.resources)
          .filter((issue) => !issue.startsWith('Цена ссылается на неизвестный ресурс:') && issue !== 'Техники способности имеют повторяющиеся имена.')
        return issues.length ? { target, issues } : { target, profile: normalizedProfile, issues: [] }
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return batch.map((target) => ({ target, issues: [`Точечная генерация profile: ${detail}`] }))
    }
  }

  const primaryGroups = await mapWithConcurrency(generatedProfileBatches(targets, 3), 3, (batch) => authorBatch(batch))
  let results = primaryGroups.flat()
  const unresolved = results.filter((result) => !result.profile)
  if (unresolved.length) {
    const retries = await mapWithConcurrency(unresolved, 3, (result) => authorBatch(
      [result.target],
      { [result.target.requestId]: result.issues },
    ))
    const retriedById = new Map(retries.flat().map((result) => [result.target.requestId, result]))
    results = results.map((result) => retriedById.get(result.target.requestId) ?? result)
  }

  results.forEach((result) => {
    if (!result.profile) {
      console.warn(`[ability-profile] «${result.target.ability.name}» оставлена на совместимой карточке: ${result.issues.join(' ')}`)
      return
    }
    result.target.apply(result.profile)
    const abilityId = `generated-${result.target.requestId}`
    const candidate = abilityStateCandidate(abilityDraftForSystem({ ...result.target.ability, id: abilityId, profile: result.profile }, system), 0)
    registry = updateAbilityRegistry(registry, candidate, result.target.ownerId, result.target.ownerKind, 'active', 0)
  })

  const authoredCount = results.filter((result) => result.profile).length
  reportProgress(report, 79, 'ability-profiles', `Готово авторских карточек: ${authoredCount} из ${targets.length}`, 8, 11)
  return world
}

const WORLD_GENERATION_STAGES: WorldGenerationStage[] = ['core', 'civilization', 'characters', 'legends', 'narrative', 'interface']

function missingManifestValues(label: string, planned: string[], actual: string[]): string[] {
  const known = new Set(actual.map((value) => value.trim().toLocaleLowerCase('ru-RU')))
  const missing = planned.filter((value) => !known.has(value.trim().toLocaleLowerCase('ru-RU')))
  return missing.length ? [`Паспорт мира требует ${label}: ${missing.join(', ')}`] : []
}

function worldManifestStageIssues(
  stage: WorldGenerationStage,
  sections: GeneratedWorldSections,
  manifest: WorldGenerationManifest,
): string[] {
  if (stage === 'core') {
    const system = sections.core.world.capabilitySystem
    const representedPlayerCapabilities = [
      ...sections.core.player.abilities.map((entry) => entry.name),
      ...sections.core.inventory.flatMap((item) => item.artifact?.powers.map((power) => power.name) ?? []),
    ]
    return [
      ...(sections.core.world.name === manifest.world.name ? [] : [`Имя мира должно буквально совпадать с паспортом: ${manifest.world.name}`]),
      ...(sections.core.player.name === manifest.player.name ? [] : [`Имя героя должно буквально совпадать с паспортом: ${manifest.player.name}`]),
      ...missingManifestValues('характеристики героя', manifest.player.statKeys, sections.core.player.stats.map((entry) => entry.key)),
      ...missingManifestValues('ресурсы героя', manifest.player.resourceKeys, sections.core.player.resources.map((entry) => entry.key)),
      ...missingManifestValues('личные способности или силы предметов героя', manifest.player.abilityNames, representedPlayerCapabilities),
      ...missingManifestValues('стартовые предметы', manifest.player.inventory.map((entry) => entry.name), sections.core.inventory.map((entry) => entry.name)),
      ...missingManifestValues('группы системы возможностей', manifest.world.capabilityGroups.map((entry) => entry.id), system?.groups.map((entry) => entry.id ?? '') ?? []),
      ...missingManifestValues('классы системы возможностей', manifest.world.capabilityTiers.map((entry) => entry.id), system?.tiers.map((entry) => entry.id ?? '') ?? []),
    ]
  }
  if (stage === 'civilization') return [
    ...missingManifestValues('фракции', manifest.factions.map((entry) => entry.name), sections.civilization.world.factions.map((entry) => entry.name)),
    ...missingManifestValues('места', manifest.places.map((entry) => entry.name), sections.civilization.world.places.map((entry) => entry.name)),
  ]
  if (stage === 'characters') return missingManifestValues('NPC', manifest.npcs.map((entry) => entry.name), sections.characters.npcs.map((entry) => entry.name))
  if (stage === 'legends') return missingManifestValues('легендарные фигуры', manifest.legends.map((entry) => entry.name), sections.legends.world.legends.map((entry) => entry.name))
  if (stage === 'narrative') return [
    ...missingManifestValues('мировые процессы', manifest.narrative.processTitles, sections.narrative.world.processes.map((entry) => entry.title)),
    ...missingManifestValues('мировые события', manifest.narrative.eventTitles, sections.narrative.worldEvents.map((entry) => entry.title)),
    ...missingManifestValues('сюжетные нити', manifest.narrative.threadTitles, sections.narrative.threads.map((entry) => entry.title)),
    ...(sections.narrative.opening.scene.location === manifest.narrative.openingLocationName ? [] : [`Стартовая локация должна совпадать с паспортом: ${manifest.narrative.openingLocationName}`]),
  ]
  return [
    ...missingManifestValues('метрики интерфейса', manifest.interface.metricIds, (sections.interface.world.metrics ?? []).map((entry) => entry.id)),
  ]
}

async function generateParallelWorldStage(
  stage: WorldGenerationStage,
  request: WorldGenerationRequest,
  concept: ConceptAnalysis,
  manifest: WorldGenerationManifest,
): Promise<readonly [WorldGenerationStage, GeneratedWorldSections[WorldGenerationStage]]> {
  const emptySections: Partial<GeneratedWorldSections> = {}
  if (stage === 'core') return [stage, await generateWorldSection(request, concept, emptySections, stage, generatedWorldCoreSchema, undefined, manifest)]
  if (stage === 'civilization') return [stage, await generateWorldSection(request, concept, emptySections, stage, generatedWorldCivilizationSchema, undefined, manifest)]
  if (stage === 'characters') return [stage, await generateWorldCharactersInBatches(request, concept, manifest)]
  if (stage === 'legends') return [stage, await generateWorldLegendsInBatches(request, concept, manifest)]
  if (stage === 'narrative') return [stage, await generateWorldSection(request, concept, emptySections, stage, generatedWorldNarrativeSchema, undefined, manifest)]
  return [stage, await generateWorldSection(request, concept, emptySections, stage, generatedWorldInterfaceSchema, undefined, manifest)]
}

export async function generateWorld(request: WorldGenerationRequest, report?: ProgressReporter): Promise<GeneratedWorld> {
  request = { ...request, creativeSeed: randomUUID() }
  const generationMode = request.generationMode ?? 'balanced'
  const generationPolicy = WORLD_GENERATION_POLICIES[generationMode]
  reportProgress(report, 3, 'concept', 'Разбираем замысел, героя и ограничения', 1, 11)
  if (request.provider.provider === 'demo') {
    reportProgress(report, 96, 'assembling', 'Собираем адаптивный демонстрационный мир', 10, 11)
    return demoWorld(request)
  }
  const analysisMessages = conceptAnalystPrompt(request)
  const rawAnalysis = await completeJson(request.provider, analysisMessages, {
    stage: 'world',
    maxAttempts: generationPolicy.providerAttempts,
    transportAttempts: generationPolicy.transportAttempts,
    timeoutMs: 120_000,
  })
  let concept = await parseWithRepair<ConceptAnalysis>(rawAnalysis, conceptAnalysisSchema, request.provider, analysisMessages, undefined, undefined, { maxAttempts: generationPolicy.schemaAttempts })
  const requestIntent = analyzeWorldRequestIntent(request)
  if (
    requestIntent.referenceRole === 'inspiration'
    && request.canonMode !== 'faithful'
    && concept.recognizedCanon
    && concept.entities.every((entity) => entity.type === 'world' || entity.type === 'other')
  ) {
    concept = {
      ...concept,
      recognizedCanon: false,
      entities: [],
      originalityRules: [...new Set([
        'Названные произведения задают жанровый опыт, но мир остаётся авторским и не копирует их имена или сюжет.',
        ...concept.originalityRules,
      ])].slice(0, 32),
    }
  }
  if (concept.recognizedCanon && (request.canonMode === 'faithful' || generationMode === 'deep')) {
    reportProgress(report, 10, 'canon', 'Сверяем канон, эпоху и заявленные силы', 2, 11)
    const verifierMessages = canonVerifierPrompt(request, concept)
    concept = await optionalStage<ConceptAnalysis>('canon-verifier', async () => {
      const verified = await completeJson(request.provider, verifierMessages, {
        maxAttempts: generationPolicy.providerAttempts,
        transportAttempts: generationPolicy.transportAttempts,
        timeoutMs: 90_000,
      })
      return parseWithRepair<ConceptAnalysis>(verified, conceptAnalysisSchema, request.provider, verifierMessages, undefined, undefined, { maxAttempts: generationPolicy.schemaAttempts })
    }, concept)
  }

  reportProgress(report, 15, 'world-manifest', 'Фиксируем единый паспорт имён, сил и причинных связей', 3, 11)
  const manifestMessages = worldGenerationManifestPrompt(request, concept)
  const rawManifest = await completeJson(request.provider, manifestMessages, {
    stage: 'world',
    maxOutputTokens: 24_576,
    maxAttempts: generationPolicy.providerAttempts,
    transportAttempts: generationPolicy.transportAttempts,
    timeoutMs: 120_000,
  })
  let manifest = await parseWithRepair<WorldGenerationManifest>(rawManifest, worldGenerationManifestSchema, request.provider, manifestMessages, undefined, undefined, { maxAttempts: generationPolicy.schemaAttempts })
  let bestManifest = manifest
  let bestManifestIssues = worldManifestOriginalityIssues(manifest, request)
  for (let attempt = 0; bestManifestIssues.length && attempt < generationPolicy.originalityRepairs; attempt += 1) {
    reportProgress(report, 19 + attempt * 2, 'world-originality', 'Убираем повторяющиеся основы и отделяем мир от способностей героя', 3, 11)
    const repairMessages = worldGenerationManifestOriginalityRepairPrompt(request, concept, bestManifest, bestManifestIssues)
    const repairedRaw = await completeJson(request.provider, repairMessages, {
      stage: 'world',
      maxOutputTokens: 24_576,
      maxAttempts: generationPolicy.providerAttempts,
      transportAttempts: generationPolicy.transportAttempts,
      timeoutMs: 120_000,
    })
    const repaired = await parseWithRepair<WorldGenerationManifest>(repairedRaw, worldGenerationManifestSchema, request.provider, repairMessages, undefined, undefined, { maxAttempts: generationPolicy.schemaAttempts })
    const repairedIssues = worldManifestOriginalityIssues(repaired, request)
    if (repairedIssues.length < bestManifestIssues.length) {
      bestManifest = repaired
      bestManifestIssues = repairedIssues
    }
    if (!repairedIssues.length) {
      bestManifest = repaired
      bestManifestIssues = []
      break
    }
  }
  manifest = bestManifest

  reportProgress(report, 24, 'parallel-world', 'Одновременно создаём шесть полных разделов мира', 4, 11, ['Герой и предметы', 'Цивилизации', 'Персонажи', 'Легендарий', 'Сюжет', 'Интерфейс'])
  const completedSections = new Map<WorldGenerationStage, GeneratedWorldSections[WorldGenerationStage]>()
  let pendingStages = [...WORLD_GENERATION_STAGES]
  let lastStageErrors = new Map<WorldGenerationStage, unknown>()
  for (let attempt = 0; pendingStages.length && attempt < generationPolicy.stageAttempts; attempt += 1) {
    const attemptedStages = [...pendingStages]
    const settled = await Promise.allSettled(attemptedStages.map((stage) => generateParallelWorldStage(stage, request, concept, manifest)))
    const failedStages: WorldGenerationStage[] = []
    const errors = new Map<WorldGenerationStage, unknown>()
    settled.forEach((result, index) => {
      const stage = attemptedStages[index]
      if (result.status === 'fulfilled') completedSections.set(stage, result.value[1])
      else {
        failedStages.push(stage)
        errors.set(stage, result.reason)
        console.warn(`[world-generation:${stage}] Раздел не завершился на проходе ${attempt + 1}; готовые разделы сохранены: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`)
      }
    })
    pendingStages = failedStages
    lastStageErrors = errors
    if (pendingStages.length) reportProgress(
      report,
      24 + Math.min(36, completedSections.size * 6),
      'parallel-world-recovery',
      `Готово разделов: ${completedSections.size} из ${WORLD_GENERATION_STAGES.length}. Повторяем только: ${pendingStages.join(', ')}`,
      4 + completedSections.size,
      11,
      pendingStages,
    )
  }
  if (pendingStages.length) throw new Error(`Не завершены разделы мира ${pendingStages.join(', ')} после сохранения остальных частей: ${pendingStages.map((stage) => {
    const reason = lastStageErrors.get(stage)
    return reason instanceof Error ? reason.message : String(reason)
  }).join('; ')}`)
  const generatedSections = WORLD_GENERATION_STAGES.map((stage) => [stage, completedSections.get(stage)!] as const)
  let sections = Object.fromEntries(generatedSections) as unknown as GeneratedWorldSections
  for (let manifestAttempt = 0; manifestAttempt < generationPolicy.manifestRepairs; manifestAttempt += 1) {
    const manifestRepairs = WORLD_GENERATION_STAGES.flatMap((stage) => {
      const issues = worldManifestStageIssues(stage, sections, manifest)
      return issues.length ? [{ stage, issues }] : []
    })
    if (!manifestRepairs.length) break
    reportProgress(report, 72, 'manifest-integrity', 'Точечно согласуем отклонившиеся разделы с паспортом мира', 8, 11)
    const sectionsSnapshot = sections
    const repairedEntries = await mapWithConcurrency(manifestRepairs, 3, async ({ stage, issues }) => {
      const repaired = await regenerateOwnedWorldSection(stage, sectionsSnapshot, request, concept, issues.join('\n'), manifest)
      return [stage, repaired[stage]] as const
    })
    sections = { ...sections, ...Object.fromEntries(repairedEntries) }
  }

  const worldWithAuthoredProfiles = await authorGeneratedWorldAbilityProfiles(
    normalizeGeneratedWorldReferences(assembleGeneratedWorldSections(sections), request.characterName),
    request,
    concept,
    report,
  )
  sections = splitGeneratedWorldSections(worldWithAuthoredProfiles)

  reportProgress(report, 80, 'world-integrity', 'Проверяем все связи между разделами мира', 9, 11)
  let integrity = await ensureGeneratedWorldIntegrity(sections, request, concept, report, manifest)
  let world = integrity.world
  let completeSections = integrity.sections
  if (world.inventory.some((item) => item.category === 'artifact' && item.artifact)) {
    world = await repairGeneratedWorldArtifacts(world, request, concept, report)
    completeSections = splitGeneratedWorldSections(world)
    integrity = await ensureGeneratedWorldIntegrity(completeSections, request, concept, report, manifest)
    world = integrity.world
    completeSections = integrity.sections
  }
  const maxRewrites = generationPolicy.qualityRewrites

  for (let attempt = 0; attempt <= maxRewrites; attempt += 1) {
    const fallbackReview: WorldQualityReview = {
      pass: true,
      coverage: 100,
      issues: [],
      missingCapabilities: [],
      coverageAudit: [],
      constraintAudit: [],
      rewriteInstructions: '',
    }
    const artifactQuality = generatedWorldArtifactQuality(world)
    const artifactItems = world.inventory.filter((item) => item.category === 'artifact' && item.artifact)
    reportProgress(report, 88 + attempt * 3, 'quality', attempt === 0 ? 'Локально проверяем механику, связи и оригинальность' : `Перепроверяем только улучшенные разделы: проход ${attempt + 1}`, 10, 11, artifactItems.length ? ['Целостность мира', `Артефакты: ${artifactItems.length}`] : ['Целостность мира'])
    const reviewPromise = generationPolicy.semanticCritics
      ? optionalStage<WorldQualityReview>('world-quality', async () => {
        const reviewMessages = worldQualityCriticPrompt(request, concept, world)
        const rawReview = await completeJson(request.provider, reviewMessages, { maxAttempts: 1, transportAttempts: 2 })
        return parseWithRepair<WorldQualityReview>(rawReview, worldQualityReviewSchema, request.provider, reviewMessages, undefined, undefined, { maxAttempts: generationPolicy.schemaAttempts })
      }, fallbackReview)
      : Promise.resolve(fallbackReview)
    const artifactCriticPromise = generationPolicy.semanticCritics ? mapWithConcurrency(artifactItems, 3, async (item) => {
        try {
          const messages = artifactQualityCriticPrompt(
            item,
            artifactQuality.registry.filter((entry) => entry.artifactId !== artifactCandidate(item as PlannedArtifactItem).id),
            { world: world.world, concept, canonMode: request.canonMode },
          )
          const raw = await completeAuxiliaryJson(request.provider, messages, { maxOutputTokens: 4_096 }, (value) => artifactQualityReviewSchema.safeParse(normalizeModelOutput(value)).success)
          const parsed = artifactQualityReviewSchema.safeParse(normalizeModelOutput(raw))
          if (!parsed.success) return []
          return parsed.data.verdict === 'rebuild' ? parsed.data.issues : []
        } catch {
          return []
        }
      }) : Promise.resolve([] as string[][])
    const [review, artifactCriticGroups] = await Promise.all([reviewPromise, artifactCriticPromise])
    const artifactCriticIssues = artifactCriticGroups.flat()
    const accessIssues = startingAccessIssues(concept, world)
    const artifactIssues = [...new Set([...artifactQuality.issues, ...artifactCriticIssues])]
    const abilityQuality = generatedWorldAbilityQuality(world)
    const abilityIssues = abilityQuality.issues
    const originalityIssues = generatedWorldOriginalityIssues(world, request)
    const mechanicalIssues = [...accessIssues, ...artifactIssues, ...abilityIssues]
    const effectiveReview: WorldQualityReview = mechanicalIssues.length || originalityIssues.length ? {
      ...review,
      pass: false,
      issues: [
        ...review.issues,
        ...(mechanicalIssues.length ? [{
          type: 'mechanics' as const,
          entity: abilityIssues.length ? 'Система способностей мира' : artifactIssues.length ? 'Стартовые артефакты мира' : world.player.name,
          detail: mechanicalIssues.join(' '),
          severity: 'high' as const,
        }] : []),
        ...originalityIssues.map((issue) => ({
          type: 'originality' as const,
          entity: `Мир: ${issue.stage}`,
          detail: issue.message,
          severity: 'high' as const,
        })),
      ],
      rewriteInstructions: `${review.rewriteInstructions} ${mechanicalIssues.length ? `Исправь startingAccess, артефакты и способности без изменения пользовательского замысла: ${mechanicalIssues.join(' ')}` : ''} ${originalityIssues.length ? `Пересобери повторяющуюся или герой-центричную основу без переименования тех же клише: ${originalityIssues.map((issue) => issue.message).join(' ')}` : ''}`.trim(),
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
        console.warn(`[model:world-quality] Мир сохранён с механическими замечаниями вместо потери всей генерации: ${abilityQuality.hardIssues.join(' ')}`)
      }
      console.warn(`[model:world-quality] Мир возвращён после ${maxRewrites} точечных содержательных переработок; итоговое покрытие ${effectiveReview.coverage}%.`)
      reportProgress(report, 97, 'finalizing', 'Завершаем лучший проверенный вариант мира', 11, 11)
      return world
    }

    const repairSummary = JSON.stringify(effectiveReview)
    const repairStages = [...new Set([...qualityRepairStages(effectiveReview), ...originalityIssues.map((issue) => issue.stage)])]
    let optionalRewriteFailed = false
    const repairedEntries = await mapWithConcurrency(repairStages, 3, async (stage) => {
      reportProgress(report, 90 + attempt * 3, 'world-section-rewrite', `Улучшаем только раздел «${stage}» по замечаниям редактора`, 10, 11)
      try {
        const repaired = await regenerateOwnedWorldSection(stage, completeSections, request, concept, repairSummary, manifest)
        return [stage, repaired[stage]] as const
      } catch (error) {
        optionalRewriteFailed = true
        const detail = error instanceof Error ? error.message : String(error)
        console.warn(`[model:world-section-rewrite] Необязательное улучшение «${stage}» пропущено; сохраняем лучший целостный мир: ${detail}`)
        return [stage, completeSections[stage]] as const
      }
    })
    if (optionalRewriteFailed) {
      reportProgress(report, 97, 'finalizing', 'Редактор недоступен — сохраняем лучший уже проверенный мир', 11, 11)
      return world
    }
    completeSections = { ...completeSections, ...Object.fromEntries(repairedEntries) }
    integrity = await ensureGeneratedWorldIntegrity(completeSections, request, concept, report, manifest)
    world = integrity.world
    completeSections = integrity.sections
  }

  reportProgress(report, 97, 'finalizing', 'Мир готов к сохранению', 11, 11)
  return world
}
