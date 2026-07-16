import type {
  Ability,
  ArtifactPower,
  ArtifactProfile,
  Campaign,
  InventoryItem,
  StateChange,
  StateChangeKind,
  Stat,
  StatusEffect,
} from '../../shared/types'
import { getNpcDisclosure } from './npc-disclosure'

type ChangeTone = StateChange['tone']

const normalized = (value: string) => value.trim().toLocaleLowerCase('ru-RU')
const signed = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value)}`
const short = (value: string, limit = 96) => value.length <= limit ? value : `${value.slice(0, limit - 1)}…`
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
const threatTierLabels = { minor: 'незначительная', capable: 'опытная', dangerous: 'опасная', elite: 'элитная', legendary: 'легендарная', mythic: 'мифическая' } as const
const storyBeatLabels = { respite: 'передышка', setup: 'завязка', exploration: 'исследование', rising: 'нарастание', challenge: 'испытание', aftermath: 'последствия', climax: 'кульминация' } as const
const challengeTierLabels = { none: 'без испытания', light: 'лёгкая', standard: 'обычная', hard: 'сложная', severe: 'крайне опасная', legendary: 'легендарная', mythic: 'мифическая' } as const
const pressureTierLabels = { trace: 'слабый след', local: 'местное', serious: 'серьёзное', critical: 'критическое', legendary: 'легендарное', mythic: 'мифическое' } as const
const pressureStageLabels = { watching: 'наблюдение', investigating: 'расследование', preparing: 'подготовка', acting: 'действие', cooling: 'ослабление', resolved: 'завершено' } as const
const legendStageLabels = { notable: 'заметная фигура', renowned: 'прославленная фигура', legendary: 'легендарная личность', mythic: 'фигура эпохи' } as const
const legendLifeLabels = { living: 'жив', dead: 'мёртв', missing: 'пропал', sealed: 'запечатан', dormant: 'неактивен', returned: 'вернулся', ascended: 'покинул смертную жизнь', unknown: 'судьба неизвестна' } as const

function byId<T extends { id: string }>(values: T[] | undefined): Map<string, T> {
  return new Map((values ?? []).map((value) => [value.id, value]))
}

function byKey<T extends { key: string }>(values: T[] | undefined): Map<string, T> {
  return new Map((values ?? []).map((value) => [normalized(value.key), value]))
}

function positiveDeltaTone(delta: number): ChangeTone {
  return delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral'
}

function resourceDeltaTone(kind: string | undefined, delta: number, after: number, criticalBelow?: number): ChangeTone {
  if (criticalBelow !== undefined && after <= criticalBelow) return 'warning'
  if (kind === 'hunger') return delta > 0 ? 'negative' : delta < 0 ? 'positive' : 'neutral'
  return positiveDeltaTone(delta)
}

function effectTone(effect: StatusEffect, removed = false): ChangeTone {
  const beneficial = effect.category === 'buff' || effect.category === 'blessing'
  if (removed) return beneficial ? 'warning' : 'positive'
  return beneficial ? 'positive' : effect.category === 'other' ? 'warning' : 'negative'
}

function effectDuration(effect: StatusEffect): string {
  const { duration } = effect
  if (duration.expiresTurn !== undefined) return `до хода ${duration.expiresTurn}`
  if (duration.unit === 'turns') return duration.remaining === undefined ? 'на несколько ходов' : `${duration.remaining} ход.`
  if (duration.unit === 'scenes') return duration.remaining === undefined ? 'на несколько сцен' : `${duration.remaining} сцен.`
  if (duration.unit === 'days') return duration.remaining === undefined ? 'на несколько дней' : `${duration.remaining} дн.`
  if (duration.unit === 'until') return duration.condition ? `до: ${duration.condition}` : 'до выполнения условия'
  return 'бессрочно'
}

function metricChanges(
  changes: StateChange[],
  beforeValues: Stat[] | undefined,
  afterValues: Stat[] | undefined,
  kind: 'stat' | 'resource',
  entityId: string,
  labelPrefix = '',
) {
  const before = byKey(beforeValues)
  const after = byKey(afterValues)
  const keys = new Set([...before.keys(), ...after.keys()])
  keys.forEach((key) => {
    const oldMetric = before.get(key)
    const newMetric = after.get(key)
    const label = `${labelPrefix}${newMetric?.label ?? oldMetric?.label ?? key}`
    if (!oldMetric && newMetric) {
      changes.push({
        kind: kind === 'resource' && (newMetric as { kind?: string }).kind === 'health' ? 'health' : kind,
        label,
        detail: `Добавлено: ${newMetric.value}${newMetric.max !== undefined ? ` / ${newMetric.max}` : ''}`,
        tone: 'neutral',
        entityId,
        after: newMetric.value,
        source: 'state-engine',
      })
      return
    }
    if (oldMetric && !newMetric) {
      changes.push({
        kind,
        label,
        detail: `Удалено (было ${oldMetric.value}${oldMetric.max !== undefined ? ` / ${oldMetric.max}` : ''})`,
        tone: 'warning',
        entityId,
        before: oldMetric.value,
        source: 'state-engine',
      })
      return
    }
    if (!oldMetric || !newMetric) return
    if (oldMetric.value !== newMetric.value) {
      const delta = newMetric.value - oldMetric.value
      const resourceKind = (newMetric as { kind?: string }).kind
      const health = kind === 'resource' && resourceKind === 'health'
      changes.push({
        kind: health ? 'health' : kind,
        label,
        detail: `${oldMetric.value} → ${newMetric.value}${newMetric.max !== undefined ? ` / ${newMetric.max}` : ''} (${signed(delta)})`,
        tone: kind === 'resource'
          ? resourceDeltaTone(resourceKind, delta, newMetric.value, (newMetric as { criticalBelow?: number }).criticalBelow)
          : positiveDeltaTone(delta),
        entityId,
        before: oldMetric.value,
        after: newMetric.value,
        delta,
        source: 'state-engine',
      })
    } else if (oldMetric.max !== newMetric.max || oldMetric.label !== newMetric.label || oldMetric.description !== newMetric.description) {
      changes.push({
        kind,
        label,
        detail: oldMetric.max !== newMetric.max
          ? `Предел: ${oldMetric.max ?? '∞'} → ${newMetric.max ?? '∞'}`
          : 'Описание характеристики обновлено',
        tone: 'neutral',
        entityId,
        before: oldMetric.max,
        after: newMetric.max,
        source: 'state-engine',
      })
    }
  })
}

function statusEffectChanges(
  changes: StateChange[],
  beforeValues: StatusEffect[] | undefined,
  afterValues: StatusEffect[] | undefined,
  entityId: string,
  labelPrefix = '',
) {
  const before = byId(beforeValues)
  const after = byId(afterValues)
  const ids = new Set([...before.keys(), ...after.keys()])
  ids.forEach((effectId) => {
    const oldEffect = before.get(effectId)
    const newEffect = after.get(effectId)
    if (!oldEffect && newEffect) {
      changes.push({
        kind: 'condition',
        label: `${labelPrefix}${newEffect.name}`,
        detail: `Получено: ${short(newEffect.description)} · ${effectDuration(newEffect)}`,
        tone: effectTone(newEffect),
        entityId,
        after: newEffect.severity,
        source: newEffect.source || 'state-engine',
      })
      return
    }
    if (oldEffect && !newEffect) {
      changes.push({
        kind: 'condition',
        label: `${labelPrefix}${oldEffect.name}`,
        detail: 'Эффект завершён или снят',
        tone: effectTone(oldEffect, true),
        entityId,
        before: oldEffect.severity,
        source: oldEffect.source || 'state-engine',
      })
      return
    }
    if (!oldEffect || !newEffect || same(oldEffect, newEffect)) return
    const parts: string[] = []
    if (oldEffect.severity !== newEffect.severity) parts.push(`тяжесть ${oldEffect.severity} → ${newEffect.severity}`)
    if (oldEffect.stacks !== newEffect.stacks) parts.push(`стаки ${oldEffect.stacks} → ${newEffect.stacks}`)
    if (!same(oldEffect.duration, newEffect.duration)) parts.push(`срок: ${effectDuration(newEffect)}`)
    changes.push({
      kind: 'condition',
      label: `${labelPrefix}${newEffect.name}`,
      detail: parts.length ? parts.join(' · ') : 'Параметры эффекта обновлены',
      tone: effectTone(newEffect),
      entityId,
      before: oldEffect.severity,
      after: newEffect.severity,
      delta: newEffect.severity - oldEffect.severity || undefined,
      source: newEffect.source || 'state-engine',
    })
  })
}

function artifactChanges(changes: StateChange[], item: InventoryItem, before: ArtifactProfile | undefined, after: ArtifactProfile | undefined) {
  if (!before && !after) return
  if (!before && after) {
    changes.push({ kind: 'artifact', label: item.name, detail: `Раскрыт артефакт: ${after.powers.length} сил`, tone: 'positive', entityId: item.id, source: 'state-engine' })
    return
  }
  if (before && !after) {
    changes.push({ kind: 'artifact', label: item.name, detail: 'Свойства артефакта утрачены', tone: 'negative', entityId: item.id, source: 'state-engine' })
    return
  }
  if (!before || !after) return
  if (before.mastery !== after.mastery) {
    const oldValue = before.mastery
    const newValue = after.mastery
    const delta = oldValue !== undefined && newValue !== undefined ? newValue - oldValue : undefined
    changes.push({
      kind: 'artifact',
      label: `${item.name}: общее освоение`,
      detail: `${oldValue === undefined ? 'не отслеживалось' : oldValue} → ${newValue === undefined ? 'не отслеживается' : newValue}${delta === undefined ? '' : ` (${signed(delta)})`}`,
      tone: delta === undefined ? 'neutral' : positiveDeltaTone(delta),
      entityId: item.id,
      before: oldValue,
      after: newValue,
      delta,
      source: 'state-engine',
    })
  }
  const numeric: Array<[string, number, number]> = [
    ['Настройка', before.attunement, after.attunement],
    ['Связь', before.bond, after.bond],
  ]
  numeric.forEach(([name, oldValue, newValue]) => {
    if (oldValue === newValue) return
    const delta = newValue - oldValue
    changes.push({ kind: 'artifact', label: `${item.name}: ${name}`, detail: `${oldValue} → ${newValue} (${signed(delta)})`, tone: positiveDeltaTone(delta), entityId: item.id, before: oldValue, after: newValue, delta, source: 'state-engine' })
  })
  if (before.awakened !== after.awakened) {
    changes.push({ kind: 'artifact', label: item.name, detail: after.awakened ? 'Артефакт пробуждён' : 'Артефакт уснул', tone: after.awakened ? 'positive' : 'warning', entityId: item.id, before: before.awakened ? 'пробуждён' : 'спит', after: after.awakened ? 'пробуждён' : 'спит', source: 'state-engine' })
  }
  if (before.mood !== after.mood) {
    changes.push({ kind: 'artifact', label: `${item.name}: настроение`, detail: `${before.mood ?? 'неизвестно'} → ${after.mood ?? 'неизвестно'}`, tone: 'neutral', entityId: item.id, before: before.mood, after: after.mood, source: 'state-engine' })
  }
  const oldPowers = byId(before.powers)
  const newPowers = byId(after.powers)
  new Set([...oldPowers.keys(), ...newPowers.keys()]).forEach((powerId) => {
    const oldPower = oldPowers.get(powerId)
    const newPower = newPowers.get(powerId)
    if (!oldPower && newPower) changes.push({ kind: 'artifact', label: `${item.name}: ${newPower.name}`, detail: 'Открыта новая сила', tone: 'positive', entityId: item.id, source: 'state-engine' })
    else if (oldPower && !newPower) changes.push({ kind: 'artifact', label: `${item.name}: ${oldPower.name}`, detail: 'Сила утрачена', tone: 'negative', entityId: item.id, source: 'state-engine' })
    else if (oldPower && newPower) {
      if (oldPower.mastery !== newPower.mastery) {
        const delta = newPower.mastery - oldPower.mastery
        changes.push({ kind: 'artifact', label: `${item.name}: ${newPower.name}`, detail: `Мастерство ${oldPower.mastery} → ${newPower.mastery} (${signed(delta)})`, tone: positiveDeltaTone(delta), entityId: item.id, before: oldPower.mastery, after: newPower.mastery, delta, source: 'state-engine' })
      }
      const oldDetails = structuredClone(oldPower) as Partial<ArtifactPower>
      const newDetails = structuredClone(newPower) as Partial<ArtifactPower>
      delete oldDetails.mastery
      delete newDetails.mastery
      if (!same(oldDetails, newDetails)) changes.push({ kind: 'artifact', label: `${item.name}: ${newPower.name}`, detail: 'Описание и параметры силы обновлены', tone: 'positive', entityId: item.id, source: 'state-engine' })
    }
  })
  const structuralBefore = { classification: before.classification, powerSource: before.powerSource, operatingPrinciple: before.operatingPrinciple, scale: before.scale, requirements: before.requirements, components: before.components, passiveEffects: before.passiveEffects, combinedEffects: before.combinedEffects, failureModes: before.failureModes, drawbacks: before.drawbacks, evolutionPaths: before.evolutionPaths }
  const structuralAfter = { classification: after.classification, powerSource: after.powerSource, operatingPrinciple: after.operatingPrinciple, scale: after.scale, requirements: after.requirements, components: after.components, passiveEffects: after.passiveEffects, combinedEffects: after.combinedEffects, failureModes: after.failureModes, drawbacks: after.drawbacks, evolutionPaths: after.evolutionPaths }
  if (!same(structuralBefore, structuralAfter)) {
    changes.push({ kind: 'artifact', label: item.name, detail: 'Структура, эффекты или пути развития артефакта обновлены', tone: 'neutral', entityId: item.id, source: 'state-engine' })
  }
}

function abilityChanges(changes: StateChange[], beforeValues: Ability[], afterValues: Ability[], entityId: string, prefix = '') {
  const before = byId(beforeValues)
  const after = byId(afterValues)
  new Set([...before.keys(), ...after.keys()]).forEach((abilityId) => {
    const oldAbility = before.get(abilityId)
    const newAbility = after.get(abilityId)
    if (!oldAbility && newAbility) {
      changes.push({ kind: 'ability', label: `${prefix}${newAbility.name}`, detail: 'Получена новая способность', tone: 'positive', entityId, source: 'state-engine' })
      return
    }
    if (oldAbility && !newAbility) {
      changes.push({ kind: 'ability', label: `${prefix}${oldAbility.name}`, detail: 'Способность утрачена', tone: 'negative', entityId, source: 'state-engine' })
      return
    }
    if (!oldAbility || !newAbility || same(oldAbility, newAbility)) return
    if ((oldAbility.mastery ?? 0) !== (newAbility.mastery ?? 0)) {
      const oldValue = oldAbility.mastery ?? 0
      const newValue = newAbility.mastery ?? 0
      const delta = newValue - oldValue
      changes.push({ kind: 'ability', label: `${prefix}${newAbility.name}`, detail: `Мастерство ${oldValue} → ${newValue} (${signed(delta)})`, tone: positiveDeltaTone(delta), entityId, before: oldValue, after: newValue, delta, source: 'state-engine' })
    }
    const detailsBefore = { ...oldAbility, mastery: undefined, history: undefined }
    const detailsAfter = { ...newAbility, mastery: undefined, history: undefined }
    if (!same(detailsBefore, detailsAfter)) changes.push({ kind: 'ability', label: `${prefix}${newAbility.name}`, detail: 'Свойства или развитие способности обновлены', tone: 'neutral', entityId, source: 'state-engine' })
  })
}

function stringSetChanges(changes: StateChange[], beforeValues: string[], afterValues: string[], kind: StateChangeKind, label: string) {
  const before = new Map(beforeValues.map((value) => [normalized(value), value]))
  const after = new Map(afterValues.map((value) => [normalized(value), value]))
  after.forEach((value, key) => {
    if (!before.has(key)) changes.push({ kind, label, detail: `Добавлено: ${short(value)}`, tone: 'neutral', source: 'state-engine' })
  })
  before.forEach((value, key) => {
    if (!after.has(key)) changes.push({ kind, label, detail: `Удалено: ${short(value)}`, tone: 'neutral', source: 'state-engine' })
  })
}

function collectionChanges<T extends { id: string }>(
  changes: StateChange[],
  beforeValues: T[] | undefined,
  afterValues: T[] | undefined,
  kind: StateChangeKind,
  labelOf: (value: T) => string,
  statusOf?: (value: T) => string | number,
) {
  const before = byId(beforeValues)
  const after = byId(afterValues)
  new Set([...before.keys(), ...after.keys()]).forEach((entryId) => {
    const oldEntry = before.get(entryId)
    const newEntry = after.get(entryId)
    if (!oldEntry && newEntry) changes.push({ kind, label: labelOf(newEntry), detail: 'Добавлено', tone: 'neutral', entityId: entryId, source: 'state-engine' })
    else if (oldEntry && !newEntry) changes.push({ kind, label: labelOf(oldEntry), detail: 'Удалено', tone: 'warning', entityId: entryId, source: 'state-engine' })
    else if (oldEntry && newEntry && !same(oldEntry, newEntry)) {
      const oldStatus = statusOf?.(oldEntry)
      const newStatus = statusOf?.(newEntry)
      changes.push({ kind, label: labelOf(newEntry), detail: oldStatus !== undefined && newStatus !== undefined && oldStatus !== newStatus ? `${oldStatus} → ${newStatus}` : 'Состояние обновлено', tone: 'neutral', entityId: entryId, before: oldStatus, after: newStatus, source: 'state-engine' })
    }
  })
}

export function diffCampaignState(before: Campaign, after: Campaign): StateChange[] {
  const changes: StateChange[] = []
  const heroId = after.player.id

  const playerFields: Array<[keyof Campaign['player'], string]> = [
    ['name', 'Имя героя'], ['archetype', 'Архетип'], ['appearance', 'Внешность'], ['personality', 'Характер'],
    ['backstory', 'Предыстория'], ['goal', 'Цель'],
  ]
  playerFields.forEach(([field, label]) => {
    const oldValue = String(before.player[field] ?? '')
    const newValue = String(after.player[field] ?? '')
    if (oldValue === newValue) return
    changes.push({ kind: 'character', label, detail: `${short(oldValue)} → ${short(newValue)}`, tone: 'neutral', entityId: heroId, before: short(oldValue), after: short(newValue), source: 'state-engine' })
  })
  if (before.player.level !== after.player.level) {
    const delta = after.player.level - before.player.level
    changes.push({ kind: 'character', label: 'Уровень', detail: `${before.player.level} → ${after.player.level} (${signed(delta)})`, tone: positiveDeltaTone(delta), entityId: heroId, before: before.player.level, after: after.player.level, delta, source: 'state-engine' })
  }
  const beforeLife = before.player.lifeState ?? 'active'
  const afterLife = after.player.lifeState ?? 'active'
  if (beforeLife !== afterLife) {
    const dangerous = afterLife !== 'active'
    changes.push({ kind: 'health', label: 'Состояние жизни', detail: `${beforeLife} → ${afterLife}`, tone: dangerous ? 'negative' : 'positive', entityId: heroId, before: beforeLife, after: afterLife, source: 'state-engine' })
  }

  metricChanges(changes, before.player.stats, after.player.stats, 'stat', heroId)
  metricChanges(changes, before.player.resources, after.player.resources, 'resource', heroId)

  const currencies = new Set([...Object.keys(before.player.currency ?? {}), ...Object.keys(after.player.currency ?? {})])
  currencies.forEach((currency) => {
    const oldValue = before.player.currency?.[currency] ?? 0
    const newValue = after.player.currency?.[currency] ?? 0
    if (oldValue === newValue) return
    const delta = newValue - oldValue
    changes.push({ kind: 'currency', label: currency, detail: `${oldValue} → ${newValue} (${signed(delta)})`, tone: positiveDeltaTone(delta), entityId: heroId, before: oldValue, after: newValue, delta, source: 'state-engine' })
  })

  const oldConditions = new Map((before.player.conditions ?? []).map((value) => [normalized(value), value]))
  const newConditions = new Map((after.player.conditions ?? []).map((value) => [normalized(value), value]))
  newConditions.forEach((condition, key) => {
    if (!oldConditions.has(key)) changes.push({ kind: 'condition', label: condition, detail: 'Получено новое состояние', tone: 'warning', entityId: heroId, source: 'state-engine' })
  })
  oldConditions.forEach((condition, key) => {
    if (!newConditions.has(key)) changes.push({ kind: 'condition', label: condition, detail: 'Состояние снято', tone: 'positive', entityId: heroId, source: 'state-engine' })
  })
  statusEffectChanges(changes, before.player.statusEffects ?? [], after.player.statusEffects ?? [], heroId)

  const oldItems = byId(before.inventory)
  const newItems = byId(after.inventory)
  new Set([...oldItems.keys(), ...newItems.keys()]).forEach((itemId) => {
    const oldItem = oldItems.get(itemId)
    const newItem = newItems.get(itemId)
    if (!oldItem && newItem) {
      changes.push({ kind: newItem.artifact ? 'artifact' : 'inventory', label: newItem.name, detail: `Получено ×${newItem.quantity}`, tone: 'positive', entityId: itemId, after: newItem.quantity, source: 'state-engine' })
      artifactChanges(changes, newItem, undefined, newItem.artifact)
      return
    }
    if (oldItem && !newItem) {
      changes.push({ kind: oldItem.artifact ? 'artifact' : 'inventory', label: oldItem.name, detail: `Удалено ×${oldItem.quantity}`, tone: 'negative', entityId: itemId, before: oldItem.quantity, source: 'state-engine' })
      return
    }
    if (!oldItem || !newItem) return
    const numericFields: Array<[keyof InventoryItem, string]> = [['quantity', 'Количество'], ['durability', 'Прочность'], ['charges', 'Заряды']]
    numericFields.forEach(([field, label]) => {
      const oldValue = oldItem[field] as number | undefined
      const newValue = newItem[field] as number | undefined
      if (oldValue === newValue) return
      const delta = (newValue ?? 0) - (oldValue ?? 0)
      changes.push({ kind: 'inventory', label: `${newItem.name}: ${label}`, detail: `${oldValue ?? '—'} → ${newValue ?? '—'}${oldValue !== undefined && newValue !== undefined ? ` (${signed(delta)})` : ''}`, tone: newValue === undefined ? 'warning' : positiveDeltaTone(delta), entityId: itemId, before: oldValue, after: newValue, delta: oldValue !== undefined && newValue !== undefined ? delta : undefined, source: 'state-engine' })
    })
    if (oldItem.equipped !== newItem.equipped || oldItem.equippedSlot !== newItem.equippedSlot) {
      changes.push({ kind: 'inventory', label: newItem.name, detail: newItem.equipped ? `Экипировано${newItem.equippedSlot ? `: ${newItem.equippedSlot}` : ''}` : 'Снято', tone: newItem.equipped ? 'positive' : 'neutral', entityId: itemId, before: oldItem.equipped ? oldItem.equippedSlot ?? 'экипировано' : 'не экипировано', after: newItem.equipped ? newItem.equippedSlot ?? 'экипировано' : 'не экипировано', source: 'state-engine' })
    }
    if (oldItem.state !== newItem.state) {
      changes.push({ kind: 'inventory', label: newItem.name, detail: `Состояние: ${oldItem.state ?? 'не указано'} → ${newItem.state ?? 'не указано'}`, tone: newItem.state === 'broken' || newItem.state === 'depleted' ? 'negative' : newItem.state === 'damaged' ? 'warning' : 'neutral', entityId: itemId, before: oldItem.state, after: newItem.state, source: 'state-engine' })
    }
    const oldProperties = { name: oldItem.name, description: oldItem.description, category: oldItem.category, rarity: oldItem.rarity, rarityProfile: oldItem.rarityProfile, weight: oldItem.weight, effects: oldItem.effects, origin: oldItem.origin }
    const newProperties = { name: newItem.name, description: newItem.description, category: newItem.category, rarity: newItem.rarity, rarityProfile: newItem.rarityProfile, weight: newItem.weight, effects: newItem.effects, origin: newItem.origin }
    if (!same(oldProperties, newProperties)) changes.push({ kind: 'inventory', label: newItem.name, detail: 'Свойства предмета обновлены', tone: 'neutral', entityId: itemId, source: 'state-engine' })
    artifactChanges(changes, newItem, oldItem.artifact, newItem.artifact)
  })

  abilityChanges(changes, before.player.abilities ?? [], after.player.abilities ?? [], heroId)

  const oldNpcs = byId(before.npcs)
  const newNpcs = byId(after.npcs)
  new Set([...oldNpcs.keys(), ...newNpcs.keys()]).forEach((npcId) => {
    const oldNpc = oldNpcs.get(npcId)
    const newNpc = newNpcs.get(npcId)
    if (!oldNpc && newNpc) {
      changes.push({ kind: 'character', label: newNpc.name, detail: 'Новый персонаж', tone: 'neutral', entityId: npcId, source: 'state-engine' })
      return
    }
    if (oldNpc && !newNpc) {
      changes.push({ kind: 'character', label: oldNpc.name, detail: 'Персонаж удалён из мира', tone: 'warning', entityId: npcId, source: 'state-engine' })
      return
    }
    if (!oldNpc || !newNpc) return
    const oldDisclosure = getNpcDisclosure(oldNpc)
    const newDisclosure = getNpcDisclosure(newNpc)
    if (oldNpc.relationship !== newNpc.relationship) {
      const delta = newNpc.relationship - oldNpc.relationship
      if (newDisclosure.has('relationship')) changes.push({ kind: 'relationship', label: newNpc.name, detail: `${oldNpc.relationship} → ${newNpc.relationship} (${signed(delta)})`, tone: positiveDeltaTone(delta), entityId: npcId, before: oldNpc.relationship, after: newNpc.relationship, delta, source: 'state-engine' })
    }
    if (oldNpc.status !== newNpc.status && newDisclosure.has('conditions')) changes.push({ kind: 'character', label: newNpc.name, detail: `Статус: ${oldNpc.status} → ${newNpc.status}`, tone: newNpc.status === 'dead' || newNpc.status === 'missing' ? 'negative' : 'neutral', entityId: npcId, before: oldNpc.status, after: newNpc.status, source: 'state-engine' })
    if (oldNpc.currentGoal !== newNpc.currentGoal && newDisclosure.has('goal')) changes.push({ kind: 'character', label: `${newNpc.name}: цель`, detail: `${short(oldNpc.currentGoal)} → ${short(newNpc.currentGoal)}`, tone: 'neutral', entityId: npcId, source: 'state-engine' })
    if (oldNpc.lastSeen !== newNpc.lastSeen && newDisclosure.has('description')) changes.push({ kind: 'character', label: `${newNpc.name}: последнее появление`, detail: `${short(oldNpc.lastSeen)} → ${short(newNpc.lastSeen)}`, tone: 'neutral', entityId: npcId, before: short(oldNpc.lastSeen), after: short(newNpc.lastSeen), source: 'state-engine' })
    if (!same(oldNpc.initiative, newNpc.initiative)) {
      const visible = newDisclosure.has('initiative') && newNpc.initiative?.visibility !== 'hidden'
      if (visible) changes.push({
        kind: 'character',
        label: `${newNpc.name}: инициатива`,
        detail: visible && newNpc.initiative ? `${short(newNpc.initiative.intent)} · следующий шаг: ${short(newNpc.initiative.nextMove)}` : 'Скрытая инициатива персонажа обновлена',
        tone: newNpc.initiative?.urgency !== undefined && newNpc.initiative.urgency >= 75 ? 'warning' : 'neutral',
        entityId: npcId,
        before: oldNpc.initiative?.urgency,
        after: newNpc.initiative?.urgency,
        source: visible ? 'state-engine' : 'hidden-state',
      })
    }
    const oldEvidence = new Set(oldDisclosure.evidence.map((entry) => entry.id))
    newDisclosure.evidence.filter((entry) => !oldEvidence.has(entry.id)).forEach((entry) => changes.push({ kind: 'knowledge', label: `${newNpc.name}: новые сведения`, detail: short(entry.summary), tone: 'positive', entityId: npcId, source: entry.source }))
    const oldNpcProfile = { role: oldNpc.role, description: oldNpc.description, disposition: oldNpc.disposition, notes: oldNpc.notes, voice: oldNpc.voice }
    const newNpcProfile = { role: newNpc.role, description: newNpc.description, disposition: newNpc.disposition, notes: newNpc.notes, voice: newNpc.voice }
    if (!same(oldNpcProfile, newNpcProfile) && ['description', 'personality', 'disposition', 'voice'].some((section) => newDisclosure.has(section as Parameters<typeof newDisclosure.has>[0]))) changes.push({ kind: 'character', label: newNpc.name, detail: 'Известный профиль персонажа уточнён', tone: 'neutral', entityId: npcId, source: 'state-engine' })
    metricChanges(changes, oldDisclosure.stats, newDisclosure.stats, 'stat', npcId, `${newNpc.name}: `)
    metricChanges(changes, oldDisclosure.resources, newDisclosure.resources, 'resource', npcId, `${newNpc.name}: `)
    statusEffectChanges(changes, oldDisclosure.conditions, newDisclosure.conditions, npcId, `${newNpc.name}: `)
    abilityChanges(changes, oldDisclosure.abilities, newDisclosure.abilities, npcId, `${newNpc.name}: `)
    if (!same(oldNpc.strategy, newNpc.strategy)) {
      const visible = ['strategyOverview', 'strategyMetrics', 'strategyPlan', 'strategyDetails', 'countermeasures'].some((section) => newDisclosure.has(section as Parameters<typeof newDisclosure.has>[0])) && newNpc.strategy?.visibility !== 'hidden'
      if (visible) changes.push({
        kind: 'character',
        label: `${newNpc.name}: стратегия`,
        detail: visible && newNpc.strategy ? `Планирование обновлено · горизонт: ${short(newNpc.strategy.planningHorizon)}` : 'Скрытая стратегия персонажа обновлена',
        tone: newNpc.strategy?.strategicSkill !== undefined && newNpc.strategy.strategicSkill >= 80 ? 'warning' : 'neutral',
        entityId: npcId,
        before: oldNpc.strategy?.strategicSkill,
        after: newNpc.strategy?.strategicSkill,
        source: visible ? 'state-engine' : 'hidden-state',
      })
    }
    if (!same(oldNpc.threatProfile, newNpc.threatProfile)) {
      const visible = newDisclosure.has('threatProfile') && newNpc.threatProfile?.visibility !== 'hidden'
      if (visible) changes.push({
        kind: 'character',
        label: visible && newNpc.threatProfile ? `${newNpc.name}: оценка угрозы` : `${newNpc.name}: скрытый масштаб угрозы`,
        detail: visible && newNpc.threatProfile ? `${threatTierLabels[newNpc.threatProfile.tier]} · ${short(newNpc.threatProfile.reputation)}` : 'Скрытые сведения об угрозе обновлены',
        tone: newNpc.threatProfile && ['legendary', 'mythic'].includes(newNpc.threatProfile.tier) ? 'warning' : 'neutral',
        entityId: npcId,
        before: oldNpc.threatProfile?.tier,
        after: newNpc.threatProfile?.tier,
        source: visible ? 'state-engine' : 'hidden-state',
      })
    }
    const dimensions = new Set([...Object.keys(oldNpc.relationshipDimensions ?? {}), ...Object.keys(newNpc.relationshipDimensions ?? {})])
    dimensions.forEach((dimension) => {
      if (!newDisclosure.has('relationshipDimensions')) return
      const oldValue = oldNpc.relationshipDimensions?.[dimension as keyof typeof oldNpc.relationshipDimensions] ?? 0
      const newValue = newNpc.relationshipDimensions?.[dimension as keyof typeof newNpc.relationshipDimensions] ?? 0
      if (oldValue === newValue) return
      const delta = newValue - oldValue
      changes.push({ kind: 'relationship', label: `${newNpc.name}: ${dimension}`, detail: `${oldValue} → ${newValue} (${signed(delta)})`, tone: dimension === 'fear' || dimension === 'suspicion' ? positiveDeltaTone(-delta) : positiveDeltaTone(delta), entityId: npcId, before: oldValue, after: newValue, delta, source: 'state-engine' })
    })
  })

  const oldQuests = byId(before.quests)
  const newQuests = byId(after.quests)
  new Set([...oldQuests.keys(), ...newQuests.keys()]).forEach((questId) => {
    const oldQuest = oldQuests.get(questId)
    const newQuest = newQuests.get(questId)
    if (!oldQuest && newQuest) changes.push({ kind: 'quest', label: newQuest.title, detail: 'Новая цель', tone: 'positive', entityId: questId, after: newQuest.status, source: 'state-engine' })
    else if (oldQuest && !newQuest) changes.push({ kind: 'quest', label: oldQuest.title, detail: 'Цель удалена', tone: 'warning', entityId: questId, before: oldQuest.status, source: 'state-engine' })
    else if (oldQuest && newQuest) {
      if (oldQuest.status !== newQuest.status) changes.push({ kind: 'quest', label: newQuest.title, detail: `${oldQuest.status} → ${newQuest.status}`, tone: newQuest.status === 'completed' ? 'positive' : newQuest.status === 'failed' ? 'negative' : 'neutral', entityId: questId, before: oldQuest.status, after: newQuest.status, source: 'state-engine' })
      const oldObjectives = byId(oldQuest.objectives)
      newQuest.objectives.forEach((objective) => {
        const previous = oldObjectives.get(objective.id)
        if (!previous) changes.push({ kind: 'quest', label: newQuest.title, detail: `Новая задача: ${short(objective.text)}`, tone: 'neutral', entityId: questId, source: 'state-engine' })
        else if (previous.completed !== objective.completed) changes.push({ kind: 'quest', label: newQuest.title, detail: `${objective.completed ? 'Выполнено' : 'Снова активно'}: ${short(objective.text)}`, tone: objective.completed ? 'positive' : 'warning', entityId: questId, source: 'state-engine' })
      })
      const newObjectives = byId(newQuest.objectives)
      oldQuest.objectives.forEach((objective) => {
        if (!newObjectives.has(objective.id)) changes.push({ kind: 'quest', label: newQuest.title, detail: `Задача удалена: ${short(objective.text)}`, tone: 'warning', entityId: questId, source: 'state-engine' })
      })
    }
  })

  const sceneFields: Array<[keyof Campaign['scene'], string]> = [['title', 'Сцена'], ['location', 'Место'], ['time', 'Время'], ['weather', 'Погода'], ['tension', 'Напряжение']]
  sceneFields.forEach(([field, label]) => {
    const oldValue = before.scene[field] as string | number
    const newValue = after.scene[field] as string | number
    if (oldValue === newValue) return
    const delta = typeof oldValue === 'number' && typeof newValue === 'number' ? newValue - oldValue : undefined
    changes.push({ kind: 'scene', label, detail: `${oldValue} → ${newValue}${delta !== undefined ? ` (${signed(delta)})` : ''}`, tone: field === 'tension' && delta !== undefined ? positiveDeltaTone(-delta) : 'neutral', before: oldValue, after: newValue, delta, source: 'state-engine' })
  })
  if (!same(before.scene.presentNpcIds, after.scene.presentNpcIds)) changes.push({ kind: 'scene', label: 'Участники сцены', detail: 'Состав присутствующих изменился', tone: 'neutral', source: 'state-engine' })
  if (!same(before.pacing, after.pacing) && after.pacing) {
    changes.push({
      kind: 'scene',
      label: 'Ритм истории',
      detail: `${storyBeatLabels[after.pacing.beat]} · ${challengeTierLabels[after.pacing.challengeTier]} · интенсивность ${Math.round(after.pacing.intensity)}%`,
      tone: ['severe', 'legendary', 'mythic'].includes(after.pacing.challengeTier) ? 'warning' : after.pacing.beat === 'respite' ? 'positive' : 'neutral',
      before: before.pacing?.intensity,
      after: after.pacing.intensity,
      delta: before.pacing ? after.pacing.intensity - before.pacing.intensity : undefined,
      source: 'state-engine',
    })
  }
  if (!before.activeConflict && after.activeConflict) {
    changes.push({ kind: 'conflict', label: after.activeConflict.title, detail: `Началось противостояние${after.activeConflict.tier ? ` · ${challengeTierLabels[after.activeConflict.tier]}` : ''} · раунд ${after.activeConflict.round}`, tone: 'warning', entityId: after.activeConflict.id, after: after.activeConflict.momentum, source: 'state-engine' })
  } else if (before.activeConflict && !after.activeConflict) {
    changes.push({ kind: 'conflict', label: before.activeConflict.title, detail: 'Противостояние завершено', tone: 'neutral', entityId: before.activeConflict.id, before: before.activeConflict.momentum, source: 'state-engine' })
  } else if (before.activeConflict && after.activeConflict && !same(before.activeConflict, after.activeConflict)) {
    changes.push({ kind: 'conflict', label: after.activeConflict.title, detail: `Раунд ${before.activeConflict.round} → ${after.activeConflict.round} · темп: ${before.activeConflict.momentum} → ${after.activeConflict.momentum}${after.activeConflict.tier ? ` · ${challengeTierLabels[after.activeConflict.tier]}` : ''}`, tone: after.activeConflict.momentum === 'opposition' ? 'warning' : after.activeConflict.momentum === 'player' ? 'positive' : 'neutral', entityId: after.activeConflict.id, before: before.activeConflict.momentum, after: after.activeConflict.momentum, source: 'state-engine' })
  }

  const worldFields: Array<[keyof Campaign['world'], string]> = [['tagline', 'Описание мира'], ['overview', 'Состояние мира'], ['era', 'Эпоха']]
  worldFields.forEach(([field, label]) => {
    const oldValue = String(before.world[field] ?? '')
    const newValue = String(after.world[field] ?? '')
    if (oldValue !== newValue) changes.push({ kind: 'world', label, detail: `${short(oldValue)} → ${short(newValue)}`, tone: 'neutral', source: 'state-engine' })
  })
  if (before.world.calendar.day !== after.world.calendar.day || before.world.calendar.label !== after.world.calendar.label) {
    const delta = after.world.calendar.day - before.world.calendar.day
    changes.push({ kind: 'world', label: 'Календарь', detail: `${before.world.calendar.label}, день ${before.world.calendar.day} → ${after.world.calendar.label}, день ${after.world.calendar.day}`, tone: 'neutral', before: before.world.calendar.day, after: after.world.calendar.day, delta, source: 'state-engine' })
  }
  stringSetChanges(changes, before.world.rules, after.world.rules, 'world', 'Правило мира')
  stringSetChanges(changes, before.world.mysteries, after.world.mysteries, 'world', 'Тайна мира')

  const namedWorldDiff = <T extends { name: string }>(oldValues: T[], newValues: T[], label: string) => {
    const oldMap = new Map(oldValues.map((value) => [normalized(value.name), value]))
    const newMap = new Map(newValues.map((value) => [normalized(value.name), value]))
    newMap.forEach((value, key) => {
      const previous = oldMap.get(key)
      if (!previous) changes.push({ kind: 'world', label: `${label}: ${value.name}`, detail: 'Добавлено', tone: 'neutral', source: 'state-engine' })
      else if (!same(previous, value)) changes.push({ kind: 'world', label: `${label}: ${value.name}`, detail: 'Состояние обновлено', tone: 'neutral', source: 'state-engine' })
    })
    oldMap.forEach((value, key) => {
      if (!newMap.has(key)) changes.push({ kind: 'world', label: `${label}: ${value.name}`, detail: 'Удалено', tone: 'warning', source: 'state-engine' })
    })
  }
  namedWorldDiff(before.world.factions, after.world.factions, 'Фракция')
  namedWorldDiff(before.world.locations, after.world.locations, 'Локация')
  collectionChanges(changes, before.world.routes, after.world.routes, 'world', (route) => `Маршрут: ${route.label}`, (route) => route.discovered ? 'открыт' : 'скрыт')
  collectionChanges(changes, before.world.places, after.world.places, 'world', (place) => `Атлас: ${place.name}`, (place) => place.currentSituation)
  collectionChanges(changes, before.world.processes, after.world.processes, 'world', (process) => `Внешний процесс: ${process.title}`, (process) => `${process.status} · ${Math.round(process.momentum)}%`)
  if (!same(before.world.legendarium, after.world.legendarium) && after.world.legendarium) {
    changes.push({ kind: 'world', label: `Память мира: ${after.world.legendarium.name}`, detail: 'Правила признания и сохранения легенд обновлены', tone: 'neutral', source: 'state-engine' })
  }
  collectionChanges(
    changes,
    before.world.legends,
    after.world.legends,
    'world',
    (legend) => legend.discovery.visibility === 'hidden' ? 'Скрытая историческая линия' : `Легендарная фигура: ${legend.name}`,
    (legend) => legend.discovery.visibility === 'hidden'
      ? 'Скрытое состояние изменилось'
      : `${legendStageLabels[legend.stage]} · ${legendLifeLabels[legend.lifeStatus]} · изучено ${Math.round(legend.discovery.awareness)}%`,
  )
  collectionChanges(changes, before.world.laws, after.world.laws, 'world', (law) => `Закон: ${law.title}`, (law) => law.status)
  collectionChanges(changes, before.world.mechanics, after.world.mechanics, 'world', (mechanic) => `Механика: ${mechanic.name}`, (mechanic) => mechanic.status)
  collectionChanges(changes, before.world.interfaceModules, after.world.interfaceModules, 'world', (module) => `Интерфейс мира: ${module.title}`, (module) => module.elements.length)

  const oldReputation = new Map((before.factionReputation ?? []).map((entry) => [normalized(entry.factionName), entry]))
  const newReputation = new Map((after.factionReputation ?? []).map((entry) => [normalized(entry.factionName), entry]))
  new Set([...oldReputation.keys(), ...newReputation.keys()]).forEach((key) => {
    const oldEntry = oldReputation.get(key)
    const newEntry = newReputation.get(key)
    const oldValue = oldEntry?.value ?? 0
    const newValue = newEntry?.value ?? 0
    const label = newEntry?.factionName ?? oldEntry?.factionName ?? key
    if (oldValue !== newValue) {
      const delta = newValue - oldValue
      changes.push({ kind: 'reputation', label, detail: `${oldValue} → ${newValue} (${signed(delta)})${newEntry?.label ? ` · ${newEntry.label}` : ''}`, tone: positiveDeltaTone(delta), before: oldValue, after: newValue, delta, source: 'state-engine' })
      return
    }
    if (oldEntry?.label !== newEntry?.label || !same(oldEntry?.notes ?? [], newEntry?.notes ?? [])) {
      const newNotes = (newEntry?.notes ?? []).filter((note) => !(oldEntry?.notes ?? []).includes(note))
      changes.push({ kind: 'reputation', label, detail: `${newEntry?.label ?? 'Статус обновлён'}${newNotes.length ? ` · ${short(newNotes.join('; '))}` : ''}`, tone: 'neutral', before: oldEntry?.label, after: newEntry?.label, source: 'state-engine' })
    }
  })

  const npcName = (npcId: string) => after.npcs.find((npc) => npc.id === npcId)?.name ?? before.npcs.find((npc) => npc.id === npcId)?.name ?? npcId
  const oldSocialLinks = byId(before.socialLinks)
  const newSocialLinks = byId(after.socialLinks)
  new Set([...oldSocialLinks.keys(), ...newSocialLinks.keys()]).forEach((linkId) => {
    const oldLink = oldSocialLinks.get(linkId)
    const newLink = newSocialLinks.get(linkId)
    if (oldLink && newLink && same(oldLink, newLink)) return
    const link = newLink ?? oldLink
    if (!link) return
    const label = link.secret ? 'Скрытая социальная связь' : `${npcName(link.fromNpcId)} ↔ ${npcName(link.toNpcId)}: ${link.label}`
    if (!oldLink) changes.push({ kind: 'relationship', label, detail: link.secret ? 'Скрытая связь добавлена' : `Добавлена · ${link.score}`, tone: 'neutral', entityId: linkId, after: link.score, source: link.secret ? 'hidden-state' : 'state-engine' })
    else if (!newLink) changes.push({ kind: 'relationship', label, detail: link.secret ? 'Скрытая связь удалена' : 'Связь удалена', tone: 'warning', entityId: linkId, before: link.score, source: link.secret ? 'hidden-state' : 'state-engine' })
    else {
      const delta = newLink.score - oldLink.score
      changes.push({ kind: 'relationship', label, detail: delta ? `${oldLink.score} → ${newLink.score} (${signed(delta)})` : 'Характер связи обновлён', tone: delta ? positiveDeltaTone(delta) : 'neutral', entityId: linkId, before: oldLink.score, after: newLink.score, delta: delta || undefined, source: link.secret ? 'hidden-state' : 'state-engine' })
    }
  })

  const oldLore = byId(before.lore)
  const newLore = byId(after.lore)
  new Set([...oldLore.keys(), ...newLore.keys()]).forEach((loreId) => {
    const oldEntry = oldLore.get(loreId)
    const newEntry = newLore.get(loreId)
    if (oldEntry && newEntry && same(oldEntry, newEntry)) return
    const entry = newEntry ?? oldEntry
    if (!entry) return
    const concealed = entry.secret && !entry.discovered
    const label = concealed ? 'Скрытая запись мира' : entry.title
    const detail = !oldEntry
      ? concealed ? 'Скрытое знание добавлено в мир' : `Открыто: ${short(entry.content)}`
      : !newEntry ? concealed ? 'Скрытое знание удалено' : 'Запись удалена'
        : !oldEntry.discovered && newEntry.discovered ? `Открыто: ${short(newEntry.content)}` : 'Запись мира обновлена'
    changes.push({ kind: 'knowledge', label, detail, tone: newEntry?.discovered && !oldEntry?.discovered ? 'positive' : 'neutral', entityId: loreId, source: concealed ? 'hidden-state' : 'state-engine' })
  })

  const oldMemories = byId(before.memories)
  ;(after.memories ?? []).forEach((memory) => {
    if (oldMemories.has(memory.id)) return
    changes.push({ kind: 'knowledge', label: 'Новая память', detail: short(memory.content), tone: memory.importance >= 75 ? 'positive' : 'neutral', entityId: memory.id, after: memory.importance, source: 'state-engine' })
  })

  const oldMysteries = byId(before.mysteryCases)
  const newMysteries = byId(after.mysteryCases)
  new Set([...oldMysteries.keys(), ...newMysteries.keys()]).forEach((mysteryId) => {
    const oldMystery = oldMysteries.get(mysteryId)
    const newMystery = newMysteries.get(mysteryId)
    if (!oldMystery && newMystery) {
      changes.push({ kind: 'knowledge', label: `Расследование: ${newMystery.title}`, detail: 'Новое дело', tone: 'neutral', entityId: mysteryId, after: newMystery.status, source: 'state-engine' })
      return
    }
    if (oldMystery && !newMystery) {
      changes.push({ kind: 'knowledge', label: `Расследование: ${oldMystery.title}`, detail: 'Дело удалено', tone: 'warning', entityId: mysteryId, before: oldMystery.status, source: 'state-engine' })
      return
    }
    if (!oldMystery || !newMystery || same(oldMystery, newMystery)) return
    const oldClues = oldMystery.clues.filter((clue) => clue.discovered).length
    const newClues = newMystery.clues.filter((clue) => clue.discovered).length
    const detail = oldMystery.status !== newMystery.status
      ? `${oldMystery.status} → ${newMystery.status}`
      : oldClues !== newClues ? `Открытые улики: ${oldClues} → ${newClues}` : 'Дело обновлено'
    changes.push({ kind: 'knowledge', label: `Расследование: ${newMystery.title}`, detail, tone: newMystery.status === 'solved' ? 'positive' : newMystery.status === 'failed' ? 'negative' : 'neutral', entityId: mysteryId, before: oldMystery.status, after: newMystery.status, source: 'state-engine' })
  })

  const oldPlans = byId(before.antagonistPlans)
  const newPlans = byId(after.antagonistPlans)
  new Set([...oldPlans.keys(), ...newPlans.keys()]).forEach((planId) => {
    const oldPlan = oldPlans.get(planId)
    const newPlan = newPlans.get(planId)
    if (oldPlan && newPlan && same(oldPlan, newPlan)) return
    const plan = newPlan ?? oldPlan
    if (!plan) return
    const label = plan.secret ? 'Скрытый план противника' : `План: ${plan.title}`
    if (!oldPlan) changes.push({ kind: 'world', label, detail: plan.secret ? 'Скрытый план начал действовать' : `Давление: ${plan.pressure}`, tone: plan.pressure >= 70 ? 'warning' : 'neutral', entityId: planId, after: plan.pressure, source: plan.secret ? 'hidden-state' : 'state-engine' })
    else if (!newPlan) changes.push({ kind: 'world', label, detail: plan.secret ? 'Скрытый план завершён' : 'План удалён', tone: 'neutral', entityId: planId, before: plan.pressure, source: plan.secret ? 'hidden-state' : 'state-engine' })
    else changes.push({ kind: 'world', label, detail: `${oldPlan.status} → ${newPlan.status} · давление ${oldPlan.pressure} → ${newPlan.pressure} · шаг ${oldPlan.currentStep} → ${newPlan.currentStep}`, tone: newPlan.pressure > oldPlan.pressure ? 'warning' : 'neutral', entityId: planId, before: oldPlan.pressure, after: newPlan.pressure, delta: newPlan.pressure - oldPlan.pressure || undefined, source: plan.secret ? 'hidden-state' : 'state-engine' })
  })

  const oldTimeline = byId(before.timeline)
  ;(after.timeline ?? []).forEach((event) => {
    if (oldTimeline.has(event.id)) return
    const categoryKind: Partial<Record<typeof event.category, StateChangeKind>> = { story: 'world', inventory: 'inventory', character: 'character', relationship: 'relationship', quest: 'quest', world: 'world', ability: 'ability', artifact: 'artifact', influence: 'relationship', mystery: 'knowledge' }
    changes.push({ kind: categoryKind[event.category] ?? 'world', label: event.title, detail: short(event.description), tone: 'neutral', entityId: event.id, source: 'timeline' })
  })

  collectionChanges(changes, before.threads, after.threads, 'world', (thread) => thread.secret ? 'Скрытая сюжетная линия' : `Линия: ${thread.title}`, (thread) => thread.status)
  collectionChanges(changes, before.worldEvents, after.worldEvents, 'world', (event) => event.visibility === 'hidden' ? 'Скрытое мировое событие' : `Событие: ${event.title}`, (event) => event.status)
  collectionChanges(changes, before.worldPressures, after.worldPressures, 'world', (pressure) => pressure.visibility === 'hidden' ? 'Скрытая реакция мира' : `Давление: ${pressure.sourceName}`, (pressure) => pressure.visibility === 'hidden' ? 'Скрытое состояние изменилось' : `${pressureTierLabels[pressure.tier]} · ${pressureStageLabels[pressure.stage]}`)
  collectionChanges(changes, before.characterArcs, after.characterArcs, 'character', (arc) => arc.secret ? 'Скрытая арка персонажа' : `Арка: ${arc.title}`, (arc) => arc.progress)
  collectionChanges(changes, before.influenceAssets, after.influenceAssets, 'relationship', (asset) => asset.secret ? 'Скрытый ресурс влияния' : `Влияние: ${asset.title}`, (asset) => asset.value)

  if (!same(before.partyMemberIds ?? [], after.partyMemberIds ?? [])) changes.push({ kind: 'character', label: 'Состав отряда', detail: 'Участники отряда изменились', tone: 'neutral', source: 'state-engine' })
  if (!same(before.partyRoles ?? {}, after.partyRoles ?? {})) changes.push({ kind: 'character', label: 'Роли отряда', detail: 'Распределение ролей в отряде обновлено', tone: 'neutral', source: 'state-engine' })
  return changes
}

export function summarizeStateChanges(changes: StateChange[]): string[] {
  return changes.map((change) => `${change.label}: ${change.detail}`)
}
