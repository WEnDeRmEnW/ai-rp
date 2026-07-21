import type {
  Ability,
  AbilityDraft,
  AbilityExecutionReceipt,
  AbilityDiscovery,
  AbilityKnowledgeLevel,
  AbilityProfileSection,
  AbilityRegistryEntry,
  CapabilityGroup,
  CapabilityTier,
  PowerTechnique,
  PowerTechniqueDraft,
  WorldCapabilitySystem,
  Campaign,
  TurnPatch,
} from './types.js'
import { grantedItemAbilities } from './effective-abilities.js'

const abilitySections: AbilityProfileSection[] = [
  'identity', 'principle', 'source', 'standing', 'facets', 'availability', 'techniques', 'counterplay', 'progression', 'history',
]

const clean = (values: string[] | undefined, limit: number) => [...new Set(
  (values ?? []).map((value) => value.trim()).filter(Boolean),
)].slice(0, limit)

const normalize = (value: string) => value
  .normalize('NFKC')
  .toLocaleLowerCase('ru-RU')
  .replaceAll('ё', 'е')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()

const tokens = (values: Array<string | undefined>) => new Set(
  values.flatMap((value) => normalize(value ?? '').split(' ').filter((token) => token.length >= 3)),
)

const overlap = (left: Set<string>, right: Set<string>) => {
  if (!left.size || !right.size) return 0
  const intersection = [...left].filter((token) => right.has(token)).length
  return intersection / Math.max(1, Math.min(left.size, right.size))
}

export function normalizeAbilityDiscovery(
  discovery: AbilityDiscovery,
  ability: Pick<Ability, 'techniques'>,
  turn: number,
): AbilityDiscovery {
  const techniqueIds = new Set(ability.techniques?.map((technique) => technique.id) ?? [])
  return {
    awareness: Math.max(0, Math.min(100, Math.round(discovery.awareness))),
    revealedSections: [...new Set(discovery.revealedSections)].filter((section) => abilitySections.includes(section)).slice(0, abilitySections.length),
    techniqueKnowledge: Object.fromEntries(
      Object.entries(discovery.techniqueKnowledge ?? {}).filter(([techniqueId]) => techniqueIds.has(techniqueId)).slice(0, 96),
    ),
    evidence: (discovery.evidence ?? []).map((entry) => ({
      ...entry,
      reliability: Math.max(0, Math.min(100, Math.round(entry.reliability))),
      learnedTurn: Math.max(0, Math.min(turn, Math.round(entry.learnedTurn))),
    })).slice(-64),
    updatedTurn: turn,
  }
}

export function abilitySectionKnown(ability: Ability, section: AbilityProfileSection): boolean {
  return !ability.profile || ability.profile.discovery.revealedSections.includes(section)
}

export function abilityTechniqueKnowledge(ability: Ability, techniqueId: string): AbilityKnowledgeLevel {
  const discovery = ability.profile?.discovery
  if (!discovery) return 'understood'
  return discovery.techniqueKnowledge[techniqueId] ?? (discovery.revealedSections.includes('techniques') ? 'known' : 'hidden')
}

export function visibleAbilityTechniques(ability: Ability) {
  return (ability.techniques ?? []).filter((technique) => {
    const knowledge = abilityTechniqueKnowledge(ability, technique.id)
    return knowledge === 'known' || knowledge === 'understood'
  })
}

export function abilityFingerprint(ability: Ability) {
  const profile = ability.profile
  const identity = profile?.creativeIdentity
  return {
    coreFantasy: identity?.coreFantasy ?? ability.description,
    centralPrinciple: identity?.centralPrinciple ?? ability.description,
    originPattern: identity?.originPattern ?? ability.source ?? '',
    interactionModel: identity?.interactionModel ?? ability.activation ?? '',
    signatureExperience: identity?.signatureExperience ?? (ability.examples ?? []).join(' · '),
    mechanicVerbs: clean(identity?.mechanicVerbs, 16),
    sensoryMotifs: clean(identity?.sensoryMotifs, 16),
    capabilityPatterns: clean([
      ...(ability.capabilities ?? []),
      ...(ability.effects ?? []),
      ...(ability.techniques ?? []).flatMap((technique) => [technique.name, technique.description, ...(technique.effects ?? [])]),
    ], 64),
    ownerExpression: profile
      ? [profile.ownerExpression.summary, ...profile.ownerExpression.priorities, ...profile.ownerExpression.signatures].join(' · ')
      : '',
    visualSignature: profile
      ? `${profile.presentation.layout} · ${profile.presentation.icon} · ${profile.presentation.symbol} · ${profile.presentation.motif}`
      : ability.name,
  }
}

