import { randomInt } from 'node:crypto'
import type { ActionCheck, ActionType, Campaign } from '../shared/types.js'
import { tokenize } from '../shared/context.js'
import { activeItemAbilities } from '../shared/effective-abilities.js'

const riskyAction = /(атак|удар|стрел|уклон|взлом|крад|пробир|прыж|лез|убежд|обман|запуг|скрыт|подкрад|колдов|техник|ритуал|fight|attack|steal|climb|persuad|deceiv)/iu

const challengeTierModifiers: Record<NonNullable<Campaign['pacing']>['challengeTier'], number> = {
  none: -2,
  light: -1,
  standard: 0,
  hard: 2,
  severe: 4,
  legendary: 6,
  mythic: 8,
}

const threatTierRanks = { minor: 0, capable: 1, dangerous: 2, elite: 3, legendary: 4, mythic: 5 } as const

function metricMatchesForCheck(metric: { key: string; label: string; aliases?: string[] }, candidate: string): boolean {
  const normalized = candidate.trim().toLocaleLowerCase('ru-RU')
  return [metric.key, metric.label, ...(metric.aliases ?? [])].some((value) => value.trim().toLocaleLowerCase('ru-RU') === normalized)
}

function softTokenMatch(left: string, right: string): boolean {
  if (left === right) return true
  // Four Cyrillic letters retain the lexical stem for common Russian case and
  // verb endings: «прямой/прямым», «атака/атакую», «рывок/рывком».
  const length = Math.min(4, left.length, right.length)
  return length >= 3 && left.slice(0, length) === right.slice(0, length)
}

function textMatchesAction(input: string, description: string): boolean {
  const actionTokens = tokenize(input)
  const descriptionTokens = tokenize(description)
  const hits = descriptionTokens.filter((token) => actionTokens.some((candidate) => softTokenMatch(token, candidate))).length
  return hits >= Math.min(2, Math.max(1, descriptionTokens.length))
}

function relevantAbilityMastery(npc: Campaign['npcs'][number], input: string): number | undefined {
  const social = /(обман|запуг|убежд|уговор|перехитр|манипул|deceiv|persuad)/iu.test(input)
  const covert = /(скры|крад|пробир|засад|убег|преслед|steal|sneak|escape)/iu.test(input)
  const relevantCategories = social
    ? new Set(['mind', 'perception', 'control', 'utility'])
    : covert
      ? new Set(['mobility', 'perception', 'control', 'utility', 'space'])
      : new Set(['offense', 'defense', 'control', 'mobility', 'summoning', 'transformation', 'reality', 'time', 'space', 'mind', 'soul', 'energy', 'matter'])
  const abilities = (npc.abilities ?? [])
    .filter((ability) => ability.kind === 'passive' || !ability.category || relevantCategories.has(ability.category))
    .filter((ability) => {
      const requirements = ability.requirements ?? []
      return requirements.length === 0 || !requirements.some((requirement) => /недоступ|отсутств|невозмож/iu.test(requirement))
    })
    .flatMap((ability) => {
      const relevantTechniques = (ability.techniques ?? [])
        .filter((technique) => technique.unlocked && (technique.kind === 'passive' || relevantCategories.has(technique.category)))
        .filter((technique) => technique.kind === 'passive' || textMatchesAction(input, `${technique.name} ${technique.description}`))
        .map((technique) => technique.mastery)
      return relevantTechniques.length ? relevantTechniques : [ability.mastery]
    })
    .filter((mastery): mastery is number => Number.isFinite(mastery))
    .sort((left, right) => right - left)
    .slice(0, 3)
  if (!abilities.length) return undefined
  return abilities.reduce<number>((sum, mastery) => sum + mastery, 0) / abilities.length
}

function normalizedStatCompetence(npc: Campaign['npcs'][number]): number | undefined {
  const stats = (npc.stats ?? []).map((stat) => stat.max && stat.max > 0 ? stat.value / stat.max * 100 : stat.value * 10)
    .filter(Number.isFinite)
    .sort((left, right) => right - left)
    .slice(0, 3)
  if (!stats.length) return undefined
  return Math.max(0, Math.min(100, stats.reduce((sum, value) => sum + value, 0) / stats.length))
}

