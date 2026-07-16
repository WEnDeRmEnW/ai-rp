import { describe, expect, it } from 'vitest'
import type { AdaptiveInterfaceElement, AdaptiveInterfaceModule } from '../../shared/types'
import { createDemoCampaign } from './demo'
import { adaptiveInterfaceBindingIssues, resolveAdaptiveElementState, resolveAdaptiveInterfaceElement } from './adaptive-interface'

const element = (overrides: Partial<AdaptiveInterfaceElement> = {}): AdaptiveInterfaceElement => ({
  id: 'element-1', label: 'Показатель', kind: 'meter', state: 'normal', ...overrides,
})

const moduleWith = (entry: AdaptiveInterfaceElement): AdaptiveInterfaceModule => ({
  id: 'module-1', title: 'Модуль', description: 'Проверочный модуль', placement: 'dashboard', visual: 'cards', icon: 'pulse',
  accent: '#71d3b1', secondary: '#e7b96b', priority: 50, visibility: 'known', reason: 'Проверка', updatePolicy: 'По состоянию',
  collapsible: true, collapsedByDefault: false, elements: [entry], createdTurn: 0, lastChangedTurn: 0,
})

describe('adaptive interface live bindings', () => {
  it('reads real world metrics and derives warning states without another model call', () => {
    const campaign = createDemoCampaign()
    campaign.world.metrics = [{
      id: 'metric-alert', key: 'alert', label: 'Розыск', description: 'Внимание властей', value: 74, min: 0, max: 100,
      unit: '%', visibility: 'known', source: 'Стража', updatePolicy: 'Растёт после публичных преступлений', lastChangedTurn: 2,
    }]
    const source = element({ binding: { domain: 'world.metric', key: 'alert' }, value: 5, stateRules: { warningAbove: 60, dangerAbove: 90 } })
    const resolved = resolveAdaptiveInterfaceElement(campaign, source)
    expect(resolved).toMatchObject({ value: 74, min: 0, max: 100, unit: '%', live: true, missing: false })
    expect(resolveAdaptiveElementState(source, resolved)).toBe('warning')
  })

  it('marks a broken live binding instead of displaying a believable authored fallback', () => {
    const campaign = createDemoCampaign()
    const source = element({ value: 88, binding: { domain: 'world.metric', key: 'deleted-metric' } })
    expect(resolveAdaptiveInterfaceElement(campaign, source)).toMatchObject({ value: 88, live: false, missing: true })
    expect(adaptiveInterfaceBindingIssues(campaign, [moduleWith(source)])).toEqual([
      expect.objectContaining({ moduleId: 'module-1', elementId: 'element-1', domain: 'world.metric', key: 'deleted-metric' }),
    ])
  })

  it('never leaks hidden NPC statistics through a model-authored module', () => {
    const campaign = createDemoCampaign()
    const npc = campaign.npcs[0]
    npc.stats = [{ key: 'intellect', label: 'Интеллект', value: 99, max: 100 }]
    npc.dossier = undefined
    const hidden = element({ binding: { domain: 'npc.stat', target: npc.id, key: 'intellect' } })
    expect(resolveAdaptiveInterfaceElement(campaign, hidden)).toMatchObject({ missing: false, suppressed: true })
    expect(adaptiveInterfaceBindingIssues(campaign, [moduleWith(hidden)])).toEqual([])

    npc.dossier = { familiarity: 'familiar', revealedSections: [], revealedStatKeys: ['intellect'], revealedResourceKeys: [], revealedAbilityIds: [], evidence: [], updatedTurn: 3 }
    expect(resolveAdaptiveInterfaceElement(campaign, hidden)).toMatchObject({ value: 99, live: true, missing: false })
  })

  it('keeps hidden metrics unavailable even when the binding knows their exact id', () => {
    const campaign = createDemoCampaign()
    campaign.world.metrics = [{ id: 'secret-cycle', key: 'secret', label: 'Тайный цикл', description: 'Секрет', value: 3, min: 0, max: 10, visibility: 'hidden', source: 'Неизвестно', updatePolicy: 'Скрыто', lastChangedTurn: 1 }]
    const source = element({ binding: { domain: 'world.metric', target: 'secret-cycle' } })
    expect(resolveAdaptiveInterfaceElement(campaign, source)).toMatchObject({ missing: false, suppressed: true })
    expect(adaptiveInterfaceBindingIssues(campaign, [moduleWith(source)])).toEqual([])
  })

  it('treats an existing hidden faction as secret rather than as a broken binding', () => {
    const campaign = createDemoCampaign()
    const faction = campaign.world.factions[0]
    faction.visibility = 'hidden'
    const reputation = campaign.factionReputation?.find((entry) => entry.factionName === faction.name)
    expect(reputation).toBeDefined()
    const source = element({ binding: { domain: 'faction.reputation', key: faction.name } })

    expect(resolveAdaptiveInterfaceElement(campaign, source)).toMatchObject({ missing: false, suppressed: true })
    expect(adaptiveInterfaceBindingIssues(campaign, [moduleWith(source)])).toEqual([])
  })

  it('keeps rumored world values connected without exposing their exact numbers', () => {
    const campaign = createDemoCampaign()
    campaign.world.metrics = [{ id: 'rumor-cycle', key: 'rumor', label: 'Неясный цикл', description: 'Слух', value: 93, min: 0, max: 100, visibility: 'rumored', source: 'Слухи', updatePolicy: 'Неизвестно', lastChangedTurn: 1 }]
    const source = element({ binding: { domain: 'world.metric', target: 'rumor-cycle' }, stateRules: { dangerAbove: 80 } })
    const resolved = resolveAdaptiveInterfaceElement(campaign, source)

    expect(resolved).toMatchObject({ value: 'По слухам', live: true, missing: false, concealed: true })
    expect(resolveAdaptiveElementState(source, resolved)).toBe('normal')
    expect(adaptiveInterfaceBindingIssues(campaign, [moduleWith(source)])).toEqual([])
  })

  it('does not expose exact readiness from a rumored conflict participant', () => {
    const campaign = createDemoCampaign()
    campaign.activeConflict = {
      id: 'conflict-1', kind: 'combat', title: 'Засада', round: 1, phase: 'Начало', stakes: 'Выжить', terrain: [], hazards: [], momentum: 'contested', startedTurn: 1, lastUpdatedTurn: 1,
      participants: [{ entityId: campaign.npcs[0].id, side: 'opposition', objective: 'Неизвестно', position: 'В тени', readiness: 97, morale: 88, intent: 'Скрыто', lastAction: '', advantages: [], vulnerabilities: [], visibility: 'rumored' }],
    }
    const source = element({ binding: { domain: 'conflict.participant-readiness', target: campaign.npcs[0].id } })

    expect(resolveAdaptiveInterfaceElement(campaign, source)).toMatchObject({ value: 'По слухам', concealed: true, missing: false })
    expect(adaptiveInterfaceBindingIssues(campaign, [moduleWith(source)])).toEqual([])
  })

  it('keeps a rumored faction power qualitative even when a module targets its id', () => {
    const campaign = createDemoCampaign()
    const faction = campaign.world.factions[0]
    faction.visibility = 'rumored'
    faction.power = 96
    const source = element({ binding: { domain: 'faction.power', target: faction.id ?? faction.name } })

    expect(resolveAdaptiveInterfaceElement(campaign, source)).toMatchObject({ value: 'По слухам', concealed: true, missing: false })
  })
})
