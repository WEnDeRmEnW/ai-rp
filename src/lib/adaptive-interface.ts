import type {
  AdaptiveInterfaceElement, AdaptiveInterfaceElementState, AdaptiveInterfaceModule, Campaign, RelationshipDimensions,
} from '../../shared/types'
import { getNpcDisclosure } from './npc-disclosure'

export interface ResolvedInterfaceElement {
  value: string | number | boolean
  min?: number
  max?: number
  unit?: string
  /** True when the value is read from campaign state instead of the authored fallback. */
  live: boolean
  /** A live binding exists, but its target/key is no longer present. */
  missing: boolean
}

export interface AdaptiveInterfaceBindingIssue {
  moduleId: string
  moduleTitle: string
  elementId: string
  elementLabel: string
  domain: string
  target?: string
  key?: string
}

const normalize = (value?: string) => value?.trim().toLocaleLowerCase('ru-RU').replaceAll('ё', 'е') ?? ''
const same = (left?: string, right?: string) => normalize(left) === normalize(right)
const matchesKey = (key: string | undefined, entity: { key: string; label: string; aliases?: string[] }) => {
  const needle = normalize(key)
  return normalize(entity.key) === needle || normalize(entity.label) === needle || entity.aliases?.some((alias) => normalize(alias) === needle)
}

const itemByTarget = (campaign: Campaign, target?: string) => campaign.inventory.find((entry) => same(entry.id, target) || same(entry.name, target))
const npcByTarget = (campaign: Campaign, target?: string) => campaign.npcs.find((entry) => same(entry.id, target) || same(entry.name, target))
const entityIdByTarget = (campaign: Campaign, target?: string) => {
  if (same(campaign.player.id, target) || same(campaign.player.name, target)) return campaign.player.id
  return npcByTarget(campaign, target)?.id ?? target
}
const bound = (value: string | number | boolean, min?: number, max?: number, unit?: string): ResolvedInterfaceElement => ({ value, min, max, unit, live: true, missing: false })

