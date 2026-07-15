import type { Campaign, CampaignEditRequest, CampaignEditResponse, OperationProgress, TurnPatch, TurnRequest, TurnResponse, WorldGenerationRequest } from '../shared/types.js'
import { randomUUID } from 'node:crypto'
import { demoTurn, demoWorld } from './demo.js'
import { completeJson, completeText } from './provider.js'
import { normalizeModelOutput } from './model-normalizer.js'
import { backgroundSimulatorPrompt, campaignEditorPrompt, canonVerifierPrompt, conceptAnalystPrompt, consequenceAuditorPrompt, continuityCriticPrompt, directorPrompt, memoryCuratorPrompt, narratorPrompt, progressionAuditPrompt, revisionPrompt, worldArchitectPrompt, worldQualityCriticPrompt, worldRewritePrompt } from './prompts.js'
import { backgroundSimulationSchema, campaignEditResponseSchema, conceptAnalysisSchema, consequenceAuditSchema, continuityReviewSchema, generatedWorldSchema, memoryCuratorSchema, progressionAuditSchema, turnPatchSchema, turnPlanSchema, worldQualityReviewSchema, type ConceptAnalysis, type ConsequenceAudit, type GeneratedWorld, type WorldQualityReview } from './schemas.js'
import { resolveActionCheck } from './resolution.js'
import { tokenize } from '../shared/context.js'

type ProgressReporter = (progress: OperationProgress) => void

