import type {
  Campaign,
  CampaignSnapshot,
  GameEvent,
  InventoryItem,
  InventoryItemPatch,
  LoreEntry,
  MemoryEntry,
  Quest,
  StoryMessage,
  TurnPatch,
  TurnResponse,
  ActionType,
  ArtifactProfile,
  Ability,
  AbilityDraft,
  AbilityChangePatch,
  ActiveConflict,
  NPCStrategy,
  NPCDossier,
  PowerTechnique,
  PowerTechniqueChangePatch,
  PowerTechniqueDraft,
  StatusEffect,
  StateChange,
  WorldPressure,
  AdaptiveInterfaceElement,
  AdaptiveInterfaceModule,
  WorldInterfaceBlueprint,
  InspectorTabId,
  WorldMetric,
  WorldChronicleEntry,
  WorldScale,
  LegendaryFigure,
  LegendStage,
  WorldPatch,
} from '../../shared/types'
import { compactMemoryBank } from '../../shared/context'
import { normalizeItemRarity } from '../../shared/rarity'
import { normalizeArtifactDiscovery, updateArtifactRegistry } from '../../shared/artifacts'
import { isMutationOperationName } from '../../shared/mutation-operations'
import { diffCampaignState, summarizeStateChanges } from './state-changes'

const id = () => crypto.randomUUID()
const now = () => new Date().toISOString()
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const normalizedName = (value: string) => value.trim().toLocaleLowerCase('ru-RU')
const uniqueStrings = (values: string[], limit: number) => [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit)
const INTERFACE_MODULE_LIMIT = 8
const INTERFACE_ELEMENT_LIMIT = 16
const WORLD_METRIC_LIMIT = 48
const WORLD_CHRONICLE_LIMIT = 5_000
const TERMINAL_RETENTION_TURNS = 4
const WORLD_PLACE_LIMIT = 600
const WORLD_PROCESS_TERMINAL_LIMIT = 60
const WORLD_FACTION_LIMIT = 120
const WORLD_LOCATION_LIMIT = 240
const WORLD_ROUTE_LIMIT = 1_000
const WORLD_LAW_LIMIT = 200
const WORLD_MECHANIC_LIMIT = 200
const WORLD_LEGEND_LIMIT = 500

const WORLD_SCALE_IMPORTANCE: Record<WorldScale, number> = {
  personal: 45,
  local: 55,
  regional: 65,
  national: 75,
  continental: 82,
  global: 90,
  cosmic: 96,
}

function pressureScale(tier: NonNullable<Campaign['worldPressures']>[number]['tier']): WorldScale {
  if (tier === 'mythic') return 'cosmic'
  if (tier === 'legendary') return 'global'
  if (tier === 'critical') return 'national'
  if (tier === 'serious') return 'regional'
  if (tier === 'local') return 'local'
  return 'personal'
}

function rejectedReference(diagnostics: StateChange[] | undefined, path: string, reference: string | undefined, reason = 'ссылка не найдена') {
  diagnostics?.push({
    kind: 'system',
    label: 'Изменение не применено',
    detail: `${path}: ${reason}${reference ? ` «${reference}»` : ''}`,
    tone: 'warning',
    entityId: reference,
    source: 'state-engine',
  })
}

function metricMatches(metric: { key: string; label: string; aliases?: string[] }, candidate: string): boolean {
  const normalizedCandidate = normalizedName(candidate)
  return [metric.key, metric.label, ...(metric.aliases ?? [])].some((value) => normalizedName(value) === normalizedCandidate)
}

function normalizeInterfaceElements(
  elements: AdaptiveInterfaceElement[],
  diagnostics: StateChange[] | undefined,
  path: string,
): AdaptiveInterfaceElement[] {
  const byId = new Map<string, AdaptiveInterfaceElement>()
  elements.forEach((element, index) => {
    if (byId.has(element.id)) rejectedReference(diagnostics, `${path}[${index}].id`, element.id, 'повторяющийся идентификатор элемента; сохранена последняя версия')
    byId.set(element.id, structuredClone(element))
  })
  const uniqueElements = [...byId.values()]
  const kept = uniqueElements.slice(0, INTERFACE_ELEMENT_LIMIT)
  uniqueElements.slice(INTERFACE_ELEMENT_LIMIT).forEach((element) => {
    rejectedReference(diagnostics, path, element.id, `превышен лимит ${INTERFACE_ELEMENT_LIMIT} элементов модуля`)
  })
  const ids = new Set(kept.map((element) => element.id))
  return kept.map((element, elementIndex) => {
    const links = [...new Set(element.links ?? [])].filter((link, linkIndex) => {
      const valid = link !== element.id && ids.has(link)
      if (!valid) rejectedReference(diagnostics, `${path}[${elementIndex}].links[${linkIndex}]`, link, 'связь ведёт к отсутствующему или тому же элементу')
      return valid
    })
    return { ...element, links }
  })
}

function normalizeInterfaceModule(
  incoming: Omit<AdaptiveInterfaceModule, 'createdTurn' | 'lastChangedTurn'> & Partial<Pick<AdaptiveInterfaceModule, 'createdTurn' | 'lastChangedTurn'>>,
  turn: number,
  diagnostics: StateChange[] | undefined,
  path: string,
  existing?: AdaptiveInterfaceModule,
): AdaptiveInterfaceModule {
  return {
    ...incoming,
    id: existing?.id ?? incoming.id,
    pinned: existing?.pinned === true ? true : incoming.pinned,
    density: incoming.density ?? existing?.density,
    emphasis: incoming.emphasis ?? existing?.emphasis,
    priority: clamp(Number.isFinite(incoming.priority) ? incoming.priority : 0, 0, 100),
    elements: normalizeInterfaceElements(incoming.elements ?? [], diagnostics, `${path}.elements`),
    createdTurn: existing?.createdTurn ?? turn,
    lastChangedTurn: turn,
  }
}

function validInterfaceBlueprint(blueprint: WorldInterfaceBlueprint): boolean {
  const tabIds = blueprint.tabs.map((tab) => tab.id)
  const requiredTabIds: InspectorTabId[] = ['dashboard', 'scene', 'hero', 'inventory', 'changes', 'world']
  return tabIds.length === requiredTabIds.length
    && new Set(tabIds).size === tabIds.length
    && requiredTabIds.every((id) => tabIds.includes(id))
    && blueprint.tabs.every((tab) => tab.visible)
    && blueprint.tabs.some((tab) => tab.id === blueprint.defaultTab)
    && blueprint.dashboardSections.length > 0
    && new Set(blueprint.dashboardSections).size === blueprint.dashboardSections.length
}

function normalizedMeter(value: number | undefined, maximum: number | undefined): number | undefined {
  if (!Number.isFinite(value)) return undefined
  return clamp(value ?? 0, 0, Number.isFinite(maximum) ? Math.max(0, maximum ?? 0) : 1_000_000)
}

function itemState(
  explicit: InventoryItem['state'] | undefined,
  durability: number | undefined,
  maxDurability: number | undefined,
  charges: number | undefined,
  maxCharges: number | undefined,
): InventoryItem['state'] | undefined {
  if (explicit === 'sealed') return explicit
  if (durability !== undefined && durability <= 0) return 'broken'
  if (charges !== undefined && maxCharges !== undefined && charges <= 0) return 'depleted'
  if (explicit) return explicit
  if (durability !== undefined && maxDurability !== undefined && durability < maxDurability) return 'damaged'
  if (durability !== undefined || charges !== undefined) return 'intact'
  return undefined
}

function normalizeStatusEffect(
  effect: Omit<StatusEffect, 'id' | 'appliedTurn'> & { id?: string; appliedTurn?: number },
  turn: number,
  existing?: StatusEffect,
): StatusEffect {
  const remaining = Number.isFinite(effect.duration.remaining)
    ? Math.max(0, Math.round(effect.duration.remaining ?? 0))
    : undefined
  const expiresTurn = Number.isFinite(effect.duration.expiresTurn)
    ? Math.max(0, Math.round(effect.duration.expiresTurn ?? 0))
    : undefined
  const finiteRecord = (record: Record<string, number> | undefined) => record
    ? Object.fromEntries(Object.entries(record).filter(([key, value]) => key.trim() && Number.isFinite(value)).slice(0, 24))
    : undefined
  return {
    ...effect,
    id: existing?.id ?? effect.id ?? id(),
    name: effect.name.trim(),
    description: effect.description.trim(),
    source: effect.source.trim(),
    severity: clamp(effect.severity, 0, 100),
    effects: effect.effects.slice(0, 48),
    resourceDeltasPerTurn: finiteRecord(effect.resourceDeltasPerTurn),
    checkModifiers: finiteRecord(effect.checkModifiers),
    stacks: clamp(Math.round(effect.stacks), 1, 999),
    duration: {
      ...effect.duration,
      remaining,
      expiresTurn,
      condition: effect.duration.condition?.trim() || undefined,
    },
    appliedTurn: Math.min(turn, Math.max(0, Math.round(existing?.appliedTurn ?? effect.appliedTurn ?? turn))),
  }
}

function applyRecurringStatusEffects(
  resources: Array<{ key: string; label: string; value: number; max?: number; aliases?: string[] }>,
  effects: StatusEffect[],
  diagnostics: StateChange[] | undefined,
  ownerPath: string,
  turn: number,
) {
  effects.forEach((effect) => {
    if (effect.duration.expiresTurn !== undefined && effect.duration.expiresTurn <= turn) return
    Object.entries(effect.resourceDeltasPerTurn ?? {}).forEach(([key, delta]) => {
      if (!Number.isFinite(delta)) return
      const resource = resources.find((candidate) => metricMatches(candidate, key))
      if (!resource) {
        rejectedReference(diagnostics, `${ownerPath}.statusEffects.${effect.id}.resourceDeltasPerTurn.${key}`, key, 'ресурс периодического эффекта не найден')
        return
      }
      resource.value = clamp(resource.value + delta, 0, resource.max ?? 1_000_000)
    })
  })
}

function tickStatusEffects(effects: StatusEffect[], turn: number, sceneChanges = 0, dayChanges = 0): StatusEffect[] {
  return effects.flatMap((effect) => {
    if (effect.duration.expiresTurn !== undefined && effect.duration.expiresTurn <= turn) return []
    if (effect.duration.remaining === undefined) return [{ ...effect }]
    const elapsed = effect.duration.unit === 'turns'
      ? 1
      : effect.duration.unit === 'scenes'
        ? sceneChanges
        : effect.duration.unit === 'days'
          ? dayChanges
          : 0
    if (elapsed <= 0) return [{ ...effect }]
    const remaining = Math.max(0, Math.round(effect.duration.remaining) - elapsed)
    if (remaining <= 0) return []
    return [{ ...effect, duration: { ...effect.duration, remaining } }]
  })
}

function normalizePowerTechnique(draft: PowerTechniqueDraft, existing?: PowerTechnique): PowerTechnique {
  return {
    ...existing,
    ...draft,
    id: existing?.id ?? draft.id ?? id(),
    name: draft.name.trim(),
    description: draft.description.trim(),
    mastery: clamp(draft.mastery, 0, 100),
    activation: draft.activation.trim(),
    scale: draft.scale.trim(),
    costs: draft.costs.slice(0, 8),
    effects: draft.effects.slice(0, 12),
    requirements: draft.requirements.slice(0, 12),
    limitations: draft.limitations.slice(0, 12),
  }
}

function materializePowerTechniques(existing: PowerTechnique[] | undefined, drafts: PowerTechniqueDraft[] | undefined, authoritative = false): PowerTechnique[] {
  if (authoritative && drafts !== undefined) {
    return drafts.map((draft) => {
      const current = existing?.find((technique) => (draft.id && technique.id === draft.id) || normalizedName(technique.name) === normalizedName(draft.name))
      return normalizePowerTechnique(draft, current)
    }).slice(-48)
  }
  const result = (existing ?? []).map((technique) => normalizePowerTechnique(technique, technique))
  drafts?.forEach((draft) => {
    const current = result.find((technique) => (draft.id && technique.id === draft.id) || normalizedName(technique.name) === normalizedName(draft.name))
    if (current) Object.assign(current, normalizePowerTechnique(draft, current))
    else result.push(normalizePowerTechnique(draft))
  })
  return result.slice(-48)
}

function applyPowerTechniqueChanges(
  techniques: PowerTechnique[],
  changes: PowerTechniqueChangePatch[] | undefined,
  diagnostics: StateChange[] | undefined,
  path: string,
) {
  changes?.slice(0, 48).forEach((change, index) => {
    const technique = techniques.find((candidate) => candidate.id === change.techniqueId)
    if (!technique) {
      rejectedReference(diagnostics, `${path}.techniqueChanges[${index}].techniqueId`, change.techniqueId, 'подспособность не найдена')
      return
    }
    if (change.name?.trim()) technique.name = change.name.trim()
    if (change.description?.trim()) technique.description = change.description.trim()
    if (change.kind) technique.kind = change.kind
    if (change.category) technique.category = change.category
    if (Number.isFinite(change.mastery)) technique.mastery = clamp(change.mastery ?? 0, 0, 100)
    if (Number.isFinite(change.masteryDelta)) technique.mastery = clamp(technique.mastery + (change.masteryDelta ?? 0), 0, 100)
    if (change.activation?.trim()) technique.activation = change.activation.trim()
    if (change.scale?.trim()) technique.scale = change.scale.trim()
    if (change.costs) technique.costs = change.costs.slice(0, 8)
    if (change.effects) technique.effects = change.effects.slice(0, 12)
    if (change.requirements) technique.requirements = change.requirements.slice(0, 12)
    if (change.limitations) technique.limitations = change.limitations.slice(0, 12)
    if (change.unlocked !== undefined) technique.unlocked = change.unlocked
  })
}

function removePowerTechniques(
  techniques: PowerTechnique[],
  removeIds: string[] | undefined,
  diagnostics: StateChange[] | undefined,
  path: string,
): PowerTechnique[] {
  if (!removeIds?.length) return techniques
  const known = new Set(techniques.map((technique) => technique.id))
  removeIds.slice(0, 48).forEach((techniqueId, index) => {
    if (!known.has(techniqueId)) rejectedReference(diagnostics, `${path}.removeTechniqueIds[${index}]`, techniqueId, 'подспособность не найдена')
  })
  const removed = new Set(removeIds)
  return techniques.filter((technique) => !removed.has(technique.id))
}

function normalizeArtifact(artifact: ArtifactProfile, turn: number): ArtifactProfile {
  const normalized: ArtifactProfile = {
    ...artifact,
    mastery: artifact.mastery === undefined ? undefined : clamp(artifact.mastery, 0, 100),
    attunement: clamp(artifact.attunement, 0, 100),
    bond: clamp(artifact.bond, -100, 100),
    requirements: artifact.requirements.slice(0, 48),
    passiveEffects: artifact.passiveEffects.slice(0, 48),
    combinedEffects: artifact.combinedEffects.slice(0, 48),
    failureModes: artifact.failureModes.slice(0, 48),
    components: artifact.components.slice(0, 32).map((component) => ({ ...component, capabilities: component.capabilities.slice(0, 64) })),
    powers: artifact.powers.slice(0, 64).map((power) => ({
      ...power,
      mastery: clamp(power.mastery, 0, 100),
      costs: power.costs.slice(0, 8),
      limitations: power.limitations.slice(0, 48),
      capabilities: power.capabilities?.slice(0, 64) ?? [],
      synergies: power.synergies?.slice(0, 32) ?? [],
      counters: power.counters?.slice(0, 32) ?? [],
      examples: power.examples?.slice(0, 24) ?? [],
      techniques: materializePowerTechniques([], power.techniques),
    })),
    drawbacks: artifact.drawbacks.slice(0, 48),
    evolutionPaths: artifact.evolutionPaths.slice(0, 24),
    secrets: artifact.secrets.slice(0, 48),
    creativeIdentity: artifact.creativeIdentity ? {
      ...artifact.creativeIdentity,
      conceptualDomains: uniqueStrings(artifact.creativeIdentity.conceptualDomains, 12),
      mechanicVerbs: uniqueStrings(artifact.creativeIdentity.mechanicVerbs, 16),
      motifs: uniqueStrings(artifact.creativeIdentity.motifs, 16),
      differentiation: uniqueStrings(artifact.creativeIdentity.differentiation, 12),
      relatedArtifactIds: uniqueStrings(artifact.creativeIdentity.relatedArtifactIds ?? [], 24),
    } : undefined,
    presentation: artifact.presentation ? {
      ...artifact.presentation,
      sectionOrder: [...new Set(artifact.presentation.sectionOrder)].slice(0, 12),
    } : undefined,
  }
  normalized.discovery = normalizeArtifactDiscovery(artifact.discovery, { artifact: normalized } as InventoryItem, turn)
  return normalized
}

function mergeTextDetails(current: string[] | undefined, incoming: string[] | undefined, limit: number): string[] {
  return [...(current ?? []), ...(incoming ?? [])]
    .map((value) => value.trim())
    .filter((value, index, all) => value && all.indexOf(value) === index)
    .slice(-limit)
}

function materializeAbility(draft: AbilityDraft, turn: number, existing?: Ability): Ability {
  const paths = draft.evolutionPaths === undefined
    ? [...(existing?.evolutionPaths ?? [])]
    : draft.evolutionPaths.map((path) => {
      const current = existing?.evolutionPaths?.find((candidate) => (path.id && candidate.id === path.id) || normalizedName(candidate.name) === normalizedName(path.name))
      return { ...current, ...path, id: current?.id ?? path.id ?? id() }
    })
  const histories = [
    ...(existing?.history ?? []),
    ...(draft.history ?? []).map((entry) => ({ ...entry, id: entry.id ?? id(), turn: entry.turn ?? turn })),
  ].filter((entry, index, all) => all.findIndex((candidate) => candidate.id === entry.id) === index).slice(-100)
  return {
    ...existing,
    ...draft,
    id: existing?.id ?? draft.id ?? id(),
    name: draft.name.trim(),
    description: draft.description.trim(),
    mastery: clamp(draft.mastery ?? existing?.mastery ?? 0, 0, 100),
    costs: (draft.costs ?? existing?.costs ?? []).slice(0, 8),
    // A full-card upsert is authoritative for every explicitly supplied collection. This lets
    // the model remove obsolete effects/limits after an upgrade. Granular additive changes
    // remain available through AbilityChangePatch.add* fields below.
    effects: draft.effects === undefined ? existing?.effects ?? [] : mergeTextDetails([], draft.effects, 48),
    limitations: draft.limitations === undefined ? existing?.limitations ?? [] : mergeTextDetails([], draft.limitations, 48),
    requirements: draft.requirements === undefined ? existing?.requirements ?? [] : mergeTextDetails([], draft.requirements, 48),
    evolutionPaths: paths.slice(-24),
    history: histories,
    tags: draft.tags === undefined ? existing?.tags ?? [] : mergeTextDetails([], draft.tags, 32),
    capabilities: draft.capabilities === undefined ? existing?.capabilities ?? [] : mergeTextDetails([], draft.capabilities, 64),
    synergies: draft.synergies === undefined ? existing?.synergies ?? [] : mergeTextDetails([], draft.synergies, 32),
    counters: draft.counters === undefined ? existing?.counters ?? [] : mergeTextDetails([], draft.counters, 32),
    examples: draft.examples === undefined ? existing?.examples ?? [] : mergeTextDetails([], draft.examples, 24),
    techniques: materializePowerTechniques(existing?.techniques, draft.techniques, true),
  }
}