export function resolveAdaptiveInterfaceElement(campaign: Campaign, element: AdaptiveInterfaceElement): ResolvedInterfaceElement {
  const fallback: ResolvedInterfaceElement = { value: element.value ?? '—', min: element.min, max: element.max, unit: element.unit, live: false, missing: false }
  const binding = element.binding
  if (!binding || binding.domain === 'custom') return fallback
  const missing = (): ResolvedInterfaceElement => ({ ...fallback, missing: true })

  if (binding.domain === 'player.level') return bound(campaign.player.level, element.min ?? 0, element.max, element.unit)
  if (binding.domain === 'player.resource') {
    const resource = campaign.player.resources.find((entry) => matchesKey(binding.key, entry))
    return resource ? bound(resource.value, element.min ?? 0, element.max ?? resource.max, element.unit) : missing()
  }
  if (binding.domain === 'player.stat') {
    const stat = campaign.player.stats.find((entry) => matchesKey(binding.key, entry))
    return stat ? bound(stat.value, element.min ?? 0, element.max ?? stat.max, element.unit) : missing()
  }
  if (binding.domain === 'player.currency') {
    const entry = Object.entries(campaign.player.currency).find(([key]) => same(key, binding.key))
    return entry ? bound(entry[1], element.min, element.max, element.unit) : missing()
  }
  if (binding.domain === 'player.condition-count') {
    const statusEffects = (campaign.player.statusEffects ?? []).filter((effect) => !effect.hidden)
    const key = normalize(binding.key)
    const matchingEffects = key ? statusEffects.filter((effect) => normalize(effect.category) === key || normalize(effect.name) === key) : statusEffects
    const matchingConditions = key ? campaign.player.conditions.filter((condition) => normalize(condition).includes(key)) : campaign.player.conditions
    return bound(matchingEffects.length + matchingConditions.length, element.min ?? 0, element.max, element.unit)
  }
  if (binding.domain === 'player.ability-mastery') {
    const ability = campaign.player.abilities.find((entry) => same(entry.id, binding.target ?? binding.key) || same(entry.name, binding.target ?? binding.key))
    return ability ? bound(ability.mastery ?? 0, element.min ?? 0, element.max ?? 100, element.unit ?? '%') : missing()
  }

  if (binding.domain === 'scene.tension') return bound(campaign.scene.tension, element.min ?? 0, element.max ?? 100, element.unit ?? '%')
  if (binding.domain === 'conflict.round') return campaign.activeConflict ? bound(campaign.activeConflict.round, element.min ?? 1, element.max, element.unit) : missing()
  if (binding.domain === 'conflict.participant-readiness' || binding.domain === 'conflict.participant-morale') {
    const entityId = entityIdByTarget(campaign, binding.target)
    const participant = campaign.activeConflict?.participants.find((entry) => same(entry.entityId, entityId))
    if (!participant) return missing()
    const value = binding.domain === 'conflict.participant-readiness' ? participant.readiness : participant.morale
    return bound(value, element.min ?? 0, element.max ?? 100, element.unit ?? '%')
  }

  if (binding.domain === 'world.day') return bound(campaign.world.calendar.day, element.min, element.max, element.unit)
  if (binding.domain === 'world.metric') {
    const needle = binding.target ?? binding.key
    const metric = (campaign.world.metrics ?? []).find((entry) => same(entry.id, needle) || same(entry.key, needle) || same(entry.label, needle))
    if (!metric || metric.visibility === 'hidden') return missing()
    return bound(metric.value, element.min ?? metric.min, element.max ?? metric.max, element.unit ?? metric.unit)
  }
  if (binding.domain === 'world.location-danger') {
    const location = campaign.world.locations.find((entry) => same(entry.name, binding.target ?? binding.key))
    return location ? bound(location.danger, element.min ?? 0, element.max ?? 100, element.unit ?? '%') : missing()
  }
  if (binding.domain === 'world.process-momentum') {
    const process = (campaign.world.processes ?? []).find((entry) => same(entry.id, binding.target) || same(entry.title, binding.target))
    return process ? bound(process.momentum, element.min ?? 0, element.max ?? 100, element.unit ?? '%') : missing()
  }
  if (binding.domain === 'world.pressure') {
    const pressure = (campaign.worldPressures ?? []).find((entry) => same(entry.id, binding.target) || same(entry.sourceName, binding.target))
    if (!pressure) return missing()
    const score = { trace: 10, local: 25, serious: 45, critical: 65, legendary: 85, mythic: 100 }[pressure.tier]
    return bound(score, element.min ?? 0, element.max ?? 100, element.unit ?? '%')
  }
  if (binding.domain === 'faction.reputation') {
    const reputation = (campaign.factionReputation ?? []).find((entry) => same(entry.factionName, binding.key ?? binding.target))
    return reputation ? bound(reputation.value, element.min ?? -100, element.max ?? 100, element.unit) : missing()
  }
  if (binding.domain === 'faction.power') {
    const faction = campaign.world.factions.find((entry) => same(entry.id, binding.target) || same(entry.name, binding.target ?? binding.key))
    return faction?.power !== undefined ? bound(faction.power, element.min ?? 0, element.max ?? 100, element.unit ?? '%') : missing()
  }

  if (binding.domain === 'inventory.category-count') {
    const value = campaign.inventory
      .filter((item) => !binding.key || same(item.category, binding.key))
      .reduce((total, item) => total + item.quantity, 0)
    return bound(value, element.min ?? 0, element.max, element.unit)
  }
  if (['inventory.item-charges', 'inventory.item-quantity', 'inventory.item-durability', 'artifact.mastery', 'artifact.attunement', 'artifact.bond', 'artifact.power-mastery'].includes(binding.domain)) {
    const item = itemByTarget(campaign, binding.target)
    if (!item) return missing()
    if (binding.domain === 'inventory.item-charges') return item.charges !== undefined ? bound(item.charges, element.min ?? 0, element.max ?? item.maxCharges, element.unit) : missing()
    if (binding.domain === 'inventory.item-quantity') return bound(item.quantity, element.min ?? 0, element.max, element.unit)
    if (binding.domain === 'inventory.item-durability') return item.durability !== undefined ? bound(item.durability, element.min ?? 0, element.max ?? item.maxDurability, element.unit) : missing()
    if (!item.artifact) return missing()
    if (binding.domain === 'artifact.attunement') return bound(item.artifact.attunement, element.min ?? 0, element.max ?? 100, element.unit ?? '%')
    if (binding.domain === 'artifact.bond') return bound(item.artifact.bond, element.min ?? -100, element.max ?? 100, element.unit)
    if (binding.domain === 'artifact.mastery') {
      const mastery = item.artifact.mastery ?? (item.artifact.powers.length ? item.artifact.powers.reduce((sum, power) => sum + power.mastery, 0) / item.artifact.powers.length : 0)
      return bound(Math.round(mastery), element.min ?? 0, element.max ?? 100, element.unit ?? '%')
    }
    const power = item.artifact.powers.find((entry) => same(entry.id, binding.key) || same(entry.name, binding.key))
    return power ? bound(power.mastery, element.min ?? 0, element.max ?? 100, element.unit ?? '%') : missing()
  }

  if (binding.domain === 'quest.active-count') return bound(campaign.quests.filter((quest) => quest.status === 'active').length, element.min ?? 0, element.max, element.unit)
  if (binding.domain === 'quest.objective-progress') {
    const quest = campaign.quests.find((entry) => same(entry.id, binding.target) || same(entry.title, binding.target))
    if (!quest) return missing()
    const value = quest.objectives.length ? quest.objectives.filter((objective) => objective.completed).length / quest.objectives.length * 100 : (quest.status === 'completed' ? 100 : 0)
    return bound(Math.round(value), element.min ?? 0, element.max ?? 100, element.unit ?? '%')
  }
  if (binding.domain === 'mystery.progress') {
    const mystery = (campaign.mysteryCases ?? []).find((entry) => same(entry.id, binding.target) || same(entry.title, binding.target))
    if (!mystery) return missing()
    const value = mystery.clues.length ? mystery.clues.filter((clue) => clue.discovered).length / mystery.clues.length * 100 : (mystery.status === 'solved' ? 100 : 0)
    return bound(Math.round(value), element.min ?? 0, element.max ?? 100, element.unit ?? '%')
  }
  if (binding.domain === 'party.size') return bound((campaign.partyMemberIds ?? []).length, element.min ?? 0, element.max, element.unit)

  const npc = npcByTarget(campaign, binding.target)
  if (!npc) return missing()
  const disclosure = getNpcDisclosure(npc)
  if (binding.domain === 'npc.relationship') return disclosure.has('relationship') ? bound(npc.relationship, element.min ?? -100, element.max ?? 100, element.unit) : missing()
  if (binding.domain === 'npc.initiative-urgency') return disclosure.has('initiative') && npc.initiative ? bound(npc.initiative.urgency, element.min ?? 0, element.max ?? 100, element.unit ?? '%') : missing()
  if (binding.domain === 'npc.relationship-dimension') {
    const key = normalize(binding.key) as keyof RelationshipDimensions
    const value = npc.relationshipDimensions?.[key]
    return disclosure.has('relationshipDimensions') && typeof value === 'number' ? bound(value, element.min ?? -100, element.max ?? 100, element.unit) : missing()
  }
  if (binding.domain === 'npc.stat') {
    const stat = disclosure.stats.find((entry) => matchesKey(binding.key, entry))
    return stat ? bound(stat.value, element.min ?? 0, element.max ?? stat.max, element.unit) : missing()
  }
  if (binding.domain === 'npc.resource') {
    const resource = disclosure.resources.find((entry) => matchesKey(binding.key, entry))
    return resource ? bound(resource.value, element.min ?? 0, element.max ?? resource.max, element.unit) : missing()
  }
  return missing()
}

