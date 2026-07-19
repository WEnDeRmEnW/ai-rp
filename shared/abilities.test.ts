import { describe, expect, it } from 'vitest'
import type { Ability, AbilityProfile, InventoryItem, WorldCapabilitySystem } from './types'
import { abilityExecutionIssues, abilityNoveltyIssues, abilityProfileIssues, visibleAbilityTechniques } from './abilities'
import { createDemoCampaign } from '../src/lib/demo'

export const testCapabilitySystem: WorldCapabilitySystem = {
  id: 'system-resonance',
  title: 'Резонансные практики Эйдола',
  summary: 'Возможности сравниваются по реальному охвату и доказанным результатам, а не по известности владельца.',
  masteryMeaning: 'Точность и устойчивость владения уже доступной частью возможности.',
  powerMeaning: 'Фактический предел воздействия, который mastery не повышает автоматически.',
  availabilityMeaning: 'Можно ли применить возможность сейчас с учётом только реально существующих условий.',
  groups: [{ id: 'group-memory', label: 'Мнемоника', description: 'Практики чтения и закрепления следов памяти.', natureKinds: ['innate', 'trained'], icon: 'eye', accent: '#71d3b1', secondary: '#b99af7', reason: 'Память является наблюдаемым законом Эйдола.' }],
  tiers: [
    { id: 'tier-personal', label: 'Личный резонанс', order: 1, description: 'Воздействует на владельца или один доступный след.', scope: 'Один человек или предмет', evidenceRequirements: ['Подтверждённое применение на одном следе.'] },
    { id: 'tier-regional', label: 'Хор памяти', order: 4, description: 'Меняет множество связанных следов.', scope: 'Город или регион', evidenceRequirements: ['Несколько независимо подтверждённых массовых эффектов.'] },
  ],
  comparisonRules: ['Сначала сравнивать предел, затем доступность и только потом mastery.'],
  createdTurn: 1,
  lastChangedTurn: 1,
}

export function testAbilityProfile(overrides: Partial<AbilityProfile> = {}): AbilityProfile {
  return {
    nature: { kind: 'innate', groupId: 'group-memory', label: 'Врождённый резонанс', explanation: 'Тело владельца слышит остаточный рисунок памяти.' },
    creativeIdentity: {
      coreFantasy: 'Услышать событие как трещину в материале, а не увидеть готовое видение.',
      centralPrinciple: 'Предмет сохраняет не изображение прошлого, а напряжение между несовместимыми воспоминаниями.',
      originPattern: 'След утраченного имени владельца.',
      interactionModel: 'Касание, выбор одной трещины и её осторожное озвучивание.',
      signatureExperience: 'Металл холодеет, а слова прошлого слышны разными голосами из одной точки.',
      mechanicVerbs: ['слышать', 'сопоставлять', 'закреплять'],
      sensoryMotifs: ['холод металла', 'расходящиеся голоса'],
      differentiation: ['Не показывает объективную запись.', 'Работает только с противоречием внутри следа.'],
    },
    ownerExpression: { summary: 'Эрен ищет несостыковки и избегает прямого вторжения.', priorities: ['Сначала проверить источник'], habits: ['Касается предмета тыльной стороной пальцев'], signatures: ['Повторяет последнее услышанное слово'], avoids: ['Не объявляет догадку фактом'] },
    standing: { systemId: testCapabilitySystem.id, tierId: 'tier-personal', tierLabel: 'Личный резонанс', basis: 'Подтверждённые короткие отклики от отдельных предметов.', ceiling: 'Один противоречивый след за применение.', scope: 'Предмет в прямом контакте', evidence: ['Записка отозвалась голосом неизвестного свидетеля.'], uncertainties: ['Нельзя пока доказать точность каждого голоса.'] },
    facets: [
      { key: 'precision', label: 'Точность отбора', value: 62, description: 'Способность отделять один голос от остальных.' },
      { key: 'depth', label: 'Глубина следа', value: 34, description: 'Насколько старое напряжение можно услышать.' },
    ],
    presentation: { layout: 'constellation', icon: 'eye', symbol: '⌁', motif: 'расходящиеся трещины', accent: '#71d3b1', secondary: '#b99af7', density: 'comfortable', sectionOrder: ['identity', 'principle', 'standing', 'facets', 'techniques', 'counterplay', 'progression', 'history'], summary: 'Слышит противоречия, которые материя не смогла забыть.' },
    discovery: { awareness: 100, revealedSections: ['identity', 'principle', 'source', 'standing', 'facets', 'availability', 'techniques', 'counterplay', 'progression', 'history'], techniqueKnowledge: { 'tech-listen': 'understood', 'tech-hidden': 'hidden' }, evidence: [], updatedTurn: 1 },
    availability: { state: 'ready', reasons: [] },
    developmentSeeds: [],
    ...overrides,
  }
}