export interface AbilitySimilarity {
  registryEntry: AbilityRegistryEntry
  overall: number
  idea: number
  origin: number
  mechanics: number
  interaction: number
  experience: number
  expression: number
  visual: number
  allowedReuse: boolean
}

export function compareAbilityToRegistry(ability: Ability, registry: AbilityRegistryEntry[]): AbilitySimilarity[] {
  const fingerprint = abilityFingerprint(ability)
  const identity = ability.profile?.creativeIdentity
  return registry
    .filter((entry) => entry.abilityId !== ability.id)
    .map((entry) => {
      const previous = entry.fingerprint
      const idea = overlap(tokens([fingerprint.coreFantasy, fingerprint.centralPrinciple]), tokens([previous.coreFantasy, previous.centralPrinciple]))
      const origin = overlap(tokens([fingerprint.originPattern]), tokens([previous.originPattern]))
      const mechanics = overlap(tokens([...fingerprint.mechanicVerbs, ...fingerprint.capabilityPatterns]), tokens([...previous.mechanicVerbs, ...previous.capabilityPatterns]))
      const interaction = overlap(tokens([fingerprint.interactionModel]), tokens([previous.interactionModel]))
      const experience = overlap(tokens([fingerprint.signatureExperience, ...fingerprint.sensoryMotifs]), tokens([previous.signatureExperience, ...previous.sensoryMotifs]))
      const expression = overlap(tokens([fingerprint.ownerExpression]), tokens([previous.ownerExpression]))
      const visual = overlap(tokens([fingerprint.visualSignature]), tokens([previous.visualSignature]))
      const sharesLineage = Boolean(identity?.lineageId && identity.lineageId === entry.lineageId)
      const explicitlyRelated = Boolean(identity?.relatedAbilityIds?.includes(entry.abilityId))
      const allowedReuse = Boolean(
        identity?.resemblanceKind
        && identity.resemblanceReason?.trim()
        && (sharesLineage || explicitlyRelated || identity.resemblanceKind === 'canon'),
      )
      const overall = idea * .2 + origin * .12 + mechanics * .27 + interaction * .14
        + experience * .1 + expression * .1 + visual * .07
      return { registryEntry: entry, overall, idea, origin, mechanics, interaction, experience, expression, visual, allowedReuse }
    })
    .sort((left, right) => right.overall - left.overall)
}

const genericAbilityMotifs = /(?:энергетическ\S* луч|универсальн\S* щит|аур\S* силы|абсолютн\S* контроль|манипуляц\S* энерг|таинственн\S* мощ)/iu

export function abilityNoveltyIssues(ability: Ability, registry: AbilityRegistryEntry[]): string[] {
  const identity = ability.profile?.creativeIdentity
  if (!identity) return [`«${ability.name}» не имеет авторского профиля.`]
  const issues: string[] = []
  const closest = compareAbilityToRegistry(ability, registry)[0]
  if (closest && !closest.allowedReuse) {
    if (closest.overall >= .66) issues.push(`«${ability.name}» слишком похожа на «${closest.registryEntry.name}»: общий отпечаток ${Math.round(closest.overall * 100)}%.`)
    if (closest.idea >= .76 && closest.mechanics >= .68) issues.push(`Центральный принцип и механика повторяют «${closest.registryEntry.name}».`)
    if (closest.interaction >= .78 && closest.experience >= .72 && closest.visual >= .68) issues.push(`Способ взаимодействия, проявление и подача повторяют «${closest.registryEntry.name}».`)
  }
  const identityText = [
    identity.coreFantasy,
    identity.centralPrinciple,
    identity.originPattern,
    identity.interactionModel,
    identity.signatureExperience,
    ...identity.sensoryMotifs,
  ].join(' ')
  if (genericAbilityMotifs.test(identityText) && !identity.resemblanceReason?.trim() && identity.differentiation.length < 2) {
    issues.push(`Клишированный принцип «${ability.name}» требует причинной связи с миром и минимум двух конкретных отличий.`)
  }
  return [...new Set(issues)]
}

