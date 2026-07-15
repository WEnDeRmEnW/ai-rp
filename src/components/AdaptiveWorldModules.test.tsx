import { describe, expect, it } from 'vitest'
import type { AdaptiveInterfaceBinding, AdaptiveInterfaceElement } from '../../shared/types'
import { createDemoCampaign } from '../lib/demo'
import { resolveAdaptiveInterfaceElement } from '../lib/adaptive-interface'

const element = (domain: AdaptiveInterfaceBinding['domain'], key?: string, target?: string): AdaptiveInterfaceElement => ({
  id: crypto.randomUUID(), label: domain, kind: 'value', state: 'normal', binding: { domain, key, target }, links: [],
})

describe('adaptive world interface live bindings', () => {
  it('reads changing campaign facts instead of keeping decorative copied values', () => {
    const campaign = createDemoCampaign()
    const resource = campaign.player.resources[0]
    const stat = campaign.player.stats[0]
    const npc = campaign.npcs[0]
    npc.dossier = { familiarity: 'familiar', revealedSections: ['relationship'], revealedStatKeys: [], revealedResourceKeys: [], revealedAbilityIds: [], evidence: [], updatedTurn: campaign.turn }
    const item = campaign.inventory[0]
    item.charges = 3
    item.maxCharges = 7
    campaign.scene.tension = 73
    campaign.factionReputation = [{ factionName: 'Латунный хор', value: -14, label: 'Недоверие', notes: [] }]

    expect(resolveAdaptiveInterfaceElement(campaign, element('player.resource', resource.key))).toMatchObject({ value: resource.value, max: resource.max })
    expect(resolveAdaptiveInterfaceElement(campaign, element('player.stat', stat.label))).toMatchObject({ value: stat.value, max: stat.max })
    expect(resolveAdaptiveInterfaceElement(campaign, element('scene.tension'))).toMatchObject({ value: 73, min: 0, max: 100, unit: '%', live: true, missing: false })
    expect(resolveAdaptiveInterfaceElement(campaign, element('faction.reputation', 'Латунный хор'))).toMatchObject({ value: -14, min: -100, max: 100 })
    expect(resolveAdaptiveInterfaceElement(campaign, element('inventory.item-charges', undefined, item.id))).toMatchObject({ value: 3, max: 7 })
    expect(resolveAdaptiveInterfaceElement(campaign, element('npc.relationship', undefined, npc.name))).toMatchObject({ value: npc.relationship, min: -100, max: 100 })

    resource.value -= 2
    campaign.scene.tension = 19
    expect(resolveAdaptiveInterfaceElement(campaign, element('player.resource', resource.key)).value).toBe(resource.value)
    expect(resolveAdaptiveInterfaceElement(campaign, element('scene.tension')).value).toBe(19)
  })

  it('keeps explicitly authored custom values for unique world state', () => {
    expect(resolveAdaptiveInterfaceElement(createDemoCampaign(), { ...element('custom'), value: 'Третья печать расколота' }).value).toBe('Третья печать расколота')
  })
})