export function resolveAdaptiveElementState(element: AdaptiveInterfaceElement, resolved: ResolvedInterfaceElement): AdaptiveInterfaceElementState {
  if (typeof resolved.value !== 'number' || !element.stateRules) return element.state
  const value = resolved.value
  const rules = element.stateRules
  if ((rules.dangerBelow !== undefined && value <= rules.dangerBelow) || (rules.dangerAbove !== undefined && value >= rules.dangerAbove)) return 'danger'
  if ((rules.warningBelow !== undefined && value <= rules.warningBelow) || (rules.warningAbove !== undefined && value >= rules.warningAbove)) return 'warning'
  if ((rules.positiveBelow !== undefined && value <= rules.positiveBelow) || (rules.positiveAbove !== undefined && value >= rules.positiveAbove)) return 'positive'
  return element.state
}

export function adaptiveInterfaceBindingIssues(campaign: Campaign, modules: AdaptiveInterfaceModule[] = campaign.world.interfaceModules ?? []): AdaptiveInterfaceBindingIssue[] {
  return modules.flatMap((module) => module.elements.flatMap((element) => {
    if (!element.binding || element.binding.domain === 'custom') return []
    const resolved = resolveAdaptiveInterfaceElement(campaign, element)
    return resolved.missing ? [{
      moduleId: module.id,
      moduleTitle: module.title,
      elementId: element.id,
      elementLabel: element.label,
      domain: element.binding.domain,
      target: element.binding.target,
      key: element.binding.key,
    }] : []
  }))
}