function oppositionCompetence(npc: Campaign['npcs'][number], input: string): number {
  const strategy = npc.strategy
  const social = /(обман|запуг|убежд|уговор|перехитр|манипул|deceiv|persuad)/iu.test(input)
  const covert = /(скры|крад|пробир|засад|убег|преслед|steal|sneak|escape)/iu.test(input)
  const strategicScore = !strategy ? undefined : social
    ? (strategy.intelligence + strategy.strategicSkill + strategy.deceptionSkill + strategy.predictionSkill) / 4
    : covert
      ? (strategy.predictionSkill + strategy.tacticalSkill + strategy.strategicSkill + strategy.adaptability) / 4
      : (strategy.tacticalSkill + strategy.predictionSkill + strategy.adaptability + strategy.intelligence) / 4
  const abilityScore = relevantAbilityMastery(npc, input)
  const statScore = normalizedStatCompetence(npc)
  const components = [
    strategicScore === undefined ? undefined : { value: strategicScore, weight: 0.55 },
    abilityScore === undefined ? undefined : { value: abilityScore, weight: 0.30 },
    statScore === undefined ? undefined : { value: statScore, weight: 0.15 },
  ].filter((component): component is { value: number; weight: number } => Boolean(component))
  if (!components.length) return 35
  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0)
  return components.reduce((sum, component) => sum + component.value * component.weight, 0) / totalWeight
}

function findStrategicOpponent(campaign: Campaign, input: string) {
  const normalized = input.toLocaleLowerCase('ru-RU')
  const activeOppositionIds = new Set((campaign.activeConflict?.participants ?? []).filter((participant) => participant.side === 'opposition').map((participant) => participant.entityId))
  const named = campaign.npcs.filter((npc) => campaign.scene.presentNpcIds.includes(npc.id) && (
    normalized.includes(npc.name.toLocaleLowerCase('ru-RU'))
    || (npc.role.length >= 4 && normalized.includes(npc.role.toLocaleLowerCase('ru-RU')))
  ))
  const directlyOpposed = /(атак|удар|стрел|уклон|сраж|драл|бор|обман|запуг|убежд|перехитр|преслед|убег|скры|крад|fight|attack|deceiv|persuad|escape)/iu.test(input)
  const active = campaign.npcs.filter((npc) => activeOppositionIds.has(npc.id))
  const candidates = active.length > 0
    ? active
    : named.length > 0
      ? named
    : directlyOpposed
      ? campaign.npcs.filter((npc) => campaign.scene.presentNpcIds.includes(npc.id) && npc.relationship < -10)
      : []

  return candidates.sort((left, right) => oppositionCompetence(right, input) - oppositionCompetence(left, input))[0]
}

