import { describe, expect, it } from 'vitest'
import { createDemoCampaign } from './demo'
import { getWorldInterfaceBlueprint, getWorldPresentation } from './world-customization'

describe('world customization compatibility', () => {
  it('deeply fills missing legacy presentation labels', () => {
    const world = createDemoCampaign().world
    world.presentation = { ...world.presentation!, labels: { ...world.presentation!.labels, scene: 'Эпизод' } }
    delete (world.presentation.labels as Partial<typeof world.presentation.labels>).inventory
    const presentation = getWorldPresentation(world)
    expect(presentation.labels.scene).toBe('Эпизод')
    expect(presentation.labels.inventory).toBeTruthy()
    expect(presentation.categoryLabels.weapon).toBeTruthy()
  })

  it('gives old worlds a complete recoverable dashboard', () => {
    const world = createDemoCampaign().world
    world.interfaceBlueprint = undefined
    const blueprint = getWorldInterfaceBlueprint(world)
    expect(blueprint.defaultTab).toBe('dashboard')
    expect(blueprint.tabs).toHaveLength(6)
    expect(blueprint.tabs.every((tab) => tab.visible)).toBe(true)
    expect(blueprint.dashboardSections).toContain('interfaceHealth')
  })

  it('never lets an AI blueprint hide any of the six useful screens', () => {
    const world = createDemoCampaign().world
    world.interfaceBlueprint = {
      title: 'Боевой HUD', subtitle: 'Только бой', defaultTab: 'world', reason: 'Под сцену', updatedTurn: 7,
      tabs: [{ id: 'dashboard', label: '', visible: false }, { id: 'world', label: 'Архив', visible: false }],
      dashboardSections: ['modules'],
    }
    const blueprint = getWorldInterfaceBlueprint(world)
    expect(blueprint.tabs).toHaveLength(6)
    expect(blueprint.tabs.every((tab) => tab.visible)).toBe(true)
    expect(blueprint.tabs.find((tab) => tab.id === 'dashboard')).toMatchObject({ visible: true, label: 'Пульт' })
    expect(blueprint.tabs.find((tab) => tab.id === 'world')).toMatchObject({ visible: true, label: 'Архив' })
    expect(blueprint.defaultTab).toBe('world')
    expect(blueprint.dashboardSections).toEqual(expect.arrayContaining(['modules', 'interfaceHealth']))
  })
})
