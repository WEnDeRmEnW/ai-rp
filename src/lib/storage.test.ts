import 'fake-indexeddb/auto'
import { deleteDB, openDB } from 'idb'
import { describe, expect, it } from 'vitest'
import type { Campaign } from '../../shared/types'
import { createDemoCampaign } from './demo'

describe('campaign IndexedDB storage', () => {
  it('migrates a legacy keyPath and saves a campaign whose inline id was missing', async () => {
    await deleteDB('letopis-rp')
    const legacyDb = await openDB('letopis-rp', 1, {
      upgrade(db) {
        const store = db.createObjectStore('campaigns', { keyPath: 'legacyKey' })
        store.createIndex('by-updated', 'updatedAt')
      },
    })
    const legacyRecord = { ...createDemoCampaign(), id: undefined, legacyKey: 'legacy-campaign' }
    await legacyDb.put('campaigns', legacyRecord)
    legacyDb.close()

    const storage = await import('./storage')
    const campaigns = await storage.getCampaigns()
    expect(campaigns).toHaveLength(1)
    expect(campaigns[0].id).toBe('legacy-campaign')

    const keyless = { ...campaigns[0], id: undefined } as unknown as Campaign
    const saved = await storage.saveCampaign(keyless)
    expect(saved.id).toEqual(expect.any(String))
    expect(saved.id.length).toBeGreaterThan(0)

    const upgradedDb = await openDB('letopis-rp', 3)
    const migratedRecords = await upgradedDb.getAll('campaigns-v2')
    expect(migratedRecords.some((record) => record.id === 'legacy-campaign')).toBe(true)
    expect(migratedRecords.some((record) => record.id === saved.id)).toBe(true)
    expect(await upgradedDb.count('campaigns')).toBe(0)
    expect(upgradedDb.objectStoreNames.contains('campaign-owners')).toBe(true)
    upgradedDb.close()
  })

  it('preserves a changed scene quality mode across a real IndexedDB reload', async () => {
    const storage = await import('./storage')
    await storage.clearCampaigns()
    const campaign = createDemoCampaign()
    campaign.settings.qualityMode = 'balanced'
    await storage.saveCampaign(campaign, 'settings-owner')

    const [reloaded] = await storage.getCampaignsForOwner('settings-owner')
    expect(reloaded.settings.qualityMode).toBe('balanced')
  })

  it('claims guest stories once and keeps campaigns isolated by account', async () => {
    const storage = await import('./storage')
    await storage.clearCampaigns()
    const guest = createDemoCampaign()
    const other = { ...createDemoCampaign(), id: crypto.randomUUID(), title: 'Другой аккаунт' }
    await storage.saveCampaign(guest, 'guest')
    await storage.saveCampaign(other, 'user-b')

    await storage.claimGuestCampaigns('user-a')

    expect((await storage.getCampaignsForOwner('user-a')).map((campaign) => campaign.id)).toEqual([guest.id])
    expect((await storage.getCampaignsForOwner('user-b')).map((campaign) => campaign.id)).toEqual([other.id])
    expect(await storage.getCampaignsForOwner('guest')).toEqual([])
  })

  it('restores an NPC name corrupted by an operation token from the newest real snapshot', async () => {
    const storage = await import('./storage')
    const campaign = createDemoCampaign()
    const npcId = campaign.npcs[0].id
    const realName = campaign.npcs[0].name
    campaign.snapshots = [{
      turn: campaign.turn,
      messageCount: campaign.messages.length,
      eventCount: campaign.timeline.length,
      world: campaign.world,
      player: campaign.player,
      inventory: campaign.inventory,
      npcs: campaign.npcs.map((npc) => ({ ...npc })),
      quests: campaign.quests,
      lore: campaign.lore,
      memories: campaign.memories,
      scene: campaign.scene,
    }]
    campaign.npcs[0] = { ...campaign.npcs[0], name: 'update', currentGoal: 'Осмотреть имплант героя' }

    const migrated = storage.migrateCampaign(campaign)

    expect(migrated.npcs.find((npc) => npc.id === npcId)).toMatchObject({
      name: realName,
      currentGoal: 'Осмотреть имплант героя',
    })
  })

  it('adds the event director to old saves without inventing a visible event', async () => {
    const storage = await import('./storage')
    const legacy = createDemoCampaign() as Campaign & {
      eventDirectorState?: undefined
      settings: Campaign['settings'] & { eventDirector?: undefined }
    }
    delete legacy.eventDirectorState
    delete legacy.settings.eventDirector

    const migrated = storage.migrateCampaign(legacy)
    expect(migrated.settings.eventDirector).toMatchObject({
      enabled: true,
      frequency: 'rare',
      revealMode: 'world-only',
      permissions: { newCharacters: true, miracles: true },
    })
    expect(migrated.eventDirectorState).toMatchObject({
      surpriseCharge: 0,
      history: [],
      activeEvents: [],
    })
    expect(migrated.world.capabilitySystem).toBeUndefined()
    expect(migrated.player.abilities).toEqual([expect.objectContaining(legacy.player.abilities[0])])
    expect(migrated.player.abilities[0].profile).toBeUndefined()
    expect(migrated.abilityRegistry).toEqual([])
  })

  it('backfills the uniqueness registry from factual legacy item data without inventing an identity', async () => {
    const storage = await import('./storage')
    const legacy = createDemoCampaign()
    const legacyArtifact: import('../../shared/types').InventoryItem = {
      id: 'legacy-artifact', name: 'Старая печать', description: 'Печать хранит один подтверждённый след.', category: 'artifact', quantity: 1,
      rarity: 'rare', equipped: false, effects: ['Хранит след'], discoveredTurn: 0, history: [],
      artifact: { sentient: false, awakened: true, attunement: 10, bond: 0, requirements: [], passiveEffects: ['Хранит след'], combinedEffects: [], failureModes: [], components: [], powers: [], drawbacks: [], evolutionPaths: [], secrets: [] },
    }
    legacy.inventory.push(legacyArtifact)
    delete legacyArtifact.artifact!.creativeIdentity
    delete legacyArtifact.artifact!.presentation
    delete legacyArtifact.artifact!.discovery
    delete legacy.artifactRegistry

    const migrated = storage.migrateCampaign(legacy)
    expect(migrated.inventory.find((item) => item.id === legacyArtifact.id)?.artifact?.creativeIdentity).toBeUndefined()
    expect(migrated.artifactRegistry?.find((entry) => entry.artifactId === legacyArtifact.id)).toMatchObject({
      name: legacyArtifact.name,
      status: 'active',
    })
  })

  it('restores optional artifact power arrays missing from a legacy save', async () => {
    const storage = await import('./storage')
    const legacy = createDemoCampaign()
    const power: import('../../shared/types').ArtifactPower = {
      id: 'legacy-free-power',
      name: 'Тихий ключ',
      description: 'Открывает знакомый владельцу замок без отдельной ресурсной цены.',
      mastery: 60,
      costs: [],
      limitations: [],
      capabilities: ['Открывает один знакомый механический замок'],
      techniques: [],
    }
    delete (power as { costs?: import('../../shared/types').AbilityCost[] }).costs
    delete (power as { limitations?: string[] }).limitations
    legacy.inventory.push({
      id: 'legacy-free-artifact',
      name: 'Ключ без зубцов',
      description: 'Старый артефакт из сохранения прежней версии.',
      category: 'artifact',
      quantity: 1,
      rarity: 'rare',
      equipped: false,
      effects: [],
      discoveredTurn: 0,
      history: [],
      artifact: {
        sentient: false,
        awakened: true,
        attunement: 30,
        bond: 0,
        requirements: [],
        passiveEffects: [],
        combinedEffects: [],
        failureModes: [],
        components: [],
        powers: [power],
        drawbacks: [],
        evolutionPaths: [],
        secrets: [],
      },
    })

    const migratedPower = storage.migrateCampaign(legacy).inventory
      .find((item) => item.id === 'legacy-free-artifact')?.artifact?.powers[0]

    expect(migratedPower?.costs).toEqual([])
    expect(migratedPower?.limitations).toEqual([])
  })

  it('removes a legacy personal duplicate while preserving the real artifact power', async () => {
    const storage = await import('./storage')
    const legacy = createDemoCampaign()
    const item: import('../../shared/types').InventoryItem = {
      id: 'ownership-artifact', name: 'Перчатка абсолютного вектора', description: 'Артефакт управляет направлением приложенной силы.',
      category: 'artifact', quantity: 1, rarity: 'legendary', equipped: true, effects: [], discoveredTurn: 0, history: [],
      artifact: {
        sentient: false, awakened: true, attunement: 80, bond: 0, requirements: [], passiveEffects: [], combinedEffects: [], failureModes: [], components: [], drawbacks: [], evolutionPaths: [], secrets: [],
        powers: [{ id: 'vector-return', name: 'Возврат вектора', description: 'Разворачивает направление приложенной к владельцу силы.', mastery: 80, costs: [], limitations: [], category: 'control', capabilities: ['Возвращает импульс к его источнику'], techniques: [] }],
      },
    }
    legacy.inventory.push(item)
    const power = item.artifact!.powers[0]
    legacy.player.abilities.push({
      ...structuredClone(legacy.player.abilities[0]),
      id: 'duplicated-item-power',
      name: power.name,
      description: power.description,
      source: `Item: ${item.name}`,
      capabilities: [...(power.capabilities ?? [])],
    })

    const migrated = storage.migrateCampaign(legacy)
    expect(migrated.player.abilities.some((ability) => ability.id === 'duplicated-item-power')).toBe(false)
    expect(migrated.inventory.find((entry) => entry.id === item.id)?.artifact?.powers.some((entry) => entry.id === power.id)).toBe(true)
    expect(migrated.abilityRegistry?.find((entry) => entry.abilityId === 'duplicated-item-power')?.status).not.toBe('active')
  })
})