function strategicOppositionModifier(campaign: Campaign, input: string) {
  const npc = findStrategicOpponent(campaign, input)
  if (!npc) return undefined
  const strategy = npc.strategy
  const competence = oppositionCompetence(npc, input)
  const factors: string[] = []
  let modifier = Math.round((competence - 45) / 11)
  if (competence >= 70) factors.push('Высокое мастерство противника')

  const matchedPatterns = (strategy?.observedPlayerPatterns ?? []).filter((pattern) => textMatchesAction(input, pattern)).length
  if (matchedPatterns > 0 && (strategy?.predictionSkill ?? 0) >= 55) {
    modifier += Math.min(2, matchedPatterns)
    factors.push('Противник узнал повторяющийся приём')
  }
  const matchedAdaptation = (strategy?.learnedAdaptations ?? []).some((adaptation) => textMatchesAction(input, adaptation))
  if (matchedAdaptation) {
    modifier += 1
    factors.push('Противник уже адаптировался к похожему действию')
  }
  const countermeasure = (strategy?.countermeasures ?? []).find((counter) => ['available', 'prepared'].includes(counter.status) && textMatchesAction(input, counter.against))
  if (countermeasure) {
    modifier += countermeasure.status === 'prepared' ? 2 : 1
    factors.push(countermeasure.status === 'prepared' ? 'Заранее подготовлена контрмера' : 'Есть подходящая контрмера')
  }

  const participant = campaign.activeConflict?.participants.find((candidate) => candidate.entityId === npc.id)
  if (participant) {
    const readinessModifier = Math.max(-2, Math.min(2, Math.round((participant.readiness - 50) / 25)))
    modifier += readinessModifier
    if (readinessModifier > 0) factors.push('Высокая боевая готовность')
    if (readinessModifier < 0) factors.push('Готовность противника нарушена')
    if (participant.advantages.length > 0) {
      modifier += 1
      factors.push('Позиционное преимущество')
    }
    if (participant.vulnerabilities.some((vulnerability) => textMatchesAction(input, vulnerability))) {
      modifier -= 2
      factors.push('Герой использует уязвимость')
    }
  }
  if (campaign.activeConflict?.momentum === 'opposition') {
    modifier += 2
    factors.push('Противник владеет темпом')
  } else if (campaign.activeConflict?.momentum === 'player') {
    modifier -= 2
    factors.push('Герой владеет темпом')
  }

  const health = npc.resources?.find((resource) => resource.kind === 'health')
  const healthRatio = health?.max ? health.value / health.max : undefined
  if (healthRatio !== undefined && healthRatio <= 0.25) {
    modifier -= 3
    factors.push('Противник тяжело ранен')
  } else if (healthRatio !== undefined && healthRatio <= 0.5) {
    modifier -= 1
    factors.push('Противник ранен')
  }
  const criticalResources = (npc.resources ?? []).filter((resource) => resource.kind !== 'health' && resource.criticalBelow !== undefined && resource.value <= resource.criticalBelow).length
  if (criticalResources > 0) {
    modifier -= Math.min(2, criticalResources)
    factors.push('Ресурсы противника истощены')
  }
  const impairment = (npc.statusEffects ?? []).filter((effect) => ['injury', 'debuff', 'disease', 'poison', 'curse', 'mental'].includes(effect.category)).reduce((sum, effect) => sum + effect.severity, 0)
  if (impairment >= 60) {
    modifier -= Math.min(3, Math.ceil(impairment / 100))
    factors.push('Состояния мешают противнику')
  }

  // Raw competence can establish legendary mastery, but mythic scale must be
  // authored explicitly and backed by a validated threat profile.
  let tier: NonNullable<ActionCheck['oppositionTier']> = competence >= 90 ? 'legendary' : competence >= 78 ? 'elite' : competence >= 64 ? 'dangerous' : competence >= 45 ? 'capable' : 'minor'
  const profile = npc.threatProfile
  if (profile && threatTierRanks[profile.tier] > threatTierRanks[tier]) tier = profile.tier
  if (profile && ['legendary', 'mythic'].includes(profile.tier)) {
    const requirementUsed = profile.defeatRequirements.some((requirement) => textMatchesAction(input, requirement))
    if (requirementUsed) {
      modifier -= 2
      factors.push('Герой использует установленное условие победы')
    } else {
      modifier += profile.tier === 'mythic' ? 3 : 2
      factors.push(profile.tier === 'mythic' ? 'Противостоит сила мифического масштаба' : 'Противостоит легендарная угроза')
    }
  } else if (profile?.tier === 'elite') {
    modifier += 1
    factors.push('Подтверждённый элитный противник')
  }
  return { npc, modifier: Math.max(-4, Math.min(12, modifier)), tier, factors: [...new Set(factors)].slice(0, 8) }
}