function reportProgress(report: ProgressReporter | undefined, percent: number, stage: string, detail: string, completedSteps?: number, totalSteps?: number) {
  report?.({ percent, stage, detail, completedSteps, totalSteps })
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
- memories:[{"kind":string,"content":string,"tags":string[],"importance":number,"pinned"?:boolean}]; id, turn и createdAt здесь запрещены и назначаются сервером.
- inventory add требует вложенный item с name, description, category, quantity, rarity, equipped и effects; update требует targetId и вложенный item; remove имеет форму {"operation":"remove","targetId":"exactItemId","quantity"?:number,"reason"?:string} БЕЗ item. Редкость не запрещает фактическую потерю. Не возвращай плоские поля предмета.
- quests add требует вложенный quest с title, description, status и objectives; update требует targetId и вложенный quest.
- npcs update требует targetId и вложенный npc; урон/траты NPC записывай в npc.resourceDeltas, изменения параметров — npc.statDeltas, эффекты — npc.upsertStatusEffects, новые силы — npc.upsertAbilities, развитие сил — npc.abilityChanges, мышление и контрпланы — npc.strategy.
- conflict start/update требует полный state с id,kind,title,round,phase,stakes,terrain[],hazards[],momentum,participants[],startedTurn,lastUpdatedTurn; participant содержит entityId,side,objective,position,readiness,morale,intent,lastAction,advantages[],vulnerabilities[],visibility. Завершение: {"operation":"resolve","outcome":"..."}.
- duration статусного эффекта имеет форму {"unit":"turns|scenes|days|until|indefinite","remaining"?:number,"condition"?:string}; ключи amount/count/value запрещены.
- world.upsertPlaces содержит полные места с id,name,kind,description,scale,culture[],notableFacts[],currentSituation,visibility и необязательным точным parentId; world.upsertProcesses содержит полные процессы с id,title,description,scopeIds[],involvedFactionNames[],drivers[],obstacles[],stage,momentum,direction,status,visibility,nextMilestone,consequences[].
- cleanup — объект с массивами threads/worldEvents/quests/antagonistPlans/memories; каждый элемент имеет только targetId и reason. Активную сущность сначала переведи в терминальный статус соответствующей мутацией.
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
  return { outcome, beats, suggestions, statePatch: patch.data }
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

function sanitizePlan(campaign: Campaign, plan: ReturnType<typeof turnPlanSchema.parse>) {
  const notes: string[] = []
  const knownItems = new Set(campaign.inventory.map((item) => item.id))
  const knownStats = new Set([
    ...campaign.player.stats,
    ...(plan.statePatch.upsertStats ?? []),
  ].flatMap((stat) => [stat.key, stat.label, ...(stat.aliases ?? [])].map((key) => key.toLocaleLowerCase('ru-RU'))))
  const knownResources = new Set([
    ...campaign.player.resources,
    ...(plan.statePatch.upsertResources ?? []),
  ].flatMap((stat) => [stat.key, stat.label, ...(stat.aliases ?? [])].map((key) => key.toLocaleLowerCase('ru-RU'))))
  const knownNpcs = new Set(campaign.npcs.map((npc) => npc.id))
  const knownQuests = new Set(campaign.quests.map((quest) => quest.id))
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
    const before = plan.statePatch.inventory.length
    plan.statePatch.inventory = plan.statePatch.inventory.filter((mutation) => {
      if (mutation.operation === 'add') return Boolean(mutation.item?.name)
      if (!mutation.targetId || !knownItems.has(mutation.targetId)) return false
      return true
    })
    if (plan.statePatch.inventory.length < before) notes.push('Отклонено недопустимое изменение инвентаря.')
  }
  if (plan.statePatch.statDeltas) {
    const entries = Object.entries(plan.statePatch.statDeltas)
    const accepted = entries.filter(([key]) => knownStats.has(key.toLocaleLowerCase('ru-RU')))
    const rejected = entries.filter(([key]) => !knownStats.has(key.toLocaleLowerCase('ru-RU'))).map(([key]) => key)
    plan.statePatch.statDeltas = Object.fromEntries(accepted)
    if (rejected.length) notes.push(`Отклонены неизвестные характеристики: ${rejected.join(', ')}.`)
  }
  if (plan.statePatch.resourceDeltas) {
    const entries = Object.entries(plan.statePatch.resourceDeltas)
    const accepted = entries.filter(([key]) => knownResources.has(key.toLocaleLowerCase('ru-RU')))
    const rejected = entries.filter(([key]) => !knownResources.has(key.toLocaleLowerCase('ru-RU'))).map(([key]) => key)
    plan.statePatch.resourceDeltas = Object.fromEntries(accepted)
    if (rejected.length) notes.push(`Отклонены неизвестные ресурсы: ${rejected.join(', ')}.`)
  }
  const relationshipCount = plan.statePatch.relationships?.length ?? 0
  plan.statePatch.relationships = plan.statePatch.relationships?.filter((change) => knownNpcs.has(change.npcId))
  if ((plan.statePatch.relationships?.length ?? 0) < relationshipCount) notes.push('Отклонена связь с неизвестным персонажем.')
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
  if ((plan.statePatch.npcs?.length ?? 0) < npcMutationCount) notes.push('Отклонено противоречивое изменение персонажа.')
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
      return change
    })
    incoming.removeAbilityIds = incoming.removeAbilityIds?.filter((abilityId) => knownNpcAbilityIds.has(abilityId))
    if (rejectedChanges + rejectedRemovals > 0) notes.push(`Отклонено изменение неизвестной способности персонажа «${existingNpc.name}».`)
    return mutation
  })
  const unknownRemovedStats = plan.statePatch.removeStatKeys?.filter((key) => !knownStats.has(key.toLocaleLowerCase('ru-RU'))) ?? []
  plan.statePatch.removeStatKeys = plan.statePatch.removeStatKeys?.filter((key) => knownStats.has(key.toLocaleLowerCase('ru-RU')))
  if (unknownRemovedStats.length) notes.push(`Нельзя удалить неизвестные характеристики: ${unknownRemovedStats.join(', ')}.`)
  const unknownRemovedResources = plan.statePatch.removeResourceKeys?.filter((key) => !knownResources.has(key.toLocaleLowerCase('ru-RU'))) ?? []
  plan.statePatch.removeResourceKeys = plan.statePatch.removeResourceKeys?.filter((key) => knownResources.has(key.toLocaleLowerCase('ru-RU')))
  if (unknownRemovedResources.length) notes.push(`Нельзя удалить неизвестные ресурсы: ${unknownRemovedResources.join(', ')}.`)
  const questMutationCount = plan.statePatch.quests?.length ?? 0
  plan.statePatch.quests = plan.statePatch.quests?.filter((mutation) => mutation.operation === 'add' || Boolean(mutation.targetId && knownQuests.has(mutation.targetId)))
  if ((plan.statePatch.quests?.length ?? 0) < questMutationCount) notes.push('Отклонено изменение неизвестного задания.')
  const removedAbilityCount = plan.statePatch.removeAbilityIds?.length ?? 0
  plan.statePatch.removeAbilityIds = plan.statePatch.removeAbilityIds?.filter((abilityId) => knownAbilities.has(abilityId))
  if ((plan.statePatch.removeAbilityIds?.length ?? 0) < removedAbilityCount) notes.push('Отклонено удаление неизвестной способности.')
  const abilityChangeCount = plan.statePatch.abilityChanges?.length ?? 0
  plan.statePatch.abilityChanges = plan.statePatch.abilityChanges?.filter((change) => knownAbilities.has(change.abilityId)).map((change) => {
    if (change.mastery !== undefined && change.masteryDelta !== undefined) {
      delete change.masteryDelta
      notes.push('В развитии способности абсолютное mastery сохранено, дублирующая masteryDelta отброшена.')
    }
    return change
  })
  if ((plan.statePatch.abilityChanges?.length ?? 0) < abilityChangeCount) notes.push('Отклонено развитие неизвестной способности.')
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
        return powerChange
      })
      if (change.powerChanges.length < powerChangeCount) notes.push('Отклонено изменение неизвестной силы особого предмета.')
    }
    const knownComponentIds = new Set([
      ...(artifact?.components.map((component) => component.id) ?? []),
      ...(change.addComponents ?? []).flatMap((component) => component.id ? [component.id] : []),
    ])
    if (change.componentChanges) {
      const componentChangeCount = change.componentChanges.length
      change.componentChanges = change.componentChanges.filter((componentChange) => knownComponentIds.has(componentChange.componentId))
      if (change.componentChanges.length < componentChangeCount) notes.push('Отклонено изменение неизвестного компонента особого предмета.')
    }
    if (change.powerMasteryDeltas) {
      const powerChangeIds = new Set((change.powerChanges ?? []).filter((powerChange) => powerChange.mastery !== undefined || powerChange.masteryDelta !== undefined).map((powerChange) => powerChange.powerId))
      change.powerMasteryDeltas = Object.fromEntries(Object.entries(change.powerMasteryDeltas).filter(([powerId]) => knownPowerIds.has(powerId) && !powerChangeIds.has(powerId)))
      if (!Object.keys(change.powerMasteryDeltas).length) delete change.powerMasteryDeltas
    }
    if (artifact?.sentient || change.mood === undefined) return change
    const { mood: _ignoredMood, ...safeChange } = change
    void _ignoredMood
    notes.push('Отклонено настроение у неразумного предмета.')
    return safeChange
  })
  if ((plan.statePatch.artifactChanges?.length ?? 0) < artifactChangeCount) notes.push('Отклонено изменение неизвестного особого предмета.')
  if (plan.statePatch.removeStatusEffectIds?.length) {
    const knownEffectIds = new Set((campaign.player.statusEffects ?? []).map((effect) => effect.id))
    const before = plan.statePatch.removeStatusEffectIds.length
    plan.statePatch.removeStatusEffectIds = plan.statePatch.removeStatusEffectIds.filter((effectId) => knownEffectIds.has(effectId))
    if (plan.statePatch.removeStatusEffectIds.length < before) notes.push('Отклонено снятие неизвестного статусного эффекта.')
  }
  if (plan.statePatch.scene?.presentNpcIds) {
    const before = plan.statePatch.scene.presentNpcIds.length
    plan.statePatch.scene.presentNpcIds = plan.statePatch.scene.presentNpcIds.filter((npcId) => usableNpcIds.has(npcId))
    const livingIds = new Set([
      ...campaign.npcs.filter((npc) => npc.status !== 'dead' && npc.status !== 'missing').map((npc) => npc.id),
      ...addedNpcIds,
    ])
    plan.statePatch.scene.presentNpcIds = plan.statePatch.scene.presentNpcIds.filter((npcId) => livingIds.has(npcId))
    if (plan.statePatch.scene.presentNpcIds.length < before) notes.push('Убрано невозможное присутствие персонажа в сцене.')
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
      notes.push('Отклонено противоречивое состояние противостояния.')
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
  if ((plan.statePatch.threads?.length ?? 0) < threadCount) notes.push('Отклонено неполное или неизвестное обязательство.')
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
  if ((plan.statePatch.worldEvents?.length ?? 0) < worldEventCount) notes.push('Отклонено неполное мировое событие.')
  if (plan.statePatch.world?.upsertPlaces) {
    const before = plan.statePatch.world.upsertPlaces.length
    plan.statePatch.world.upsertPlaces = plan.statePatch.world.upsertPlaces.filter((place) => !place.parentId || (place.parentId !== place.id && knownPlaceIds.has(place.parentId)))
    if (plan.statePatch.world.upsertPlaces.length < before) notes.push('Отклонено место атласа с неизвестным или циклическим родителем.')
  }
  if (plan.statePatch.world?.upsertProcesses) {
    const before = plan.statePatch.world.upsertProcesses.length
    plan.statePatch.world.upsertProcesses = plan.statePatch.world.upsertProcesses.filter((process) => (
      process.scopeIds.every((placeId) => knownPlaceIds.has(placeId))
      && process.involvedFactionNames.every((name) => knownFactions.has(name.toLocaleLowerCase('ru-RU')))
    ))
    if (plan.statePatch.world.upsertProcesses.length < before) notes.push('Отклонён внешний процесс с неизвестной областью или фракцией.')
  }
  const reputationUpsertCount = plan.statePatch.upsertFactionReputation?.length ?? 0
  plan.statePatch.upsertFactionReputation = plan.statePatch.upsertFactionReputation?.filter((entry) => knownFactions.has(entry.factionName.toLocaleLowerCase('ru-RU')))
  if ((plan.statePatch.upsertFactionReputation?.length ?? 0) < reputationUpsertCount) notes.push('Отклонено абсолютное изменение репутации неизвестной фракции.')
  plan.statePatch.socialLinks = plan.statePatch.socialLinks?.filter((link) => link.fromNpcId !== link.toNpcId && usableNpcIds.has(link.fromNpcId) && usableNpcIds.has(link.toNpcId))
  if (plan.statePatch.party) {
    const requestedPartyAdds = plan.statePatch.party.addNpcIds ?? []
    plan.statePatch.party.addNpcIds = requestedPartyAdds.filter((npcId) => {
      if (!usableNpcIds.has(npcId)) return false
      const plannedRecruitment = [...(plan.statePatch.npcs ?? [])].reverse().find((mutation) => mutation.operation === 'update' && mutation.targetId === npcId && mutation.npc.recruitment)?.npc.recruitment
      const recruitment = plannedRecruitment ?? campaign.npcs.find((npc) => npc.id === npcId)?.recruitment
      return Boolean(recruitment && ['invited', 'member'].includes(recruitment.status) && recruitment.willingness >= 50)
    })
    if ((plan.statePatch.party.addNpcIds?.length ?? 0) < requestedPartyAdds.length) notes.push('Отклонено добавление персонажа без его явного решения и выполненных условий вступления.')
    plan.statePatch.party.removeNpcIds = plan.statePatch.party.removeNpcIds?.filter((npcId) => knownNpcs.has(npcId))
    const resultingPartyIds = new Set([...(campaign.partyMemberIds ?? []), ...(plan.statePatch.party.addNpcIds ?? [])])
    plan.statePatch.party.removeNpcIds?.forEach((npcId) => resultingPartyIds.delete(npcId))
    if (plan.statePatch.party.roles) {
      plan.statePatch.party.roles = Object.fromEntries(Object.entries(plan.statePatch.party.roles).filter(([npcId]) => usableNpcIds.has(npcId) && resultingPartyIds.has(npcId)))
    }
  }
  const campaignEntityIds = new Set([campaign.player.id, ...usableNpcIds])
  plan.statePatch.upsertCharacterArcs = plan.statePatch.upsertCharacterArcs?.filter((arc) => campaignEntityIds.has(arc.ownerId))
  plan.statePatch.upsertMysteryCases = plan.statePatch.upsertMysteryCases?.flatMap((incoming) => {
    const existing = campaign.mysteryCases?.find((mystery) => mystery.id === incoming.id)
    if (!existing) return incoming.createdTurn === campaign.turn + 1 ? [incoming] : []
    const incomingClues = new Map(incoming.clues.map((clue) => [clue.id, clue]))
    return [{
      ...existing,
      status: incoming.status,
      conclusion: incoming.conclusion,
      solvedTurn: incoming.solvedTurn,
      clues: existing.clues.map((clue) => ({
        ...clue,
        discovered: clue.discovered || Boolean(incomingClues.get(clue.id)?.discovered),
      })),
    }]
  })
  plan.statePatch.upsertAntagonistPlans = plan.statePatch.upsertAntagonistPlans?.filter((incoming) => usableNpcIds.has(incoming.ownerNpcId)).map((incoming) => {
    const existing = campaign.antagonistPlans?.find((plan) => plan.id === incoming.id)
    if (!existing) return incoming
    const incomingSteps = new Map(incoming.steps.map((step) => [step.id, step]))
    return {
      ...incoming,
      id: existing.id,
      ownerNpcId: existing.ownerNpcId,
      title: existing.title,
      objective: existing.objective,
      steps: existing.steps.map((step) => ({ ...step, status: incomingSteps.get(step.id)?.status ?? step.status })),
    }
  })
  plan.statePatch.upsertInfluenceAssets = plan.statePatch.upsertInfluenceAssets?.filter((asset) => campaignEntityIds.has(asset.holderId) && (!asset.targetId || campaignEntityIds.has(asset.targetId)))
  plan.statePatch.removeInfluenceAssetIds = plan.statePatch.removeInfluenceAssetIds?.filter((assetId) => campaign.influenceAssets?.some((asset) => asset.id === assetId))
  if (plan.statePatch.cleanup) {
    const validTargets = {
      threads: new Set((campaign.threads ?? []).map((entry) => entry.id)),
      worldEvents: new Set((campaign.worldEvents ?? []).map((entry) => entry.id)),
      quests: new Set(campaign.quests.map((entry) => entry.id)),
      antagonistPlans: new Set((campaign.antagonistPlans ?? []).map((entry) => entry.id)),
      memories: new Set(campaign.memories.map((entry) => entry.id)),
    }
    ;(Object.keys(validTargets) as Array<keyof typeof validTargets>).forEach((key) => {
      const before = plan.statePatch.cleanup?.[key]?.length ?? 0
      if (plan.statePatch.cleanup) plan.statePatch.cleanup[key] = plan.statePatch.cleanup[key]?.filter((entry) => validTargets[key].has(entry.targetId))
      if ((plan.statePatch.cleanup?.[key]?.length ?? 0) < before) notes.push(`Отклонена очистка неизвестной записи: ${key}.`)
    })
  }
  return { plan, notes }
}