export function abilityNoveltyScore(ability: Ability, registry: AbilityRegistryEntry[]): number {
  if (!ability.profile) return 0
  const closest = compareAbilityToRegistry(ability, registry)[0]
  if (!closest || closest.allowedReuse) return 100
  return Math.max(0, Math.round(100 - closest.overall * 100 - abilityNoveltyIssues(ability, registry).length * 8))
}

function groupById(system: WorldCapabilitySystem | undefined, groupId: string): CapabilityGroup | undefined {
  return system?.groups.find((group) => group.id === groupId)
}

function tierById(system: WorldCapabilitySystem | undefined, tierId: string): CapabilityTier | undefined {
  return system?.tiers.find((tier) => tier.id === tierId)
}

export function abilityProfileIssues(
  ability: Ability,
  system: WorldCapabilitySystem | undefined,
  resourceKeys: string[],
): string[] {
  const profile = ability.profile
  if (!profile) return [`«${ability.name}» не имеет полного profile.`]
  const issues: string[] = []
  if (!system) issues.push(`У мира нет capabilitySystem для новой способности «${ability.name}».`)
  if (system && profile.standing.systemId !== system.id) issues.push(`standing.systemId не совпадает с системой возможностей мира.`)
  if (!groupById(system, profile.nature.groupId)) issues.push(`Неизвестная группа возможности: ${profile.nature.groupId}.`)
  const tier = tierById(system, profile.standing.tierId)
  if (!tier) issues.push(`Неизвестный класс возможности: ${profile.standing.tierId}.`)
  if (tier && profile.standing.tierLabel !== tier.label) issues.push(`Подпись класса должна точно совпадать с capabilitySystem: ${tier.label}.`)
  if (profile.facets.length < 2 || profile.facets.length > 6) issues.push(`Нужно от двух до шести содержательных граней вместо ${profile.facets.length}.`)
  if (profile.facets.some((facet) => !Number.isFinite(facet.value) || facet.value < 0 || facet.value > 100)) issues.push(`Грани возможности должны находиться в диапазоне 0–100.`)
  if (!profile.creativeIdentity.mechanicVerbs.length) issues.push(`Не заданы механические глаголы.`)
  if (!profile.creativeIdentity.differentiation.length) issues.push(`Не объяснено отличие от других возможностей.`)
  if (!profile.ownerExpression.summary.trim() || !profile.ownerExpression.priorities.length) issues.push(`Не задана индивидуальная манера владельца.`)
  if (!profile.standing.evidence.length) issues.push(`Класс силы не подтверждён доказательствами.`)
  if (profile.developmentSeeds.some((seed) => seed.requiredConfirmations < 2 || seed.requiredConfirmations > 5)) issues.push(`Порог рождения техники должен находиться между 2 и 5.`)
  if (profile.availability?.charges && (
    profile.availability.charges.current < 0
    || profile.availability.charges.max <= 0
    || profile.availability.charges.current > profile.availability.charges.max
  )) issues.push(`Некорректное состояние зарядов способности.`)
  const knownResources = new Set(resourceKeys)
  const costResources = [
    ...(ability.costs ?? []).map((cost) => cost.resource),
    ...(ability.techniques ?? []).flatMap((technique) => technique.costs.map((cost) => cost.resource)),
  ]
  costResources.filter((resource) => !knownResources.has(resource)).forEach((resource) => issues.push(`Цена ссылается на неизвестный ресурс: ${resource}.`))
  const techniqueNames = (ability.techniques ?? []).map((technique) => normalize(technique.name))
  if (new Set(techniqueNames).size !== techniqueNames.length) issues.push(`Техники способности имеют повторяющиеся имена.`)
  return [...new Set(issues)]
}