export function testAbility(): Ability {
  return {
    id: 'ability-fracture-listening',
    name: 'Слух трещин',
    description: 'Эрен различает несовместимые остатки памяти в материальном следе.',
    source: 'Утраченное имя',
    kind: 'active',
    mastery: 100,
    costs: [{ resource: 'focus', amount: 2 }],
    capabilities: ['Выделить один противоречивый след в предмете.'],
    effects: ['Владелец слышит фрагмент одного сохранившегося противоречия.'],
    limitations: [],
    requirements: ['Непосредственно касаться предмета.'],
    synergies: ['Сверка с надёжным свидетельством.'],
    counters: ['Материал без устойчивого следа.'],
    examples: ['Услышать два разных имени владельца на одной печати.'],
    techniques: [
      { id: 'tech-listen', name: 'Развести голоса', description: 'Отделяет один голос от фонового хора.', kind: 'active', category: 'perception', mastery: 55, activation: 'Удерживать касание.', scale: 'Один предмет', costs: [{ resource: 'focus', amount: 2 }], effects: ['Один голос становится разборчивым.'], requirements: ['Прямое касание.'], limitations: [], unlocked: true },
      { id: 'tech-hidden', name: 'Имя под именем', description: 'Скрытый приём.', kind: 'active', category: 'perception', mastery: 0, activation: 'Неизвестно.', scale: 'Неизвестно', costs: [], effects: ['Скрытый эффект.'], requirements: [], limitations: [], unlocked: false },
    ],
    profile: testAbilityProfile(),
  }
}