/** Ability history is append-only. Full-card upserts and empty model arrays may enrich an
 * ability, but never erase the campaign's already recorded progression. */
function preserveAbilityHistories(current: Ability[], previousSets: Ability[][], turn: number) {
  current.forEach((ability) => {
    const previous = previousSets.flatMap((abilities) => abilities.filter((candidate) => candidate.id === ability.id || normalizedName(candidate.name) === normalizedName(ability.name)))
    const combined = [...previous.flatMap((candidate) => candidate.history ?? []), ...(ability.history ?? [])]
      .map((entry) => ({ ...entry, id: entry.id ?? id(), turn: entry.turn ?? turn }))
      .filter((entry, index, all) => all.findIndex((candidate) => candidate.id === entry.id) === index)
      .slice(-100)
    ability.history = combined
  })
}

function applyAbilityChange(
  abilities: Ability[],
  change: AbilityChangePatch,
  turn: number,
  diagnostics: StateChange[] | undefined,
  path: string,
) {
  const ability = abilities.find((candidate) => candidate.id === change.abilityId)
  if (!ability) {
    rejectedReference(diagnostics, `${path}.abilityId`, change.abilityId, 'способность не найдена')
    return
  }
  if (Number.isFinite(change.mastery)) ability.mastery = clamp(change.mastery ?? 0, 0, 100)
  if (Number.isFinite(change.masteryDelta)) ability.mastery = clamp((ability.mastery ?? 0) + (change.masteryDelta ?? 0), 0, 100)
  if (change.kind) ability.kind = change.kind
  if (change.rank?.trim()) ability.rank = change.rank.trim()
  if (change.description?.trim()) ability.description = change.description.trim()
  if (change.cooldown?.trim()) ability.cooldown = change.cooldown.trim()
  if (change.costs) ability.costs = change.costs.slice(0, 8)
  if (change.requirements) ability.requirements = change.requirements.slice(0, 48)
  if (change.progression?.trim()) ability.progression = change.progression.trim()
  if (change.tags) ability.tags = change.tags.slice(0, 32)
  if (change.category) ability.category = change.category
  if (change.scale?.trim()) ability.scale = change.scale.trim()
  if (change.activation?.trim()) ability.activation = change.activation.trim()
  if (change.canonStatus) ability.canonStatus = change.canonStatus
  if (change.canonReference?.trim()) ability.canonReference = change.canonReference.trim()
  if (change.capabilities) ability.capabilities = change.capabilities.slice(0, 64)
  if (change.synergies) ability.synergies = change.synergies.slice(0, 32)
  if (change.counters) ability.counters = change.counters.slice(0, 32)
  if (change.examples) ability.examples = change.examples.slice(0, 24)
  if (change.effects) ability.effects = change.effects.slice(0, 48)
  if (change.limitations) ability.limitations = change.limitations.slice(0, 48)
  ability.capabilities = mergeTextDetails(ability.capabilities, change.addCapabilities, 64)
  ability.synergies = mergeTextDetails(ability.synergies, change.addSynergies, 32)
  ability.counters = mergeTextDetails(ability.counters, change.addCounters, 32)
  ability.examples = mergeTextDetails(ability.examples, change.addExamples, 24)
  ability.effects = mergeTextDetails(ability.effects, change.addEffects, 48)
  ability.limitations = mergeTextDetails(ability.limitations, change.addLimitations, 48)
  ability.techniques = materializePowerTechniques(ability.techniques, change.addTechniques)
  applyPowerTechniqueChanges(ability.techniques, change.techniqueChanges, diagnostics, path)
  ability.techniques = removePowerTechniques(ability.techniques, change.removeTechniqueIds, diagnostics, path)
  ability.evolutionPaths ??= []
  change.addEvolutionPaths?.forEach((evolution) => {
    if (!ability.evolutionPaths?.some((candidate) => candidate.id === evolution.id || normalizedName(candidate.name) === normalizedName(evolution.name))) {
      ability.evolutionPaths?.push({ ...evolution, id: evolution.id ?? id() })
    }
  })
  ability.evolutionPaths = ability.evolutionPaths.slice(-24)
  const unlocks = new Set(change.unlockEvolutionPathIds ?? [])
  change.unlockEvolutionPathIds?.forEach((pathId, pathIndex) => {
    if (!(ability.evolutionPaths ?? []).some((evolution) => evolution.id === pathId)) rejectedReference(diagnostics, `${path}.unlockEvolutionPathIds[${pathIndex}]`, pathId, 'путь развития способности не найден')
  })
  ability.evolutionPaths.forEach((evolution) => { if (unlocks.has(evolution.id)) evolution.unlocked = true })
  if (change.history) {
    ability.history ??= []
    ability.history.push({ id: id(), turn, title: change.history.title, description: change.history.description })
    ability.history = ability.history.slice(-100)
  }
}

function normalizeNpcStrategy(incoming: Partial<NPCStrategy>, turn: number, existing?: NPCStrategy): NPCStrategy | undefined {
  const merged = { ...existing, ...incoming, lastUpdatedTurn: turn }
  const numericKeys: Array<keyof Pick<NPCStrategy, 'intelligence' | 'tacticalSkill' | 'strategicSkill' | 'predictionSkill' | 'adaptability' | 'deceptionSkill' | 'riskTolerance' | 'lastUpdatedTurn'>> = [
    'intelligence', 'tacticalSkill', 'strategicSkill', 'predictionSkill', 'adaptability', 'deceptionSkill', 'riskTolerance', 'lastUpdatedTurn',
  ]
  const textKeys: Array<keyof Pick<NPCStrategy, 'planningHorizon' | 'decisionStyle' | 'currentPlan' | 'visibility'>> = ['planningHorizon', 'decisionStyle', 'currentPlan', 'visibility']
  const listKeys: Array<keyof Pick<NPCStrategy, 'observedPlayerPatterns' | 'strengths' | 'blindSpots' | 'contingencies'>> = ['observedPlayerPatterns', 'strengths', 'blindSpots', 'contingencies']
  if (!numericKeys.every((key) => Number.isFinite(merged[key])) || !textKeys.every((key) => typeof merged[key] === 'string') || !listKeys.every((key) => Array.isArray(merged[key]))) return undefined
  return {
    ...(merged as NPCStrategy),
    intelligence: clamp(merged.intelligence as number, 0, 100),
    tacticalSkill: clamp(merged.tacticalSkill as number, 0, 100),
    strategicSkill: clamp(merged.strategicSkill as number, 0, 100),
    predictionSkill: clamp(merged.predictionSkill as number, 0, 100),
    adaptability: clamp(merged.adaptability as number, 0, 100),
    deceptionSkill: clamp(merged.deceptionSkill as number, 0, 100),
    riskTolerance: clamp(merged.riskTolerance as number, 0, 100),
    lastUpdatedTurn: Math.max(0, Math.min(turn, Math.round(merged.lastUpdatedTurn as number))),
    observedPlayerPatterns: (merged.observedPlayerPatterns as string[]).slice(-16),
    strengths: (merged.strengths as string[]).slice(-12),
    blindSpots: (merged.blindSpots as string[]).slice(-12),
    contingencies: (merged.contingencies as string[]).slice(-12),
    retreatConditions: merged.retreatConditions?.slice(-12),
    ethicalLimits: merged.ethicalLimits?.slice(-12),
    learnedAdaptations: merged.learnedAdaptations?.slice(-16),
    countermeasures: merged.countermeasures?.slice(-16).map((countermeasure) => ({
      ...countermeasure,
      requirements: countermeasure.requirements.slice(-12),
      tradeoffs: countermeasure.tradeoffs.slice(-12),
    })),
  }
}

