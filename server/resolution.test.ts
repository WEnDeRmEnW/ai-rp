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

  it('makes an elite prepared opponent materially harder without granting a universal counter', () => {
    const campaign = createDemoCampaign()
    campaign.settings.resolutionMode = 'visible'
    const npc = campaign.npcs[0]
    npc.relationship = -70
    npc.stats = [{ key: 'combat', label: 'Боевое мастерство', value: 10, max: 10 }]
    npc.abilities = [{
      id: 'perfect-guard', name: 'Совершенная защита', description: 'Контролирует линию прямой атаки.', rank: 'Мастер', source: 'Школа стражей', kind: 'reaction', mastery: 96,
      costs: [], effects: ['Перехватывает прямой рывок'], limitations: ['Требует видеть начало движения'], requirements: ['Сохранять стойку'], progression: 'Оттачивается в дуэлях.', evolutionPaths: [], history: [], tags: ['защита'],
      category: 'defense', scale: 'Ближняя дистанция', activation: 'Реакция на прямую атаку', capabilities: ['Перехват'], synergies: [], counters: ['Смена ритма'], examples: ['Сдвиг с линии удара'], canonStatus: 'original',
    }]
    npc.strategy = {
      intelligence: 95, tacticalSkill: 98, strategicSkill: 91, predictionSkill: 96, adaptability: 94, deceptionSkill: 75, riskTolerance: 40,
      planningHorizon: 'Несколько обменов', decisionStyle: 'Отдаёт пространство ради контроля темпа.', currentPlan: 'Спровоцировать прямой рывок.',
      observedPlayerPatterns: ['Герой начинает атаку прямым рывком.'], strengths: ['Контроль дистанции'], blindSpots: ['Не видел телепортацию героя'], contingencies: ['Отойти к колонне'],
      learnedAdaptations: ['Распознаёт прямой рывок по переносу веса'],
      countermeasures: [{ name: 'Встречный шаг', against: 'Прямой рывок и лобовая атака', response: 'Уходит с линии и подсекает опорную ногу.', requirements: ['Видеть начало движения'], tradeoffs: ['Открывает спину для союзника'], status: 'prepared', visibility: 'hidden' }],
      visibility: 'hidden', lastUpdatedTurn: 0,
    }
    campaign.activeConflict = {
      id: 'duel', kind: 'combat', title: 'Дуэль', round: 3, phase: 'Противник удерживает центр.', stakes: 'Проход', terrain: ['Колонны'], hazards: [], momentum: 'opposition', startedTurn: 0, lastUpdatedTurn: 2,
      participants: [
        { entityId: campaign.player.id, side: 'player', objective: 'Пройти.', position: 'У стены.', readiness: 60, morale: 75, intent: 'Атаковать.', lastAction: 'Отступил.', advantages: [], vulnerabilities: [], visibility: 'known' },
        { entityId: npc.id, side: 'opposition', objective: 'Удержать.', position: 'В центре.', readiness: 95, morale: 90, intent: 'Контратаковать.', lastAction: 'Занял центр.', advantages: ['Контроль центра'], vulnerabilities: [], visibility: 'hidden' },
      ],
    }

    const repeated = resolveActionCheck(campaign, `Атакую ${npc.name} прямым рывком`, 'do', () => 12)
    const novel = resolveActionCheck(campaign, `Атакую ${npc.name}, телепортируясь ему за спину`, 'do', () => 12)

    expect(repeated?.oppositionTier).toBe('legendary')
    expect(repeated?.oppositionModifier).toBeGreaterThanOrEqual(8)
    expect(repeated?.oppositionFactors).toEqual(expect.arrayContaining(['Заранее подготовлена контрмера', 'Противник владеет темпом']))
    expect(repeated!.target).toBeGreaterThan(novel!.target)
  })

  it('reduces opposition when wounds, exhaustion and a player-held tempo actually apply', () => {
    const campaign = createDemoCampaign()
    const npc = campaign.npcs[0]
    npc.relationship = -70
    npc.strategy = {
      intelligence: 80, tacticalSkill: 84, strategicSkill: 76, predictionSkill: 80, adaptability: 78, deceptionSkill: 55, riskTolerance: 50,
      planningHorizon: 'Один бой', decisionStyle: 'Держит дистанцию.', currentPlan: 'Остановить героя.', observedPlayerPatterns: [], strengths: ['Опыт'], blindSpots: ['Ранен'], contingencies: [], visibility: 'known', lastUpdatedTurn: 0,
    }
    npc.resources = [
      { key: 'health', label: 'Здоровье', value: 2, max: 10, kind: 'health' },
      { key: 'stamina', label: 'Выносливость', value: 0, max: 10, kind: 'stamina', criticalBelow: 2 },
    ]
    campaign.activeConflict = {
      id: 'fight', kind: 'combat', title: 'Бой', round: 4, phase: 'Противник отступает.', stakes: 'Выживание', terrain: [], hazards: [], momentum: 'player', startedTurn: 0, lastUpdatedTurn: 3,
      participants: [
        { entityId: campaign.player.id, side: 'player', objective: 'Победить.', position: 'В центре.', readiness: 85, morale: 90, intent: 'Давить.', lastAction: 'Прорвал защиту.', advantages: [], vulnerabilities: [], visibility: 'known' },
        { entityId: npc.id, side: 'opposition', objective: 'Отступить.', position: 'У стены.', readiness: 20, morale: 20, intent: 'Искать выход.', lastAction: 'Потерял оружие.', advantages: [], vulnerabilities: ['Открытая стойка'], visibility: 'known' },
      ],
    }

    const weakened = resolveActionCheck(campaign, `Атакую ${npc.name} в открытую стойку`, 'do', () => 12)
    expect(weakened?.oppositionModifier).toBeLessThan(0)
    expect(weakened?.oppositionFactors).toEqual(expect.arrayContaining(['Противник тяжело ранен', 'Ресурсы противника истощены', 'Герой владеет темпом']))
  })

  it('makes an authored severe challenge harder while keeping a respite mechanically light', () => {
    const respiteCampaign = createDemoCampaign()
    respiteCampaign.pacing = { beat: 'respite', intensity: 18, challengeTier: 'light', reason: 'Безопасная тренировка.', consecutivePressureTurns: 0, lastRespiteTurn: 3, updatedTurn: 3 }
    const severeCampaign = structuredClone(respiteCampaign)
    severeCampaign.pacing = { beat: 'challenge', intensity: 82, challengeTier: 'severe', reason: 'Система безопасности перешла в боевой режим.', consecutivePressureTurns: 1, lastPeakTurn: 3, updatedTurn: 3 }

    const light = resolveActionCheck(respiteCampaign, 'Пытаюсь взломать учебный замок', 'do', () => 12)
    const severe = resolveActionCheck(severeCampaign, 'Пытаюсь взломать учебный замок', 'do', () => 12)

    expect(severe!.target - light!.target).toBe(5)
    expect(severe?.oppositionFactors).toContain('Сюжетное испытание: +4')
  })

  it('respects mythic threat mechanics and materially rewards an established defeat condition', () => {
    const campaign = createDemoCampaign()
    const npc = campaign.npcs[0]
    npc.relationship = -80
    npc.stats = [{ key: 'combat', label: 'Бой', value: 10, max: 10 }]
    npc.abilities = [{
      id: 'mythic-domain', name: 'Власть над порогом', description: 'Замыкает пространство вокруг охраняемого города.', rank: 'Мифический', source: 'Древняя клятва', kind: 'passive', mastery: 98,
      costs: [], effects: ['Меняет пути внутри области клятвы.'], limitations: ['Связан с якорем клятвы.'], requirements: [], progression: 'Завершена.', evolutionPaths: [], history: [], tags: ['пространство'],
      category: 'space', scale: 'Город', activation: 'Пока цел якорь клятвы.', capabilities: ['Замыкать путь.'], synergies: [], counters: ['Разрушение якоря клятвы.'], examples: ['Возвращает беглеца к тем же воротам.'], canonStatus: 'original',
    }]
    npc.strategy = {
      intelligence: 98, tacticalSkill: 96, strategicSkill: 98, predictionSkill: 94, adaptability: 90, deceptionSkill: 85, riskTolerance: 20,
      planningHorizon: 'Века', decisionStyle: 'Удерживает клятву, не преследуя вне её границ.', currentPlan: 'Не дать герою пройти врата.', observedPlayerPatterns: [], strengths: ['Полный контроль области'], blindSpots: ['Зависимость от якоря'], contingencies: [], visibility: 'known', lastUpdatedTurn: 0,
    }
    npc.threatProfile = {
      tier: 'mythic', scope: 'Один город и его врата.', reputation: 'Не проигрывал внутри области клятвы.', whyDangerous: ['Контролирует само пространство пути.'], knownFeats: ['Остановил исход целого народа.'],
      constraints: ['Не действует вне города.'], defeatRequirements: ['Разрушить якорь клятвы.'], escalationTriggers: ['Нападение на город.'], visibility: 'known',
    }

    const direct = resolveActionCheck(campaign, `Атакую ${npc.name} прямым ударом`, 'do', () => 12)
    const counterplay = resolveActionCheck(campaign, `Разрушаю якорь клятвы и атакую ${npc.name}`, 'do', () => 12)

    expect(direct?.oppositionTier).toBe('mythic')
    expect(direct?.oppositionFactors).toContain('Противостоит сила мифического масштаба')
    expect(counterplay?.oppositionFactors).toContain('Герой использует установленное условие победы')
    expect(counterplay!.target).toBeLessThan(direct!.target)
  })
})
