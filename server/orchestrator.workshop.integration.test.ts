import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDemoCampaign } from '../src/lib/demo'
import { editCampaign } from './orchestrator'

const provider = {
  provider: 'ollama' as const,
  model: 'deepseek-v4-flash:cloud',
  baseUrl: 'https://example.test/v1',
  apiKey: 'test-key',
  temperature: 0.8,
}

function providerResponse(value: unknown) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('campaign workshop event controls', () => {
  it('repairs a resource-only answer until the requested NPC is actually resurrected', async () => {
    const campaign = createDemoCampaign()
    const target = campaign.npcs[0]
    target.name = 'Элиан'
    target.status = 'dead'
    target.resources = [{ key: 'lifeEnergy', label: 'Жизненная энергия', value: 0, max: 100, kind: 'health', aliases: [] }]
    campaign.scene.presentNpcIds = []
    campaign.messages.push({
      id: 'failed-resurrection', role: 'assistant', turn: campaign.turn, createdAt: new Date().toISOString(),
      content: 'Элиан остался мёртв после неудачной попытки воскрешения.',
    })
    const incomplete = {
      summary: 'Ресурс героя восстановлен.', campaignPatch: {}, settingsPatch: {},
      statePatch: { upsertResources: [{ key: 'lifeEnergy', label: 'Жизненная энергия', value: 100, max: 100, kind: 'health', aliases: [] }] },
    }
    const complete = {
      summary: 'Последняя попытка действительно воскресила Элиана.', campaignPatch: {}, settingsPatch: {},
      statePatch: {
        npcs: [{ operation: 'update', targetId: target.id, npc: { status: 'active', lastSeen: campaign.scene.location, resourceDeltas: { lifeEnergy: 30 } } }],
        scene: { presentNpcIds: [target.id] },
        memories: [{ kind: 'fact', content: 'Акира успешно воскресил Элиана, и тот вернулся к жизни.', tags: ['Акира', 'Элиан', 'воскрешение'], importance: 95 }],
      },
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(providerResponse(incomplete))
      .mockResolvedValueOnce(providerResponse(complete))
    vi.stubGlobal('fetch', fetchMock)

    const result = await editCampaign({
      campaign,
      instruction: 'Сделай так, чтобы у меня получилось воскресить его.',
      provider,
    })

    expect(result.statePatch.npcs).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: 'update', targetId: target.id, npc: expect.objectContaining({ status: 'active' }) }),
    ]))
    expect(result.statePatch.memories?.[0].content).toContain('воскресил Элиана')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('validates a new workshop event independently when another owner event is already queued', async () => {
    const campaign = createDemoCampaign()
    campaign.eventDirectorState = {
      surpriseCharge: 100,
      lastSeedTurn: 0,
      lastManifestedTurn: 0,
      lastLegendaryTurn: 0,
      lastMiracleTurn: undefined,
      miracleCount: 0,
      categoryCooldowns: {},
      recentSignatures: [],
      history: [],
      nextEvaluationTurn: campaign.turn + 1,
      lastEvaluatedTurn: campaign.turn,
      activeEvents: [{
        id: 'event-already-queued',
        concept: 'Ранее назначенный визит посланника.',
        category: 'revelation',
        magnitude: 'notable',
        miracleKind: 'none',
        originKind: 'existing_npc',
        sourceIds: [],
        causeIds: [campaign.player.id],
        scopeIds: [],
        participantIds: [],
        affectedDomains: ['scene'],
        knowledgeChannel: 'Посланник объявил о визите заранее.',
        trigger: 'Наступил назначенный день.',
        arrivalMethod: 'Посланник прибывает по обычной дороге.',
        observableSigns: ['У ворот появился герб посланника.'],
        immediateEffects: [{ domain: 'scene', operation: 'update', requirement: 'Показать прибытие посланника.', observable: true, mandatory: true }],
        persistentEffects: [],
        counterplay: [],
        cancellationConditions: [],
        canonReasoning: 'Событие опирается на установленный мир.',
        pacingReasoning: 'Визит был назначен заранее.',
        noveltyReasoning: 'Это продолжение прежней линии.',
        minimumDelay: 0,
        stage: 'imminent',
        signature: 'queued-owner-event',
        createdTurn: campaign.turn,
        lastAdvancedTurn: campaign.turn,
        nextEligibleTurn: campaign.turn + 1,
        workshopDirective: { requestedByOwner: true, delivery: 'next-turn', requestedTurn: campaign.turn },
      }],
    }
    const response = {
      summary: 'Новая встреча также назначена. ',
      campaignPatch: {},
      settingsPatch: {},
      statePatch: {},
      eventDirective: {
        delivery: 'seed',
        proposal: {
          mode: 'foreshadow', lifecycleStage: 'foreshadowed', concept: 'Новая охотница прибывает вслед за собственной целью.',
          category: 'revelation', magnitude: 'subtle', miracleKind: 'none', originKind: 'new_npc',
          sourceIds: ['npc-second-owner-event'], causeIds: [campaign.player.id], scopeIds: ['npc-second-owner-event'], participantIds: ['npc-second-owner-event'], affectedDomains: ['scene', 'npc', 'world-event'],
          knowledgeChannel: 'Герой замечает прибытие.', trigger: 'Охотница завершила долгий путь.',
          arrivalMethod: 'Она приходит по существующей дороге.', observableSigns: ['У дороги видны свежие следы.', 'Дозорные передают её точное описание.'],
          immediateEffects: [
            { domain: 'npc', operation: 'create', targetId: 'npc-second-owner-event', requirement: 'Создать полную самостоятельную охотницу.', observable: true, mandatory: true },
            { domain: 'scene', operation: 'update', requirement: 'Показать её прибытие без решения за героя.', observable: true, mandatory: true },
          ],
          persistentEffects: [
            { domain: 'world-event', operation: 'create', targetId: 'world-event-second-huntress', requirement: 'Сохранить прибытие охотницы как действующее событие мира.', observable: true, mandatory: true },
          ], counterplay: ['Не вступать в контакт.'], cancellationConditions: [],
          canonReasoning: 'Новая жительница допустима.', pacingReasoning: 'Событие открывает новую линию.', noveltyReasoning: 'Не повторяет визит посланника.', minimumDelay: 0,
        },
      },
    }
    const fetchMock = vi.fn(async () => providerResponse(response))
    vi.stubGlobal('fetch', fetchMock)

    const result = await editCampaign({
      campaign,
      instruction: 'На следующем ходу пусть появится новая охотница.',
      eventOptions: { delivery: 'next-turn', magnitude: 'major', category: 'encounter' },
      provider,
    })

    expect(result.eventDirective).toMatchObject({
      delivery: 'next-turn',
      proposal: { mode: 'manifest', lifecycleStage: 'manifested', magnitude: 'major', category: 'encounter' },
    })
    expect(result.statePatch.eventDirectorState?.activeEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'event-already-queued', workshopDirective: expect.objectContaining({ requestedByOwner: true }) }),
      expect.objectContaining({ concept: 'Новая охотница прибывает вслед за собственной целью.', workshopDirective: expect.objectContaining({ requestedByOwner: true }) }),
    ]))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('queues the exact requested legendary event for the next RP turn without applying it early', async () => {
    const campaign = createDemoCampaign()
    const response = {
      summary: 'Легендарная встреча назначена на следующий ход.',
      campaignPatch: {},
      settingsPatch: {},
      statePatch: {},
      eventDirective: {
        delivery: 'next-turn',
        proposal: {
          mode: 'manifest', lifecycleStage: 'manifested', concept: 'Легендарный странник прибывает по собственной старой клятве.',
          category: 'encounter', magnitude: 'legendary', miracleKind: 'none', originKind: 'new_npc',
          sourceIds: ['npc-workshop-legend'], causeIds: [campaign.player.id], scopeIds: ['npc-workshop-legend', 'world-event-legend-arrival'], participantIds: ['npc-workshop-legend'], affectedDomains: ['scene', 'npc', 'world-event', 'world-pressure', 'legend'],
          knowledgeChannel: 'Городская стража объявляет о прибытии.', trigger: 'Сегодня истёк установленный клятвой срок.',
          arrivalMethod: 'Странник добрался до города существующим караванным маршрутом.', observableSigns: ['У ворот собирается усиленная стража.', 'Старые клятвенные печати одновременно начинают светиться.', 'В городе узнают знак давно исчезнувшего ордена.'],
          immediateEffects: [
            { domain: 'npc', operation: 'create', targetId: 'npc-workshop-legend', requirement: 'Создать полного уникального легендарного NPC.', observable: true, mandatory: true },
            { domain: 'scene', operation: 'update', requirement: 'Причинно показать прибытие странника.', observable: true, mandatory: true },
          ],
          persistentEffects: [
            { domain: 'world-event', operation: 'create', targetId: 'world-event-legend-arrival', requirement: 'Зафиксировать прибытие как историческое событие, на которое реагирует город.', observable: true, mandatory: true },
            { domain: 'world-pressure', operation: 'create', targetId: 'world-pressure-old-oath', requirement: 'Сохранить давление неисполненной древней клятвы на связанные силы мира.', observable: false, mandatory: true },
            { domain: 'legend', operation: 'create', targetId: 'legend-workshop-stranger', requirement: 'Создать причинно связанную запись живой легенды и её наследия.', observable: false, mandatory: true },
          ], counterplay: ['Не выходить к воротам.', 'Узнать цель странника через посредника.'], cancellationConditions: ['Клятва будет достоверно признана исполненной.'],
          canonReasoning: 'Клятва связана с уже установленным героем.', pacingReasoning: 'Встреча открывает подготовленную линию.', noveltyReasoning: 'Способ появления и цель не повторяют недавние события.', minimumDelay: 0,
        },
      },
    }
    const fetchMock = vi.fn(async () => providerResponse(response))
    vi.stubGlobal('fetch', fetchMock)

    const result = await editCampaign({
      campaign,
      instruction: 'Создай легендарного странника на следующем ходу.',
      eventOptions: { delivery: 'next-turn', magnitude: 'legendary', category: 'encounter' },
      provider,
    })

    const materialKeys = Object.entries(result.statePatch).filter(([key, value]) => (
      key === 'eventDirectorState'
      || (Array.isArray(value) ? value.length > 0 : value && typeof value === 'object' ? Object.keys(value).length > 0 : value !== undefined)
    )).map(([key]) => key)
    expect(materialKeys).toEqual(['eventDirectorState'])
    expect(result.eventDirective).toMatchObject({ delivery: 'next-turn', proposal: { magnitude: 'legendary', category: 'encounter' } })
    expect(result.statePatch.eventDirectorState?.activeEvents[0]).toMatchObject({
      stage: 'imminent',
      magnitude: 'legendary',
      nextEligibleTurn: campaign.turn + 1,
      workshopDirective: { requestedByOwner: true, delivery: 'next-turn' },
    })
    expect(result.eventDirective?.proposal.affectedDomains).toEqual(['scene', 'npc', 'world-event', 'world-pressure', 'legend'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('binds model-authored new entities, dependent mutations and non-emergency miracle metadata without repair calls', async () => {
    const campaign = createDemoCampaign()
    const response = {
      summary: 'Необычная встреча назначена на следующий ход.',
      campaignPatch: {},
      settingsPatch: {},
      statePatch: {},
      eventDirective: {
        delivery: 'next-turn',
        proposal: {
          mode: 'manifest', lifecycleStage: 'manifested', concept: 'Неизвестный проводник появляется у закрытого перехода.',
          category: 'encounter', magnitude: 'notable', miracleKind: 'intervention', originKind: 'new_npc',
          sourceIds: ['npc-unbound-guide'], causeIds: ['invented-cause-id'], scopeIds: [], participantIds: ['npc-unbound-guide'], affectedDomains: ['scene'],
          knowledgeChannel: 'Герой видит прибытие собственными глазами.', trigger: 'Проводник завершил долгий самостоятельный поиск перехода.',
          arrivalMethod: 'Он выходит из существующего тоннеля и останавливается на расстоянии.', observableSigns: ['На одежде видна пыль дальнего маршрута.'],
          immediateEffects: [
            { domain: 'npc', operation: 'create', requirement: 'Создать полного самостоятельного NPC-проводника.', observable: true, mandatory: true },
            { domain: 'npc', operation: 'update', requirement: 'Зафиксировать для нового проводника текущую цель изучить переход.', observable: false, mandatory: true },
            { domain: 'scene', operation: 'update', requirement: 'Показать наблюдаемое прибытие, не решая реакцию героя.', observable: true, mandatory: true },
          ],
          persistentEffects: [], counterplay: [], cancellationConditions: ['Проводник обнаружит, что переход окончательно уничтожен.'],
          canonReasoning: 'Событие использует обычного нового жителя мира.', pacingReasoning: 'Короткая встреча открывает возможность, но ничего не навязывает.', noveltyReasoning: 'Проводник имеет самостоятельную цель.', minimumDelay: 0,
        },
      },
    }
    const fetchMock = vi.fn(async () => providerResponse(response))
    vi.stubGlobal('fetch', fetchMock)

    const result = await editCampaign({
      campaign,
      instruction: 'На следующем ходу пусть появится новый проводник.',
      eventOptions: { delivery: 'next-turn', magnitude: 'notable', category: 'encounter' },
      provider,
    })

    const proposal = result.eventDirective?.proposal
    const createdNpc = proposal?.immediateEffects.find((effect) => effect.domain === 'npc' && effect.operation === 'create')
    const updatedNpc = proposal?.immediateEffects.find((effect) => effect.domain === 'npc' && effect.operation === 'update')
    expect(createdNpc?.targetId).toBe('npc-unbound-guide')
    expect(updatedNpc?.targetId).toBe('npc-unbound-guide')
    expect(proposal?.sourceIds).toEqual(['npc-unbound-guide'])
    expect(proposal?.participantIds).toEqual(['npc-unbound-guide'])
    expect(proposal?.causeIds).toEqual([])
    expect(proposal?.miracleKind).toBe('none')
    expect(proposal?.affectedDomains).toEqual(['scene', 'npc'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('canonicalizes several unknown permanent entities and mislabeled creation operations in one pass', async () => {
    const campaign = createDemoCampaign()
    const response = {
      summary: 'Новая охотница и её печать назначены на следующий ход.',
      campaignPatch: {},
      settingsPatch: {},
      statePatch: {},
      eventDirective: {
        delivery: 'next-turn',
        proposal: {
          mode: 'manifest', lifecycleStage: 'manifested', concept: 'Охотница приходит с ещё не существовавшей печатью перехода.',
          category: 'encounter', magnitude: 'notable', miracleKind: 'intervention', originKind: 'multiple',
          sourceIds: ['npc-workshop-hunter', 'artifact-workshop-seal'], causeIds: ['unknown-rumor'], scopeIds: [], participantIds: ['npc-workshop-hunter'], affectedDomains: ['scene'],
          knowledgeChannel: 'Герой наблюдает её прибытие.', trigger: 'Охотница завершила самостоятельное расследование.',
          arrivalMethod: 'Она приходит по существующей дороге.', observableSigns: ['На её ладони видна незнакомая печать.'],
          immediateEffects: [
            { domain: 'npc', operation: 'create', requirement: 'Создать новую самостоятельную охотницу.', observable: true, mandatory: true },
            { domain: 'npc', operation: 'update', requirement: 'Зафиксировать цель новой охотницы исследовать переход.', observable: false, mandatory: true },
            { domain: 'artifact', operation: 'transform', targetId: 'artifact-workshop-seal', requirement: 'Создать новый постоянный артефакт-печать.', observable: true, mandatory: true },
            { domain: 'scene', operation: 'update', requirement: 'Показать прибытие, не назначая герою реакцию.', observable: true, mandatory: true },
          ],
          persistentEffects: [], counterplay: ['Не вступать в контакт.'], cancellationConditions: ['Охотница откажется от расследования.'],
          canonReasoning: 'Новые сущности не противоречат миру.', pacingReasoning: 'Событие открывает возможность.', noveltyReasoning: 'Новый мотив и способ появления.', minimumDelay: 0,
        },
      },
    }
    const fetchMock = vi.fn(async () => providerResponse(response))
    vi.stubGlobal('fetch', fetchMock)

    const result = await editCampaign({
      campaign,
      instruction: 'На следующем ходу создай охотницу с новым артефактом.',
      eventOptions: { delivery: 'next-turn', magnitude: 'notable', category: 'encounter' },
      provider,
    })

    const proposal = result.eventDirective?.proposal
    const createdNpc = proposal?.immediateEffects.find((effect) => effect.domain === 'npc' && effect.operation === 'create')
    const dependentNpc = proposal?.immediateEffects.find((effect) => effect.domain === 'npc' && effect.requirement.includes('цель'))
    const createdArtifact = proposal?.immediateEffects.find((effect) => effect.domain === 'artifact')
    expect(createdNpc?.targetId).toBe('npc-workshop-hunter')
    expect(dependentNpc).toMatchObject({ operation: 'update', targetId: 'npc-workshop-hunter' })
    expect(createdArtifact).toMatchObject({ operation: 'create', targetId: 'artifact-workshop-seal' })
    expect(proposal?.sourceIds).toEqual(['npc-workshop-hunter', 'artifact-workshop-seal'])
    expect(proposal?.causeIds).toEqual([])
    expect(proposal?.miracleKind).toBe('none')
    expect(proposal?.affectedDomains).toEqual(['scene', 'npc', 'artifact'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