export function updateAbilityRegistry(
  registry: AbilityRegistryEntry[] | undefined,
  ability: Ability,
  ownerId: string,
  ownerKind: AbilityRegistryEntry['ownerKind'],
  status: AbilityRegistryEntry['status'],
  turn: number,
): AbilityRegistryEntry[] {
  if (!ability.profile) return registry ?? []
  const current = registry?.find((entry) => entry.abilityId === ability.id && entry.ownerId === ownerId)
  const next: AbilityRegistryEntry = {
    abilityId: ability.id,
    ownerId,
    ownerKind,
    name: ability.name,
    status,
    fingerprint: abilityFingerprint(ability),
    lineageId: ability.profile.creativeIdentity.lineageId,
    canonStatus: ability.canonStatus,
    createdTurn: current?.createdTurn ?? turn,
    lastChangedTurn: turn,
  }
  return [...(registry ?? []).filter((entry) => !(entry.abilityId === ability.id && entry.ownerId === ownerId)), next].slice(-5_000)
}

function sameCosts(left: AbilityExecutionReceipt['costs'], right: AbilityExecutionReceipt['costs']) {
  const total = (costs: AbilityExecutionReceipt['costs']) => costs.reduce<Record<string, number>>((result, cost) => {
    result[cost.resource] = (result[cost.resource] ?? 0) + cost.amount
    return result
  }, {})
  const a = total(left)
  const b = total(right)
  return Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([resource, amount]) => b[resource] === amount)
}

type ExecutionAbility = {
  ability: Ability | AbilityDraft
  technique: PowerTechnique | PowerTechniqueDraft | undefined
}

function resolveExecutionAbility(
  campaign: Campaign,
  patch: TurnPatch,
  receipt: AbilityExecutionReceipt,
): ExecutionAbility | undefined {
  const addedNpc = patch.npcs?.find((mutation) => mutation.operation === 'add' && mutation.npc.id === receipt.ownerId)
  const updatedNpcAbilities = patch.npcs
    ?.filter((mutation) => mutation.operation === 'update' && mutation.targetId === receipt.ownerId)
    .flatMap((mutation) => mutation.operation === 'update' ? [
      ...(mutation.npc.abilities ?? []),
      ...(mutation.npc.upsertAbilities ?? []),
    ] : []) ?? []
  const owner = receipt.ownerKind === 'player'
    ? (receipt.ownerId === campaign.player.id ? campaign.player : undefined)
    : campaign.npcs.find((npc) => npc.id === receipt.ownerId) ?? addedNpc?.npc
  if (!owner) return undefined
  const grantedItemAbility = receipt.ownerKind === 'player'
    ? grantedItemAbilities(campaign).find((entry) => entry.ability.id === receipt.abilityId)
    : undefined
  const ability = owner.abilities?.find((candidate) => candidate.id === receipt.abilityId)
    ?? (receipt.ownerKind === 'player' ? patch.addAbilities ?? [] : [...(addedNpc?.npc.abilities ?? []), ...updatedNpcAbilities])
      .find((candidate) => candidate.id === receipt.abilityId)
    ?? grantedItemAbility?.ability
  if (!ability) return undefined
  const technique = receipt.techniqueId
    ? ability.techniques?.find((candidate) => candidate.id === receipt.techniqueId)
    : undefined
  return { ability, technique }
}

function costTotals(costs: AbilityExecutionReceipt['costs']) {
  return costs.reduce<Record<string, number>>((result, cost) => {
    result[cost.resource] = (result[cost.resource] ?? 0) + cost.amount
    return result
  }, {})
}

/**
 * The authored ability card is the source of truth. DeepSeek often copies a plausible but
 * outdated price into an execution receipt; repairing the whole turn for that shape-only
 * mismatch is both slow and fragile. Canonicalize the receipt and replace only the attributable
 * resource charge, preserving any unrelated loss already present in the patch.
 */
