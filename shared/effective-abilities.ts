import type { Ability, AbilityKind, ArtifactPower, Campaign, InventoryItem, Rarity } from './types.js'
import { artifactPowerKnowledge, artifactSectionKnown } from './artifacts.js'

export interface GrantedItemAbility {
  ability: Ability
  itemId: string
  itemName: string
  itemRarity: Rarity
  available: boolean
  blockers: string[]
  equipped: boolean
  synthetic: boolean
}

const unique = (values: Array<string | undefined>) => [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))]
const rarityRanks: Record<Rarity, string> = {
  common: 'Обычный', uncommon: 'Необычный', rare: 'Редкий', exceptional: 'Исключительный',
  epic: 'Эпический', legendary: 'Легендарный', mythic: 'Мифический', transcendent: 'Трансцендентный',
}

function abilityKind(power: ArtifactPower): AbilityKind {
  const activation = `${power.activation ?? ''} ${power.trigger ?? ''}`.toLocaleLowerCase('ru-RU')
  if (/(постоян|пассив|всегда|аур|constant|passive)/u.test(activation)) return 'passive'
  if (power.trigger?.trim()) return 'reaction'
  if (/(ритуал|ritual)/u.test(activation)) return 'ritual'
  if (/(форм|превращ|трансформа|transformation)/u.test(activation)) return 'transformation'
  return 'active'
}

function accessBlockers(item: InventoryItem): string[] {
  const blockers: string[] = []
  if (item.quantity <= 0) blockers.push('Предмет отсутствует')
  if (item.state === 'broken') blockers.push('Предмет сломан')
  if (item.state === 'depleted') blockers.push('Заряды исчерпаны')
  if (item.state === 'sealed') blockers.push('Предмет запечатан')
  if (item.artifact && !item.artifact.awakened) blockers.push(item.artifact.sentient ? 'Артефакт ещё не пробуждён' : 'Предмет не активирован')
  if (!item.equipped) blockers.push('Предмет не экипирован')
  return blockers
}

function powerAsAbility(item: InventoryItem, power: ArtifactPower): Ability {
  const artifact = item.artifact!
  return {
    id: `item-power:${item.id}:${power.id}`,
    name: power.name,
    description: power.description,
    rank: artifact.classification || rarityRanks[item.rarity],
    source: `Предмет: ${item.name}`,
    kind: abilityKind(power),
    mastery: power.mastery,
    costs: power.costs,
    effects: unique(power.capabilities ?? []),
    limitations: unique([...(power.limitations ?? []), ...(artifact.drawbacks ?? []), ...(artifact.failureModes ?? [])]),
    requirements: unique(artifact.requirements ?? []),
    progression: artifact.evolutionPaths?.length ? 'Развивается вместе с предметом и его путями эволюции.' : undefined,
    evolutionPaths: artifact.evolutionPaths,
    history: item.history,
    tags: unique(['сила предмета', item.rarity, artifact.classification]),
    category: power.category,
    scale: power.scale ?? artifact.scale,
    activation: power.activation ?? power.trigger,
    capabilities: power.capabilities,
    synergies: unique([...(power.synergies ?? []), ...(artifact.combinedEffects ?? [])]),
    counters: power.counters,
    examples: power.examples,
    techniques: power.techniques,
    canonStatus: power.canonStatus ?? artifact.canonStatus,
    canonReference: power.canonReference ?? artifact.canonReference,
  }
}

function passiveAsAbility(item: InventoryItem): Ability | undefined {
  const artifact = item.artifact
  if (!artifact || (!artifact.passiveEffects.length && !artifact.combinedEffects.length)) return undefined
  if (!artifactSectionKnown(item, 'passives') && !artifactSectionKnown(item, 'combined')) return undefined
  return {
    id: `item-passive:${item.id}`,
    name: `Пассивные свойства: ${item.name}`,
    description: artifact.operatingPrinciple || `Постоянные и объединённые эффекты предмета «${item.name}».`,
    rank: artifact.classification || rarityRanks[item.rarity],
    source: `Предмет: ${item.name}`,
    kind: 'passive',
    mastery: artifact.mastery ?? artifact.attunement,
    effects: artifact.passiveEffects,
    requirements: artifact.requirements,
    limitations: unique([...(artifact.drawbacks ?? []), ...(artifact.failureModes ?? [])]),
    capabilities: unique([...(artifact.passiveEffects ?? []), ...(artifact.combinedEffects ?? [])]),
    synergies: artifact.combinedEffects,
    evolutionPaths: artifact.evolutionPaths,
    history: item.history,
    scale: artifact.scale,
    canonStatus: artifact.canonStatus,
    canonReference: artifact.canonReference,
    tags: unique(['пассив предмета', item.rarity, artifact.classification]),
  }
}

/**
 * Item-granted powers are projected from their canonical inventory record. They are
 * deliberately not copied into player.abilities, preventing two cards from drifting
 * apart after an upgrade, theft, breakage or loss.
 */
export function grantedItemAbilities(campaign: Pick<Campaign, 'inventory'>): GrantedItemAbility[] {
  return campaign.inventory.flatMap((item) => {
    if (!item.artifact) return []
    const blockers = accessBlockers(item)
    const passive = passiveAsAbility(item)
    const abilities = [
      ...item.artifact.powers
        .filter((power) => {
          const knowledge = artifactPowerKnowledge(item, power.id)
          return knowledge === 'known' || knowledge === 'understood'
        })
        .map((power) => ({ ability: powerAsAbility(item, power), synthetic: false })),
      ...(passive ? [{ ability: passive, synthetic: true }] : []),
    ]
    return abilities.map(({ ability, synthetic }) => ({
      ability,
      itemId: item.id,
      itemName: item.name,
      itemRarity: item.rarity,
      available: blockers.length === 0,
      blockers,
      equipped: item.equipped,
      synthetic,
    }))
  })
}

export function activeItemAbilities(campaign: Pick<Campaign, 'inventory'>): Ability[] {
  return grantedItemAbilities(campaign).filter((entry) => entry.available).map((entry) => entry.ability)
}

export function effectivePlayerAbilities(campaign: Pick<Campaign, 'player' | 'inventory'>, includeUnavailable = false): Ability[] {
  const granted = grantedItemAbilities(campaign).filter((entry) => includeUnavailable || entry.available).map((entry) => entry.ability)
  return [...campaign.player.abilities, ...granted]
}
