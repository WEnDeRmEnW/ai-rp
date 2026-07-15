import { describe, expect, it } from 'vitest'
import { createDemoCampaign } from '../src/lib/demo'
import { resolveActionCheck } from './resolution'

describe('token-efficient action checks', () => {
  it('resolves risky actions locally without another model call', () => {
    const campaign = createDemoCampaign()
    campaign.settings.resolutionMode = 'visible'
    const check = resolveActionCheck(campaign, 'Пытаюсь взломать замок и пробраться внутрь', 'do', () => 12)
    expect(check?.roll).toBe(12)
    expect(check?.visibility).toBe('visible')
    expect(check?.outcome).toMatch(/success|mixed|failure|critical/)
  })

  it('does not roll for ordinary dialogue', () => {
    const campaign = createDemoCampaign()
    expect(resolveActionCheck(campaign, 'Спрашиваю Миру о городе', 'say', () => 20)).toBeUndefined()
  })

  it('accounts for explicit status, equipment and critical-resource modifiers', () => {
    const campaign = createDemoCampaign()
    campaign.player.resources.find((resource) => resource.key === 'focus')!.value = 0
    campaign.player.statusEffects = [{
      id: 'exhaustion',
      name: 'Истощение',
      description: 'Движения даются с трудом.',
      category: 'debuff',
      severity: 60,
      source: 'Переутомление',
      effects: ['Мешает сосредоточиться на рискованных действиях'],
      checkModifiers: { '*': -2 },
      stacks: 1,
      duration: { unit: 'turns', remaining: 2 },
      appliedTurn: 0,
    }]
    campaign.inventory.push({
      id: 'lucky-charm', name: 'Талисман удачи', description: 'Помогает собраться.', category: 'other',
      quantity: 1, rarity: 'uncommon', equipped: true, effects: ['+1 ко всем проверкам'], discoveredTurn: 0,
    })

    const check = resolveActionCheck(campaign, 'Пытаюсь взломать сложный замок', 'do', () => 12)
    expect(check?.modifier).toBe(-1)
  })

  it('uses stat aliases when selecting the relevant characteristic', () => {
    const campaign = createDemoCampaign()
    const finesse = campaign.player.stats.find((stat) => stat.key === 'finesse')!
    finesse.aliases = ['проворство']

    const check = resolveActionCheck(campaign, 'Проворно уклоняюсь от удара', 'do', () => 10)
    expect(check?.statKey).toBe('finesse')
  })

  it('raises opposition for a smart present opponent without granting omniscience', () => {
    const campaign = createDemoCampaign()
    campaign.settings.resolutionMode = 'visible'
    const npc = campaign.npcs[0]
    npc.relationship = -60
    npc.strategy = {
      intelligence: 92, tacticalSkill: 88, strategicSkill: 94, predictionSkill: 90, adaptability: 86, deceptionSkill: 82, riskTolerance: 45,
      planningHorizon: 'Несколько сцен', decisionStyle: 'Проверяет реакцию и держит запасной выход.', currentPlan: 'Выманить героя на неудобную позицию.',
      observedPlayerPatterns: ['Герой отвечает на прямую угрозу рывком вперёд.'], strengths: ['Многоходовое планирование'], blindSpots: ['Недооценивает импровизацию'],
      contingencies: ['Отступить к заранее подготовленной ловушке.'], visibility: 'known', lastUpdatedTurn: 0,
    }
    const baseline = structuredClone(campaign)
    baseline.npcs[0].strategy = undefined

    const smart = resolveActionCheck(campaign, `Атакую ${npc.name}, пытаясь перехитрить её`, 'do', () => 12)
    const ordinary = resolveActionCheck(baseline, `Атакую ${npc.name}, пытаясь перехитрить её`, 'do', () => 12)
    expect(smart?.oppositionNpcId).toBe(npc.id)
    expect(smart?.oppositionModifier).toBeGreaterThan(0)
    expect(smart!.target).toBeGreaterThan(ordinary!.target)
  })

  it('does not apply an unrelated NPC strategy to an environmental check', () => {
    const campaign = createDemoCampaign()
    const npc = campaign.npcs[0]
    npc.relationship = -60
    npc.strategy = {
      intelligence: 100, tacticalSkill: 100, strategicSkill: 100, predictionSkill: 100, adaptability: 100, deceptionSkill: 100, riskTolerance: 50,
      planningHorizon: 'Годы', decisionStyle: 'Холодный анализ', currentPlan: 'Наблюдать', observedPlayerPatterns: [], strengths: [], blindSpots: [], contingencies: [], visibility: 'hidden', lastUpdatedTurn: 0,
    }
    const check = resolveActionCheck(campaign, 'Взламываю старый замок на пустом складе', 'do', () => 12)
    expect(check?.oppositionNpcId).toBeUndefined()
  })
})