export function reconcileAbilityExecutionCosts(
  campaign: Campaign,
  receiptsInput: AbilityExecutionReceipt[] | undefined,
  patchInput: TurnPatch,
): { receipts: AbilityExecutionReceipt[]; patch: TurnPatch; corrections: string[] } {
  const receipts = structuredClone(receiptsInput ?? [])
  const patch = structuredClone(patchInput)
  const corrections: string[] = []
  const oldTotals = new Map<string, number>()
  const requiredTotals = new Map<string, number>()
  const addTotal = (target: Map<string, number>, receipt: AbilityExecutionReceipt, resource: string, amount: number) => {
    const key = `${receipt.ownerKind}:${receipt.ownerId}:${resource}`
    target.set(key, (target.get(key) ?? 0) + amount)
  }

  receipts.forEach((receipt, index) => {
    Object.entries(costTotals(receipt.costs)).forEach(([resource, amount]) => addTotal(oldTotals, receipt, resource, amount))
    const resolved = resolveExecutionAbility(campaign, patch, receipt)
    if (!resolved || (receipt.techniqueId && !resolved.technique)) return
    const canonical = receipt.outcome === 'blocked' ? [] : (resolved.technique?.costs ?? resolved.ability.costs ?? [])
    if (!sameCosts(receipt.costs, canonical)) {
      corrections.push(`abilityExecutions[${index}]: цена приведена к механике «${resolved.technique?.name ?? resolved.ability.name}».`)
      receipt.costs = structuredClone(canonical)
    }
    Object.entries(costTotals(canonical)).forEach(([resource, amount]) => addTotal(requiredTotals, receipt, resource, amount))
  })

  const keys = new Set([...oldTotals.keys(), ...requiredTotals.keys()])
  for (const key of keys) {
    const separator = key.indexOf(':')
    const secondSeparator = key.indexOf(':', separator + 1)
    const ownerKind = key.slice(0, separator) as AbilityExecutionReceipt['ownerKind']
    const ownerId = key.slice(separator + 1, secondSeparator)
    const resource = key.slice(secondSeparator + 1)
    const oldAmount = oldTotals.get(key) ?? 0
    const requiredAmount = requiredTotals.get(key) ?? 0
    const replaceCharge = (current: number | undefined) => {
      const delta = current ?? 0
      if (oldAmount > 0 && delta <= -oldAmount) return delta + oldAmount - requiredAmount
      return requiredAmount > 0 && delta > -requiredAmount ? -requiredAmount : delta
    }
    if (ownerKind === 'player') {
      const current = patch.resourceDeltas?.[resource]
      const next = replaceCharge(current)
      if (next !== (current ?? 0)) {
        patch.resourceDeltas = { ...(patch.resourceDeltas ?? {}), [resource]: next }
        corrections.push(`Списание ${resource} синхронизировано с фактической ценой способности.`)
      }
      continue
    }
    let mutation = patch.npcs?.find((entry) => entry.operation === 'update' && entry.targetId === ownerId)
    if (!mutation || mutation.operation !== 'update') {
      mutation = { operation: 'update', targetId: ownerId, npc: {} }
      patch.npcs = [...(patch.npcs ?? []), mutation]
    }
    const current = mutation.npc.resourceDeltas?.[resource]
    const next = replaceCharge(current)
    if (next !== (current ?? 0)) {
      mutation.npc.resourceDeltas = { ...(mutation.npc.resourceDeltas ?? {}), [resource]: next }
      corrections.push(`Списание ${resource} у ${ownerId} синхронизировано с фактической ценой способности.`)
    }
  }

  return { receipts, patch, corrections: [...new Set(corrections)] }
}

