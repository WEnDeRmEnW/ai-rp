import { randomInt } from 'node:crypto'
import type { ActionCheck, ActionType, Campaign } from '../shared/types.js'
import { tokenize } from '../shared/context.js'

const riskyAction = /(атак|удар|стрел|уклон|взлом|крад|пробир|прыж|лез|убежд|обман|запуг|скрыт|подкрад|колдов|техник|ритуал|fight|attack|steal|climb|persuad|deceiv)/iu

function metricMatchesForCheck(metric: { key: string; label: string; aliases?: string[] }, candidate: string): boolean {
  const normalized = candidate.trim().toLocaleLowerCase('ru-RU')
  return [metric.key, metric.label, ...(metric.aliases ?? [])].some((value) => value.trim().toLocaleLowerCase('ru-RU') === normalized)
}

function findStrategicOpponent(campaign: Campaign, input: string) {
  const normalized = input.toLocaleLowerCase('ru-RU')
  const named = campaign.npcs.filter((npc) => campaign.scene.presentNpcIds.includes(npc.id) && npc.strategy && (
    normalized.includes(npc.name.toLocaleLowerCase('ru-RU'))
    || (npc.role.length >= 4 && normalized.includes(npc.role.toLocaleLowerCase('ru-RU')))
  ))
  const directlyOpposed = /(атак|удар|стрел|уклон|сраж|драл|бор|обман|запуг|убежд|перехитр|преслед|убег|скры|крад|fight|attack|deceiv|persuad|escape)/iu.test(input)
  const candidates = named.length > 0
    ? named
    : directlyOpposed
      ? campaign.npcs.filter((npc) => campaign.scene.presentNpcIds.includes(npc.id) && npc.strategy && npc.relationship < -10)
      : []

  return candidates.sort((left, right) => {
    const score = (npc: typeof left) => {
      const strategy = npc.strategy!
      return strategy.intelligence + strategy.tacticalSkill + strategy.strategicSkill + strategy.predictionSkill + strategy.adaptability
    }
    return score(right) - score(left)
  })[0]
}

function strategicOppositionModifier(campaign: Campaign, input: string) {
  const npc = findStrategicOpponent(campaign, input)
  if (!npc?.strategy) return undefined
  const strategy = npc.strategy
  const social = /(обман|запуг|убежд|уговор|перехитр|манипул|deceiv|persuad)/iu.test(input)
  const covert = /(скры|крад|пробир|засад|убег|преслед|steal|sneak|escape)/iu.test(input)
  const score = social
    ? (strategy.intelligence + strategy.strategicSkill + strategy.deceptionSkill + strategy.predictionSkill) / 4
    : covert
      ? (strategy.predictionSkill + strategy.tacticalSkill + strategy.strategicSkill + strategy.adaptability) / 4
      : (strategy.tacticalSkill + strategy.predictionSkill + strategy.adaptability + strategy.intelligence) / 4
  const modifier = Math.max(-2, Math.min(5, Math.round((score - 50) / 12)))
  return { npc, modifier }
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
  const mechanicalEffectTexts = [
    ...(campaign.player.statusEffects ?? [])
      .filter((effect) => Object.keys(effect.checkModifiers ?? {}).length === 0)
      .map((effect) => `${effect.name} ${effect.description} ${effect.effects.join(' ')}`),
    ...campaign.inventory.filter((item) => item.equipped).flatMap((item) => [
      `${item.name} ${item.effects.join(' ')}`,
      ...(item.artifact?.awakened ? item.artifact.passiveEffects : []),
    ]),
    ...campaign.player.abilities.filter((ability) => ability.kind === 'passive').flatMap((ability) => ability.effects ?? []),
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
  const target = difficultyBase + Math.floor(campaign.scene.tension / 30) + (opposition?.modifier ?? 0)
  const total = roll + modifier
  const outcome = roll === 20 ? 'critical' : total >= target ? 'success' : total >= target - 3 ? 'mixed' : 'failure'
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
  }
}
