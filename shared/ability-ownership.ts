import type { Ability, AbilityDraft, ArtifactPower, InventoryItem } from './types.js'

type AbilityLike = Pick<Ability | AbilityDraft,
  'id' | 'name' | 'description' | 'source' | 'tags' | 'requirements' | 'effects' | 'capabilities' | 'canonReference' | 'profile'
>

type ItemPowerLike = Pick<ArtifactPower,
  'id' | 'name' | 'description' | 'capabilities' | 'canonReference'
>

export type AbilityOwnershipItem = Pick<InventoryItem, 'name' | 'category'> & {
  id?: string
  artifact?: {
    canonReference?: string
    powers: ItemPowerLike[]
  }
}

export interface ItemOwnedAbilityMatch {
  abilityId?: string
  abilityName: string
  itemId?: string
  itemName: string
  powerId?: string
  powerName?: string
  reason: 'explicit-item-source' | 'matching-item-power' | 'matching-canon-power'
}

const stopWords = new Set([
  'эта', 'этот', 'это', 'того', 'для', 'при', 'через', 'может', 'позволяет', 'способность', 'способности', 'сила', 'силы',
  'героя', 'владельца', 'своего', 'своей', 'его', 'или', 'как', 'что', 'the', 'and', 'with', 'from', 'ability', 'power',
])

export function normalizeAbilityOwnershipText(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/gu, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function tokens(value: string): Set<string> {
  return new Set(normalizeAbilityOwnershipText(value)
    .split(' ')
    .filter((token) => token.length >= 4 && !stopWords.has(token)))
}

function overlap(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return { ratio: 0, shared: 0 }
  let shared = 0
  left.forEach((token) => { if (right.has(token)) shared += 1 })
  return { ratio: shared / Math.min(left.size, right.size), shared }
}

function abilityText(ability: AbilityLike): string {
  return [
    ability.name, ability.description, ability.source, ability.canonReference,
    ...(ability.tags ?? []), ...(ability.requirements ?? []), ...(ability.effects ?? []), ...(ability.capabilities ?? []),
    ability.profile?.creativeIdentity?.centralPrinciple,
    ability.profile?.creativeIdentity?.originPattern,
    ability.profile?.nature?.explanation,
  ].filter(Boolean).join(' ')
}

function powerText(power: ItemPowerLike): string {
  return [power.name, power.description, power.canonReference, ...(power.capabilities ?? [])].filter(Boolean).join(' ')
}

function declaresPermanentPersonalOwnership(ability: AbilityLike): boolean {
  return /(?:навсегда\s+(?:переш|перенес|закреп|встроен|стал)|необратим\p{L}*\s+(?:перенос|слиян|передач|встраиван)|постоянно\s+(?:переш|перенес|закреп)|без\s+(?:предмета|артефакта|оружия)|не\s+зависит\s+от\s+(?:предмета|артефакта)|сохраняется\s+после\s+(?:утраты|потери|уничтожения)|встроен\p{L}*\s+в\s+(?:тело|душу|сознание)|стал\p{L}*\s+(?:личной|врожденной|собственной)\s+сил)/iu.test(abilityText(ability))
}

function explicitItemSource(ability: AbilityLike, item: AbilityOwnershipItem): boolean {
  const rawProvenance = [
    ability.source,
    ...(ability.tags ?? []),
    ...(ability.requirements ?? []),
    ability.profile?.creativeIdentity?.originPattern,
    ability.profile?.nature?.explanation,
  ].filter(Boolean).join(' ')
  const provenance = normalizeAbilityOwnershipText(rawProvenance)
  const itemName = normalizeAbilityOwnershipText(item.name)
  const directProjection = /(?:сила|пассив|дар)\s+(?:предмета|артефакта|реликвии|оружия)|(?:предмет|артефакт|реликвия|оружие|item|artifact|relic)\s*:/iu.test(rawProvenance)
  if (directProjection) return true
  if (itemName.length < 4 || !provenance.includes(itemName)) return false
  return /(?:дарует|предоставляет|дает|даёт|существует\s+пока|доступна\s+пока|активируется\s+через|зависит\s+от|требует\s+(?:владения|экипировки|ношения))/iu.test(rawProvenance)
}

/**
 * Finds only confident cases where a supposed personal ability is actually projected by an item.
 * A permanent, explicitly established transfer remains a personal ability even when it originated
 * from an artifact.
 */
export function itemOwnedAbilityMatch(
  ability: AbilityLike,
  inventory: AbilityOwnershipItem[],
): ItemOwnedAbilityMatch | undefined {
  if (declaresPermanentPersonalOwnership(ability)) return undefined
  const normalizedAbilityName = normalizeAbilityOwnershipText(ability.name)
  const abilityTokens = tokens(abilityText(ability))

  for (const item of inventory) {
    if (!item.artifact) continue
    const linkedBySource = explicitItemSource(ability, item)
    if (linkedBySource) {
      const closestPower = item.artifact.powers.find((power) => normalizeAbilityOwnershipText(power.name) === normalizedAbilityName)
      return {
        abilityId: ability.id,
        abilityName: ability.name,
        itemId: item.id,
        itemName: item.name,
        powerId: closestPower?.id,
        powerName: closestPower?.name,
        reason: 'explicit-item-source',
      }
    }

    for (const power of item.artifact.powers) {
      const sameName = normalizeAbilityOwnershipText(power.name) === normalizedAbilityName
      const similarity = overlap(abilityTokens, tokens(powerText(power)))
      const abilityCanon = normalizeAbilityOwnershipText(ability.canonReference)
      const powerCanon = normalizeAbilityOwnershipText(power.canonReference ?? item.artifact.canonReference)
      const sameCanon = Boolean(abilityCanon && powerCanon && abilityCanon === powerCanon)
      if ((sameName && similarity.shared >= 2 && similarity.ratio >= 0.45) || (similarity.shared >= 5 && similarity.ratio >= 0.82)) {
        return {
          abilityId: ability.id,
          abilityName: ability.name,
          itemId: item.id,
          itemName: item.name,
          powerId: power.id,
          powerName: power.name,
          reason: 'matching-item-power',
        }
      }
      if (sameName && sameCanon) {
        return {
          abilityId: ability.id,
          abilityName: ability.name,
          itemId: item.id,
          itemName: item.name,
          powerId: power.id,
          powerName: power.name,
          reason: 'matching-canon-power',
        }
      }
    }
  }
  return undefined
}

export function separatePersonalAbilities<T extends AbilityLike>(abilities: T[], inventory: AbilityOwnershipItem[]) {
  const personal: T[] = []
  const itemOwned: Array<{ ability: T; match: ItemOwnedAbilityMatch }> = []
  abilities.forEach((ability) => {
    const match = itemOwnedAbilityMatch(ability, inventory)
    if (match) itemOwned.push({ ability, match })
    else personal.push(ability)
  })
  return { personal, itemOwned }
}