export function abilityExecutionIssues(
  campaign: Campaign,
  receipts: AbilityExecutionReceipt[] | undefined,
  patch: TurnPatch,
): string[] {
  const issues: string[] = []
  const executions = receipts ?? []
  const expectedCosts = new Map<string, number>()
  // Item powers deliberately live only in the canonical inventory record. The UI,
  // prompts and action resolver expose them as projected abilities, so execution
  // validation must use that same projection instead of checking player.abilities
  // alone. This keeps an artifact upgrade/loss authoritative without duplicating it.
  const grantedPlayerAbilities = grantedItemAbilities(campaign)
  executions.forEach((receipt, index) => {
    const addedNpc = patch.npcs?.find((mutation) => mutation.operation === 'add' && mutation.npc.id === receipt.ownerId)
    const updatedNpcAbilities = patch.npcs
      ?.filter((mutation) => mutation.operation === 'update' && mutation.targetId === receipt.ownerId)
      .flatMap((mutation) => mutation.operation === 'update' ? [
        ...(mutation.npc.abilities ?? []),
        ...(mutation.npc.upsertAbilities ?? []),
      ] : []) ?? []
    const owner = receipt.ownerKind === 'player'
      ? (receipt.ownerId === campaign.player.id ? campaign.player : undefined)
      : campaign.npcs.find((npc) => npc.id === receipt.ownerId) ?? addedNpc?.npc
    if (!owner) {
      issues.push(`abilityExecutions[${index}]: владелец ${receipt.ownerId} не существует.`)
      return
    }
    const plannedPlayerAbilities = receipt.ownerKind === 'player' ? patch.addAbilities ?? [] : []
    const plannedNpcAbilities = receipt.ownerKind === 'npc'
      ? [...(addedNpc?.npc.abilities ?? []), ...updatedNpcAbilities]
      : []
    const grantedItemAbility = receipt.ownerKind === 'player'
      ? grantedPlayerAbilities.find((entry) => entry.ability.id === receipt.abilityId)
      : undefined
    const ability = owner.abilities?.find((candidate) => candidate.id === receipt.abilityId)
      ?? [...plannedPlayerAbilities, ...plannedNpcAbilities].find((candidate) => candidate.id === receipt.abilityId)
      ?? grantedItemAbility?.ability
    if (!ability) {
      issues.push(`abilityExecutions[${index}]: способность ${receipt.abilityId} не принадлежит владельцу.`)
      return
    }
    if (grantedItemAbility && !grantedItemAbility.available && receipt.outcome !== 'blocked') {
      issues.push(`abilityExecutions[${index}]: сила предмета ${ability.name} сейчас недоступна: ${grantedItemAbility.blockers.join('; ')}.`)
    }
    const technique = receipt.techniqueId ? ability.techniques?.find((candidate) => candidate.id === receipt.techniqueId) : undefined
    if (receipt.techniqueId && !technique) issues.push(`abilityExecutions[${index}]: техника ${receipt.techniqueId} не существует в ${ability.name}.`)
    if (technique && !technique.unlocked) issues.push(`abilityExecutions[${index}]: закрытая техника ${technique.name} не может сработать.`)
    const availability = technique?.availability ?? ability.profile?.availability
    if (availability && ['blocked', 'disabled', 'cooldown'].includes(availability.state) && receipt.outcome !== 'blocked') {
      issues.push(`abilityExecutions[${index}]: ${technique?.name ?? ability.name} имеет availability=${availability.state}.`)
    }
    const mechanicalCosts = technique?.costs ?? ability.costs ?? []
    if (!sameCosts(receipt.costs, receipt.outcome === 'blocked' ? [] : mechanicalCosts)) {
      issues.push(`abilityExecutions[${index}]: оплаченные costs не совпадают с механикой ${technique?.name ?? ability.name}.`)
    }
    if (receipt.outcome === 'blocked' && receipt.effects.length) issues.push(`abilityExecutions[${index}]: заблокированное применение не может иметь effects.`)
    if (receipt.outcome !== 'blocked' && !receipt.effects.length) issues.push(`abilityExecutions[${index}]: фактическое применение должно зафиксировать наблюдаемый effect.`)
    if (receipt.outcome !== 'blocked') mechanicalCosts.forEach((cost) => {
      const key = `${receipt.ownerKind}:${receipt.ownerId}:${cost.resource}`
      expectedCosts.set(key, (expectedCosts.get(key) ?? 0) + cost.amount)
    })
  })
  expectedCosts.forEach((amount, key) => {
    const [ownerKind, ownerId, resource] = key.split(':')
    const delta = ownerKind === 'player'
      ? patch.resourceDeltas?.[resource]
      : patch.npcs?.filter((mutation) => mutation.operation === 'update' && mutation.targetId === ownerId)
        .reduce((sum, mutation) => sum + (mutation.operation === 'update' ? mutation.npc.resourceDeltas?.[resource] ?? 0 : 0), 0)
    if ((delta ?? 0) > -amount) issues.push(`Цена ${amount} ${resource} для ${ownerId} не списана полностью в statePatch.`)
  })
  return [...new Set(issues)]
}