function normalizeNpcDossier(
  incoming: Partial<NPCDossier>,
  turn: number,
  npc: { stats?: Campaign['npcs'][number]['stats']; resources?: Campaign['npcs'][number]['resources']; abilities?: Ability[] },
  existing?: NPCDossier,
): NPCDossier | undefined {
  const merged = {
    ...existing,
    ...incoming,
    revealedSections: incoming.revealedSections ? [...(existing?.revealedSections ?? []), ...incoming.revealedSections] : existing?.revealedSections,
    revealedStatKeys: incoming.revealedStatKeys ? [...(existing?.revealedStatKeys ?? []), ...incoming.revealedStatKeys] : existing?.revealedStatKeys,
    revealedResourceKeys: incoming.revealedResourceKeys ? [...(existing?.revealedResourceKeys ?? []), ...incoming.revealedResourceKeys] : existing?.revealedResourceKeys,
    revealedAbilityIds: incoming.revealedAbilityIds ? [...(existing?.revealedAbilityIds ?? []), ...incoming.revealedAbilityIds] : existing?.revealedAbilityIds,
    evidence: incoming.evidence ? [...(existing?.evidence ?? []), ...incoming.evidence] : existing?.evidence,
  }
  if (typeof merged.familiarity !== 'string' || !Array.isArray(merged.revealedSections) || !Array.isArray(merged.revealedStatKeys)
    || !Array.isArray(merged.revealedResourceKeys) || !Array.isArray(merged.revealedAbilityIds) || !Array.isArray(merged.evidence)) return undefined
  const uniqueText = (values: string[], max: number) => [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(-max)
  const validStatKeys = uniqueText(merged.revealedStatKeys, 24).filter((key) => (npc.stats ?? []).some((stat) => metricMatches(stat, key)))
  const validResourceKeys = uniqueText(merged.revealedResourceKeys, 24).filter((key) => (npc.resources ?? []).some((resource) => metricMatches(resource, key)))
  const validAbilityIds = uniqueText(merged.revealedAbilityIds, 40).filter((abilityId) => (npc.abilities ?? []).some((ability) => ability.id === abilityId))
  const evidence = [...new Map(merged.evidence.filter((entry) => entry?.id && entry.summary?.trim() && entry.source?.trim()).map((entry) => [entry.id, {
    ...entry,
    summary: entry.summary.trim(),
    source: entry.source.trim(),
    learnedTurn: Math.max(0, Math.min(turn, Math.round(entry.learnedTurn))),
  }])).values()].slice(-60)
  return {
    familiarity: merged.familiarity,
    revealedSections: uniqueText(merged.revealedSections, 24) as NPCDossier['revealedSections'],
    revealedStatKeys: validStatKeys,
    revealedResourceKeys: validResourceKeys,
    revealedAbilityIds: validAbilityIds,
    evidence,
    updatedTurn: turn,
  }
}

function normalizeActiveConflict(incoming: ActiveConflict, turn: number, existing?: ActiveConflict): ActiveConflict {
  return {
    ...incoming,
    id: existing?.id ?? incoming.id,
    round: Math.max(1, Math.round(incoming.round)),
    terrain: incoming.terrain.slice(-16),
    hazards: incoming.hazards.slice(-16),
    victoryConditions: incoming.victoryConditions?.slice(-12),
    failureConsequences: incoming.failureConsequences?.slice(-12),
    escapeRoutes: incoming.escapeRoutes?.slice(-12),
    telegraphs: incoming.telegraphs?.slice(-12),
    participants: incoming.participants.slice(0, 24).map((participant) => ({
      ...participant,
      readiness: clamp(participant.readiness, 0, 100),
      morale: clamp(participant.morale, 0, 100),
      advantages: participant.advantages.slice(-12),
      vulnerabilities: participant.vulnerabilities.slice(-12),
    })),
    startedTurn: existing?.startedTurn ?? Math.max(0, Math.min(turn, Math.round(incoming.startedTurn))),
    lastUpdatedTurn: turn,
  }
}

function normalizeWorldPressure(incoming: WorldPressure, turn: number, existing?: WorldPressure): WorldPressure {
  return {
    ...incoming,
    id: existing?.id ?? incoming.id,
    sourceNpcId: existing?.sourceNpcId ?? incoming.sourceNpcId,
    targetIds: [...new Set(incoming.targetIds)].slice(0, 20),
    knowledge: incoming.knowledge.slice(-20),
    signs: incoming.signs.slice(-16),
    measures: incoming.measures.slice(-16).map((measure) => ({
      ...measure,
      effects: measure.effects.slice(-12),
      counterplay: measure.counterplay.slice(-12),
      tradeoffs: measure.tradeoffs.slice(-12),
    })),
    counterplay: incoming.counterplay.slice(-16),
    deescalationConditions: incoming.deescalationConditions.slice(-12),
    createdTurn: existing?.createdTurn ?? Math.max(0, Math.min(turn, Math.round(incoming.createdTurn))),
    lastAdvancedTurn: turn,
  }
}

function normalizeThreatProfile(profile: NonNullable<Campaign['npcs'][number]['threatProfile']>) {
  return {
    ...profile,
    signatureAbilities: profile.signatureAbilities?.slice(-12),
    threatVectors: profile.threatVectors?.slice(-12),
    defensiveLayers: profile.defensiveLayers?.slice(-12),
    battlefieldControl: profile.battlefieldControl?.slice(-12),
    informationAdvantages: profile.informationAdvantages?.slice(-12),
    preparedAssets: profile.preparedAssets?.slice(-12),
    engagementPhases: profile.engagementPhases?.slice(-6).map((phase) => ({
      ...phase,
      priorities: phase.priorities.slice(-8),
      signatureMoves: phase.signatureMoves.slice(-8),
      openings: phase.openings.slice(-8),
      exitConditions: phase.exitConditions.slice(-8),
    })),
    collateralRisks: profile.collateralRisks?.slice(-12),
    whyDangerous: profile.whyDangerous.slice(-12),
    knownFeats: profile.knownFeats.slice(-12),
    constraints: profile.constraints.slice(-12),
    defeatRequirements: profile.defeatRequirements.slice(-12),
    escalationTriggers: profile.escalationTriggers.slice(-12),
  }
}

const LEGEND_STAGE_RANK: Record<LegendStage, number> = { notable: 0, renowned: 1, legendary: 2, mythic: 3 }

function normalizeLegend(
  incoming: NonNullable<WorldPatch['upsertLegends']>[number],
  turn: number,
  existing?: LegendaryFigure,
): LegendaryFigure {
  const unique = (values: string[], limit: number) => [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit)
  const mergeRecords = <T extends { id: string }>(previous: T[] | undefined, incomingValues: T[], limit: number) => {
    const records = new Map((previous ?? []).map((entry) => [entry.id, structuredClone(entry)]))
    incomingValues.forEach((entry) => records.set(entry.id, structuredClone(entry)))
    return [...records.values()].slice(-limit)
  }
  const deeds = mergeRecords(existing?.deeds, incoming.deeds, 40)
  const myths = mergeRecords(existing?.myths, incoming.myths, 40)
  const legacies = mergeRecords(existing?.legacies, incoming.legacies, 40)
  const discoveryEvidence = mergeRecords(existing?.discovery.evidence, incoming.discovery.evidence.map((entry) => ({
    ...entry,
    learnedTurn: entry.learnedTurn ?? existing?.discovery.evidence.find((known) => known.id === entry.id)?.learnedTurn ?? turn,
  })), 80)
  const discoveryChanged = !existing || JSON.stringify({
    ...existing.discovery,
    updatedTurn: undefined,
  }) !== JSON.stringify({
    ...incoming.discovery,
    evidence: discoveryEvidence,
    updatedTurn: undefined,
  })
  return {
    ...structuredClone(incoming),
    id: existing?.id ?? incoming.id,
    characterId: incoming.characterId,
    aliases: unique(incoming.aliases, 16),
    titles: unique(incoming.titles, 16),
    renown: clamp(incoming.renown, 0, 100),
    influence: clamp(incoming.influence, 0, 100),
    powerStanding: incoming.powerStanding ? {
      ...incoming.powerStanding,
      domains: unique(incoming.powerStanding.domains, 12),
      evidence: unique(incoming.powerStanding.evidence, 16),
      uncertainties: unique(incoming.powerStanding.uncertainties, 12),
    } : existing?.powerStanding,
    knownFeats: unique(incoming.knownFeats, 20),
    disputedClaims: unique(incoming.disputedClaims, 20),
    associatedFactionNames: unique(incoming.associatedFactionNames, 20),
    relatedNpcIds: [...new Set(incoming.relatedNpcIds)].slice(0, 24),
    successorNpcIds: [...new Set(incoming.successorNpcIds)].slice(0, 24),
    deeds: deeds.map((deed) => ({
      ...deed,
      scopeIds: [...new Set(deed.scopeIds)].slice(0, 24),
      factionNames: unique(deed.factionNames, 20),
      witnesses: unique(deed.witnesses, 20),
      consequences: unique(deed.consequences, 20),
      renownImpact: clamp(deed.renownImpact, -100, 100),
    })),
    myths: myths.map((myth) => ({
      ...myth,
      believers: unique(myth.believers, 20),
    })),
    legacies: legacies.map((legacy) => ({
      ...legacy,
      holderNpcIds: [...new Set(legacy.holderNpcIds)].slice(0, 20),
      scopeIds: [...new Set(legacy.scopeIds)].slice(0, 24),
      factionNames: unique(legacy.factionNames, 20),
      accessConditions: unique(legacy.accessConditions, 16),
      consequences: unique(legacy.consequences, 16),
    })),
    currentState: {
      ...incoming.currentState,
      encounterReadiness: clamp(incoming.currentState.encounterReadiness, 0, 100),
      encounterConditions: unique(incoming.currentState.encounterConditions, 16),
      blockers: unique(incoming.currentState.blockers, 16),
      signs: unique(incoming.currentState.signs, 16),
      lastUpdatedTurn: turn,
    },
    emergence: {
      ...incoming.emergence,
      momentum: clamp(incoming.emergence.momentum, -100, 100),
      qualifyingSigns: unique(incoming.emergence.qualifyingSigns, 16),
      disqualifiers: unique(incoming.emergence.disqualifiers, 16),
      lastEvaluatedTurn: turn,
    },
    canon: {
      ...incoming.canon,
      anchorFacts: unique(incoming.canon.anchorFacts, 24),
      forbiddenContradictions: unique(incoming.canon.forbiddenContradictions, 24),
      divergenceNotes: unique(incoming.canon.divergenceNotes, 24),
    },
    discovery: {
      ...incoming.discovery,
      awareness: clamp(incoming.discovery.awareness, 0, 100),
      revealedSections: [...new Set(incoming.discovery.revealedSections)].slice(0, 16),
      evidence: discoveryEvidence.map((entry) => ({
        ...entry,
        reliability: clamp(entry.reliability, 0, 100),
        learnedTurn: clamp(Math.round(entry.learnedTurn), 0, turn),
      })),
      updatedTurn: discoveryChanged ? turn : existing?.discovery.updatedTurn ?? turn,
    },
    createdTurn: existing?.createdTurn ?? incoming.createdTurn ?? turn,
    lastChangedTurn: turn,
  }
}

function createSnapshot(campaign: Campaign): CampaignSnapshot {
  return {
    turn: campaign.turn,
    world: structuredClone(campaign.world),
    player: structuredClone(campaign.player),
    inventory: structuredClone(campaign.inventory),
    npcs: structuredClone(campaign.npcs),
    quests: structuredClone(campaign.quests),
    lore: structuredClone(campaign.lore),
    memories: structuredClone(campaign.memories),
    scene: structuredClone(campaign.scene),
    pacing: structuredClone(campaign.pacing),
    activeConflict: structuredClone(campaign.activeConflict),
    socialLinks: structuredClone(campaign.socialLinks ?? []),
    threads: structuredClone(campaign.threads ?? []),
    worldEvents: structuredClone(campaign.worldEvents ?? []),
    factionReputation: structuredClone(campaign.factionReputation ?? []),
    archives: structuredClone(campaign.archives ?? []),
    partyMemberIds: structuredClone(campaign.partyMemberIds ?? []),
    partyRoles: structuredClone(campaign.partyRoles ?? {}),
    characterArcs: structuredClone(campaign.characterArcs ?? []),
    mysteryCases: structuredClone(campaign.mysteryCases ?? []),
    antagonistPlans: structuredClone(campaign.antagonistPlans ?? []),
    worldPressures: structuredClone(campaign.worldPressures ?? []),
    influenceAssets: structuredClone(campaign.influenceAssets ?? []),
    eventDirectorState: structuredClone(campaign.eventDirectorState),
    artifactRegistry: structuredClone(campaign.artifactRegistry ?? []),
    messageCount: campaign.messages.length,
    eventCount: campaign.timeline.length,
  }
}

function materializeItem(patch: InventoryItemPatch, turn: number): InventoryItem | undefined {
  if (!patch?.name?.trim() || !patch.description?.trim() || !patch.category || !Number.isFinite(patch.quantity) || !patch.rarity || patch.equipped === undefined || !Array.isArray(patch.effects)) return undefined
  const maxDurability = Number.isFinite(patch?.maxDurability) ? Math.max(0, patch?.maxDurability ?? 0) : undefined
  const durability = normalizedMeter(patch?.durability, maxDurability)
  const maxCharges = Number.isFinite(patch?.maxCharges) ? Math.max(0, patch?.maxCharges ?? 0) : undefined
  const charges = normalizedMeter(patch?.charges, maxCharges)
  return normalizeItemRarity({
    id: patch?.id ?? id(),
    name: patch.name.trim(),
    description: patch.description.trim(),
    category: patch.category,
    quantity: clamp(Math.round(patch.quantity ?? 1), 1, 999),
    rarity: patch.rarity,
    rarityProfile: patch.rarityProfile ? { ...patch.rarityProfile, acquisitionRisk: clamp(patch.rarityProfile.acquisitionRisk, 0, 100) } : undefined,
    equipped: patch.equipped,
    equippedSlot: patch?.equippedSlot,
    weight: patch?.weight,
    durability,
    maxDurability,
    charges,
    maxCharges,
    state: itemState(patch?.state, durability, maxDurability, charges, maxCharges),
    effects: Array.isArray(patch?.effects) ? patch.effects.slice(0, 12) : [],
    origin: patch?.origin,
    discoveredTurn: patch?.discoveredTurn ?? turn,
    history: patch?.history?.slice(0, 40).map((entry) => ({ ...entry, id: entry.id ?? id(), turn: entry.turn ?? turn })) ?? [],
    artifact: patch?.artifact ? normalizeArtifact(patch.artifact, turn) : undefined,
  })
}

export function describePatch(patch: TurnPatch): string[] {
  const changes: string[] = []
  patch.inventory?.forEach((mutation) => {
    if (mutation.operation === 'add') changes.push(`+ ${mutation.item?.name ?? 'предмет'} ×${mutation.item?.quantity ?? 1}`)
    if (mutation.operation === 'remove') changes.push(`− предмет ${mutation.targetId}${mutation.quantity ? ` ×${mutation.quantity}` : ''}`)
    if (mutation.operation === 'update') changes.push(`Обновлено: ${mutation.item?.name ?? 'предмет'}`)
  })
  Object.entries(patch.resourceDeltas ?? {}).forEach(([key, delta]) => changes.push(`${key} ${delta >= 0 ? '+' : '−'}${Math.abs(delta)}`))
  Object.entries(patch.statDeltas ?? {}).forEach(([key, delta]) => changes.push(`${key} ${delta >= 0 ? '+' : '−'}${Math.abs(delta)}`))
  Object.entries(patch.currencyDeltas ?? {}).forEach(([key, delta]) => changes.push(`${key} ${delta >= 0 ? '+' : '−'}${Math.abs(delta)}`))
  patch.addAbilities?.forEach((ability) => changes.push(`Новая способность: ${ability.name}`))
  patch.abilityChanges?.forEach(() => changes.push('Способность развивается'))
  patch.artifactChanges?.forEach(() => changes.push('Артефакт изменился'))
  patch.addConditions?.forEach((condition) => changes.push(`Состояние: ${condition}`))
  patch.removeConditions?.forEach((condition) => changes.push(`Снято: ${condition}`))
  patch.relationships?.forEach((relation) => changes.push(`Отношение ${relation.delta >= 0 ? '+' : '−'}${Math.abs(relation.delta)}`))
  patch.quests?.forEach((quest) => changes.push(quest.operation === 'add' ? `Новая цель: ${quest.quest?.title ?? 'квест'}` : `Квест обновлён`))
  patch.lore?.forEach((entry) => changes.push(entry.enabled ? `${entry.discovered ? 'Открыт' : 'Обновлён'} лор: ${entry.title}` : `Лор больше не действует: ${entry.title}`))
  patch.npcs?.forEach((mutation) => changes.push(mutation.operation === 'add' ? `Новый персонаж: ${mutation.npc.name}` : `Обновлён персонаж`))
  if (patch.playerProfile) changes.push('Профиль героя изменён')
  if (patch.world) changes.push('Мир изменился')
  patch.upsertStats?.forEach((stat) => changes.push(`Система: ${stat.label}`))
  patch.upsertResources?.forEach((resource) => changes.push(`Ресурс: ${resource.label}`))
  patch.socialLinks?.forEach((link) => changes.push(`Связь NPC: ${link.label}`))
  patch.removeSocialLinkIds?.forEach(() => changes.push('Связь NPC прекратилась'))
  patch.threads?.forEach((mutation) => changes.push(mutation.operation === 'add' ? `Новая связь: ${mutation.thread?.title ?? 'обязательство'}` : 'Обязательство обновлено'))
  patch.worldEvents?.forEach((mutation) => changes.push(mutation.operation === 'add' ? `Событие назначено: ${mutation.event?.title ?? 'мировое событие'}` : 'Мировое событие обновлено'))
  if (patch.party?.addNpcIds?.length || patch.party?.removeNpcIds?.length || Object.keys(patch.party?.roles ?? {}).length) changes.push('Состав отряда изменён')
  Object.entries(patch.factionReputationDeltas ?? {}).forEach(([name, delta]) => changes.push(`${name}: репутация ${delta >= 0 ? '+' : '−'}${Math.abs(delta)}`))
  patch.upsertCharacterArcs?.forEach((arc) => changes.push(`Арка: ${arc.title}`))
  patch.upsertMysteryCases?.forEach((mystery) => changes.push(`Расследование: ${mystery.title}`))
  patch.upsertAntagonistPlans?.forEach(() => changes.push('План противника продвинулся'))
  patch.upsertWorldPressures?.forEach((pressure) => changes.push(`Ответ мира: ${pressure.sourceName}`))
  if (patch.pacing) changes.push(`Ритм сцены: ${patch.pacing.beat} · ${patch.pacing.challengeTier}`)
  patch.upsertInfluenceAssets?.forEach((asset) => changes.push(`Влияние: ${asset.title}`))
  patch.world?.upsertLegends?.forEach((legend) => changes.push(`Легенда мира: ${legend.name}`))
  if (patch.conflict) changes.push(patch.conflict.operation === 'start' ? 'Началось противостояние' : patch.conflict.operation === 'resolve' ? 'Противостояние завершилось' : 'Обстановка противостояния изменилась')
  return changes.slice(0, 14)
}

export function applyPatch(
  base: Campaign,
  patch: TurnPatch,
  turn: number,
  diagnostics?: StateChange[],
  options: { advanceStatusClock?: boolean } = {},
): Campaign {
  const campaign = structuredClone(base)
  campaign.settings.responseLength ??= 'adaptive'
  const retirementEvents: Array<Omit<GameEvent, 'id' | 'turn' | 'createdAt'>> = []
  const sceneChanges = patch.scene && (
    (patch.scene.title !== undefined && patch.scene.title !== campaign.scene.title)
    || (patch.scene.location !== undefined && patch.scene.location !== campaign.scene.location)
  ) ? 1 : 0
  const dayChanges = Number.isFinite(patch.world?.calendarDayDelta) ? Math.max(0, Math.floor(patch.world?.calendarDayDelta ?? 0)) : 0
  campaign.player.stats ??= []
  campaign.player.resources ??= []
  campaign.player.abilities ??= []
  campaign.player.conditions ??= []
  if (options.advanceStatusClock !== false) {
    applyRecurringStatusEffects(campaign.player.resources, campaign.player.statusEffects ?? [], diagnostics, 'player', turn)
    campaign.player.statusEffects = tickStatusEffects(campaign.player.statusEffects ?? [], turn, sceneChanges, dayChanges)
  }
  campaign.player.lifeState ??= 'active'
  campaign.player.currency ??= {}
  campaign.npcs.forEach((npc) => {
    npc.stats ??= []
    npc.resources ??= []
    npc.abilities ??= []
    if (options.advanceStatusClock !== false) {
      applyRecurringStatusEffects(npc.resources, npc.statusEffects ?? [], diagnostics, `npcs.${npc.id}`, turn)
      npc.statusEffects = tickStatusEffects(npc.statusEffects ?? [], turn, sceneChanges, dayChanges)
    }
  })
  campaign.socialLinks ??= []
  campaign.threads ??= []
  campaign.worldEvents ??= []
  campaign.factionReputation ??= []
  campaign.documents ??= []
  campaign.archives ??= []
  campaign.partyMemberIds ??= []
  campaign.partyRoles ??= {}
  campaign.characterArcs ??= []
  campaign.mysteryCases ??= []
  campaign.antagonistPlans ??= []
  campaign.worldPressures ??= []
  campaign.influenceAssets ??= []
  campaign.artifactRegistry ??= []
  if (patch.eventDirectorState) campaign.eventDirectorState = structuredClone(patch.eventDirectorState)
  campaign.world.places ??= []
  campaign.world.processes ??= []
  campaign.world.legends ??= []
  campaign.world.chronicle ??= []

  type ChronicleDraft = Omit<WorldChronicleEntry, 'id' | 'createdAt' | 'endTurn' | 'importance'> & {
    endTurn?: number
    importance?: number
  }
  const queueChronicle = (draft: ChronicleDraft) => {
    if (campaign.world.chronicle?.some((entry) => entry.kind === draft.kind && entry.sourceId === draft.sourceId)) return
    const timestamp = now()
    const entry: WorldChronicleEntry = {
      ...draft,
      id: id(),
      scopeIds: [...new Set(draft.scopeIds)].slice(0, 24),
      causeIds: [...new Set(draft.causeIds)].filter((causeId) => causeId !== draft.sourceId).slice(0, 24),
      entityIds: [...new Set(draft.entityIds)].slice(0, 24),
      startTurn: clamp(Math.round(draft.startTurn), 0, turn),
      endTurn: clamp(Math.round(draft.endTurn ?? turn), 0, turn),
      importance: clamp(draft.importance ?? WORLD_SCALE_IMPORTANCE[draft.scale], 0, 100),
      createdAt: timestamp,
    }
    if (entry.endTurn < entry.startTurn) entry.endTurn = entry.startTurn
    campaign.world.chronicle = [...(campaign.world.chronicle ?? []), entry].slice(-WORLD_CHRONICLE_LIMIT)
    // Rumored and hidden causal facts remain available only through the visibility-aware
    // chronicle. The general story archive is narrator-facing and may contain exact summaries,
    // so only confirmed facts are allowed into it.
    if (entry.visibility === 'known') {
      const archiveKind = ['global', 'cosmic'].includes(entry.scale) ? 'era' as const
        : ['process', 'event', 'pressure', 'plan'].includes(entry.kind) ? 'chapter' as const
          : 'scene' as const
      campaign.archives = [...(campaign.archives ?? []), {
        id: id(),
        kind: archiveKind,
        title: entry.title,
        summary: `${entry.summary} Итог: ${entry.outcome}`,
        startTurn: entry.startTurn,
        endTurn: entry.endTurn,
        tags: ['world-chronicle', entry.kind, entry.scale, entry.sourceId],
        entityIds: [...new Set([...entry.entityIds, ...entry.scopeIds])].slice(0, 24),
        importance: entry.importance,
        createdAt: timestamp,
      }].slice(-20_000)
    }
  }
  const knownCausalIds = new Set([
    ...(campaign.world.processes ?? []).map((entry) => entry.id),
    ...(campaign.world.legends ?? []).flatMap((entry) => [entry.id, ...entry.deeds.map((deed) => deed.id), ...entry.legacies.map((legacy) => legacy.id)]),
    ...(campaign.world.chronicle ?? []).flatMap((entry) => [entry.id, entry.sourceId]),
    ...(campaign.threads ?? []).map((entry) => entry.id),
    ...(campaign.worldEvents ?? []).map((entry) => entry.id),
    ...campaign.quests.map((entry) => entry.id),
    ...(campaign.antagonistPlans ?? []).map((entry) => entry.id),
    ...(campaign.worldPressures ?? []).map((entry) => entry.id),
    ...(patch.world?.upsertProcesses ?? []).map((entry) => entry.id),
    ...(patch.world?.upsertLegends ?? []).flatMap((entry) => [entry.id, ...entry.deeds.map((deed) => deed.id), ...entry.legacies.map((legacy) => legacy.id)]),
    ...(patch.threads ?? []).flatMap((entry) => entry.operation === 'add' && entry.thread?.id ? [entry.thread.id] : []),
    ...(patch.worldEvents ?? []).flatMap((entry) => entry.operation === 'add' && entry.event?.id ? [entry.event.id] : []),
    ...(patch.upsertAntagonistPlans ?? []).map((entry) => entry.id),
    ...(patch.upsertWorldPressures ?? []).map((entry) => entry.id),
  ])
  const normalizeCauseIds = (ownerId: string, causeIds: string[] | undefined, path: string) => [...new Set(causeIds ?? [])].filter((causeId, index) => {
    const valid = causeId !== ownerId && knownCausalIds.has(causeId)
    if (!valid) rejectedReference(diagnostics, `${path}.causeIds[${index}]`, causeId, 'причинная ссылка неизвестна или ссылается на себя')
    return valid
  }).slice(0, 24)
  const normalizeScopeIds = (scopeIds: string[] | undefined, path: string) => {
    const knownPlaces = new Set([...(campaign.world.places ?? []).map((place) => place.id), ...(patch.world?.upsertPlaces ?? []).map((place) => place.id)])
    return [...new Set(scopeIds ?? [])].filter((placeId, index) => {
      const valid = knownPlaces.has(placeId)
      if (!valid) rejectedReference(diagnostics, `${path}.scopeIds[${index}]`, placeId, 'область причинного изменения не найдена в атласе')
      return valid
    }).slice(0, 24)
  }
  const inferScale = (scopeIds: string[] | undefined, fallback: WorldScale = 'local'): WorldScale => {
    const kinds = new Set((scopeIds ?? []).map((scopeId) => campaign.world.places?.find((place) => place.id === scopeId)?.kind))
    if (kinds.has('dimension') || kinds.has('system') || kinds.has('planet')) return 'cosmic'
    if (kinds.has('realm') || kinds.has('continent')) return 'continental'
    if (kinds.has('country')) return 'national'
    if (kinds.has('region')) return 'regional'
    return fallback
  }

  if (patch.playerProfile) {
    const { levelDelta, ...profile } = patch.playerProfile
    Object.assign(campaign.player, profile)
    if (Number.isFinite(levelDelta)) campaign.player.level = clamp(campaign.player.level + (levelDelta ?? 0), 1, 999)
  }

  const upsertStatList = <T extends { key: string; label: string; value: number; aliases?: string[] }>(current: T[], incoming: T[], limit: number) => {
    incoming.slice(0, limit).forEach((stat) => {
      const incomingNames = [stat.key, stat.label, ...(stat.aliases ?? [])]
      const existing = current.find((candidate) => incomingNames.some((name) => metricMatches(candidate, name)))
      const normalized = { ...stat, aliases: [...new Set((stat.aliases ?? []).map((alias) => alias.trim()).filter(Boolean))].slice(0, 16) }
      if (existing) Object.assign(existing, normalized, { key: existing.key })
      else current.push(normalized)
    })
  }
  upsertStatList(campaign.player.stats, patch.upsertStats ?? [], 24)
  upsertStatList(campaign.player.resources, patch.upsertResources ?? [], 24)
  if (patch.removeStatKeys?.length) {
    patch.removeStatKeys.forEach((key, index) => {
      if (!campaign.player.stats.some((stat) => metricMatches(stat, key))) rejectedReference(diagnostics, `statePatch.removeStatKeys[${index}]`, key, 'характеристика не найдена')
    })
    campaign.player.stats = campaign.player.stats.filter((stat) => !patch.removeStatKeys?.some((key) => metricMatches(stat, key)))
  }
  if (patch.removeResourceKeys?.length) {
    patch.removeResourceKeys.forEach((key, index) => {
      if (!campaign.player.resources.some((resource) => metricMatches(resource, key))) rejectedReference(diagnostics, `statePatch.removeResourceKeys[${index}]`, key, 'ресурс не найден')
    })
    campaign.player.resources = campaign.player.resources.filter((resource) => !patch.removeResourceKeys?.some((key) => metricMatches(resource, key)))
  }

  patch.inventory?.slice(0, 25).forEach((mutation, mutationIndex) => {
    if (mutation.operation === 'add') {
      const incoming = materializeItem(mutation.item, turn)
      if (!incoming) {
        rejectedReference(diagnostics, `statePatch.inventory[${mutationIndex}].item`, mutation.item?.name, 'новый предмет не содержит полного авторского описания и не был дополнен значениями-заглушками')
        return
      }
      const existing = campaign.inventory.find(
        (item) => item.name.toLocaleLowerCase('ru-RU') === incoming.name.toLocaleLowerCase('ru-RU') && item.category === incoming.category && !item.equipped,
      )
      if (existing && incoming.category !== 'artifact' && incoming.category !== 'weapon' && incoming.category !== 'armor') {
        existing.quantity = clamp(existing.quantity + incoming.quantity, 1, 999)
      } else {
        campaign.inventory.push(incoming)
        if (incoming.artifact) campaign.artifactRegistry = updateArtifactRegistry(campaign.artifactRegistry, incoming, 'active', turn)
      }
      return
    }

    const index = campaign.inventory.findIndex((item) => item.id === mutation.targetId)
    if (index < 0) {
      rejectedReference(diagnostics, `statePatch.inventory[${mutationIndex}].targetId`, mutation.targetId, 'предмет не найден')
      return
    }
    if (mutation.operation === 'remove') {
      const current = campaign.inventory[index]
      const amount = Number.isFinite(mutation.quantity) ? Math.max(1, Math.round(mutation.quantity ?? 1)) : undefined
      if (amount !== undefined && amount < current.quantity) current.quantity -= amount
      else {
        if (current.artifact) {
          const destroyed = /уничтож|разруш|рассып|стерт|стёрт|destroy|erase|shatter/iu.test(mutation.reason ?? '')
          campaign.artifactRegistry = updateArtifactRegistry(campaign.artifactRegistry, current, destroyed ? 'destroyed' : 'lost', turn)
        }
        campaign.inventory.splice(index, 1)
      }
      return
    }
    const current = campaign.inventory[index]
    const update = mutation.item ?? {}
    const maxDurability = Number.isFinite(update.maxDurability) ? Math.max(0, update.maxDurability ?? 0) : current.maxDurability
    const durability = normalizedMeter(update.durability ?? current.durability, maxDurability)
    const maxCharges = Number.isFinite(update.maxCharges) ? Math.max(0, update.maxCharges ?? 0) : current.maxCharges
    const charges = normalizedMeter(update.charges ?? current.charges, maxCharges)
    const preservedState = update.state ?? (current.state === 'sealed' || (durability === undefined && charges === undefined) ? current.state : undefined)
    campaign.inventory[index] = normalizeItemRarity({
      ...current,
      ...update,
      id: current.id,
      name: update.name?.trim() || current.name,
      rarity: update.rarity ?? current.rarity,
      rarityProfile: update.rarityProfile ? { ...update.rarityProfile, acquisitionRisk: clamp(update.rarityProfile.acquisitionRisk, 0, 100) } : current.rarityProfile,
      quantity: clamp(Math.round(update.quantity ?? current.quantity), 1, 999),
      durability,
      maxDurability,
      charges,
      maxCharges,
      state: itemState(preservedState, durability, maxDurability, charges, maxCharges),
      effects: Array.isArray(update.effects) ? update.effects.slice(0, 48) : current.effects,
      history: update.history
        ? [...(current.history ?? []), ...update.history.map((entry) => ({ ...entry, id: entry.id ?? id(), turn: entry.turn ?? turn }))]
          .filter((entry, entryIndex, all) => all.findIndex((candidate) => candidate.id === entry.id) === entryIndex)
          .slice(-80)
        : current.history,
      artifact: update.artifact ? normalizeArtifact({ ...current.artifact, ...update.artifact }, turn) : current.artifact,
    })
    if (campaign.inventory[index].artifact && (update.artifact || update.description || update.origin || update.effects)) {
      campaign.artifactRegistry = updateArtifactRegistry(campaign.artifactRegistry, campaign.inventory[index], 'active', turn)
    }
  })

  const updateStats = (deltas: Record<string, number> | undefined, type: 'stats' | 'resources') => {
    Object.entries(deltas ?? {}).forEach(([key, delta]) => {
      if (!Number.isFinite(delta)) return
      const target = campaign.player[type].find(
        (stat) => metricMatches(stat, key),
      )
      if (!target) {
        rejectedReference(diagnostics, `statePatch.${type === 'stats' ? 'statDeltas' : 'resourceDeltas'}.${key}`, key, type === 'stats' ? 'характеристика не найдена' : 'ресурс не найден')
        return
      }
      target.value = clamp(target.value + delta, type === 'resources' ? 0 : -999, target.max ?? 999)
    })
  }
  updateStats(patch.statDeltas, 'stats')
  updateStats(patch.resourceDeltas, 'resources')

  Object.entries(patch.currencyDeltas ?? {}).forEach(([currency, delta]) => {
    if (!Number.isFinite(delta)) return
    campaign.player.currency[currency] = Math.max(0, (campaign.player.currency[currency] ?? 0) + delta)
  })

  patch.addAbilities?.slice(0, 40).forEach((ability) => {
    const existing = campaign.player.abilities.find((current) => current.id === ability.id || normalizedName(current.name) === normalizedName(ability.name))
    if (existing) Object.assign(existing, materializeAbility(ability, turn, existing))
    else campaign.player.abilities.push(materializeAbility(ability, turn))
  })
  if (patch.removeAbilityIds?.length) {
    patch.removeAbilityIds.forEach((abilityId, index) => {
      if (!campaign.player.abilities.some((ability) => ability.id === abilityId)) rejectedReference(diagnostics, `statePatch.removeAbilityIds[${index}]`, abilityId, 'способность не найдена')
    })
    campaign.player.abilities = campaign.player.abilities.filter((ability) => !patch.removeAbilityIds?.includes(ability.id))
  }

  patch.abilityChanges?.slice(0, 24).forEach((change, changeIndex) => applyAbilityChange(
    campaign.player.abilities,
    change,
    turn,
    diagnostics,
    `statePatch.abilityChanges[${changeIndex}]`,
  ))

  patch.artifactChanges?.slice(0, 24).forEach((change, changeIndex) => {
    const item = campaign.inventory.find((candidate) => candidate.id === change.itemId)
    if (!item) {
      rejectedReference(diagnostics, `statePatch.artifactChanges[${changeIndex}].itemId`, change.itemId, 'предмет артефакта не найден')
      return
    }
    if (!item.artifact) {
      rejectedReference(diagnostics, `statePatch.artifactChanges[${changeIndex}].itemId`, change.itemId, 'у предмета нет профиля артефакта')
      return
    }
    const artifact = item.artifact
    const transformsIdentity = Boolean(
      change.creativeIdentity || change.presentation || change.powerSource || change.operatingPrinciple
      || change.classification || change.addPowers?.length || change.addComponents?.length
      || change.powerChanges?.some((power) => power.name || power.description || power.capabilities || power.addCapabilities || power.addTechniques?.length)
    )
    const previousArtifactForm = transformsIdentity ? structuredClone(item) : undefined
    if (change.itemDescription?.trim()) item.description = change.itemDescription.trim()
    if (change.itemEffects) item.effects = change.itemEffects.slice(0, 12)
    if (Number.isFinite(change.mastery)) artifact.mastery = clamp(change.mastery ?? 0, 0, 100)
    if (Number.isFinite(change.attunement)) artifact.attunement = clamp(change.attunement ?? 0, 0, 100)
    if (Number.isFinite(change.bond)) artifact.bond = clamp(change.bond ?? 0, -100, 100)
    if (Number.isFinite(change.masteryDelta)) artifact.mastery = clamp((artifact.mastery ?? 0) + (change.masteryDelta ?? 0), 0, 100)
    if (Number.isFinite(change.bondDelta)) artifact.bond = clamp(artifact.bond + (change.bondDelta ?? 0), -100, 100)
    if (Number.isFinite(change.attunementDelta)) artifact.attunement = clamp(artifact.attunement + (change.attunementDelta ?? 0), 0, 100)
    if (change.awakened !== undefined) artifact.awakened = change.awakened
    if (change.mood?.trim()) artifact.mood = change.mood.trim()
    if (change.classification?.trim()) artifact.classification = change.classification.trim()
    if (change.powerSource?.trim()) artifact.powerSource = change.powerSource.trim()
    if (change.operatingPrinciple?.trim()) artifact.operatingPrinciple = change.operatingPrinciple.trim()
    if (change.scale?.trim()) artifact.scale = change.scale.trim()
    if (change.canonStatus) artifact.canonStatus = change.canonStatus
    if (change.canonReference?.trim()) artifact.canonReference = change.canonReference.trim()
    if (change.creativeIdentity) artifact.creativeIdentity = {
      ...change.creativeIdentity,
      conceptualDomains: uniqueStrings(change.creativeIdentity.conceptualDomains, 12),
      mechanicVerbs: uniqueStrings(change.creativeIdentity.mechanicVerbs, 16),
      motifs: uniqueStrings(change.creativeIdentity.motifs, 16),
      differentiation: uniqueStrings(change.creativeIdentity.differentiation, 12),
      relatedArtifactIds: uniqueStrings(change.creativeIdentity.relatedArtifactIds ?? [], 24),
    }
    if (change.presentation) artifact.presentation = {
      ...change.presentation,
      sectionOrder: [...new Set(change.presentation.sectionOrder)].slice(0, 12),
    }
    if (change.requirements) artifact.requirements = change.requirements.slice(0, 48)
    if (change.passiveEffects) artifact.passiveEffects = change.passiveEffects.slice(0, 48)
    if (change.combinedEffects) artifact.combinedEffects = change.combinedEffects.slice(0, 48)
    if (change.failureModes) artifact.failureModes = change.failureModes.slice(0, 48)
    if (change.drawbacks) artifact.drawbacks = change.drawbacks.slice(0, 48)
    artifact.passiveEffects = mergeTextDetails(artifact.passiveEffects, change.addPassiveEffects, 48)
    artifact.combinedEffects = mergeTextDetails(artifact.combinedEffects, change.addCombinedEffects, 48)
    artifact.failureModes = mergeTextDetails(artifact.failureModes, change.addFailureModes, 48)
    change.addPowers?.forEach((power) => {
      if (!artifact.powers.some((candidate) => candidate.id === power.id || candidate.name.toLocaleLowerCase('ru-RU') === power.name.toLocaleLowerCase('ru-RU'))) {
        artifact.powers.push({
          ...power, id: power.id ?? id(), mastery: clamp(power.mastery, 0, 100),
          costs: power.costs.slice(0, 8), limitations: power.limitations.slice(0, 48),
          capabilities: power.capabilities?.slice(0, 64) ?? [], synergies: power.synergies?.slice(0, 32) ?? [],
          counters: power.counters?.slice(0, 32) ?? [], examples: power.examples?.slice(0, 24) ?? [],
          techniques: materializePowerTechniques([], power.techniques),
        })
      }
    })
    artifact.powers = artifact.powers.slice(-64)
    change.powerChanges?.forEach((powerChange, powerChangeIndex) => {
      const power = artifact.powers.find((candidate) => candidate.id === powerChange.powerId)
      if (!power) {
        rejectedReference(diagnostics, `statePatch.artifactChanges[${changeIndex}].powerChanges[${powerChangeIndex}].powerId`, powerChange.powerId, 'сила артефакта не найдена')
        return
      }
      if (powerChange.name?.trim()) power.name = powerChange.name.trim()
      if (powerChange.description?.trim()) power.description = powerChange.description.trim()
      if (Number.isFinite(powerChange.mastery)) power.mastery = clamp(powerChange.mastery ?? 0, 0, 100)
      if (Number.isFinite(powerChange.masteryDelta)) power.mastery = clamp(power.mastery + (powerChange.masteryDelta ?? 0), 0, 100)
      if (powerChange.costs) power.costs = powerChange.costs.slice(0, 8)
      if (powerChange.trigger?.trim()) power.trigger = powerChange.trigger.trim()
      if (powerChange.category) power.category = powerChange.category
      if (powerChange.scale?.trim()) power.scale = powerChange.scale.trim()
      if (powerChange.activation?.trim()) power.activation = powerChange.activation.trim()
      if (powerChange.canonStatus) power.canonStatus = powerChange.canonStatus
      if (powerChange.canonReference?.trim()) power.canonReference = powerChange.canonReference.trim()
      if (powerChange.capabilities) power.capabilities = powerChange.capabilities.slice(0, 64)
      if (powerChange.synergies) power.synergies = powerChange.synergies.slice(0, 32)
      if (powerChange.counters) power.counters = powerChange.counters.slice(0, 32)
      if (powerChange.examples) power.examples = powerChange.examples.slice(0, 24)
      if (powerChange.limitations) power.limitations = powerChange.limitations.slice(0, 48)
      power.capabilities = mergeTextDetails(power.capabilities, powerChange.addCapabilities, 64)
      power.synergies = mergeTextDetails(power.synergies, powerChange.addSynergies, 32)
      power.counters = mergeTextDetails(power.counters, powerChange.addCounters, 32)
      power.examples = mergeTextDetails(power.examples, powerChange.addExamples, 24)
      power.limitations = mergeTextDetails(power.limitations, powerChange.addLimitations, 48)
      power.techniques = materializePowerTechniques(power.techniques, powerChange.addTechniques)
      applyPowerTechniqueChanges(power.techniques, powerChange.techniqueChanges, diagnostics, `statePatch.artifactChanges[${changeIndex}].powerChanges[${powerChangeIndex}]`)
      power.techniques = removePowerTechniques(power.techniques, powerChange.removeTechniqueIds, diagnostics, `statePatch.artifactChanges[${changeIndex}].powerChanges[${powerChangeIndex}]`)
    })
    Object.entries(change.powerMasteryDeltas ?? {}).forEach(([powerId, delta]) => {
      const power = artifact.powers.find((candidate) => candidate.id === powerId)
      if (!power) {
        rejectedReference(diagnostics, `statePatch.artifactChanges[${changeIndex}].powerMasteryDeltas.${powerId}`, powerId, 'сила артефакта не найдена')
        return
      }
      if (Number.isFinite(delta)) power.mastery = clamp(power.mastery + delta, 0, 100)
    })
    change.addComponents?.forEach((component) => {
      if (!artifact.components.some((candidate) => candidate.id === component.id || normalizedName(candidate.name) === normalizedName(component.name))) {
        artifact.components.push({ ...component, id: component.id ?? id(), capabilities: component.capabilities.slice(0, 64) })
      }
    })
    artifact.components = artifact.components.slice(-32)
    change.componentChanges?.forEach((componentChange, componentChangeIndex) => {
      const component = artifact.components.find((candidate) => candidate.id === componentChange.componentId)
      if (!component) {
        rejectedReference(diagnostics, `statePatch.artifactChanges[${changeIndex}].componentChanges[${componentChangeIndex}].componentId`, componentChange.componentId, 'компонент артефакта не найден')
        return
      }
      if (componentChange.name?.trim()) component.name = componentChange.name.trim()
      if (componentChange.description?.trim()) component.description = componentChange.description.trim()
      if (componentChange.role?.trim()) component.role = componentChange.role.trim()
      if (componentChange.status) component.status = componentChange.status
      if (componentChange.required !== undefined) component.required = componentChange.required
      if (componentChange.capabilities) component.capabilities = componentChange.capabilities.slice(0, 64)
      component.capabilities = mergeTextDetails(component.capabilities, componentChange.addCapabilities, 64)
    })
    artifact.drawbacks = mergeTextDetails(artifact.drawbacks, change.addDrawbacks, 48)
    change.addEvolutionPaths?.forEach((path) => {
      if (!artifact.evolutionPaths.some((candidate) => candidate.id === path.id || candidate.name.toLocaleLowerCase('ru-RU') === path.name.toLocaleLowerCase('ru-RU'))) {
        artifact.evolutionPaths.push({ ...path, id: path.id ?? id() })
      }
    })
    artifact.evolutionPaths = artifact.evolutionPaths.slice(-24)
    const unlocks = new Set(change.unlockEvolutionPathIds ?? [])
    change.unlockEvolutionPathIds?.forEach((pathId, pathIndex) => {
      if (!artifact.evolutionPaths.some((path) => path.id === pathId)) rejectedReference(diagnostics, `statePatch.artifactChanges[${changeIndex}].unlockEvolutionPathIds[${pathIndex}]`, pathId, 'путь развития артефакта не найден')
    })
    artifact.evolutionPaths.forEach((path) => { if (unlocks.has(path.id)) path.unlocked = true })
    if (change.history) {
      item.history ??= []
      item.history.push({ id: id(), turn, title: change.history.title, description: change.history.description })
      item.history = item.history.slice(-80)
    }
    if (change.discovery) artifact.discovery = normalizeArtifactDiscovery(
      { ...change.discovery, updatedTurn: turn },
      item,
      turn,
    )
    Object.assign(item, normalizeItemRarity(item))
    if (previousArtifactForm) {
      const previousFormIndex = (campaign.artifactRegistry ?? []).filter((entry) => entry.artifactId.startsWith(`${previousArtifactForm.id}@`)).length + 1
      campaign.artifactRegistry = updateArtifactRegistry(
        campaign.artifactRegistry,
        { ...previousArtifactForm, id: `${previousArtifactForm.id}@${Math.max(0, turn - 1)}:${previousFormIndex}` },
        'transformed',
        turn,
      )
    }
    campaign.artifactRegistry = updateArtifactRegistry(campaign.artifactRegistry, item, 'active', turn)
  })

  patch.addConditions?.forEach((condition) => {
    const clean = condition.trim()
    if (clean && !campaign.player.conditions.some((current) => normalizedName(current) === normalizedName(clean))) campaign.player.conditions.push(clean)
  })
  if (patch.removeConditions?.length) {
    patch.removeConditions.forEach((condition, index) => {
      if (!campaign.player.conditions.some((current) => normalizedName(current) === normalizedName(condition))) rejectedReference(diagnostics, `statePatch.removeConditions[${index}]`, condition, 'состояние не найдено')
    })
    const removed = new Set(patch.removeConditions.map(normalizedName))
    campaign.player.conditions = campaign.player.conditions.filter((condition) => !removed.has(normalizedName(condition)))
  }

  if (patch.removeStatusEffectIds?.length) {
    const removed = new Set(patch.removeStatusEffectIds)
    patch.removeStatusEffectIds.forEach((effectId, index) => {
      const existedAtTurnStart = (base.player.statusEffects ?? []).some((effect) => effect.id === effectId)
      if (!existedAtTurnStart && !campaign.player.statusEffects.some((effect) => effect.id === effectId)) rejectedReference(diagnostics, `statePatch.removeStatusEffectIds[${index}]`, effectId, 'эффект состояния не найден')
    })
    campaign.player.statusEffects = campaign.player.statusEffects.filter((effect) => !removed.has(effect.id))
  }
  patch.upsertStatusEffects?.slice(0, 48).forEach((incoming) => {
    const existing = campaign.player.statusEffects.find((effect) => effect.id === incoming.id || normalizedName(effect.name) === normalizedName(incoming.name))
    const normalized = normalizeStatusEffect(incoming, turn, existing)
    if (normalized.duration.unit === 'turns' && normalized.duration.remaining !== undefined && normalized.duration.remaining <= 0) {
      if (existing) campaign.player.statusEffects = campaign.player.statusEffects.filter((effect) => effect.id !== existing.id)
      return
    }
    if (existing) Object.assign(existing, normalized, { id: existing.id })
    else campaign.player.statusEffects.push(normalized)
  })

  const applyRelationshipChanges = () => patch.relationships?.forEach((change, changeIndex) => {
    const npc = campaign.npcs.find((candidate) => candidate.id === change.npcId)
    if (!npc) {
      rejectedReference(diagnostics, `statePatch.relationships[${changeIndex}].npcId`, change.npcId, 'персонаж не найден')
      return
    }
    if (!Number.isFinite(change.delta)) return
    npc.relationship = clamp(npc.relationship + change.delta, -100, 100)
    if (change.dimensions) {
      npc.relationshipDimensions ??= { trust: 0, respect: 0, affection: 0, fear: 0, suspicion: 0, dependence: 0 }
      Object.entries(change.dimensions).forEach(([key, delta]) => {
        if (!Number.isFinite(delta)) return
        const dimension = key as keyof typeof npc.relationshipDimensions
        npc.relationshipDimensions![dimension] = clamp(npc.relationshipDimensions![dimension] + (delta ?? 0), -100, 100)
      })
    }
    if (change.note?.trim()) npc.notes = [...npc.notes, change.note.trim()].slice(-8)
  })

  patch.npcs?.slice(0, 20).forEach((mutation, mutationIndex) => {
    if (mutation.operation === 'add') {
      if (isMutationOperationName(mutation.npc.name)) {
        rejectedReference(diagnostics, `statePatch.npcs[${mutationIndex}].npc.name`, mutation.npc.name, 'служебное значение операции не может быть именем персонажа')
        return
      }
      if (!campaign.npcs.some((npc) => npc.id === mutation.npc.id || npc.name.toLocaleLowerCase('ru-RU') === mutation.npc.name.toLocaleLowerCase('ru-RU'))) {
        const addedNpc: Campaign['npcs'][number] = {
          ...mutation.npc,
          notes: mutation.npc.notes.slice(0, 8),
          stats: mutation.npc.stats?.slice(0, 24).map((stat) => ({ ...stat, aliases: stat.aliases?.slice(0, 16) })) ?? [],
          resources: mutation.npc.resources?.slice(0, 24).map((resource) => ({ ...resource, aliases: resource.aliases?.slice(0, 16) })) ?? [],
          statusEffects: mutation.npc.statusEffects?.slice(0, 48).map((effect) => normalizeStatusEffect(effect, turn)) ?? [],
          abilities: mutation.npc.abilities?.slice(0, 40).map((ability) => materializeAbility(ability, turn)) ?? [],
          strategy: mutation.npc.strategy ? normalizeNpcStrategy(mutation.npc.strategy, turn) : undefined,
          threatProfile: mutation.npc.threatProfile ? normalizeThreatProfile(mutation.npc.threatProfile) : undefined,
          recruitment: mutation.npc.recruitment ? {
            ...mutation.npc.recruitment,
            willingness: clamp(mutation.npc.recruitment.willingness, 0, 100),
            requirements: mutation.npc.recruitment.requirements.map((requirement) => requirement.trim()).filter(Boolean).slice(0, 12),
          } : undefined,
          dossier: undefined,
        }
        addedNpc.dossier = mutation.npc.dossier ? normalizeNpcDossier(mutation.npc.dossier, turn, addedNpc) : undefined
        campaign.npcs.push(addedNpc)
      }
      return
    }
    const npc = campaign.npcs.find((candidate) => candidate.id === mutation.targetId)
    if (!npc) {
      rejectedReference(diagnostics, `statePatch.npcs[${mutationIndex}].targetId`, mutation.targetId, 'персонаж не найден')
      return
    }
    const {
      notes, stats, resources, statusEffects, abilities, upsertAbilities, removeAbilityIds, abilityChanges, knowledge, relationshipDimensions, initiative, strategy, threatProfile, recruitment, dossier, voice,
      upsertStats, removeStatKeys, upsertResources, removeResourceKeys, statDeltas, resourceDeltas,
      upsertStatusEffects, removeStatusEffectIds, removeKnowledgeIds,
      ...profile
    } = mutation.npc
    if (isMutationOperationName(profile.name)) {
      rejectedReference(diagnostics, `statePatch.npcs[${mutationIndex}].npc.name`, profile.name, 'служебное значение операции не может быть именем персонажа')
      delete profile.name
    }
    Object.assign(npc, profile, { id: npc.id })
    if (notes) npc.notes = [...new Set([...npc.notes, ...notes.map((note) => note.trim()).filter(Boolean)])].slice(-8)
    npc.stats ??= []
    npc.resources ??= []
    npc.abilities ??= []
    npc.statusEffects ??= []
    upsertStatList(npc.stats, [...(stats ?? []), ...(upsertStats ?? [])], 24)
    upsertStatList(npc.resources, [...(resources ?? []), ...(upsertResources ?? [])], 24)
    const removeNpcMetrics = <T extends { key: string; label: string; aliases?: string[] }>(current: T[], removed: string[] | undefined, path: string) => {
      ;(removed ?? []).forEach((key, index) => {
        if (!current.some((metric) => metricMatches(metric, key))) rejectedReference(diagnostics, `${path}[${index}]`, key, 'показатель персонажа не найден')
      })
      return current.filter((metric) => !(removed ?? []).some((key) => metricMatches(metric, key)))
    }
    npc.stats = removeNpcMetrics(npc.stats, removeStatKeys, `statePatch.npcs[${mutationIndex}].npc.removeStatKeys`)
    npc.resources = removeNpcMetrics(npc.resources, removeResourceKeys, `statePatch.npcs[${mutationIndex}].npc.removeResourceKeys`)
    const applyNpcDeltas = <T extends { key: string; label: string; value: number; max?: number; aliases?: string[] }>(current: T[], deltas: Record<string, number> | undefined, path: string, resource: boolean) => {
      Object.entries(deltas ?? {}).forEach(([key, delta]) => {
        const metric = current.find((candidate) => metricMatches(candidate, key))
        if (!metric) {
          rejectedReference(diagnostics, `${path}.${key}`, key, 'показатель персонажа не найден')
          return
        }
        if (Number.isFinite(delta)) metric.value = clamp(metric.value + delta, resource ? 0 : -999, metric.max ?? 999)
      })
    }
    applyNpcDeltas(npc.stats, statDeltas, `statePatch.npcs[${mutationIndex}].npc.statDeltas`, false)
    applyNpcDeltas(npc.resources, resourceDeltas, `statePatch.npcs[${mutationIndex}].npc.resourceDeltas`, true)
    ;(removeStatusEffectIds ?? []).forEach((effectId, index) => {
      if (!npc.statusEffects?.some((effect) => effect.id === effectId)) rejectedReference(diagnostics, `statePatch.npcs[${mutationIndex}].npc.removeStatusEffectIds[${index}]`, effectId, 'эффект персонажа не найден')
    })
    const removedNpcEffects = new Set(removeStatusEffectIds ?? [])
    npc.statusEffects = npc.statusEffects.filter((effect) => !removedNpcEffects.has(effect.id))
    ;[...(statusEffects ?? []), ...(upsertStatusEffects ?? [])].forEach((incoming) => {
      const existing = npc.statusEffects?.find((effect) => (incoming.id && effect.id === incoming.id) || normalizedName(effect.name) === normalizedName(incoming.name))
      const normalized = normalizeStatusEffect(incoming, turn, existing)
      if (existing) Object.assign(existing, normalized, { id: existing.id })
      else npc.statusEffects?.push(normalized)
    })
    ;[...(abilities ?? []), ...(upsertAbilities ?? [])].slice(0, 40).forEach((incoming) => {
      const existing = npc.abilities?.find((ability) => (incoming.id && ability.id === incoming.id) || normalizedName(ability.name) === normalizedName(incoming.name))
      const normalized = materializeAbility(incoming, turn, existing)
      if (existing) Object.assign(existing, normalized, { id: existing.id })
      else npc.abilities?.push(normalized)
    })
    ;(removeAbilityIds ?? []).forEach((abilityId, index) => {
      if (!npc.abilities?.some((ability) => ability.id === abilityId)) rejectedReference(diagnostics, `statePatch.npcs[${mutationIndex}].npc.removeAbilityIds[${index}]`, abilityId, 'способность персонажа не найдена')
    })
    const removedNpcAbilities = new Set(removeAbilityIds ?? [])
    npc.abilities = npc.abilities.filter((ability) => !removedNpcAbilities.has(ability.id))
    abilityChanges?.slice(0, 24).forEach((change, changeIndex) => applyAbilityChange(
      npc.abilities ?? [],
      change,
      turn,
      diagnostics,
      `statePatch.npcs[${mutationIndex}].npc.abilityChanges[${changeIndex}]`,
    ))
    if (knowledge || removeKnowledgeIds) {
      const removed = new Set(removeKnowledgeIds ?? [])
      npc.knowledge = (npc.knowledge ?? []).filter((fact) => !removed.has(fact.id))
      ;(knowledge ?? []).forEach((fact) => {
        const existing = npc.knowledge?.find((candidate) => (fact.id && candidate.id === fact.id) || normalizedName(candidate.subject) === normalizedName(fact.subject))
        if (existing) Object.assign(existing, fact, { id: existing.id })
        else npc.knowledge?.push({ ...fact, id: fact.id ?? id() })
      })
    }
    if (relationshipDimensions) {
      const merged = { ...(npc.relationshipDimensions ?? {}), ...relationshipDimensions }
      if (['trust', 'respect', 'affection', 'fear', 'suspicion', 'dependence'].every((key) => Number.isFinite(merged[key as keyof typeof merged]))) {
        npc.relationshipDimensions = Object.fromEntries(Object.entries(merged).map(([key, value]) => [key, clamp(value as number, -100, 100)])) as unknown as NonNullable<typeof npc.relationshipDimensions>
      } else rejectedReference(diagnostics, `statePatch.npcs[${mutationIndex}].npc.relationshipDimensions`, npc.id, 'частичные грани отношений нельзя создать без существующей основы')
    }
    if (initiative) {
      const merged = { ...(npc.initiative ?? {}), ...initiative }
      if (typeof merged.intent === 'string' && typeof merged.nextMove === 'string' && typeof merged.trigger === 'string' && Number.isFinite(merged.urgency) && Array.isArray(merged.blockedBy) && Number.isFinite(merged.lastAdvancedTurn) && typeof merged.visibility === 'string') {
        npc.initiative = { ...merged, urgency: clamp(merged.urgency as number, 0, 100), blockedBy: merged.blockedBy.slice(0, 8) } as NonNullable<typeof npc.initiative>
      } else rejectedReference(diagnostics, `statePatch.npcs[${mutationIndex}].npc.initiative`, npc.id, 'частичную инициативу нельзя создать без существующей основы')
    }
    if (strategy) {
      const normalized = normalizeNpcStrategy(strategy, turn, npc.strategy)
      if (normalized) npc.strategy = normalized
      else rejectedReference(diagnostics, `statePatch.npcs[${mutationIndex}].npc.strategy`, npc.id, 'неполный стратегический профиль нельзя создать без существующей основы')
    }
    if (threatProfile) npc.threatProfile = normalizeThreatProfile(threatProfile)
    if (recruitment) npc.recruitment = {
      ...recruitment,
      willingness: clamp(recruitment.willingness, 0, 100),
      requirements: recruitment.requirements.map((requirement) => requirement.trim()).filter(Boolean).slice(0, 12),
    }
    if (dossier) {
      const normalized = normalizeNpcDossier(dossier, turn, npc, npc.dossier)
      if (normalized) npc.dossier = normalized
      else rejectedReference(diagnostics, `statePatch.npcs[${mutationIndex}].npc.dossier`, npc.id, 'частичное досье нельзя создать без существующей основы')
    }
    if (voice) {
      const merged = { ...(npc.voice ?? {}), ...voice }
      if (typeof merged.style === 'string' && Array.isArray(merged.patterns) && Array.isArray(merged.avoids)) npc.voice = { style: merged.style, patterns: merged.patterns.slice(0, 8), avoids: merged.avoids.slice(0, 8) }
      else rejectedReference(diagnostics, `statePatch.npcs[${mutationIndex}].npc.voice`, npc.id, 'частичный голос нельзя создать без существующей основы')
    }
    if (npc.initiative) {
      npc.initiative.urgency = clamp(npc.initiative.urgency, 0, 100)
      npc.initiative.blockedBy = npc.initiative.blockedBy.slice(0, 8)
    }
    if (npc.strategy) npc.strategy = normalizeNpcStrategy(npc.strategy, turn, npc.strategy)
  })
  applyRelationshipChanges()

  if (patch.conflict) {
    if (patch.conflict.operation === 'resolve') {
      if (!campaign.activeConflict) {
        rejectedReference(diagnostics, 'statePatch.conflict', undefined, 'активное противостояние не найдено')
      } else {
        retirementEvents.push({
          title: `Завершено: ${campaign.activeConflict.title}`,
          description: patch.conflict.outcome,
          category: 'story',
        })
        campaign.activeConflict = undefined
      }
    } else {
      const incoming = patch.conflict.state
      const existing = campaign.activeConflict
      const validEntityIds = new Set([campaign.player.id, ...campaign.npcs.map((npc) => npc.id)])
      const participantIds = incoming.participants.map((participant) => participant.entityId)
      const invalidId = participantIds.find((entityId) => !validEntityIds.has(entityId))
      const duplicateId = participantIds.find((entityId, index) => participantIds.indexOf(entityId) !== index)
      const hasPlayer = participantIds.includes(campaign.player.id)
      if (patch.conflict.operation === 'start' && existing) {
        rejectedReference(diagnostics, 'statePatch.conflict', incoming.id, 'нельзя начать новое противостояние до завершения текущего')
      } else if (patch.conflict.operation === 'update' && !existing) {
        rejectedReference(diagnostics, 'statePatch.conflict', incoming.id, 'нет активного противостояния для обновления')
      } else if (patch.conflict.operation === 'update' && existing?.id !== incoming.id) {
        rejectedReference(diagnostics, 'statePatch.conflict.state.id', incoming.id, 'id противостояния не совпадает с активным')
      } else if (invalidId) {
        rejectedReference(diagnostics, 'statePatch.conflict.state.participants', invalidId, 'участник противостояния не найден')
      } else if (duplicateId) {
        rejectedReference(diagnostics, 'statePatch.conflict.state.participants', duplicateId, 'участник указан дважды')
      } else if (!hasPlayer) {
        rejectedReference(diagnostics, 'statePatch.conflict.state.participants', campaign.player.id, 'герой должен присутствовать в активном противостоянии')
      } else {
        campaign.activeConflict = normalizeActiveConflict(incoming, turn, existing)
      }
    }
  }

  if (patch.removeSocialLinkIds?.length) {
    const knownSocialLinkIds = new Set((campaign.socialLinks ?? []).map((link) => link.id))
    patch.removeSocialLinkIds.forEach((linkId, index) => {
      if (!knownSocialLinkIds.has(linkId)) rejectedReference(diagnostics, `statePatch.removeSocialLinkIds[${index}]`, linkId, 'социальная связь не найдена')
    })
    const removed = new Set(patch.removeSocialLinkIds.filter((linkId) => knownSocialLinkIds.has(linkId)))
    campaign.socialLinks = (campaign.socialLinks ?? []).filter((link) => !removed.has(link.id))
  }

  patch.socialLinks?.slice(0, 40).forEach((link, linkIndex) => {
    const npcIds = new Set(campaign.npcs.map((npc) => npc.id))
    if (link.fromNpcId === link.toNpcId) {
      rejectedReference(diagnostics, `statePatch.socialLinks[${linkIndex}]`, link.id, 'социальная связь не может вести к тому же персонажу')
      return
    }
    if (!npcIds.has(link.fromNpcId) || !npcIds.has(link.toNpcId)) {
      rejectedReference(diagnostics, `statePatch.socialLinks[${linkIndex}]`, !npcIds.has(link.fromNpcId) ? link.fromNpcId : link.toNpcId, 'участник социальной связи не найден')
      return
    }
    const existing = campaign.socialLinks?.find((candidate) => candidate.id === link.id || (
      candidate.fromNpcId === link.fromNpcId && candidate.toNpcId === link.toNpcId && candidate.kind === link.kind
    ))
    const normalized = { ...link, score: clamp(link.score, -100, 100), notes: link.notes.slice(0, 8) }
    if (existing) Object.assign(existing, normalized, { id: existing.id })
    else campaign.socialLinks?.push(normalized)
  })

  patch.threads?.slice(0, 20).forEach((mutation, mutationIndex) => {
    if (mutation.operation === 'add') {
      const thread = mutation.thread
      if (!thread?.id || !thread.title || !thread.type || !thread.detail || !thread.status || !Array.isArray(thread.participantIds)) return
      if (!campaign.threads?.some((candidate) => candidate.id === thread.id)) campaign.threads?.push({
        ...thread,
        participantIds: [...new Set(thread.participantIds)].slice(0, 20),
        scopeIds: normalizeScopeIds(thread.scopeIds, `statePatch.threads[${mutationIndex}].thread`),
        causeIds: normalizeCauseIds(thread.id, thread.causeIds, `statePatch.threads[${mutationIndex}].thread`),
        createdTurn: thread.createdTurn ?? turn,
        lastChangedTurn: turn,
      } as NonNullable<Campaign['threads']>[number])
      return
    }
    const thread = campaign.threads?.find((candidate) => candidate.id === mutation.targetId)
    if (!thread) {
      rejectedReference(diagnostics, `statePatch.threads[${mutationIndex}].targetId`, mutation.targetId, 'сюжетная линия не найдена')
      return
    }
    if (mutation.operation === 'resolve') thread.status = 'resolved'
    else if (mutation.operation === 'break') thread.status = 'broken'
    else if (mutation.thread) Object.assign(thread, mutation.thread, {
      id: thread.id,
      createdTurn: thread.createdTurn,
      ...(mutation.thread.scopeIds ? { scopeIds: normalizeScopeIds(mutation.thread.scopeIds, `statePatch.threads[${mutationIndex}].thread`) } : {}),
      ...(mutation.thread.causeIds ? { causeIds: normalizeCauseIds(thread.id, mutation.thread.causeIds, `statePatch.threads[${mutationIndex}].thread`) } : {}),
    })
    thread.lastChangedTurn = turn
  })

  patch.worldEvents?.slice(0, 20).forEach((mutation, mutationIndex) => {
    if (mutation.operation === 'add') {
      const event = mutation.event
      if (!event?.id || !event.title || !event.description || !event.status || !event.visibility || !Array.isArray(event.involvedIds)) return
      if (!campaign.worldEvents?.some((candidate) => candidate.id === event.id)) campaign.worldEvents?.push({
        ...event,
        involvedIds: [...new Set(event.involvedIds)].slice(0, 20),
        scopeIds: normalizeScopeIds(event.scopeIds, `statePatch.worldEvents[${mutationIndex}].event`),
        causeIds: normalizeCauseIds(event.id, event.causeIds, `statePatch.worldEvents[${mutationIndex}].event`),
        consequences: event.consequences?.slice(0, 16),
        createdTurn: event.createdTurn ?? turn,
        lastChangedTurn: turn,
      } as NonNullable<Campaign['worldEvents']>[number])
      return
    }
    const event = campaign.worldEvents?.find((candidate) => candidate.id === mutation.targetId)
    if (!event) {
      rejectedReference(diagnostics, `statePatch.worldEvents[${mutationIndex}].targetId`, mutation.targetId, 'мировое событие не найдено')
      return
    }
    if (mutation.operation === 'resolve') event.status = 'resolved'
    else if (mutation.operation === 'cancel') event.status = 'cancelled'
    else if (mutation.event) Object.assign(event, mutation.event, {
      id: event.id,
      createdTurn: event.createdTurn,
      ...(mutation.event.scopeIds ? { scopeIds: normalizeScopeIds(mutation.event.scopeIds, `statePatch.worldEvents[${mutationIndex}].event`) } : {}),
      ...(mutation.event.causeIds ? { causeIds: normalizeCauseIds(event.id, mutation.event.causeIds, `statePatch.worldEvents[${mutationIndex}].event`) } : {}),
      ...(mutation.event.consequences ? { consequences: mutation.event.consequences.slice(0, 16) } : {}),
    })
    event.lastChangedTurn = turn
  })

  const reputationLabel = (value: number) => value >= 60 ? 'Почитают' : value >= 20 ? 'Уважают' : value <= -60 ? 'Ненавидят' : value <= -20 ? 'Не доверяют' : 'Нейтрально'
  Object.entries(patch.factionReputationDeltas ?? {}).forEach(([factionName, delta]) => {
    if (!Number.isFinite(delta)) return
    const reputation = campaign.factionReputation?.find((entry) => entry.factionName.toLocaleLowerCase('ru-RU') === factionName.toLocaleLowerCase('ru-RU'))
    if (reputation) {
      reputation.value = clamp(reputation.value + delta, -100, 100)
      reputation.label = reputationLabel(reputation.value)
    } else if (campaign.world.factions.some((faction) => faction.name.toLocaleLowerCase('ru-RU') === factionName.toLocaleLowerCase('ru-RU'))) {
      const value = clamp(delta, -100, 100)
      campaign.factionReputation?.push({ factionName, value, label: reputationLabel(value), notes: [] })
    } else {
      rejectedReference(diagnostics, `statePatch.factionReputationDeltas.${factionName}`, factionName, 'фракция не найдена')
    }
  })
  patch.upsertFactionReputation?.forEach((incoming, index) => {
    const existing = campaign.factionReputation?.find((entry) => normalizedName(entry.factionName) === normalizedName(incoming.factionName))
    const factionExists = campaign.world.factions.some((faction) => normalizedName(faction.name) === normalizedName(incoming.factionName))
    if (!existing && !factionExists) {
      rejectedReference(diagnostics, `statePatch.upsertFactionReputation[${index}].factionName`, incoming.factionName, 'фракция не найдена')
      return
    }
    const value = clamp(incoming.value, -100, 100)
    if (existing) {
      existing.value = value
      existing.label = incoming.label?.trim() || reputationLabel(value)
      if (incoming.notes) existing.notes = [...new Set([...existing.notes, ...incoming.notes.map((note) => note.trim()).filter(Boolean)])].slice(-16)
      return
    }
    campaign.factionReputation?.push({
      factionName: incoming.factionName,
      value,
      label: incoming.label?.trim() || reputationLabel(value),
      notes: incoming.notes?.map((note) => note.trim()).filter(Boolean).slice(-16) ?? [],
    })
  })

  const availableNpcIds = new Set(campaign.npcs.filter((npc) => npc.status !== 'dead').map((npc) => npc.id))
  const removedPartyIds = new Set(patch.party?.removeNpcIds ?? [])
  patch.party?.removeNpcIds?.forEach((npcId, index) => {
    if (!(campaign.partyMemberIds ?? []).includes(npcId)) rejectedReference(diagnostics, `statePatch.party.removeNpcIds[${index}]`, npcId, 'персонаж не состоит в отряде')
  })
  campaign.partyMemberIds = campaign.partyMemberIds.filter((npcId) => availableNpcIds.has(npcId) && !removedPartyIds.has(npcId))
  removedPartyIds.forEach((npcId) => {
    const npc = campaign.npcs.find((candidate) => candidate.id === npcId)
    if (npc?.recruitment?.status === 'member') npc.recruitment.status = 'left'
  })
  patch.party?.addNpcIds?.forEach((npcId, index) => {
    const npc = campaign.npcs.find((candidate) => candidate.id === npcId)
    if (!npc || !availableNpcIds.has(npcId)) {
      rejectedReference(diagnostics, `statePatch.party.addNpcIds[${index}]`, npcId, 'доступный персонаж отряда не найден')
      return
    }
    if (!npc.recruitment || !['invited', 'member'].includes(npc.recruitment.status) || npc.recruitment.willingness < 50) {
      rejectedReference(diagnostics, `statePatch.party.addNpcIds[${index}]`, npcId, 'персонаж не принял обоснованное решение вступить в отряд')
      return
    }
    if (!campaign.partyMemberIds?.includes(npcId)) campaign.partyMemberIds?.push(npcId)
    npc.recruitment.status = 'member'
  })
  campaign.partyMemberIds = campaign.partyMemberIds.slice(0, 8)
  campaign.partyRoles = Object.fromEntries(Object.entries(campaign.partyRoles).filter(([npcId]) => campaign.partyMemberIds?.includes(npcId)))
  Object.entries(patch.party?.roles ?? {}).forEach(([npcId, role]) => {
    if (!campaign.partyMemberIds?.includes(npcId)) {
      rejectedReference(diagnostics, `statePatch.party.roles.${npcId}`, npcId, 'роль назначена персонажу вне отряда')
      return
    }
    const cleanRole = role.trim()
    if (cleanRole) campaign.partyRoles![npcId] = cleanRole
  })

  const campaignEntityIds = new Set([campaign.player.id, ...campaign.npcs.map((npc) => npc.id)])
  patch.upsertCharacterArcs?.slice(0, 20).forEach((incoming, arcIndex) => {
    if (!campaignEntityIds.has(incoming.ownerId)) {
      rejectedReference(diagnostics, `statePatch.upsertCharacterArcs[${arcIndex}].ownerId`, incoming.ownerId, 'владелец арки не найден')
      return
    }
    const normalized = {
      ...incoming,
      progress: clamp(incoming.progress, 0, 100),
      stages: incoming.stages.slice(0, 12),
      turningPoints: incoming.turningPoints.slice(0, 12),
      lastAdvancedTurn: turn,
    }
    const existing = campaign.characterArcs?.find((arc) => arc.id === incoming.id)
    if (existing) Object.assign(existing, normalized, { id: existing.id, ownerId: existing.ownerId })
    else campaign.characterArcs?.push(normalized)
  })

  patch.upsertMysteryCases?.slice(0, 12).forEach((incoming) => {
    const normalized = {
      ...incoming,
      clues: incoming.clues.slice(0, 30).map((clue) => ({ ...clue })),
      redHerrings: incoming.redHerrings.slice(0, 12),
      revelationRules: incoming.revelationRules.slice(0, 12),
      createdTurn: Math.min(turn, Math.max(0, incoming.createdTurn)),
      solvedTurn: incoming.solvedTurn === undefined ? undefined : Math.min(turn, Math.max(0, incoming.solvedTurn)),
    }
    const existing = campaign.mysteryCases?.find((mystery) => mystery.id === incoming.id)
    if (existing) {
      const immutableTruth = existing.truth
      const immutableCulprit = existing.culpritId
      const immutableCreatedTurn = existing.createdTurn
      Object.assign(existing, normalized, {
        id: existing.id,
        truth: immutableTruth,
        culpritId: immutableCulprit,
        createdTurn: immutableCreatedTurn,
      })
    } else {
      campaign.mysteryCases?.push(normalized)
    }
  })

  patch.upsertAntagonistPlans?.slice(0, 12).forEach((incoming, planIndex) => {
    if (!availableNpcIds.has(incoming.ownerNpcId)) {
      rejectedReference(diagnostics, `statePatch.upsertAntagonistPlans[${planIndex}].ownerNpcId`, incoming.ownerNpcId, 'владелец плана не найден или недоступен')
      return
    }
    const normalized = {
      ...incoming,
      currentStep: clamp(Math.round(incoming.currentStep), 0, Math.max(0, incoming.steps.length - 1)),
      pressure: clamp(incoming.pressure, 0, 100),
      resources: incoming.resources.slice(0, 16),
      knowledge: incoming.knowledge.slice(0, 20),
      steps: incoming.steps.slice(0, 12),
      weaknesses: incoming.weaknesses.slice(0, 12),
      lastAdvancedTurn: turn,
    }
    const existing = campaign.antagonistPlans?.find((plan) => plan.id === incoming.id)
    if (existing) Object.assign(existing, normalized, { id: existing.id, ownerNpcId: existing.ownerNpcId })
    else campaign.antagonistPlans?.push(normalized)
  })

  patch.upsertWorldPressures?.slice(0, 16).forEach((incoming, pressureIndex) => {
    const invalidTarget = incoming.targetIds.find((targetId) => !campaignEntityIds.has(targetId))
    if (invalidTarget) {
      rejectedReference(diagnostics, `statePatch.upsertWorldPressures[${pressureIndex}].targetIds`, invalidTarget, 'цель давления мира не найдена')
      return
    }
    if (incoming.sourceNpcId && !campaignEntityIds.has(incoming.sourceNpcId)) {
      rejectedReference(diagnostics, `statePatch.upsertWorldPressures[${pressureIndex}].sourceNpcId`, incoming.sourceNpcId, 'источник давления мира не найден')
      return
    }
    const measureIds = incoming.measures.map((measure) => measure.id)
    if (measureIds.length !== new Set(measureIds).size) {
      rejectedReference(diagnostics, `statePatch.upsertWorldPressures[${pressureIndex}].measures`, incoming.id, 'контрмеры имеют повторяющиеся id')
      return
    }
    const existing = campaign.worldPressures?.find((pressure) => pressure.id === incoming.id)
    const normalized = normalizeWorldPressure(incoming, turn, existing)
    if (existing) Object.assign(existing, normalized, { id: existing.id, createdTurn: existing.createdTurn })
    else campaign.worldPressures?.push(normalized)
  })

  if (patch.removeInfluenceAssetIds?.length) {
    const removed = new Set(patch.removeInfluenceAssetIds)
    patch.removeInfluenceAssetIds.forEach((assetId, index) => {
      if (!(campaign.influenceAssets ?? []).some((asset) => asset.id === assetId)) rejectedReference(diagnostics, `statePatch.removeInfluenceAssetIds[${index}]`, assetId, 'ресурс влияния не найден')
    })
    campaign.influenceAssets = campaign.influenceAssets.filter((asset) => !removed.has(asset.id))
  }
  patch.upsertInfluenceAssets?.slice(0, 30).forEach((incoming, assetIndex) => {
    if (!campaignEntityIds.has(incoming.holderId) || (incoming.targetId && !campaignEntityIds.has(incoming.targetId))) {
      const missingId = !campaignEntityIds.has(incoming.holderId) ? incoming.holderId : incoming.targetId
      rejectedReference(diagnostics, `statePatch.upsertInfluenceAssets[${assetIndex}]`, missingId, 'участник ресурса влияния не найден')
      return
    }
    const normalized = {
      ...incoming,
      value: clamp(incoming.value, -100, 100),
      acquiredTurn: Math.min(turn, Math.max(0, incoming.acquiredTurn)),
    }
    const existing = campaign.influenceAssets?.find((asset) => asset.id === incoming.id)
    if (existing) Object.assign(existing, normalized, { id: existing.id, holderId: existing.holderId })
    else campaign.influenceAssets?.push(normalized)
  })

  patch.quests?.slice(0, 10).forEach((mutation, mutationIndex) => {
    if (mutation.operation === 'add') {
      if (!mutation.quest?.title?.trim() || !mutation.quest.description?.trim() || !mutation.quest.status || !Array.isArray(mutation.quest.objectives)) {
        rejectedReference(diagnostics, `statePatch.quests[${mutationIndex}].quest`, mutation.quest?.title, 'новая цель не содержит полного авторского описания и не была дополнена значениями-заглушками')
        return
      }
      const quest: Quest = {
        id: mutation.quest?.id ?? id(),
        title: mutation.quest.title.trim(),
        description: mutation.quest.description.trim(),
        status: mutation.quest.status,
        objectives: mutation.quest.objectives,
        reward: mutation.quest?.reward,
        giver: mutation.quest?.giver,
        createdTurn: mutation.quest.createdTurn ?? turn,
        lastChangedTurn: turn,
      }
      campaign.quests.push(quest)
      return
    }
    const quest = campaign.quests.find((candidate) => candidate.id === mutation.targetId)
    if (!quest) {
      rejectedReference(diagnostics, `statePatch.quests[${mutationIndex}].targetId`, mutation.targetId, 'цель не найдена')
      return
    }
    if (mutation.operation === 'complete') quest.status = 'completed'
    else if (mutation.operation === 'fail') quest.status = 'failed'
    else Object.assign(quest, mutation.quest, { id: quest.id, createdTurn: quest.createdTurn })
    quest.lastChangedTurn = turn
  })

  patch.lore?.slice(0, 12).forEach((entry) => {
    const existing = campaign.lore.find((candidate) => candidate.id === entry.id || candidate.title.toLocaleLowerCase('ru-RU') === entry.title.toLocaleLowerCase('ru-RU'))
    const normalized: LoreEntry = {
      ...entry,
      id: entry.id ?? existing?.id ?? id(),
      keys: entry.keys?.slice(0, 20) ?? [],
      priority: clamp(entry.priority ?? 50, 0, 100),
    }
    if (existing) Object.assign(existing, normalized, { id: existing.id })
    else campaign.lore.push(normalized)
  })

  if (patch.scene) {
    campaign.scene = {
      ...campaign.scene,
      ...patch.scene,
      tension: clamp(patch.scene.tension ?? campaign.scene.tension, 0, 100),
      presentNpcIds: Array.isArray(patch.scene.presentNpcIds) ? patch.scene.presentNpcIds.slice(0, 12) : campaign.scene.presentNpcIds,
    }
  }

  if (patch.pacing || campaign.pacing) {
    const previous = campaign.pacing
    const authored = patch.pacing ?? previous
    if (authored) {
      const advancesTurn = !previous || turn > previous.updatedTurn
      const pressureBeat = ['rising', 'challenge', 'climax'].includes(authored.beat) || authored.intensity >= 70
      const previousPressureBeat = previous && (['rising', 'challenge', 'climax'].includes(previous.beat) || previous.intensity >= 70)
      const consecutivePressureTurns = !advancesTurn
        ? previous?.consecutivePressureTurns ?? 0
        : pressureBeat
          ? previousPressureBeat ? (previous?.consecutivePressureTurns ?? 0) + 1 : 1
          : 0
      campaign.pacing = {
        ...authored,
        intensity: clamp(authored.intensity, 0, 100),
        consecutivePressureTurns,
        lastRespiteTurn: authored.beat === 'respite' && advancesTurn ? turn : previous?.lastRespiteTurn,
        lastPeakTurn: ['severe', 'legendary', 'mythic'].includes(authored.challengeTier) && advancesTurn ? turn : previous?.lastPeakTurn,
        updatedTurn: advancesTurn ? turn : previous?.updatedTurn ?? turn,
      }
    }
  }

  if (patch.world) {
    const worldPatch = patch.world
    if (worldPatch.name) campaign.world.name = worldPatch.name
    if (worldPatch.tagline) campaign.world.tagline = worldPatch.tagline
    if (worldPatch.inspiration) campaign.world.inspiration = worldPatch.inspiration
    if (worldPatch.genre) campaign.world.genre = worldPatch.genre
    if (worldPatch.tone) campaign.world.tone = worldPatch.tone
    if (worldPatch.overview) campaign.world.overview = worldPatch.overview
    if (worldPatch.era) campaign.world.era = worldPatch.era
    if (worldPatch.system) campaign.world.system = {
      ...(campaign.world.system ?? { name: 'Система мира', summary: '', progression: '', conflictResolution: '', consequences: '', equipmentSlots: [] }),
      ...worldPatch.system,
      equipmentSlots: worldPatch.system.equipmentSlots ?? campaign.world.system?.equipmentSlots ?? [],
    }
    if (worldPatch.presentation) campaign.world.presentation = {
      ...(campaign.world.presentation ?? {}),
      ...worldPatch.presentation,
      labels: { ...(campaign.world.presentation?.labels ?? {}), ...(worldPatch.presentation.labels ?? {}) },
      categoryLabels: { ...(campaign.world.presentation?.categoryLabels ?? {}), ...(worldPatch.presentation.categoryLabels ?? {}) },
      rarityLabels: { ...(campaign.world.presentation?.rarityLabels ?? {}), ...(worldPatch.presentation.rarityLabels ?? {}) },
    } as typeof campaign.world.presentation
    const hasText = (values: string[], target: string) => values.some((value) => normalizedName(value) === normalizedName(target))
    worldPatch.removeRules?.forEach((rule, index) => {
      if (!hasText(campaign.world.rules, rule)) rejectedReference(diagnostics, `statePatch.world.removeRules[${index}]`, rule, 'правило мира не найдено')
    })
    worldPatch.resolveMysteries?.forEach((mystery, index) => {
      if (!hasText(campaign.world.mysteries, mystery)) rejectedReference(diagnostics, `statePatch.world.resolveMysteries[${index}]`, mystery, 'тайна мира не найдена')
    })
    worldPatch.removeFactions?.forEach((name, index) => {
      if (!campaign.world.factions.some((faction) => normalizedName(faction.name) === normalizedName(name))) rejectedReference(diagnostics, `statePatch.world.removeFactions[${index}]`, name, 'фракция не найдена')
    })
    worldPatch.removeLocations?.forEach((name, index) => {
      if (!campaign.world.locations.some((location) => normalizedName(location.name) === normalizedName(name))) rejectedReference(diagnostics, `statePatch.world.removeLocations[${index}]`, name, 'локация не найдена')
    })
    worldPatch.removeRouteIds?.forEach((routeId, index) => {
      if (!(campaign.world.routes ?? []).some((route) => route.id === routeId)) rejectedReference(diagnostics, `statePatch.world.removeRouteIds[${index}]`, routeId, 'маршрут не найден')
    })
    worldPatch.removePlaceIds?.forEach((placeId, index) => {
      if (!(campaign.world.places ?? []).some((place) => place.id === placeId)) rejectedReference(diagnostics, `statePatch.world.removePlaceIds[${index}]`, placeId, 'место атласа не найдено')
    })
    worldPatch.retireProcessIds?.forEach((processId, index) => {
      if (!(campaign.world.processes ?? []).some((process) => process.id === processId)) rejectedReference(diagnostics, `statePatch.world.retireProcessIds[${index}]`, processId, 'внешний процесс не найден')
    })
    worldPatch.removeLegendIds?.forEach((legendId, index) => {
      if (!(campaign.world.legends ?? []).some((legend) => legend.id === legendId)) rejectedReference(diagnostics, `statePatch.world.removeLegendIds[${index}]`, legendId, 'легендарная личность не найдена')
    })
    worldPatch.removeLawIds?.forEach((lawId, index) => {
      if (!(campaign.world.laws ?? []).some((law) => law.id === lawId)) rejectedReference(diagnostics, `statePatch.world.removeLawIds[${index}]`, lawId, 'закон мира не найден')
    })
    worldPatch.removeMechanicIds?.forEach((mechanicId, index) => {
      if (!(campaign.world.mechanics ?? []).some((mechanic) => mechanic.id === mechanicId)) rejectedReference(diagnostics, `statePatch.world.removeMechanicIds[${index}]`, mechanicId, 'механика мира не найдена')
    })
    worldPatch.removeInterfaceModuleIds?.forEach((moduleId, index) => {
      if (!(campaign.world.interfaceModules ?? []).some((module) => module.id === moduleId)) rejectedReference(diagnostics, `statePatch.world.removeInterfaceModuleIds[${index}]`, moduleId, 'модуль интерфейса не найден')
    })
    worldPatch.removeMetricIds?.forEach((metricId, index) => {
      if (!(campaign.world.metrics ?? []).some((metric) => metric.id === metricId)) rejectedReference(diagnostics, `statePatch.world.removeMetricIds[${index}]`, metricId, 'показатель мира не найден')
    })
    const removeByText = (values: string[], removed: string[] | undefined) => {
      const set = new Set((removed ?? []).map((value) => value.toLocaleLowerCase('ru-RU')))
      return values.filter((value) => !set.has(value.toLocaleLowerCase('ru-RU')))
    }
    campaign.world.rules = [...removeByText(campaign.world.rules, worldPatch.removeRules), ...(worldPatch.addRules ?? [])].filter((value, index, all) => all.findIndex((item) => item.toLocaleLowerCase('ru-RU') === value.toLocaleLowerCase('ru-RU')) === index).slice(0, 20)
    campaign.world.mysteries = [...removeByText(campaign.world.mysteries, worldPatch.resolveMysteries), ...(worldPatch.addMysteries ?? [])].filter((value, index, all) => all.findIndex((item) => item.toLocaleLowerCase('ru-RU') === value.toLocaleLowerCase('ru-RU')) === index).slice(0, 20)

    const upsertNamed = <T extends { name: string }>(current: T[], incoming: T[] | undefined, removed: string[] | undefined, limit: number) => {
      const removedNames = new Set((removed ?? []).map((name) => name.toLocaleLowerCase('ru-RU')))
      const next = current.filter((entry) => !removedNames.has(entry.name.toLocaleLowerCase('ru-RU')))
      ;(incoming ?? []).forEach((entry) => {
        const existing = next.find((candidate) => candidate.name.toLocaleLowerCase('ru-RU') === entry.name.toLocaleLowerCase('ru-RU'))
        if (existing) Object.assign(existing, entry)
        else next.push(entry)
      })
      return next.slice(0, limit)
    }
    const factionUpserts = worldPatch.upsertFactions?.map((entry) => {
      const existing = campaign.world.factions.find((faction) => normalizedName(faction.name) === normalizedName(entry.name))
      return { ...entry, id: existing?.id ?? entry.id ?? id(), lastChangedTurn: turn }
    })
    campaign.world.factions = upsertNamed(campaign.world.factions, factionUpserts, worldPatch.removeFactions, WORLD_FACTION_LIMIT)
    campaign.world.locations = upsertNamed(campaign.world.locations, worldPatch.upsertLocations, worldPatch.removeLocations, WORLD_LOCATION_LIMIT)
    const removedRoutes = new Set(worldPatch.removeRouteIds ?? [])
    const routes = (campaign.world.routes ?? []).filter((route) => !removedRoutes.has(route.id))
    ;(worldPatch.upsertRoutes ?? []).forEach((route) => {
      const existing = routes.find((candidate) => candidate.id === route.id)
      if (existing) Object.assign(existing, route, { id: existing.id })
      else routes.push(route)
    })
    campaign.world.routes = routes.slice(0, WORLD_ROUTE_LIMIT)

    const removedPlaceIds = new Set(worldPatch.removePlaceIds ?? [])
    const places = (campaign.world.places ?? []).filter((place) => !removedPlaceIds.has(place.id))
    const incomingPlaceIds = new Set((worldPatch.upsertPlaces ?? []).map((place) => place.id))
    const availablePlaceIds = new Set([...places.map((place) => place.id), ...incomingPlaceIds])
    ;(worldPatch.upsertPlaces ?? []).forEach((incoming, placeIndex) => {
      if (incoming.parentId && (!availablePlaceIds.has(incoming.parentId) || incoming.parentId === incoming.id)) {
        rejectedReference(diagnostics, `statePatch.world.upsertPlaces[${placeIndex}].parentId`, incoming.parentId, 'родительское место не найдено или ссылается само на себя')
        return
      }
      const existing = places.find((place) => place.id === incoming.id || normalizedName(place.name) === normalizedName(incoming.name))
      const normalized = {
        ...incoming,
        culture: incoming.culture.slice(0, 12),
        notableFacts: incoming.notableFacts.slice(0, 16),
      }
      if (existing) Object.assign(existing, normalized, { id: existing.id, createdTurn: existing.createdTurn, lastChangedTurn: turn })
      else places.push({ ...normalized, createdTurn: incoming.createdTurn ?? turn, lastChangedTurn: turn })
    })
    campaign.world.places = places.slice(0, WORLD_PLACE_LIMIT)

    const processes = campaign.world.processes ?? []
    const placeIds = new Set(campaign.world.places.map((place) => place.id))
    const factionNames = new Set(campaign.world.factions.map((faction) => normalizedName(faction.name)))
    ;(worldPatch.upsertProcesses ?? []).forEach((incoming, processIndex) => {
      const unknownScope = incoming.scopeIds.find((placeId) => !placeIds.has(placeId))
      const unknownFaction = incoming.involvedFactionNames.find((name) => !factionNames.has(normalizedName(name)))
      if (unknownScope || unknownFaction) {
        rejectedReference(diagnostics, `statePatch.world.upsertProcesses[${processIndex}]`, unknownScope ?? unknownFaction, unknownScope ? 'область процесса не найдена в атласе' : 'участник процесса не найден среди фракций')
        return
      }
      const existing = processes.find((process) => process.id === incoming.id || normalizedName(process.title) === normalizedName(incoming.title))
      const normalized = {
        ...incoming,
        momentum: clamp(incoming.momentum, 0, 100),
        scopeIds: [...new Set(incoming.scopeIds)].slice(0, 20),
        causeIds: incoming.causeIds
          ? normalizeCauseIds(incoming.id, incoming.causeIds, `statePatch.world.upsertProcesses[${processIndex}]`)
          : existing?.causeIds,
        scale: incoming.scale ?? existing?.scale ?? inferScale(incoming.scopeIds),
        involvedFactionNames: [...new Set(incoming.involvedFactionNames)].slice(0, 20),
        drivers: incoming.drivers.slice(0, 16),
        obstacles: incoming.obstacles.slice(0, 16),
        consequences: incoming.consequences.slice(0, 16),
      }
      if (existing) Object.assign(existing, normalized, { id: existing.id, createdTurn: existing.createdTurn, lastAdvancedTurn: turn })
      else processes.push({ ...normalized, createdTurn: incoming.createdTurn ?? turn, lastAdvancedTurn: turn })
    })
    const retiredProcessIds = new Set<string>()
    ;(worldPatch.retireProcessIds ?? []).forEach((processId, processIndex) => {
      const process = processes.find((candidate) => candidate.id === processId)
      if (!process) return
      if (!['resolved', 'failed'].includes(process.status)) {
        rejectedReference(diagnostics, `statePatch.world.retireProcessIds[${processIndex}]`, processId, 'активный процесс нельзя убрать до завершения')
        return
      }
      retiredProcessIds.add(processId)
      queueChronicle({
        sourceId: process.id,
        kind: 'process',
        title: process.title,
        summary: process.description,
        outcome: process.stage,
        scale: process.scale ?? inferScale(process.scopeIds),
        scopeIds: process.scopeIds,
        causeIds: process.causeIds ?? [],
        entityIds: [],
        visibility: process.visibility,
        startTurn: process.createdTurn,
      })
      retirementEvents.push({ title: `Завершён внешний процесс: ${process.title}`, description: `${process.description} Итог: ${process.stage}`, category: 'world' })
    })
    const remainingProcesses = processes.filter((process) => !retiredProcessIds.has(process.id))
    const activeProcessCount = remainingProcesses.filter((process) => !['resolved', 'failed'].includes(process.status)).length
    const terminalBudget = Math.max(0, WORLD_PROCESS_TERMINAL_LIMIT - activeProcessCount)
    const retainedTerminalIds = new Set((terminalBudget > 0
      ? remainingProcesses.filter((process) => ['resolved', 'failed'].includes(process.status)).slice(-terminalBudget)
      : []).map((process) => process.id))
    remainingProcesses.filter((process) => ['resolved', 'failed'].includes(process.status) && !retainedTerminalIds.has(process.id)).forEach((process) => queueChronicle({
      sourceId: process.id,
      kind: 'process',
      title: process.title,
      summary: process.description,
      outcome: process.stage,
      scale: process.scale ?? inferScale(process.scopeIds),
      scopeIds: process.scopeIds,
      causeIds: process.causeIds ?? [],
      entityIds: [],
      visibility: process.visibility,
      startTurn: process.createdTurn,
      endTurn: process.lastAdvancedTurn,
    }))
    campaign.world.processes = remainingProcesses.filter((process) => !['resolved', 'failed'].includes(process.status) || retainedTerminalIds.has(process.id))

    if (worldPatch.legendarium) {
      const incoming = worldPatch.legendarium
      const unique = (values: string[], limit: number) => [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit)
      campaign.world.legendarium = {
        ...structuredClone(incoming),
        recognitionRules: unique(incoming.recognitionRules, 16),
        transmissionChannels: unique(incoming.transmissionChannels, 16),
        distortionForces: unique(incoming.distortionForces, 16),
        memoryKeepers: unique(incoming.memoryKeepers, 16),
        erasureForces: unique(incoming.erasureForces, 16),
        successionRules: unique(incoming.successionRules, 16),
        encounterRules: unique(incoming.encounterRules, 16),
        thresholds: incoming.thresholds
          .map((threshold) => ({ ...threshold, minRenown: clamp(threshold.minRenown, 0, 100), requirements: unique(threshold.requirements, 12) }))
          .sort((left, right) => LEGEND_STAGE_RANK[left.stage] - LEGEND_STAGE_RANK[right.stage]),
        updatedTurn: turn,
      }
    }

    const removedLegendIds = new Set(worldPatch.removeLegendIds ?? [])
    const legends = (campaign.world.legends ?? []).filter((legend) => !removedLegendIds.has(legend.id)).map((legend) => structuredClone(legend))
    const characterIds = new Set([campaign.player.id, ...campaign.npcs.map((npc) => npc.id)])
    const legendPlaceIds = new Set((campaign.world.places ?? []).map((place) => place.id))
    const legendFactionNames = new Set(campaign.world.factions.map((faction) => normalizedName(faction.name)))
    const legendThresholds = new Map((campaign.world.legendarium?.thresholds ?? []).map((threshold) => [threshold.stage, threshold.minRenown]))
    ;(worldPatch.upsertLegends ?? []).forEach((incoming, legendIndex) => {
      const existing = legends.find((legend) => legend.id === incoming.id || normalizedName(legend.name) === normalizedName(incoming.name))
      const referencedCharacterIds = [
        ...(incoming.characterId ? [incoming.characterId] : []),
        ...incoming.relatedNpcIds,
        ...incoming.successorNpcIds,
        ...incoming.legacies.flatMap((legacy) => legacy.holderNpcIds),
      ]
      const unknownCharacterId = referencedCharacterIds.find((characterId) => !characterIds.has(characterId))
      const referencedPlaceIds = [
        ...(incoming.currentState.locationId ? [incoming.currentState.locationId] : []),
        ...incoming.deeds.flatMap((deed) => deed.scopeIds),
        ...incoming.legacies.flatMap((legacy) => legacy.scopeIds),
      ]
      const unknownPlaceId = referencedPlaceIds.find((placeId) => !legendPlaceIds.has(placeId))
      const referencedFactions = [
        ...incoming.associatedFactionNames,
        ...incoming.deeds.flatMap((deed) => deed.factionNames),
        ...incoming.legacies.flatMap((legacy) => legacy.factionNames),
      ]
      const unknownFaction = referencedFactions.find((name) => !legendFactionNames.has(normalizedName(name)))
      const minimumRenown = legendThresholds.get(incoming.stage)
      const insufficientEvidence = ['legendary', 'mythic'].includes(incoming.stage)
        && (incoming.knownFeats.length < 2 || incoming.deeds.length < 2 || incoming.myths.length + incoming.legacies.length < 2)
      const missingLivingCharacter = ['living', 'returned'].includes(incoming.lifeStatus)
        && !incoming.characterId
      const impossibleEncounter = ['dead', 'sealed', 'dormant'].includes(incoming.lifeStatus)
        && incoming.currentState.encounterReadiness > 0
        && incoming.currentState.encounterConditions.length === 0
      if (unknownCharacterId || unknownPlaceId || unknownFaction || (minimumRenown !== undefined && incoming.renown < minimumRenown) || insufficientEvidence || missingLivingCharacter || impossibleEncounter) {
        const reason = unknownCharacterId ? 'связанный персонаж не найден'
          : unknownPlaceId ? 'связанное место не найдено'
            : unknownFaction ? 'связанная фракция не найдена'
              : minimumRenown !== undefined && incoming.renown < minimumRenown ? `известность ниже порога ${minimumRenown} для ступени ${incoming.stage}`
                : insufficientEvidence ? 'легендарный статус не подкреплён несколькими подвигами, мифами или наследием'
                  : missingLivingCharacter ? 'живая легендарная фигура не связана с симулируемым героем или NPC'
                    : 'встреча с недоступной фигурой не имеет причинных условий'
        rejectedReference(diagnostics, `statePatch.world.upsertLegends[${legendIndex}]`, incoming.name, reason)
        return
      }
      const normalized = normalizeLegend(incoming, turn, existing)
      if (existing) Object.assign(existing, normalized, { id: existing.id, createdTurn: existing.createdTurn })
      else if (legends.length < WORLD_LEGEND_LIMIT) legends.push(normalized)
      else rejectedReference(diagnostics, `statePatch.world.upsertLegends[${legendIndex}]`, incoming.name, `превышен лимит ${WORLD_LEGEND_LIMIT} легендарных записей`)
    })
    campaign.world.legends = legends

    const removedLawIds = new Set(worldPatch.removeLawIds ?? [])
    const laws = (campaign.world.laws ?? []).filter((law) => !removedLawIds.has(law.id))
    ;(worldPatch.upsertLaws ?? []).forEach((incoming) => {
      const existing = laws.find((law) => law.id === incoming.id || normalizedName(law.title) === normalizedName(incoming.title))
      if (existing) Object.assign(existing, incoming, { id: existing.id, createdTurn: existing.createdTurn, lastChangedTurn: turn })
      else laws.push({ ...incoming, createdTurn: incoming.createdTurn ?? turn, lastChangedTurn: turn })
    })
    campaign.world.laws = laws.slice(0, WORLD_LAW_LIMIT)

    const removedMechanicIds = new Set(worldPatch.removeMechanicIds ?? [])
    const mechanics = (campaign.world.mechanics ?? []).filter((mechanic) => !removedMechanicIds.has(mechanic.id))
    ;(worldPatch.upsertMechanics ?? []).forEach((incoming) => {
      const existing = mechanics.find((mechanic) => mechanic.id === incoming.id || normalizedName(mechanic.name) === normalizedName(incoming.name))
      if (existing) Object.assign(existing, incoming, { id: existing.id, createdTurn: existing.createdTurn, lastChangedTurn: turn })
      else mechanics.push({ ...incoming, createdTurn: incoming.createdTurn ?? turn, lastChangedTurn: turn })
    })
    campaign.world.mechanics = mechanics.slice(0, WORLD_MECHANIC_LIMIT)

    const removedInterfaceModuleIds = new Set(worldPatch.removeInterfaceModuleIds ?? [])
    const interfaceModules = (campaign.world.interfaceModules ?? [])
      .filter((module) => !removedInterfaceModuleIds.has(module.id))
      .map((module) => structuredClone(module))
    ;(worldPatch.upsertInterfaceModules ?? []).forEach((incoming, moduleIndex) => {
      const existingIndex = interfaceModules.findIndex((module) => module.id === incoming.id)
      const existing = existingIndex >= 0 ? interfaceModules[existingIndex] : undefined
      const normalized = normalizeInterfaceModule(incoming, turn, diagnostics, `statePatch.world.upsertInterfaceModules[${moduleIndex}]`, existing)
      if (existingIndex >= 0) interfaceModules[existingIndex] = normalized
      else interfaceModules.push(normalized)
    })
    ;(worldPatch.interfaceModuleChanges ?? []).forEach((change, changeIndex) => {
      const module = interfaceModules.find((candidate) => candidate.id === change.moduleId)
      if (!module) {
        rejectedReference(diagnostics, `statePatch.world.interfaceModuleChanges[${changeIndex}].moduleId`, change.moduleId, 'модуль интерфейса не найден')
        return
      }
      const knownElementIds = new Set([
        ...module.elements.map((element) => element.id),
        ...(change.upsertElements ?? []).map((element) => element.id),
      ])
      ;(change.removeElementIds ?? []).forEach((elementId, elementIndex) => {
        if (!knownElementIds.has(elementId)) rejectedReference(diagnostics, `statePatch.world.interfaceModuleChanges[${changeIndex}].removeElementIds[${elementIndex}]`, elementId, 'элемент модуля не найден')
      })
      const removedElementIds = new Set(change.removeElementIds ?? [])
      const elements = module.elements.filter((element) => !removedElementIds.has(element.id)).map((element) => structuredClone(element))
      ;(change.upsertElements ?? []).forEach((element) => {
        const existingElementIndex = elements.findIndex((candidate) => candidate.id === element.id)
        if (existingElementIndex >= 0) elements[existingElementIndex] = structuredClone(element)
        else elements.push(structuredClone(element))
      })
      Object.assign(module, change.module ?? {}, {
        id: module.id,
        createdTurn: module.createdTurn,
        lastChangedTurn: turn,
        pinned: module.pinned === true ? true : change.module?.pinned ?? module.pinned,
        priority: clamp(Number.isFinite(change.module?.priority) ? change.module!.priority! : module.priority, 0, 100),
        elements: normalizeInterfaceElements(elements, diagnostics, `statePatch.world.interfaceModuleChanges[${changeIndex}].upsertElements`),
      })
    })
    interfaceModules.sort((left, right) => (
      Number(Boolean(right.pinned)) - Number(Boolean(left.pinned))
      || right.priority - left.priority
      || left.createdTurn - right.createdTurn
      || left.id.localeCompare(right.id, 'ru')
    ))
    interfaceModules.slice(INTERFACE_MODULE_LIMIT).forEach((module) => {
      rejectedReference(diagnostics, 'statePatch.world.interfaceModules', module.id, `превышен лимит ${INTERFACE_MODULE_LIMIT} модулей; отклонён модуль с меньшим приоритетом`)
    })
    campaign.world.interfaceModules = interfaceModules.slice(0, INTERFACE_MODULE_LIMIT)

    if (worldPatch.interfaceBlueprint) {
      const blueprint = { ...structuredClone(worldPatch.interfaceBlueprint), updatedTurn: turn }
      if (validInterfaceBlueprint(blueprint)) campaign.world.interfaceBlueprint = blueprint
      else rejectedReference(diagnostics, 'statePatch.world.interfaceBlueprint', blueprint.defaultTab, 'некорректная компоновка правой панели')
    }

    const removedMetricIds = new Set(worldPatch.removeMetricIds ?? [])
    const metrics = (campaign.world.metrics ?? []).filter((metric) => !removedMetricIds.has(metric.id)).map((metric) => structuredClone(metric))
    ;(worldPatch.upsertMetrics ?? []).forEach((incoming, metricIndex) => {
      const existingIndex = metrics.findIndex((metric) => metric.id === incoming.id)
      const duplicateKey = metrics.find((metric, index) => index !== existingIndex && normalizedName(metric.key) === normalizedName(incoming.key))
      if (duplicateKey) {
        rejectedReference(diagnostics, `statePatch.world.upsertMetrics[${metricIndex}].key`, incoming.key, `ключ уже принадлежит показателю «${duplicateKey.label}»`)
        return
      }
      if (!Number.isFinite(incoming.min) || !Number.isFinite(incoming.max) || incoming.max <= incoming.min) {
        rejectedReference(diagnostics, `statePatch.world.upsertMetrics[${metricIndex}]`, incoming.id, 'некорректный диапазон показателя')
        return
      }
      const normalized: WorldMetric = {
        ...incoming,
        id: existingIndex >= 0 ? metrics[existingIndex].id : incoming.id,
        value: clamp(Number.isFinite(incoming.value) ? incoming.value : incoming.min, incoming.min, incoming.max),
        lastChangedTurn: turn,
      }
      if (existingIndex >= 0) metrics[existingIndex] = normalized
      else if (metrics.length < WORLD_METRIC_LIMIT) metrics.push(normalized)
      else rejectedReference(diagnostics, `statePatch.world.upsertMetrics[${metricIndex}]`, incoming.id, `превышен лимит ${WORLD_METRIC_LIMIT} показателей мира`)
    })
    Object.entries(worldPatch.metricDeltas ?? {}).forEach(([reference, delta]) => {
      const candidates = metrics.filter((metric) => metric.id === reference || normalizedName(metric.key) === normalizedName(reference) || normalizedName(metric.label) === normalizedName(reference))
      if (candidates.length !== 1) {
        rejectedReference(diagnostics, `statePatch.world.metricDeltas.${reference}`, reference, candidates.length ? 'ссылка на показатель неоднозначна' : 'показатель мира не найден')
        return
      }
      if (!Number.isFinite(delta)) return
      const metric = candidates[0]
      metric.value = clamp(metric.value + delta, metric.min, metric.max)
      metric.lastChangedTurn = turn
    })
    campaign.world.metrics = metrics
    if (Number.isFinite(worldPatch.calendarDayDelta)) campaign.world.calendar.day = Math.max(1, campaign.world.calendar.day + (worldPatch.calendarDayDelta ?? 0))
    if (worldPatch.calendarLabel) campaign.world.calendar.label = worldPatch.calendarLabel
  }

  const cleanup = patch.cleanup
  const retire = <T extends { id: string }>(
    values: T[],
    requests: Array<{ targetId: string; reason: string }> | undefined,
    canRetire: (value: T) => boolean,
    path: string,
    label: (value: T) => string,
    description: (value: T, reason: string) => string,
    category: GameEvent['category'],
    onRetire: (value: T, reason: string) => void,
  ) => {
    const retired = new Set<string>()
    ;(requests ?? []).forEach((request, index) => {
      const value = values.find((entry) => entry.id === request.targetId)
      if (!value) {
        rejectedReference(diagnostics, `statePatch.cleanup.${path}[${index}].targetId`, request.targetId, 'завершённая запись не найдена')
        return
      }
      if (!canRetire(value)) {
        rejectedReference(diagnostics, `statePatch.cleanup.${path}[${index}].targetId`, request.targetId, 'активную запись нельзя убрать без завершения')
        return
      }
      retired.add(value.id)
      retirementEvents.push({ title: `Закрыто: ${label(value)}`, description: description(value, request.reason), category })
      onRetire(value, request.reason)
    })
    return values.filter((value) => !retired.has(value.id))
  }
  campaign.threads = retire(
    campaign.threads,
    cleanup?.threads,
    (thread) => ['fulfilled', 'broken', 'resolved'].includes(normalizedName(thread.status)),
    'threads',
    (thread) => thread.title,
    (thread, reason) => `${thread.detail} Причина снятия с активного состояния: ${reason}`,
    'story',
    (thread, reason) => queueChronicle({
      sourceId: thread.id, kind: 'thread', title: thread.title, summary: thread.detail, outcome: reason,
      scale: thread.scale ?? inferScale(thread.scopeIds, 'personal'), scopeIds: thread.scopeIds ?? [], causeIds: thread.causeIds ?? [],
      entityIds: thread.participantIds, visibility: thread.secret ? 'hidden' : 'known', startTurn: thread.createdTurn,
      endTurn: thread.lastChangedTurn ?? turn,
    }),
  )
  campaign.worldEvents = retire(
    campaign.worldEvents,
    cleanup?.worldEvents,
    (event) => ['resolved', 'cancelled'].includes(event.status),
    'worldEvents',
    (event) => event.title,
    (event, reason) => `${event.description} Итог: ${reason}`,
    'world',
    (event, reason) => queueChronicle({
      sourceId: event.id, kind: 'event', title: event.title, summary: event.description, outcome: reason,
      scale: event.scale ?? inferScale(event.scopeIds), scopeIds: event.scopeIds ?? [], causeIds: event.causeIds ?? [],
      entityIds: event.involvedIds, visibility: event.visibility, startTurn: event.createdTurn,
      endTurn: event.lastChangedTurn ?? turn,
    }),
  )
  campaign.quests = retire(
    campaign.quests,
    cleanup?.quests,
    (quest) => ['completed', 'failed'].includes(quest.status),
    'quests',
    (quest) => quest.title,
    (quest, reason) => `${quest.description} Итог: ${reason}`,
    'quest',
    (quest, reason) => queueChronicle({
      sourceId: quest.id, kind: 'quest', title: quest.title, summary: quest.description, outcome: reason,
      scale: 'personal', scopeIds: [], causeIds: [], entityIds: [], visibility: quest.status === 'hidden' ? 'hidden' : 'known',
      startTurn: quest.createdTurn ?? 0, endTurn: quest.lastChangedTurn ?? turn,
    }),
  )
  campaign.antagonistPlans = retire(
    campaign.antagonistPlans,
    cleanup?.antagonistPlans,
    (plan) => ['completed', 'failed', 'abandoned'].includes(plan.status),
    'antagonistPlans',
    (plan) => plan.title,
    (plan, reason) => `${plan.objective} Итог: ${reason}`,
    'world',
    (plan, reason) => queueChronicle({
      sourceId: plan.id, kind: 'plan', title: plan.title, summary: `${plan.objective} Метод: ${plan.method}`, outcome: reason,
      scale: 'local', scopeIds: [], causeIds: [], entityIds: [plan.ownerNpcId], visibility: plan.secret ? 'hidden' : 'known',
      startTurn: Math.max(0, plan.lastAdvancedTurn), endTurn: plan.lastAdvancedTurn,
    }),
  )
  campaign.worldPressures = retire(
    campaign.worldPressures,
    cleanup?.worldPressures,
    (pressure) => pressure.stage === 'resolved',
    'worldPressures',
    (pressure) => `${pressure.sourceName}: ${pressure.objective}`,
    (pressure, reason) => `${pressure.cause} Итог: ${reason}`,
    'world',
    (pressure, reason) => queueChronicle({
      sourceId: pressure.id, kind: 'pressure', title: `${pressure.sourceName}: ${pressure.objective}`, summary: pressure.cause, outcome: reason,
      scale: pressureScale(pressure.tier), scopeIds: [], causeIds: [], entityIds: pressure.targetIds,
      visibility: pressure.visibility, startTurn: pressure.createdTurn, endTurn: pressure.lastAdvancedTurn,
    }),
  )

  // Terminal records remain visible for a few turns, then move to the compact chronicle.
  // Active, stalled, scheduled, due, hidden-active and otherwise unresolved records are never
  // removed by this budget compaction.
  const compactFinished = <T extends { id: string }>(
    values: T[],
    isTerminal: (value: T) => boolean,
    changedTurn: (value: T) => number,
    archive: (value: T) => void,
    label: (value: T) => string,
  ) => values.filter((value) => {
    if (!isTerminal(value) || turn - changedTurn(value) < TERMINAL_RETENTION_TURNS) return true
    archive(value)
    retirementEvents.push({ title: `Перенесено в хронику: ${label(value)}`, description: 'Завершённая линия сохранена как компактная причинная запись.', category: 'world' })
    return false
  })
  campaign.world.processes = compactFinished(
    campaign.world.processes ?? [],
    (process) => ['resolved', 'failed'].includes(process.status),
    (process) => process.lastAdvancedTurn,
    (process) => queueChronicle({
      sourceId: process.id, kind: 'process', title: process.title, summary: process.description, outcome: process.stage,
      scale: process.scale ?? inferScale(process.scopeIds), scopeIds: process.scopeIds, causeIds: process.causeIds ?? [], entityIds: [],
      visibility: process.visibility, startTurn: process.createdTurn, endTurn: process.lastAdvancedTurn,
    }),
    (process) => process.title,
  )
  campaign.threads = compactFinished(
    campaign.threads ?? [],
    (thread) => ['fulfilled', 'broken', 'resolved'].includes(normalizedName(thread.status)),
    (thread) => thread.lastChangedTurn ?? thread.createdTurn,
    (thread) => queueChronicle({
      sourceId: thread.id, kind: 'thread', title: thread.title, summary: thread.detail, outcome: thread.status,
      scale: thread.scale ?? inferScale(thread.scopeIds, 'personal'), scopeIds: thread.scopeIds ?? [], causeIds: thread.causeIds ?? [],
      entityIds: thread.participantIds, visibility: thread.secret ? 'hidden' : 'known', startTurn: thread.createdTurn,
      endTurn: thread.lastChangedTurn ?? turn,
    }),
    (thread) => thread.title,
  )
  campaign.worldEvents = compactFinished(
    campaign.worldEvents ?? [],
    (event) => ['resolved', 'cancelled'].includes(event.status),
    (event) => event.lastChangedTurn ?? event.createdTurn,
    (event) => queueChronicle({
      sourceId: event.id, kind: 'event', title: event.title, summary: event.description,
      outcome: event.consequences?.join(' ') || event.status,
      scale: event.scale ?? inferScale(event.scopeIds), scopeIds: event.scopeIds ?? [], causeIds: event.causeIds ?? [],
      entityIds: event.involvedIds, visibility: event.visibility, startTurn: event.createdTurn, endTurn: event.lastChangedTurn ?? turn,
    }),
    (event) => event.title,
  )
  campaign.quests = compactFinished(
    campaign.quests,
    (quest) => ['completed', 'failed'].includes(quest.status),
    (quest) => quest.lastChangedTurn ?? quest.createdTurn ?? 0,
    (quest) => queueChronicle({
      sourceId: quest.id, kind: 'quest', title: quest.title, summary: quest.description, outcome: quest.status,
      scale: 'personal', scopeIds: [], causeIds: [], entityIds: [], visibility: quest.status === 'hidden' ? 'hidden' : 'known',
      startTurn: quest.createdTurn ?? 0, endTurn: quest.lastChangedTurn ?? turn,
    }),
    (quest) => quest.title,
  )
  campaign.antagonistPlans = compactFinished(
    campaign.antagonistPlans ?? [],
    (plan) => ['completed', 'failed', 'abandoned'].includes(plan.status),
    (plan) => plan.lastAdvancedTurn,
    (plan) => queueChronicle({
      sourceId: plan.id, kind: 'plan', title: plan.title, summary: `${plan.objective} Метод: ${plan.method}`, outcome: plan.status,
      scale: 'local', scopeIds: [], causeIds: [], entityIds: [plan.ownerNpcId], visibility: plan.secret ? 'hidden' : 'known',
      startTurn: plan.lastAdvancedTurn, endTurn: plan.lastAdvancedTurn,
    }),
    (plan) => plan.title,
  )
  campaign.worldPressures = compactFinished(
    campaign.worldPressures ?? [],
    (pressure) => pressure.stage === 'resolved',
    (pressure) => pressure.lastAdvancedTurn,
    (pressure) => queueChronicle({
      sourceId: pressure.id, kind: 'pressure', title: `${pressure.sourceName}: ${pressure.objective}`, summary: pressure.cause,
      outcome: pressure.deescalationConditions.join(' ') || pressure.stage, scale: pressureScale(pressure.tier), scopeIds: [], causeIds: [],
      entityIds: pressure.targetIds, visibility: pressure.visibility, startTurn: pressure.createdTurn, endTurn: pressure.lastAdvancedTurn,
    }),
    (pressure) => `${pressure.sourceName}: ${pressure.objective}`,
  )
  const removedMemoryIds = new Set<string>()
  ;(cleanup?.memories ?? []).forEach((request, index) => {
    const memory = campaign.memories.find((entry) => entry.id === request.targetId)
    if (!memory) {
      rejectedReference(diagnostics, `statePatch.cleanup.memories[${index}].targetId`, request.targetId, 'воспоминание не найдено')
      return
    }
    if (memory.pinned) {
      rejectedReference(diagnostics, `statePatch.cleanup.memories[${index}].targetId`, request.targetId, 'закреплённое воспоминание нельзя удалить автоматически')
      return
    }
    removedMemoryIds.add(memory.id)
  })
  campaign.memories = campaign.memories.filter((memory) => !removedMemoryIds.has(memory.id))

  const timestamp = now()
  const memories: MemoryEntry[] = (patch.memories ?? []).slice(0, 8).map((memory) => ({
    ...memory,
    id: id(),
    turn,
    createdAt: timestamp,
    importance: clamp(memory.importance, 0, 100),
    tags: memory.tags.slice(0, 12),
  }))
  campaign.memories = compactMemoryBank([...campaign.memories, ...memories])

  const events: GameEvent[] = [...(patch.events ?? []).slice(0, 12), ...retirementEvents.slice(0, 24)].map((event) => ({
    ...event,
    id: id(),
    turn,
    createdAt: timestamp,
  }))
  campaign.timeline.push(...events)
  campaign.worldEvents?.forEach((event) => {
    if (event.status !== 'scheduled') return
    if ((event.dueTurn !== undefined && event.dueTurn <= turn) || (event.dueDay !== undefined && event.dueDay <= campaign.world.calendar.day)) event.status = 'due'
  })
  preserveAbilityHistories(campaign.player.abilities ?? [], [
    base.player.abilities ?? [],
    ...[...base.snapshots].reverse().map((snapshot) => snapshot.player.abilities ?? []),
  ], turn)
  campaign.npcs.forEach((npc) => {
    preserveAbilityHistories(npc.abilities ?? [], [
      base.npcs.find((candidate) => candidate.id === npc.id)?.abilities ?? [],
      ...[...base.snapshots].reverse().map((snapshot) => snapshot.npcs.find((candidate) => candidate.id === npc.id)?.abilities ?? []),
    ], turn)
  })
  return campaign
}

export function commitTurn(
  base: Campaign,
  input: string,
  actionType: ActionType,
  response: TurnResponse,
): Campaign {
  if (!response || typeof response !== 'object' || !response.statePatch || typeof response.statePatch !== 'object' || Array.isArray(response.statePatch)) {
    throw new Error('Сервер вернул неполный ход: statePatch отсутствует. Состояние истории не изменено.')
  }
  const nextTurn = base.turn + 1
  const timestamp = now()
  const userMessage: StoryMessage = {
    id: id(),
    role: 'user',
    content: input,
    actionType,
    turn: nextTurn,
    createdAt: timestamp,
  }
  const rejectedChanges: StateChange[] = []
  const campaign = applyPatch(base, response.statePatch, nextTurn, rejectedChanges)
  const stateChanges = [...diffCampaignState(base, campaign), ...rejectedChanges]
  const changes = summarizeStateChanges(stateChanges)
  const assistantMessage: StoryMessage = {
    id: id(),
    role: 'assistant',
    content: response.narrative,
    suggestions: response.suggestions.slice(0, 4),
    activeLoreIds: response.activeLoreIds,
    recalledMemoryIds: response.recalledMemoryIds,
    activeDocumentChunkIds: response.activeDocumentChunkIds,
    continuityNotes: response.continuityNotes,
    check: response.check,
    changeSummary: changes,
    stateChanges,
    turn: nextTurn,
    createdAt: timestamp,
  }

  campaign.snapshots = [...base.snapshots, createSnapshot(base)].slice(-40)
  campaign.messages = [...base.messages, userMessage, assistantMessage]
  const newArchives = (response.archives ?? []).slice(0, 4).map((archive) => ({
    ...archive,
    id: id(),
    createdAt: timestamp,
    startTurn: clamp(archive.startTurn, 0, nextTurn),
    endTurn: clamp(archive.endTurn, archive.startTurn, nextTurn),
    importance: clamp(archive.importance, 0, 100),
    tags: archive.tags.slice(0, 24),
    entityIds: archive.entityIds.slice(0, 24),
  }))
  campaign.archives = [...(campaign.archives ?? []), ...newArchives].slice(-20_000)
  campaign.turn = nextTurn
  campaign.updatedAt = timestamp
  return campaign
}

export function commitFailedTurn(base: Campaign, input: string, actionType: ActionType, error: string): Campaign {
  const turn = base.turn + 1
  const timestamp = now()
  return {
    ...base,
    updatedAt: timestamp,
    messages: [
      ...base.messages,
      { id: id(), role: 'user', content: input, actionType, turn, createdAt: timestamp },
      { id: id(), role: 'assistant', content: error, turn, createdAt: timestamp, failed: true },
    ],
  }
}

export function rewindLastTurn(campaign: Campaign): Campaign {
  const snapshot = campaign.snapshots.at(-1)
  if (!snapshot) return campaign
  return {
    ...campaign,
    turn: snapshot.turn,
    world: structuredClone(snapshot.world ?? campaign.world),
    player: structuredClone(snapshot.player),
    inventory: structuredClone(snapshot.inventory),
    npcs: structuredClone(snapshot.npcs),
    quests: structuredClone(snapshot.quests),
    lore: structuredClone(snapshot.lore),
    memories: structuredClone(snapshot.memories),
    scene: structuredClone(snapshot.scene),
    pacing: structuredClone(snapshot.pacing ?? campaign.pacing),
    activeConflict: structuredClone(snapshot.activeConflict),
    socialLinks: structuredClone(snapshot.socialLinks ?? campaign.socialLinks ?? []),
    threads: structuredClone(snapshot.threads ?? campaign.threads ?? []),
    worldEvents: structuredClone(snapshot.worldEvents ?? campaign.worldEvents ?? []),
    factionReputation: structuredClone(snapshot.factionReputation ?? campaign.factionReputation ?? []),
    archives: structuredClone(snapshot.archives ?? campaign.archives ?? []),
    partyMemberIds: structuredClone(snapshot.partyMemberIds ?? campaign.partyMemberIds ?? []),
    partyRoles: structuredClone(snapshot.partyRoles ?? campaign.partyRoles ?? {}),
    characterArcs: structuredClone(snapshot.characterArcs ?? campaign.characterArcs ?? []),
    mysteryCases: structuredClone(snapshot.mysteryCases ?? campaign.mysteryCases ?? []),
    antagonistPlans: structuredClone(snapshot.antagonistPlans ?? campaign.antagonistPlans ?? []),
    worldPressures: structuredClone(snapshot.worldPressures ?? campaign.worldPressures ?? []),
    influenceAssets: structuredClone(snapshot.influenceAssets ?? campaign.influenceAssets ?? []),
    eventDirectorState: structuredClone(snapshot.eventDirectorState ?? campaign.eventDirectorState),
    artifactRegistry: structuredClone(snapshot.artifactRegistry ?? campaign.artifactRegistry ?? []),
    messages: campaign.messages.slice(0, snapshot.messageCount),
    timeline: campaign.timeline.slice(0, snapshot.eventCount),
    snapshots: campaign.snapshots.slice(0, -1),
    updatedAt: now(),
  }
}
