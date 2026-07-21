import { describe, expect, it } from 'vitest'
import { createDemoCampaign } from '../src/lib/demo'
import type { CampaignEditResponse } from '../shared/types'
import { detectWorkshopResurrectionIntent, workshopStateResponseIssues } from './workshop-intent'

function resurrectionCampaign() {
  const campaign = createDemoCampaign()
  const target = campaign.npcs[0]
  target.name = 'Элиан'
  target.status = 'dead'
  target.resources = [{ key: 'lifeEnergy', label: 'Жизненная энергия', value: 0, max: 100, kind: 'health', aliases: [] }]
  campaign.scene.presentNpcIds = []
  campaign.messages.push({
    id: 'assistant-resurrection-failure',
    role: 'assistant',
    content: 'Последняя попытка не удалась: Элиан остался мёртв, а герой потерял сознание.',
    turn: campaign.turn,
    createdAt: new Date().toISOString(),
  })
  return { campaign, target }
}

describe('workshop owner-intent verification', () => {
  it('does not accept an unrelated patch when the owner asked to receive a maximum-rarity artifact', () => {
    const { campaign } = resurrectionCampaign()
    const response: CampaignEditResponse = {
      summary: 'Герой получил великий артефакт.',
      campaignPatch: {},
      settingsPatch: {},
      statePatch: { memories: [{ kind: 'fact', content: 'Кузница пообещала награду.', tags: ['Кузница'], importance: 40 }] },
    }

    expect(workshopStateResponseIssues(campaign, 'Выдай моему герою артефакт максимальной редкости.', response)).toEqual(expect.arrayContaining([
      expect.stringContaining('transcendent'),
      expect.stringContaining('inventory'),
    ]))
  })

  it('resolves a pronoun to the dead NPC from the latest conversation', () => {
    const { campaign, target } = resurrectionCampaign()
    expect(detectWorkshopResurrectionIntent(campaign, 'Сделай так, чтобы у меня получилось воскресить его.')).toEqual({
      mode: 'apply',
      targetNpcId: target.id,
      targetNpcName: 'Элиан',
      ambiguousTargetNames: [],
    })
  })

  it('rejects a resource-only patch when the requested resurrection did not happen', () => {
    const { campaign, target } = resurrectionCampaign()
    const response: CampaignEditResponse = {
      summary: 'Жизненная энергия восстановлена.',
      campaignPatch: {},
      settingsPatch: {},
      statePatch: { upsertResources: [{ key: 'lifeEnergy', label: 'Жизненная энергия', value: 100, max: 100, kind: 'health', aliases: [] }] },
    }
    expect(workshopStateResponseIssues(campaign, 'Сделай так, чтобы у меня получилось воскресить его.', response)).toEqual(expect.arrayContaining([
      expect.stringContaining(target.id),
    ]))
  })

  it('accepts an atomic resurrection with living status, health, scene presence and causal memory', () => {
    const { campaign, target } = resurrectionCampaign()
    const response: CampaignEditResponse = {
      summary: 'Последняя попытка Акиры действительно воскресила Элиана.',
      campaignPatch: {},
      settingsPatch: {},
      statePatch: {
        npcs: [{ operation: 'update', targetId: target.id, npc: { status: 'active', lastSeen: campaign.scene.location, resourceDeltas: { lifeEnergy: 25 } } }],
        scene: { presentNpcIds: [target.id] },
        memories: [{ kind: 'fact', content: 'Акира успешно воскресил Элиана; тот вернулся к жизни в текущей сцене.', tags: ['Акира', 'Элиан', 'воскрешение'], importance: 95 }],
      },
    }
    expect(workshopStateResponseIssues(campaign, 'Сделай так, чтобы у меня получилось воскресить его.', response)).toEqual([])
  })

  it('distinguishes enabling resurrection from applying it immediately', () => {
    const { campaign } = resurrectionCampaign()
    const instruction = 'Сделай, чтобы моя способность могла в будущем воскрешать людей.'
    expect(detectWorkshopResurrectionIntent(campaign, instruction)?.mode).toBe('enable')
    const response: CampaignEditResponse = {
      summary: 'Открыта возможность воскрешения.',
      campaignPatch: {},
      settingsPatch: {},
      statePatch: {
        abilityChanges: [{ abilityId: campaign.player.abilities[0].id, addCapabilities: ['Возвращать недавно умершего к жизни при выполнении условий воскрешения.'] }],
      },
    }
    expect(workshopStateResponseIssues(campaign, instruction, response)).toEqual([])
  })
})
