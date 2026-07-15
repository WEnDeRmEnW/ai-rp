import type { AdaptiveInterfaceElement, Campaign } from '../../shared/types'

export interface ResolvedInterfaceElement {
  value: string | number | boolean
  min?: number
  max?: number
  unit?: string
}

const normalize = (value?: string) => value?.trim().toLocaleLowerCase('ru-RU') ?? ''
const same = (left?: string, right?: string) => normalize(left) === normalize(right)
const matchesKey = (key: string | undefined, entity: { key: string; label: string; aliases?: string[] }) => {
  const needle = normalize(key)
  return normalize(entity.key) === needle || normalize(entity.label) === needle || entity.aliases?.some((alias) => normalize(alias) === needle)
}

export function resolveAdaptiveInterfaceElement(campaign: Campaign, element: AdaptiveInterfaceElement): ResolvedInterfaceElement {
  const fallback = { value: element.value ?? '—', min: element.min, max: element.max, unit: element.unit }
  const binding = element.binding
  if (!binding || binding.domain === 'custom') return fallback

  if (binding.domain === 'player.resource') {
    const resource = campaign.player.resources.find((entry) => matchesKey(binding.key, entry))
    return resource ? { value: resource.value, min: element.min ?? 0, max: element.max ?? resource.max, unit: element.unit } : fallback
  }
  if (binding.domain === 'player.stat') {
    const stat = campaign.player.stats.find((entry) => matchesKey(binding.key, entry))
    return stat ? { value: stat.value, min: element.min ?? 0, max: element.max ?? stat.max, unit: element.unit } : fallback
  }
  if (binding.domain === 'player.currency') {
    const entry = Object.entries(campaign.player.currency).find(([key]) => same(key, binding.key))
    return entry ? { ...fallback, value: entry[1] } : fallback
  }
  if (binding.domain === 'player.condition-count') {
    const statusEffects = (campaign.player.statusEffects ?? []).filter((effect) => !effect.hidden)
    const key = normalize(binding.key)
    const matchingEffects = key ? statusEffects.filter((effect) => normalize(effect.category) === key || normalize(effect.name) === key) : statusEffects
    const matchingConditions = key ? campaign.player.conditions.filter((condition) => normalize(condition).includes(key)) : campaign.player.conditions
    return { ...fallback, value: matchingEffects.length + matchingConditions.length, min: element.min ?? 0 }
  }
  if (binding.domain === 'scene.tension') return { value: campaign.scene.tension, min: element.min ?? 0, max: element.max ?? 100, unit: element.unit ?? '%' }
  if (binding.domain === 'world.day') return { ...fallback, value: campaign.world.calendar.day }
  if (binding.domain === 'faction.reputation') {
    const reputation = (campaign.factionReputation ?? []).find((entry) => same(entry.factionName, binding.key ?? binding.target))
    return reputation ? { value: reputation.value, min: element.min ?? -100, max: element.max ?? 100, unit: element.unit } : fallback
  }
  if (binding.domain === 'inventory.category-count') {
    const value = campaign.inventory
      .filter((item) => !binding.key || same(item.category, binding.key))
      .reduce((total, item) => total + item.quantity, 0)
    return { ...fallback, value, min: element.min ?? 0 }
  }
  if (binding.domain === 'inventory.item-charges') {
    const item = campaign.inventory.find((entry) => same(entry.id, binding.target) || same(entry.name, binding.target))
    return item?.charges !== undefined
      ? { value: item.charges, min: element.min ?? 0, max: element.max ?? item.maxCharges, unit: element.unit }
      : fallback
  }
  if (binding.domain === 'quest.active-count') return { ...fallback, value: campaign.quests.filter((quest) => quest.status === 'active').length, min: element.min ?? 0 }

  const npc = campaign.npcs.find((entry) => same(entry.id, binding.target) || same(entry.name, binding.target))
  if (binding.domain === 'npc.relationship') return npc ? { value: npc.relationship, min: element.min ?? -100, max: element.max ?? 100, unit: element.unit } : fallback
  if (binding.domain === 'npc.resource') {
    const resource = npc?.resources?.find((entry) => matchesKey(binding.key, entry))
    return resource ? { value: resource.value, min: element.min ?? 0, max: element.max ?? resource.max, unit: element.unit } : fallback
  }
  return fallback
}