describe('authorial ability mechanics', () => {
  it('keeps mastery separate from factual power standing', () => {
    const ability = testAbility()
    expect(ability.mastery).toBe(100)
    expect(ability.profile?.standing.tierId).toBe('tier-personal')
    expect(abilityProfileIssues(ability, testCapabilitySystem, ['focus'])).toEqual([])
  })

  it('never reveals a hidden or locked technique through the visible projection', () => {
    expect(visibleAbilityTechniques(testAbility()).map((technique) => technique.name)).toEqual(['Развести голоса'])
  })

  it('requires the exact real cost and rejects a blocked technique that produces effects', () => {
    const campaign = createDemoCampaign()
    const ability = testAbility()
    campaign.world.capabilitySystem = testCapabilitySystem
    campaign.player.abilities = [ability]
    const valid = abilityExecutionIssues(campaign, [{ ownerKind: 'player', ownerId: campaign.player.id, abilityId: ability.id, techniqueId: 'tech-listen', intent: 'Развести голоса в печати.', outcome: 'success', costs: [{ resource: 'focus', amount: 2 }], requirementsUsed: ['Прямое касание.'], effects: ['Один голос стал разборчивым.'], evidence: 'Наблюдаемый результат сцены.' }], { resourceDeltas: { focus: -2 } })
    expect(valid).toEqual([])

    ability.techniques![0].availability = { state: 'blocked', reasons: ['Нет прямого контакта.'] }
    const invalid = abilityExecutionIssues(campaign, [{ ownerKind: 'player', ownerId: campaign.player.id, abilityId: ability.id, techniqueId: 'tech-listen', intent: 'Развести голоса на расстоянии.', outcome: 'success', costs: [{ resource: 'focus', amount: 2 }], requirementsUsed: [], effects: ['Приём всё равно сработал.'], evidence: 'Противоречивый текст.' }], { resourceDeltas: { focus: -2 } })
    expect(invalid.join(' ')).toContain('availability=blocked')
  })

  it('accepts an equipped artifact power as belonging to the player', () => {
    const campaign = createDemoCampaign()
    const item: InventoryItem = {
      id: 'artifact-execution',
      name: 'Execution Crown',
      description: 'A crown that projects a controlled spatial seam.',
      category: 'artifact',
      quantity: 1,
      rarity: 'mythic',
      equipped: true,
      effects: [],
      discoveredTurn: 1,
      artifact: {
        sentient: false,
        awakened: true,
        mastery: 70,
        attunement: 70,
        bond: 0,
        requirements: [],
        passiveEffects: [],
        combinedEffects: [],
        failureModes: [],
        components: [],
        powers: [{
          id: 'seam-power',
          name: 'Spatial Seam',
          description: 'Opens a short seam between two visible points.',
          mastery: 70,
          costs: [{ resource: 'focus', amount: 2 }],
          limitations: [],
          category: 'space',
          capabilities: ['Opens one short spatial seam.'],
          techniques: [],
        }],
        drawbacks: [],
        evolutionPaths: [],
        secrets: [],
      },
    }
    campaign.inventory = [item]

    const issues = abilityExecutionIssues(campaign, [{
      ownerKind: 'player',
      ownerId: campaign.player.id,
      abilityId: 'item-power:artifact-execution:seam-power',
      intent: 'Open a seam.',
      outcome: 'success',
      costs: [{ resource: 'focus', amount: 2 }],
      requirementsUsed: [],
      effects: ['A short seam opens.'],
      evidence: 'The seam is visible in the scene.',
    }], { resourceDeltas: { focus: -2 } })

    expect(issues).toEqual([])
  })

  it('reports an unavailable artifact power as blocked instead of foreign', () => {
    const campaign = createDemoCampaign()
    campaign.inventory = [{
      id: 'sealed-artifact', name: 'Sealed Crown', description: 'A sealed artifact.', category: 'artifact', quantity: 1,
      rarity: 'mythic', equipped: true, state: 'sealed', effects: [], discoveredTurn: 1,
      artifact: {
        sentient: false, awakened: true, mastery: 40, attunement: 40, bond: 0, requirements: [], passiveEffects: [], combinedEffects: [], failureModes: [], components: [],
        powers: [{ id: 'sealed-power', name: 'Sealed Power', description: 'Cannot operate while sealed.', mastery: 40, costs: [], limitations: [], capabilities: ['Produces a visible pulse.'], techniques: [] }],
        drawbacks: [], evolutionPaths: [], secrets: [],
      },
    }]

    const issues = abilityExecutionIssues(campaign, [{
      ownerKind: 'player', ownerId: campaign.player.id, abilityId: 'item-power:sealed-artifact:sealed-power', intent: 'Use it.', outcome: 'success', costs: [], requirementsUsed: [], effects: ['A pulse appears.'], evidence: 'Visible pulse.',
    }], {})

    expect(issues.join(' ')).toContain('сейчас недоступна')
    expect(issues.join(' ')).not.toContain('не принадлежит владельцу')
  })

  it('blocks a near-duplicate unless a real shared lineage is declared', () => {
    const original = testAbility()
    const duplicate = { ...testAbility(), id: 'ability-copy', name: 'Слух раскола' }
    const registry = [{ abilityId: original.id, ownerId: 'owner-a', ownerKind: 'player' as const, name: original.name, status: 'active' as const, fingerprint: {
      coreFantasy: original.profile!.creativeIdentity.coreFantasy,
      centralPrinciple: original.profile!.creativeIdentity.centralPrinciple,
      originPattern: original.profile!.creativeIdentity.originPattern,
      interactionModel: original.profile!.creativeIdentity.interactionModel,
      signatureExperience: original.profile!.creativeIdentity.signatureExperience,
      mechanicVerbs: original.profile!.creativeIdentity.mechanicVerbs,
      sensoryMotifs: original.profile!.creativeIdentity.sensoryMotifs,
      capabilityPatterns: [...(original.capabilities ?? []), ...(original.effects ?? [])],
      ownerExpression: original.profile!.ownerExpression.summary,
      visualSignature: original.profile!.presentation.motif,
    }, createdTurn: 1, lastChangedTurn: 1 }]
    expect(abilityNoveltyIssues(duplicate, registry).length).toBeGreaterThan(0)
  })
})
