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
    expect(resolveAdaptiveInterfaceElement(campaign, hidden).missing).toBe(true)

    npc.dossier = { familiarity: 'familiar', revealedSections: [], revealedStatKeys: ['intellect'], revealedResourceKeys: [], revealedAbilityIds: [], evidence: [], updatedTurn: 3 }
    expect(resolveAdaptiveInterfaceElement(campaign, hidden)).toMatchObject({ value: 99, live: true, missing: false })
  })

  it('keeps hidden metrics unavailable even when the binding knows their exact id', () => {
    const campaign = createDemoCampaign()
    campaign.world.metrics = [{ id: 'secret-cycle', key: 'secret', label: 'Тайный цикл', description: 'Секрет', value: 3, min: 0, max: 10, visibility: 'hidden', source: 'Неизвестно', updatePolicy: 'Скрыто', lastChangedTurn: 1 }]
    expect(resolveAdaptiveInterfaceElement(campaign, element({ binding: { domain: 'world.metric', target: 'secret-cycle' } })).missing).toBe(true)
  })
})