function mergePatches(backgroundInput: TurnPatch | null | undefined, foregroundInput: TurnPatch | null | undefined): TurnPatch {
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
    ...(hasCalendarDayDelta ? { calendarDayDelta: (background.world?.calendarDayDelta ?? 0) + (foreground.world?.calendarDayDelta ?? 0) } : {}),
  } : undefined
  const party = background.party || foreground.party ? {
    addNpcIds: unique(background.party?.addNpcIds, foreground.party?.addNpcIds),
    removeNpcIds: unique(background.party?.removeNpcIds, foreground.party?.removeNpcIds),
    roles: { ...(background.party?.roles ?? {}), ...(foreground.party?.roles ?? {}) },
  } : undefined
  const cleanupKeys = ['threads', 'worldEvents', 'quests', 'antagonistPlans', 'memories'] as const
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
    conflict: foreground.conflict ?? background.conflict,
    socialLinks: concat(background.socialLinks, foreground.socialLinks),
    threads: concat(background.threads, foreground.threads),
    worldEvents: concat(background.worldEvents, foreground.worldEvents),
    factionReputationDeltas: sumRecords(background.factionReputationDeltas, foreground.factionReputationDeltas),
    upsertFactionReputation: concat(background.upsertFactionReputation, foreground.upsertFactionReputation),
    party,
    upsertCharacterArcs: concat(background.upsertCharacterArcs, foreground.upsertCharacterArcs),
    upsertMysteryCases: concat(background.upsertMysteryCases, foreground.upsertMysteryCases),
    upsertAntagonistPlans: concat(background.upsertAntagonistPlans, foreground.upsertAntagonistPlans),
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
function mergeAuditPatch(baseInput: TurnPatch | null | undefined, auditInput: TurnPatch | null | undefined): TurnPatch {
  const base = baseInput ?? {}
  const additional = structuredClone(auditInput ?? {})
  const omitRecordedKeys = (candidate: Record<string, number> | undefined, recorded: Record<string, number> | undefined) => {
    if (!candidate) return undefined
    const filtered = Object.fromEntries(Object.entries(candidate).filter(([key]) => !Object.hasOwn(recorded ?? {}, key)))
    return Object.keys(filtered).length ? filtered : undefined
  }
  additional.statDeltas = omitRecordedKeys(additional.statDeltas, base.statDeltas)
  additional.resourceDeltas = omitRecordedKeys(additional.resourceDeltas, base.resourceDeltas)
  additional.currencyDeltas = omitRecordedKeys(additional.currencyDeltas, base.currencyDeltas)
  additional.factionReputationDeltas = omitRecordedKeys(additional.factionReputationDeltas, base.factionReputationDeltas)

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
    const recordedResourceDeltas = Object.assign({}, ...recordedUpdates.map((entry) => entry.operation === 'update' ? entry.npc.resourceDeltas ?? {} : {}))
    const recordedStatDeltas = Object.assign({}, ...recordedUpdates.map((entry) => entry.operation === 'update' ? entry.npc.statDeltas ?? {} : {}))
    npc.resourceDeltas = omitRecordedKeys(npc.resourceDeltas, recordedResourceDeltas)
    npc.statDeltas = omitRecordedKeys(npc.statDeltas, recordedStatDeltas)
    const recordedNpcAbilityChanges = recordedUpdates.flatMap((entry) => entry.operation === 'update' ? entry.npc.abilityChanges ?? [] : [])
    npc.abilityChanges = filterSupplementalAbilityChanges(recordedNpcAbilityChanges, npc.abilityChanges)
    const recordedNpcEffects = new Set(recordedUpdates.flatMap((entry) => entry.operation === 'update' ? (entry.npc.upsertStatusEffects ?? []).flatMap((effect) => [effect.id, effect.name.toLocaleLowerCase('ru-RU')].filter(Boolean)) : []))
    npc.upsertStatusEffects = npc.upsertStatusEffects?.filter((effect) => !recordedNpcEffects.has(effect.id) && !recordedNpcEffects.has(effect.name.toLocaleLowerCase('ru-RU')))
    const recordedStrategyKeys = new Set(recordedUpdates.flatMap((entry) => entry.operation === 'update' ? Object.keys(entry.npc.strategy ?? {}) : []))
    if (npc.strategy) {
      const strategy = Object.fromEntries(Object.entries(npc.strategy).filter(([key]) => !recordedStrategyKeys.has(key)))
      npc.strategy = Object.keys(strategy).length ? strategy : undefined
    }
    const arrayKeys = ['abilityChanges', 'upsertStatusEffects', 'removeStatusEffectIds', 'upsertAbilities', 'removeAbilityIds'] as const
    arrayKeys.forEach((key) => { if (npc[key]?.length === 0) delete npc[key] })
    if (Object.keys(npc).length === 0) return []
    return [{ ...mutation, npc }]
  })

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
    threads: patch.threads,
    worldEvents: patch.worldEvents,
    factionReputationDeltas: patch.factionReputationDeltas,
    upsertFactionReputation: patch.upsertFactionReputation,
    world: patch.world,
    upsertCharacterArcs: patch.upsertCharacterArcs,
    upsertAntagonistPlans: patch.upsertAntagonistPlans,
    upsertInfluenceAssets: patch.upsertInfluenceAssets,
    cleanup: patch.cleanup,
  }
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