export function resolveActionCheck(
  campaign: Campaign,
  input: string,
  actionType: ActionType,
  rollDie: () => number = () => randomInt(1, 21),
): ActionCheck | undefined {
  const mode = campaign.settings.resolutionMode ?? 'hidden'
  if (mode === 'off' || actionType !== 'do' || !riskyAction.test(input)) return undefined
  const queryTokens = tokenize(input)
  const query = new Set(queryTokens)
  const matchesQuery = (token: string) => query.has(token) || (
    token.length >= 5 && queryTokens.some((candidate) => candidate.length >= 5 && candidate.slice(0, 5) === token.slice(0, 5))
  )
  const scored = campaign.player.stats.map((stat, index) => ({
    stat,
    index,
    score: tokenize(`${stat.key} ${stat.label} ${(stat.aliases ?? []).join(' ')} ${stat.description ?? ''}`).reduce((sum, token) => sum + (matchesQuery(token) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score || a.index - b.index)
  const stat = scored[0]?.stat
  if (!stat) return undefined

  const roll = Math.max(1, Math.min(20, Math.round(rollDie())))
  const midpoint = (stat.max ?? 10) / 2
  const baseModifier = Math.round(stat.value - midpoint)
  const mechanicallyAvailableAbilities = [...campaign.player.abilities, ...activeItemAbilities(campaign)]
  const mechanicalEffectTexts = [
    ...(campaign.player.statusEffects ?? [])
      .filter((effect) => Object.keys(effect.checkModifiers ?? {}).length === 0)
      .map((effect) => `${effect.name} ${effect.description} ${effect.effects.join(' ')}`),
    ...campaign.inventory.filter((item) => item.equipped).flatMap((item) => [
      `${item.name} ${item.effects.join(' ')}`,
    ]),
    ...mechanicallyAvailableAbilities.filter((ability) => ability.kind === 'passive').flatMap((ability) => ability.effects ?? []),
    ...mechanicallyAvailableAbilities.flatMap((ability) => (ability.techniques ?? [])
      .filter((technique) => technique.unlocked && technique.kind === 'passive')
      .flatMap((technique) => technique.effects)),
  ]
  const explicitEffectModifier = mechanicalEffectTexts.reduce((sum, effectText) => {
    const text = effectText.toLocaleLowerCase('ru-RU')
    const concernsChecks = /(проверк|броск|действ|check|roll)/iu.test(text)
    const concernsStat = [stat.key, stat.label, ...(stat.aliases ?? [])].some((name) => text.includes(name.toLocaleLowerCase('ru-RU')))
    if (!concernsChecks && !concernsStat) return sum
    const signed = text.match(/(?:^|\s)([+−-]\s*\d{1,2})(?=\s|$|\D)/u)?.[1]?.replace('−', '-').replace(/\s/g, '')
    return sum + (signed ? Number(signed) : 0)
  }, 0)
  const structuredEffectModifier = (campaign.player.statusEffects ?? []).reduce((sum, effect) => {
    const modifiers = effect.checkModifiers ?? {}
    const specific = Object.entries(modifiers).reduce((subtotal, [key, value]) => (
      key !== '*' && Number.isFinite(value) && metricMatchesForCheck(stat, key) ? subtotal + value : subtotal
    ), 0)
    const universal = Number.isFinite(modifiers['*']) ? modifiers['*'] : 0
    return sum + specific + universal
  }, 0)
  const criticalResourcePenalty = campaign.player.resources.filter((resource) => {
    const threshold = resource.criticalBelow ?? (resource.max ? Math.max(1, resource.max * 0.1) : undefined)
    return resource.kind !== 'health' && threshold !== undefined && resource.value <= threshold
  }).length
  const lifeStatePenalty = !campaign.player.lifeState || campaign.player.lifeState === 'active' ? 0 : campaign.player.lifeState === 'unconscious' ? -8 : -12
  const modifier = Math.max(-12, Math.min(12, baseModifier + structuredEffectModifier + explicitEffectModifier - Math.min(3, criticalResourcePenalty) + lifeStatePenalty))
  const difficultyBase = campaign.settings.difficulty === 'story' ? 8 : campaign.settings.difficulty === 'harsh' ? 13 : 10
  const opposition = strategicOppositionModifier(campaign, input)
  const challengeModifier = campaign.pacing ? challengeTierModifiers[campaign.pacing.challengeTier] : 0
  const target = Math.max(4, Math.min(30, difficultyBase + Math.floor(campaign.scene.tension / 30) + challengeModifier + (opposition?.modifier ?? 0)))
  const total = roll + modifier
  const outcome = roll === 1 ? 'failure' : roll === 20 && total >= target - 2 ? 'critical' : total >= target ? 'success' : total >= target - 3 ? 'mixed' : 'failure'
  return {
    statKey: stat.key,
    statLabel: stat.label,
    roll,
    modifier,
    target,
    total,
    outcome,
    visibility: mode,
    oppositionNpcId: opposition?.npc.id,
    oppositionLabel: opposition?.npc.name,
    oppositionModifier: opposition?.modifier,
    oppositionTier: opposition?.tier,
    oppositionFactors: [
      ...(opposition?.factors ?? []),
      ...(challengeModifier > 0 ? [`Сюжетное испытание: +${challengeModifier}`] : challengeModifier < 0 ? [`Щадящий эпизод: ${challengeModifier}`] : []),
    ].slice(0, 8),
  }
}