export async function runTurn(request: TurnRequest, report?: ProgressReporter): Promise<TurnResponse> {
  reportProgress(report, 3, 'preparing', 'Проверяем ввод и собираем актуальное состояние', 1, 9)
  const check = resolveActionCheck(request.campaign, request.input, request.actionType)
  if (request.provider.provider === 'demo') {
    reportProgress(report, 80, 'narrating', 'Собираем демонстрационный ответ', 8, 9)
    return { ...demoTurn(request.campaign, request.input), check }
  }

  reportProgress(report, 8, 'world-simulation', 'Персонажи и мир делают свои независимые шаги', 2, 9)
  const backgroundMessages = backgroundSimulatorPrompt(request.campaign, request.input)
  const emptyBackground: ReturnType<typeof backgroundSimulationSchema.parse> = { signals: [], statePatch: {} }
  const background = await optionalStage<ReturnType<typeof backgroundSimulationSchema.parse>>('background', async () => {
    const rawBackground = await completeJson(request.provider, backgroundMessages)
    return parseWithRepair(rawBackground, backgroundSimulationSchema, request.provider, backgroundMessages, () => ({ signals: [], statePatch: {} }))
  }, emptyBackground)
  reportProgress(report, 18, 'directing', 'Режиссёр строит причинный план и последствия', 3, 9)
  const director = directorPrompt(request.campaign, request.input, request.actionType, check, background)
  const rawPlan = await completeJson(request.provider, director.messages)
  const validPlan = await parseWithRepair(rawPlan, turnPlanSchema, request.provider, director.messages, salvageTurnPlan)
  const progressionMessages = progressionAuditPrompt(request.campaign, request.input, validPlan)
  if (progressionMessages) {
    reportProgress(report, 31, 'progression', 'Сверяем развитие способностей, предметов и персонажей', 4, 9)
    const emptyProgression: ReturnType<typeof progressionAuditSchema.parse> = {}
    const progression = await optionalStage<ReturnType<typeof progressionAuditSchema.parse>>('progression', async () => {
      const rawProgression = await completeJson(request.provider, progressionMessages)
      return parseWithRepair(rawProgression, progressionAuditSchema, request.provider, progressionMessages, () => ({}))
    }, emptyProgression)
    const supplementalAbilityChanges = filterSupplementalAbilityChanges(validPlan.statePatch.abilityChanges, progression.abilityChanges)
    const supplementalArtifactChanges = filterSupplementalArtifactChanges(validPlan.statePatch.artifactChanges, progression.artifactChanges)
    validPlan.statePatch.abilityChanges = [
      ...(validPlan.statePatch.abilityChanges ?? []),
      ...(supplementalAbilityChanges ?? []),
    ]
    validPlan.statePatch.artifactChanges = [
      ...(validPlan.statePatch.artifactChanges ?? []),
      ...(supplementalArtifactChanges ?? []),
    ]
    for (const npcAudit of progression.npcAbilityChanges ?? []) {
      const alreadyTracked = (validPlan.statePatch.npcs ?? [])
        .filter((mutation) => mutation.operation === 'update' && mutation.targetId === npcAudit.npcId)
        .flatMap((mutation) => mutation.operation === 'update' ? mutation.npc.abilityChanges ?? [] : [])
      const abilityChanges = filterSupplementalAbilityChanges(alreadyTracked, npcAudit.abilityChanges)
      if (abilityChanges?.length) {
        validPlan.statePatch.npcs = [
          ...(validPlan.statePatch.npcs ?? []),
          { operation: 'update', targetId: npcAudit.npcId, npc: { abilityChanges } },
        ]
      }
    }
  }
  // The foreground plan already owns every consequence of the current input. Background
  // simulation may contribute only non-overlapping off-screen changes, never repeat the same
  // NPC cost/damage after seeing the user's upcoming intention.
  validPlan.statePatch = mergeAuditPatch(validPlan.statePatch, restrictBackgroundPatch(background.statePatch)) as typeof validPlan.statePatch
  const sanitized = sanitizePlan(request.campaign, validPlan)
  reportProgress(report, 43, 'drafting', request.campaign.settings.qualityMode === 'balanced' ? 'Пишем сцену по утверждённому плану' : 'Пишем два независимых варианта сцены', 5, 9)
  const firstDraft = completeText(request.provider, narratorPrompt(request.campaign, request.input, request.actionType, sanitized.plan, check, 'grounded'))
  const [draftAResult, draftBResult] = request.campaign.settings.qualityMode === 'balanced'
    ? await firstDraft.then((draft) => [{ status: 'fulfilled' as const, value: draft }, { status: 'fulfilled' as const, value: draft }])
    : await Promise.allSettled([firstDraft, completeText(request.provider, narratorPrompt(request.campaign, request.input, request.actionType, sanitized.plan, check, 'dramatic'))])
  if (draftAResult.status === 'rejected' && draftBResult.status === 'rejected') throw draftAResult.reason
  const draftA = draftAResult.status === 'fulfilled' ? draftAResult.value : (draftBResult as PromiseFulfilledResult<string>).value
  const draftB = draftBResult.status === 'fulfilled' ? draftBResult.value : draftA
  reportProgress(report, 61, 'critic', 'Критик выбирает сильнейший непротиворечивый вариант', 6, 9)
  const criticMessages = continuityCriticPrompt(request.campaign, request.input, request.actionType, sanitized.plan, draftA, draftB)
  const review = await optionalStage('critic', async () => {
    const rawReview = await completeJson(request.provider, criticMessages)
    return parseWithRepair(rawReview, continuityReviewSchema, request.provider, criticMessages, () => ({ chosen: 'a' as const, pass: true, issues: [], rewriteInstructions: '' }))
  }, { chosen: 'a' as const, pass: true, issues: [], rewriteInstructions: '' })
  const chosenDraft = review.chosen === 'a' ? draftA : draftB
  let narrative = review.pass ? chosenDraft : await optionalStage(
    'revision',
    () => completeText(request.provider, revisionPrompt(request.campaign, request.input, sanitized.plan, chosenDraft, review.rewriteInstructions)),
    chosenDraft,
  )

  const repairedOmissions: ConsequenceAudit['omissions'] = []
  const narrativeAuditNotes: string[] = []
  let consequenceAudit: ConsequenceAudit | undefined
  let reconciled = sanitized

  // Audit state and prose together. If the model replaced a binding story direction with its
  // own scene, rewrite the prose and audit the corrected result again before committing anything.
  for (let narrativeAttempt = 0; narrativeAttempt < 3; narrativeAttempt += 1) {
    reportProgress(report, 72 + narrativeAttempt * 7, 'consequence-audit', narrativeAttempt === 0 ? 'Проверяем все 15 областей состояния' : `Исправляем пропущенные последствия: попытка ${narrativeAttempt + 1}`, 7, 9)
    const auditMessages = consequenceAuditorPrompt(request.campaign, request.input, request.actionType, reconciled.plan, narrative, check)
    const rawAudit = await completeJson(request.provider, auditMessages)
    consequenceAudit = await parseWithRepair<ConsequenceAudit>(rawAudit, consequenceAuditSchema, request.provider, auditMessages)
    repairedOmissions.push(...consequenceAudit.omissions)
    narrativeAuditNotes.push(...consequenceAudit.narrativeIssues.map((issue) => `${issue.severity}: ${issue.requirement}`))
    reconciled.plan.statePatch = mergeAuditPatch(reconciled.plan.statePatch, consequenceAudit.statePatch) as typeof reconciled.plan.statePatch
    reconciled = sanitizePlan(request.campaign, reconciled.plan)

    // A structurally valid patch can still reference an entity that no longer exists. Make the
    // model repair that exact consequence rather than silently dropping it.
    for (let referenceAttempt = 1; consequenceAudit.omissions.length > 0 && reconciled.notes.length > 0 && referenceAttempt < 3; referenceAttempt += 1) {
      const retryMessages = consequenceAuditorPrompt(
        request.campaign,
        request.input,
        request.actionType,
        { ...reconciled.plan, rejectedConsequenceNotes: reconciled.notes },
        narrative,
        check,
      )
      const retryRaw = await completeJson(request.provider, retryMessages)
      const retryAudit = await parseWithRepair<ConsequenceAudit>(retryRaw, consequenceAuditSchema, request.provider, retryMessages)
      if (retryAudit.pass) {
        reconciled.notes = [...reconciled.notes, 'Повторная сверка не исправила отклонённое изменение состояния.']
        continue
      }
      consequenceAudit = retryAudit
      repairedOmissions.push(...retryAudit.omissions)
      narrativeAuditNotes.push(...retryAudit.narrativeIssues.map((issue) => `${issue.severity}: ${issue.requirement}`))
      reconciled.plan.statePatch = mergeAuditPatch(reconciled.plan.statePatch, retryAudit.statePatch) as typeof reconciled.plan.statePatch
      reconciled = sanitizePlan(request.campaign, reconciled.plan)
    }
    if (consequenceAudit.omissions.length > 0 && reconciled.notes.length > 0) {
      throw new Error(`DeepSeek не смог безопасно привязать обязательное последствие к текущему состоянию: ${reconciled.notes.join(' ')}`)
    }
    if (consequenceAudit.narrativePass) break
    if (narrativeAttempt === 2) {
      throw new Error(`DeepSeek трижды не выполнил обязательные факты ввода: ${consequenceAudit.narrativeIssues.map((issue) => issue.requirement).join(' ')}`)
    }
    const rewriteInstructions = consequenceAudit.narrativeIssues.map((issue) => issue.instruction).join('\n')
    narrative = await completeText(request.provider, revisionPrompt(request.campaign, request.input, reconciled.plan, narrative, rewriteInstructions))
  }
  if (!consequenceAudit) throw new Error('Не удалось выполнить обязательную сверку последствий.')

  reportProgress(report, 93, 'memory', 'Закрепляем факты и долгую память истории', 8, 9)
  const curatorMessages = memoryCuratorPrompt(request.campaign, request.input, narrative, reconciled.plan)
  const curator = await optionalStage('memory', async () => {
    const rawCurator = await completeJson(request.provider, curatorMessages)
    return parseWithRepair(rawCurator, memoryCuratorSchema, request.provider, curatorMessages, () => ({ memories: [], archives: [] }))
  }, { memories: [], archives: [] })
  if (curator.cleanup) {
    reconciled.plan.statePatch = mergePatches(reconciled.plan.statePatch, { cleanup: curator.cleanup }) as typeof reconciled.plan.statePatch
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

  reportProgress(report, 98, 'finalizing', 'Формируем атомарный ответ и изменения', 9, 9)
  return {
    narrative,
    suggestions: reconciled.plan.suggestions,
    statePatch: reconciled.plan.statePatch,
    activeLoreIds: director.selection.activeLoreIds,
    recalledMemoryIds: director.selection.recalledMemoryIds,
    activeDocumentChunkIds: director.selection.activeDocumentChunkIds,
    continuityNotes: [...new Set([...sanitized.notes, ...reconciled.notes, ...reviewNotes, ...narrativeAuditNotes, ...auditNotes])],
    check,
    archives,
  }
}

export async function editCampaign(request: CampaignEditRequest, report?: ProgressReporter): Promise<CampaignEditResponse> {
  if (request.provider.provider === 'demo') throw new Error('ИИ-корректор требует подключённую модель. Выберите DeepSeek V4 Flash в настройках.')
  reportProgress(report, 8, 'reading-state', 'Изучаем выбранную кампанию и точные идентификаторы', 1, 4)
  const messages = campaignEditorPrompt(request.campaign, request.instruction)
  reportProgress(report, 28, 'planning-edit', 'ИИ проектирует минимальную корректировку без сюжетного хода', 2, 4)
  const raw = await completeJson(request.provider, messages)
  reportProgress(report, 68, 'validating-edit', 'Проверяем структуру, ссылки и допустимые изменения', 3, 4)
  const parsed = await parseWithRepair<CampaignEditResponse>(raw, campaignEditResponseSchema, request.provider, messages)
  const plan = turnPlanSchema.parse({ outcome: parsed.summary, beats: [parsed.summary], suggestions: ['Продолжить', 'Осмотреть изменения'], statePatch: parsed.statePatch })
  const sanitized = sanitizePlan(request.campaign, plan)
  reportProgress(report, 96, 'finalizing-edit', 'Подготавливаем безопасное применение корректировки', 4, 4)
  return {
    ...parsed,
    summary: sanitized.notes.length ? `${parsed.summary} Часть небезопасных ссылок отклонена: ${sanitized.notes.join(' ')}` : parsed.summary,
    statePatch: sanitized.plan.statePatch,
  }
}

export async function generateWorld(request: WorldGenerationRequest, report?: ProgressReporter): Promise<GeneratedWorld> {
  reportProgress(report, 4, 'concept', 'Разбираем замысел, героя и ограничения', 1, 6)
  if (request.provider.provider === 'demo') {
    reportProgress(report, 86, 'assembling', 'Собираем адаптивный демонстрационный мир', 5, 6)
    return demoWorld(request)
  }
  const analysisMessages = conceptAnalystPrompt(request)
  const rawAnalysis = await completeJson(request.provider, analysisMessages)
  let concept = await parseWithRepair<ConceptAnalysis>(rawAnalysis, conceptAnalysisSchema, request.provider, analysisMessages)
  if (concept.recognizedCanon) {
    reportProgress(report, 17, 'canon', 'Сверяем канон, эпоху и заявленные силы', 2, 6)
    const verifierMessages = canonVerifierPrompt(request, concept)
    concept = await optionalStage<ConceptAnalysis>('canon-verifier', async () => {
      const verified = await completeJson(request.provider, verifierMessages)
      return parseWithRepair<ConceptAnalysis>(verified, conceptAnalysisSchema, request.provider, verifierMessages)
    }, concept)
  }

  const createCandidate = async (messages: ReturnType<typeof worldArchitectPrompt> | ReturnType<typeof worldRewritePrompt>) => {
    try {
      const raw = await completeJson(request.provider, messages)
      return await parseWithRepair<GeneratedWorld>(raw, generatedWorldSchema, request.provider, messages)
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('DeepSeek не смог завершить обязательную структуру')) throw error
      const retryMessages = [
        ...messages,
        {
          role: 'user' as const,
          content: 'Предыдущий цикл автоматического восстановления не завершил контракт. Создай весь мир заново с тем же замыслом, полным набором способностей и той же содержательной глубиной. Перед отправкой проверь тип каждого поля, наличие всех обязательных массивов и вложенных объектов, а также покрытие канонического checklist. Верни только полный JSON.',
        },
      ]
      const regenerated = await completeJson(request.provider, retryMessages)
      return parseWithRepair<GeneratedWorld>(regenerated, generatedWorldSchema, request.provider, retryMessages)
    }
  }

  reportProgress(report, 31, 'architecture', 'Проектируем правила, лор, персонажей, предметы и систему мира', 3, 6)
  let world = await createCandidate(worldArchitectPrompt(request, concept))
  const maxRewrites = concept.recognizedCanon ? 2 : 1

  for (let attempt = 0; attempt <= maxRewrites; attempt += 1) {
    reportProgress(report, 61 + attempt * 13, 'quality', attempt === 0 ? 'Проверяем полноту, канон и механику мира' : `Пересобираем слабые места: проход ${attempt + 1}`, 4 + Math.min(attempt, 1), 6)
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
    const accessIssues = startingAccessIssues(concept, world)
    const effectiveReview: WorldQualityReview = accessIssues.length ? {
      ...review,
      pass: false,
      issues: [...review.issues, {
        type: 'mechanics',
        entity: world.player.name,
        detail: accessIssues.join(' '),
        severity: 'high',
      }],
      rewriteInstructions: `${review.rewriteInstructions} Исправь startingAccess без изменения пользовательского замысла: ${accessIssues.join(' ')}`.trim(),
    } : review
    const hasBlockingIssue = effectiveReview.issues.some((issue) => issue.severity === 'high' && ['canon', 'completeness', 'mechanics', 'consistency'].includes(issue.type))
      || effectiveReview.coverageAudit.some((entry) => entry.importance !== 'minor' && entry.status !== 'covered')
      || effectiveReview.constraintAudit.some((entry) => entry.verdict === 'unsupported' || entry.verdict === 'wrong-continuity')
    const requiredCoverage = concept.recognizedCanon ? 95 : 90
    if (effectiveReview.pass && effectiveReview.coverage >= requiredCoverage && !hasBlockingIssue) {
      reportProgress(report, 97, 'finalizing', 'Мир проверен и готов к сохранению', 6, 6)
      return world
    }
    if (attempt === maxRewrites) {
      console.warn(`[model:world-quality] Мир возвращён после ${maxRewrites} содержательных переработок; итоговое покрытие ${effectiveReview.coverage}%.`)
      reportProgress(report, 97, 'finalizing', 'Завершаем лучший проверенный вариант мира', 6, 6)
      return world
    }
    world = await createCandidate(worldRewritePrompt(request, concept, world, effectiveReview))
  }

  reportProgress(report, 97, 'finalizing', 'Мир готов к сохранению', 6, 6)
  return world
}
