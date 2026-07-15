import { describe, expect, it } from 'vitest'
import type { StateChange } from '../../shared/types'
import { createDemoCampaign } from './demo'
import { applyPatch, commitTurn, rewindLastTurn } from './engine'
import { diffCampaignState } from './state-changes'

describe('state engine', () => {
  it('maintains a large-scale atlas and archives finished active state instead of losing history', () => {
    const campaign = createDemoCampaign()
    campaign.quests.push({ id: 'quest-done', title: 'Закрыть ворота', description: 'Ворота должны быть запечатаны.', status: 'completed', objectives: [] })
    campaign.threads = [{ id: 'thread-done', type: 'promise', title: 'Обещание у ворот', detail: 'Герой обещал закрыть ворота.', participantIds: [campaign.player.id], status: 'resolved', secret: false, createdTurn: 1 }]
    const next = applyPatch(campaign, {
      world: {
        upsertPlaces: [{ id: 'place-country', name: 'Северная страна', kind: 'country', description: 'Холодная страна торговых застав.', scale: 'страна', culture: ['Путевые клятвы'], notableFacts: ['Зимние дороги охраняют гильдии'], currentSituation: 'Караваны меняют маршруты.', visibility: 'known' }],
        upsertProcesses: [{ id: 'process-caravans', title: 'Перенос караванных путей', description: 'Торговцы обходят опасные перевалы.', scopeIds: ['place-country'], involvedFactionNames: [], drivers: ['Сход лавин'], obstacles: ['Нехватка проводников'], stage: 'Размечен восточный обход.', momentum: 44, direction: 'rising', status: 'active', visibility: 'known', nextMilestone: 'Первый зимний караван', consequences: ['Старые заставы потеряют доход'] }],
      },
      cleanup: {
        quests: [{ targetId: 'quest-done', reason: 'Ворота запечатаны.' }],
        threads: [{ targetId: 'thread-done', reason: 'Обещание исполнено.' }],
      },
    }, 5)

    expect(next.world.places?.[0]).toMatchObject({ id: 'place-country', lastChangedTurn: 5 })
    expect(next.world.processes?.[0]).toMatchObject({ id: 'process-caravans', momentum: 44 })
    expect(next.quests.some((quest) => quest.id === 'quest-done')).toBe(false)
    expect(next.threads).toEqual([])
    expect(next.timeline).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Закрыто: Закрыть ворота', category: 'quest' }),
      expect.objectContaining({ title: 'Закрыто: Обещание у ворот', category: 'story' }),
    ]))
  })

  it('refuses to clean active obligations', () => {
    const campaign = createDemoCampaign()
    campaign.threads = [{ id: 'thread-active', type: 'promise', title: 'Незавершённое обещание', detail: 'Дело ещё не сделано.', participantIds: [campaign.player.id], status: 'active', secret: false, createdTurn: 1 }]
    const diagnostics: StateChange[] = []
    const next = applyPatch(campaign, { cleanup: { threads: [{ targetId: 'thread-active', reason: 'Давно не упоминалось.' }] } }, 2, diagnostics)
    expect(next.threads).toHaveLength(1)
    expect(diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'system', detail: expect.stringContaining('активную запись нельзя убрать') })]))
  })
  it('creates, evolves and removes AI-authored interface modules without replacing their identity', () => {
    const campaign = createDemoCampaign()
    const module = {
      id: 'ui-memory-pressure', title: 'Давление памяти', description: 'Показывает цену удерживаемых имён.',
      placement: 'hero' as const, visual: 'meters' as const, icon: 'eye' as const, accent: '#71d3b1', secondary: '#e7b96b',
      priority: 82, visibility: 'known' as const, reason: 'Память в Эйдоле имеет физический вес.',
      updatePolicy: 'Обновлять след после кражи, возврата или запечатывания воспоминания.', collapsible: true, collapsedByDefault: false,
      elements: [{ id: 'memory-focus', label: 'Фокус памяти', kind: 'meter' as const, state: 'normal' as const, binding: { domain: 'player.resource' as const, key: 'focus' }, links: [] }],
    }
    const created = applyPatch(campaign, { world: { upsertInterfaceModules: [module] } }, 3)
    expect(created.world.interfaceModules?.[0]).toMatchObject({ id: module.id, createdTurn: 3, lastChangedTurn: 3 })

    const evolved = applyPatch(created, { world: { upsertInterfaceModules: [{ ...module, title: 'Вес утраченных имён', priority: 95 }] } }, 7)
    expect(evolved.world.interfaceModules?.[0]).toMatchObject({ id: module.id, title: 'Вес утраченных имён', priority: 95, createdTurn: 3, lastChangedTurn: 7 })
    expect(diffCampaignState(created, evolved)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'world', entityId: module.id, label: 'Интерфейс мира: Вес утраченных имён' })]))

    const removed = applyPatch(evolved, { world: { removeInterfaceModuleIds: [module.id] } }, 8)
    expect(removed.world.interfaceModules).toEqual([])
  })

  it('rejects an incomplete server turn before reading a null statePatch', () => {
    const campaign = createDemoCampaign()
    expect(() => commitTurn(campaign, 'Иду дальше', 'do', null as unknown as Parameters<typeof commitTurn>[3])).toThrow('statePatch отсутствует')
  })
  it('applies valid deltas, clamps resources and ignores unknown stats', () => {
    const campaign = createDemoCampaign()
    const next = applyPatch(campaign, { resourceDeltas: { focus: -50 }, statDeltas: { missing: 100, resolve: 2 } }, 1)
    expect(next.player.resources.find((item) => item.key === 'focus')?.value).toBe(0)
    expect(next.player.stats.find((item) => item.key === 'resolve')?.value).toBe(8)
    expect(next.player.stats).toHaveLength(campaign.player.stats.length)
  })

  it('persists, evolves and removes causal laws and mechanics while advancing a faction', () => {
    const campaign = createDemoCampaign()
    const faction = campaign.world.factions[0]
    const created = applyPatch(campaign, { world: {
      upsertLaws: [{
        id: 'law-night-trade', title: 'Ночной торговый устав', description: 'После заката торговля разрешена только при свидетеле гильдии.',
        scope: 'Пограничный квартал', authority: 'Гильдия весов', status: 'proposed', visibility: 'known', consequences: ['Конфискация спорного товара'],
      }],
      upsertMechanics: [{
        id: 'mechanic-witness-price', name: 'Цена свидетеля', description: 'Публичный свидетель делает сделку исполнимой для местных фракций.',
        category: 'economic', trigger: 'Сделку подтверждает признанный свидетель.', effects: ['Возникает обязательство сторон'], source: 'Обычай Пограничного квартала', discovered: true, status: 'emerging',
      }],
      upsertFactions: [{
        ...faction, description: faction.description, attitude: faction.attitude, power: 64,
        currentMove: 'Добивается права назначать торговых свидетелей.', goals: ['Подчинить ночную торговлю'],
      }],
    } }, 4)

    expect(created.world.laws?.[0]).toMatchObject({ id: 'law-night-trade', createdTurn: 4, lastChangedTurn: 4, status: 'proposed' })
    expect(created.world.mechanics?.[0]).toMatchObject({ id: 'mechanic-witness-price', createdTurn: 4, status: 'emerging' })
    expect(created.world.factions[0]).toMatchObject({ power: 64, currentMove: 'Добивается права назначать торговых свидетелей.', lastChangedTurn: 4 })

    const evolved = applyPatch(created, { world: {
      upsertLaws: [{ ...created.world.laws![0], status: 'active', description: 'Совет утвердил ночную торговлю только при свидетеле гильдии.' }],
      upsertMechanics: [{ ...created.world.mechanics![0], status: 'active', effects: ['Возникает обязательство сторон', 'Нарушение сделки меняет репутацию'] }],
    } }, 7)
    expect(evolved.world.laws?.[0]).toMatchObject({ status: 'active', createdTurn: 4, lastChangedTurn: 7 })
    expect(evolved.world.mechanics?.[0]).toMatchObject({ status: 'active', createdTurn: 4, lastChangedTurn: 7 })
    expect(diffCampaignState(created, evolved)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'world', entityId: 'law-night-trade', detail: 'proposed → active' }),
      expect.objectContaining({ kind: 'world', entityId: 'mechanic-witness-price', detail: 'emerging → active' }),
    ]))

    const removed = applyPatch(evolved, { world: { removeLawIds: ['law-night-trade'], removeMechanicIds: ['mechanic-witness-price'] } }, 8)
    expect(removed.world.laws).toEqual([])
    expect(removed.world.mechanics).toEqual([])
  })

  it('merges stackable items but keeps artifacts separate', () => {
    const campaign = createDemoCampaign()
    const first = applyPatch(campaign, { inventory: [{ operation: 'add', item: { name: 'Лечебная трава', description: 'Снимает лёгкое недомогание.', category: 'consumable', quantity: 2, rarity: 'common', equipped: false, effects: ['Лёгкое восстановление'] } }] }, 1)
    const second = applyPatch(first, { inventory: [{ operation: 'add', item: { name: 'лечебная трава', description: 'Снимает лёгкое недомогание.', category: 'consumable', quantity: 3, rarity: 'common', equipped: false, effects: ['Лёгкое восстановление'] } }] }, 2)
    expect(second.inventory.find((item) => item.name === 'Лечебная трава')?.quantity).toBe(5)
  })

  it('commits and rewinds a whole turn atomically', () => {
    const campaign = createDemoCampaign()
    const committed = commitTurn(campaign, 'Беру осколок', 'do', {
      narrative: 'Осколок ложится в ладонь.',
      suggestions: ['Осмотреть осколок', 'Спрятать его'],
      activeLoreIds: [],
      recalledMemoryIds: [],
      statePatch: {
        inventory: [{ operation: 'add', item: { name: 'Осколок', description: 'Холодный фрагмент неизвестного механизма.', category: 'material', quantity: 1, rarity: 'uncommon', equipped: false, effects: [] } }],
        resourceDeltas: { focus: -1 },
      },
    })
    expect(committed.turn).toBe(1)
    expect(committed.messages).toHaveLength(campaign.messages.length + 2)
    expect(committed.inventory.some((item) => item.name === 'Осколок')).toBe(true)

    const rewound = rewindLastTurn(committed)
    expect(rewound.turn).toBe(0)
    expect(rewound.messages).toHaveLength(campaign.messages.length)
    expect(rewound.inventory.some((item) => item.name === 'Осколок')).toBe(false)
    expect(rewound.player.resources.find((item) => item.key === 'focus')?.value).toBe(8)
  })

  it('clamps relationships to the supported range', () => {
    const campaign = createDemoCampaign()
    const npc = campaign.npcs[0]
    const next = applyPatch(campaign, { relationships: [{ npcId: npc.id, delta: 1000 }] }, 1)
    expect(next.npcs[0].relationship).toBe(100)
  })

  it('lets the director evolve the hero, NPC roster and world model', () => {
    const campaign = createDemoCampaign()
    const next = applyPatch(campaign, {
      playerProfile: { archetype: 'Хранитель восьмого окна', levelDelta: 1 },
      upsertStats: [{ key: 'resonance', label: 'Резонанс', value: 2, max: 10, description: 'Связь со звёздной механикой.' }],
      npcs: [{
        operation: 'add',
        npc: {
          id: 'npc-clockmaker', name: 'Часовщик Иль', role: 'Смотритель нулевой минуты', description: 'Седой мастер с часовым ключом.',
          disposition: 'Осторожен', relationship: 0, status: 'active', currentGoal: 'Удержать часы от полуночи.', lastSeen: 'Башня часов', notes: ['Слышит будущий бой колокола.'],
        },
      }],
      world: {
        addRules: ['Восьмой удар часов открывает путь между минутами.'],
        upsertLocations: [{ name: 'Башня часов', description: 'Сердце механизма вокзала.', danger: 64 }],
        calendarDayDelta: 1,
        calendarLabel: 'Утро Восьмой звезды',
      },
    }, 1)

    expect(next.player.level).toBe(2)
    expect(next.player.stats.some((stat) => stat.key === 'resonance')).toBe(true)
    expect(next.npcs.some((npc) => npc.id === 'npc-clockmaker')).toBe(true)
    expect(next.world.locations.some((location) => location.name === 'Башня часов')).toBe(true)
    expect(next.world.calendar).toEqual({ day: 2, label: 'Утро Восьмой звезды' })
  })

  it('rewinds persistent world changes together with the turn', () => {
    const campaign = createDemoCampaign()
    const committed = commitTurn(campaign, 'Жду до рассвета', 'continue', {
      narrative: 'Над вокзалом светлеет небо.', suggestions: ['Осмотреть перрон', 'Найти Миру'], activeLoreIds: [], recalledMemoryIds: [],
      statePatch: { world: { calendarDayDelta: 1, calendarLabel: 'Первое утро' } },
    })

    expect(committed.world.calendar.day).toBe(2)
    expect(rewindLastTurn(committed).world.calendar).toEqual(campaign.world.calendar)
  })

  it('tracks social systems, party and long-term scene archives atomically', () => {
    const campaign = createDemoCampaign()
    const npc = campaign.npcs[0]
    const committed = commitTurn(campaign, 'Я принимаю обещание Миры', 'say', {
      narrative: 'Мира кивает.', suggestions: ['Продолжить', 'Уточнить цену'], activeLoreIds: [], recalledMemoryIds: [],
      statePatch: {
        factionReputationDeltas: { 'Латунный хор': 7 },
        npcs: [{ operation: 'update', targetId: npc.id, npc: { recruitment: { status: 'invited', willingness: 82, reason: 'Мира сама решила помочь и озвучила своё решение.', requirements: [] } } }],
        party: { addNpcIds: [npc.id], roles: { [npc.id]: 'проводник' } },
        world: { upsertRoutes: [{ id: 'secret-road', from: 'Вокзал Нулевого часа', to: 'Обсерватория Семи окон', label: 'Служебный тоннель', travelTime: 'полчаса', distance: 4, danger: 65, discovered: true }] },
      },
      archives: [{ kind: 'scene', title: 'Принятое обещание', summary: 'Эрен принял помощь Миры.', startTurn: 0, endTurn: 1, tags: ['Мира', 'обещание'], entityIds: [npc.id], importance: 80 }],
    })
    expect(committed.partyMemberIds).toContain(npc.id)
    expect(committed.partyRoles?.[npc.id]).toBe('проводник')
    expect(committed.world.routes?.some((route) => route.id === 'secret-road')).toBe(true)
    expect(committed.archives?.at(-1)?.title).toBe('Принятое обещание')
    expect(rewindLastTurn(committed).archives).toEqual(campaign.archives)
    expect(rewindLastTurn(committed).partyRoles).toEqual(campaign.partyRoles)
  })

  it('does not add an NPC to the party without their explicit readiness', () => {
    const campaign = createDemoCampaign()
    const npc = campaign.npcs[0]
    const diagnostics: Parameters<typeof applyPatch>[3] = []
    const next = applyPatch(campaign, { party: { addNpcIds: [npc.id], roles: { [npc.id]: 'проводник' } } }, 1, diagnostics)
    expect(next.partyMemberIds).not.toContain(npc.id)
    expect(diagnostics.some((entry) => entry.detail.includes('party.addNpcIds'))).toBe(true)
  })

  it('develops old abilities and sentient artifacts without losing their identity', () => {
    const campaign = createDemoCampaign()
    const ability = campaign.player.abilities[0]
    ability.mastery = 18
    ability.effects = []
    ability.limitations = []
    ability.evolutionPaths = [{ id: 'path-echo', name: 'Echo path', description: 'A focused form.', requirement: 'Three meaningful uses.', unlocked: false }]
    const item = campaign.inventory[0]
    item.history = []
    item.artifact = {
      sentient: true, awakened: false, attunement: 12, bond: -5, personality: 'Patient but proud', mood: 'asleep',
      requirements: [], passiveEffects: [], combinedEffects: [], failureModes: [], components: [],
      powers: [{ id: 'power-memory', name: 'Memory flare', description: 'Reveals an emotional trace.', mastery: 15, costs: [{ resource: 'focus', amount: 2 }], limitations: ['Once per scene'] }],
      drawbacks: [], evolutionPaths: [{ id: 'path-name', name: 'True name', description: 'The relic accepts a name.', requirement: 'Earn its trust.', unlocked: false }], secrets: ['It remembers its first owner.'],
    }

    const next = applyPatch(campaign, {
      abilityChanges: [{
        abilityId: ability.id, masteryDelta: 90, kind: 'active', costs: [{ resource: 'focus', amount: 2 }],
        requirements: ['Touch the target'], progression: 'Mastery grows through consequential use.', tags: ['memory'],
        addEffects: ['Reads a recent emotional trace'], addLimitations: ['Strong wards distort the trace'],
        unlockEvolutionPathIds: ['path-echo'], history: { title: 'First clear echo', description: 'The ability held under pressure.' },
      }],
      artifactChanges: [{
        itemId: item.id, bondDelta: 150, attunementDelta: 200, awakened: true, mood: 'curious',
        powerMasteryDeltas: { 'power-memory': 95 }, unlockEvolutionPathIds: ['path-name'],
        history: { title: 'Awakening', description: 'The relic answered its bearer.' },
      }],
    }, 7)

    const changedAbility = next.player.abilities[0]
    const changedArtifact = next.inventory[0].artifact
    expect(changedAbility).toMatchObject({ mastery: 100, kind: 'active', progression: 'Mastery grows through consequential use.' })
    expect(changedAbility.costs).toEqual([{ resource: 'focus', amount: 2 }])
    expect(changedAbility.evolutionPaths?.[0].unlocked).toBe(true)
    expect(changedAbility.history?.at(-1)).toMatchObject({ turn: 7, title: 'First clear echo' })
    expect(changedArtifact).toMatchObject({ bond: 100, attunement: 100, awakened: true, mood: 'curious' })
    expect(changedArtifact?.powers[0].mastery).toBe(100)
    expect(changedArtifact?.evolutionPaths[0].unlocked).toBe(true)
    expect(next.inventory[0].history?.at(-1)).toMatchObject({ turn: 7, title: 'Awakening' })
  })

  it('commits a material Sandevistan upgrade to both the technique and its inventory dossier', () => {
    const campaign = createDemoCampaign()
    const ability = campaign.player.abilities[0]
    Object.assign(ability, {
      name: 'Сандевистан: ускорение', description: 'Базовый импульс ускорения.', mastery: 35,
      capabilities: ['Короткий рывок'], effects: ['Ускоряет восприятие'], limitations: ['Перегрев после одного рывка'],
    })
    const item = campaign.inventory[0]
    Object.assign(item, {
      name: 'Сандевистан Militech Falcon', description: 'Серийный нейроускоритель.', effects: ['Краткое ускорение'], history: [],
      artifact: {
        sentient: false, awakened: true, mastery: 35, attunement: 45, bond: 0,
        classification: 'Боевой нейроимплант', powerSource: 'Нейроэлектрический контур', operatingPrinciple: 'Временное ускорение обработки сигналов', scale: 'Личный',
        requirements: ['Совместимая нервная система'], passiveEffects: [], combinedEffects: [], failureModes: ['Перегрев'],
        components: [{ id: 'falcon-cooling', name: 'Контур охлаждения', description: 'Штатный теплоотвод.', role: 'Отвод тепла', status: 'active', capabilities: ['Один безопасный импульс'], required: true }],
        powers: [{ id: 'falcon-time-dilation', name: 'Режим замедленного времени', description: 'Коротко ускоряет реакцию владельца.', mastery: 35, costs: [{ resource: 'energy', amount: 8 }], limitations: ['Один импульс до перегрева'], capabilities: ['Ускоренный рывок'] }],
        drawbacks: ['Сильный перегрев'], evolutionPaths: [], secrets: [],
      },
    })

    const next = applyPatch(campaign, {
      abilityChanges: [{
        abilityId: ability.id, rank: 'Mk II', description: 'Модифицированный Сандевистан удерживает два последовательных импульса.',
        costs: [{ resource: 'energy', amount: 6 }], capabilities: ['Два последовательных рывка', 'Ускоренное прицеливание'],
        effects: ['Ускоряет восприятие и моторику'], limitations: ['После второго импульса требуется охлаждение'],
        history: { title: 'Модернизация Mk II', description: 'Установлен усиленный контур охлаждения и перепрошит контроллер.' },
      }],
      artifactChanges: [{
        itemId: item.id, itemDescription: 'Модифицированный Militech Falcon Mk II с двухступенчатым охлаждением.',
        itemEffects: ['Два последовательных импульса ускорения', 'Стабилизация прицеливания'], classification: 'Боевой нейроимплант Mk II',
        operatingPrinciple: 'Двухфазное ускорение нейросигналов с промежуточным теплоотводом', passiveEffects: ['Стабилизация моторики под ускорением'],
        powerChanges: [{
          powerId: 'falcon-time-dilation', description: 'Даёт два последовательных окна ускорения без немедленного перегрева.',
          costs: [{ resource: 'energy', amount: 6 }], capabilities: ['Два последовательных рывка', 'Ускоренное прицеливание'],
          limitations: ['После второго окна требуется полный цикл охлаждения'],
        }],
        componentChanges: [{ componentId: 'falcon-cooling', name: 'Двухступенчатый контур охлаждения', description: 'Новый теплоотвод обслуживает два импульса подряд.', addCapabilities: ['Промежуточный сброс тепла'] }],
        history: { title: 'Модернизация Mk II', description: 'Аппаратная и программная части синхронно обновлены.' },
      }],
    }, 8)

    const changedAbility = next.player.abilities.find((entry) => entry.id === ability.id)!
    const changedItem = next.inventory.find((entry) => entry.id === item.id)!
    expect(changedAbility).toMatchObject({ rank: 'Mk II', costs: [{ resource: 'energy', amount: 6 }], capabilities: ['Два последовательных рывка', 'Ускоренное прицеливание'] })
    expect(changedAbility.description).toContain('два последовательных импульса')
    expect(changedItem.description).toContain('Militech Falcon Mk II')
    expect(changedItem.effects).toEqual(['Два последовательных импульса ускорения', 'Стабилизация прицеливания'])
    expect(changedItem.artifact?.operatingPrinciple).toContain('Двухфазное ускорение')
    expect(changedItem.artifact?.powers[0]).toMatchObject({ costs: [{ resource: 'energy', amount: 6 }], capabilities: ['Два последовательных рывка', 'Ускоренное прицеливание'] })
    expect(changedItem.artifact?.components[0]).toMatchObject({ name: 'Двухступенчатый контур охлаждения', capabilities: ['Один безопасный импульс', 'Промежуточный сброс тепла'] })
    expect(diffCampaignState(campaign, next)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'ability', label: 'Сандевистан: ускорение' }),
      expect.objectContaining({ kind: 'artifact', label: 'Сандевистан Militech Falcon: Режим замедленного времени', detail: 'Описание и параметры силы обновлены' }),
    ]))
  })

  it('tracks nuanced relationships and never rewrites an established mystery truth', () => {
    const campaign = createDemoCampaign()
    const npc = campaign.npcs[0]
    npc.relationshipDimensions = { trust: 10, respect: 20, affection: 0, fear: 5, suspicion: 12, dependence: 0 }
    campaign.mysteryCases = [{
      id: 'case-1', title: 'The missing seal', premise: 'A seal vanished.', truth: 'The archivist hid it.', culpritId: npc.id,
      status: 'open', createdTurn: 0, redHerrings: ['A broken window'], revelationRules: ['Find two independent traces'],
      clues: [
        { id: 'clue-1', title: 'Wax', detail: 'Fresh blue wax.', location: 'Archive', source: 'Direct observation', discovered: false, essential: true },
        { id: 'clue-2', title: 'Ledger', detail: 'A false timestamp.', location: 'Archive', source: 'Ledger', discovered: false, essential: true },
        { id: 'clue-3', title: 'Dust', detail: 'No steps at the window.', location: 'Archive', source: 'Direct observation', discovered: false, essential: false },
      ],
    }]

    const next = applyPatch(campaign, {
      relationships: [{ npcId: npc.id, delta: 3, dimensions: { trust: 95, suspicion: -50, fear: 200 } }],
      upsertMysteryCases: [{
        ...campaign.mysteryCases[0], truth: 'A newly invented answer.', culpritId: campaign.player.id, status: 'open',
        clues: campaign.mysteryCases[0].clues.map((clue, index) => ({ ...clue, discovered: index === 0 })),
      }],
    }, 4)

    expect(next.npcs[0].relationshipDimensions).toEqual({ trust: 100, respect: 20, affection: 0, fear: 100, suspicion: -38, dependence: 0 })
    expect(next.mysteryCases?.[0]).toMatchObject({ truth: 'The archivist hid it.', culpritId: npc.id, createdTurn: 0 })
    expect(next.mysteryCases?.[0].clues[0].discovered).toBe(true)
  })

  it('advances character arcs, antagonist pressure and spendable influence as campaign state', () => {
    const campaign = createDemoCampaign()
    const npc = campaign.npcs[0]
    const next = applyPatch(campaign, {
      upsertCharacterArcs: [{ id: 'arc-player', ownerId: campaign.player.id, title: 'Identity', theme: 'Trust', currentStage: 'Choosing an ally', progress: 130, stages: ['Doubt', 'Choice', 'Acceptance'], turningPoints: ['Shared a secret'], status: 'active', secret: false, lastAdvancedTurn: 20 }],
      upsertAntagonistPlans: [{ id: 'plan-1', ownerNpcId: npc.id, title: 'Close the archive', objective: 'Erase the evidence', method: 'Political pressure', currentStep: 99, pressure: 140, resources: ['A clerk'], knowledge: ['The hero seeks the seal'], steps: [{ id: 'step-1', title: 'Lock doors', trigger: 'At dusk', consequence: 'Archive access closes', status: 'active' }], weaknesses: ['Needs a signed order'], status: 'active', secret: false, lastAdvancedTurn: 20 }],
      upsertInfluenceAssets: [{ id: 'favor-1', kind: 'favor', title: 'Archivist favor', description: 'One lawful archive request.', holderId: campaign.player.id, targetId: npc.id, value: 45, status: 'active', source: 'Saved the ledger', secret: false, acquiredTurn: 2 }],
    }, 5)

    expect(next.characterArcs?.[0]).toMatchObject({ progress: 100, lastAdvancedTurn: 5 })
    expect(next.antagonistPlans?.[0]).toMatchObject({ currentStep: 0, pressure: 100, lastAdvancedTurn: 5 })
    expect(next.influenceAssets?.[0]).toMatchObject({ holderId: campaign.player.id, targetId: npc.id, value: 45 })
  })

  it('matches stat and resource deltas through aliases and records the clamped real result', () => {
    const campaign = createDemoCampaign()
    const health = campaign.player.resources.find((resource) => resource.key === 'health')!
    health.aliases = ['hp', 'очки здоровья']

    const committed = commitTurn(campaign, 'В меня попала стрела', 'do', {
      narrative: 'Стрела задевает плечо.',
      suggestions: ['Отступить', 'Перевязать рану'],
      activeLoreIds: [],
      recalledMemoryIds: [],
      statePatch: { resourceDeltas: { HP: -500 } },
    })

    expect(committed.player.resources.find((resource) => resource.key === 'health')?.value).toBe(0)
    expect(committed.messages.at(-1)?.stateChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'health', label: health.label, before: 10, after: 0, delta: -10 }),
    ]))
    expect(committed.messages.at(-1)?.changeSummary?.some((entry) => entry.includes('10 → 0'))).toBe(true)
  })

  it('normalizes charges and durability and derives an item mechanical state', () => {
    const campaign = createDemoCampaign()
    const added = applyPatch(campaign, {
      inventory: [{ operation: 'add', item: { id: 'wand', name: 'Палочка искр', description: 'Испускает короткий разряд.', category: 'weapon', quantity: 1, rarity: 'uncommon', equipped: false, effects: ['Искровой разряд'], charges: 8, maxCharges: 3, durability: 5, maxDurability: 5 } }],
    }, 1)
    expect(added.inventory.find((item) => item.id === 'wand')).toMatchObject({ charges: 3, maxCharges: 3, state: 'intact' })

    const depleted = applyPatch(added, {
      inventory: [{ operation: 'update', targetId: 'wand', item: { charges: 0 } }],
    }, 2)
    expect(depleted.inventory.find((item) => item.id === 'wand')?.state).toBe('depleted')

    const recharged = applyPatch(depleted, {
      inventory: [{ operation: 'update', targetId: 'wand', item: { charges: 3, maxDurability: 2 } }],
    }, 3)
    expect(recharged.inventory.find((item) => item.id === 'wand')).toMatchObject({ charges: 3, durability: 2, state: 'intact' })

    const broken = applyPatch(recharged, {
      inventory: [{ operation: 'update', targetId: 'wand', item: { durability: -20 } }],
    }, 4)
    expect(broken.inventory.find((item) => item.id === 'wand')).toMatchObject({ durability: 0, state: 'broken' })
  })

  it('applies recurring effects before ticking their duration and reports both consequences', () => {
    const campaign = createDemoCampaign()
    campaign.player.statusEffects = [
      {
        id: 'poison-1',
        name: 'Яд скорпиона',
        description: 'Яд продолжает вредить телу.',
        category: 'poison',
        severity: 40,
        source: 'Укус скорпиона',
        effects: ['Теряет здоровье каждый ход'],
        resourceDeltasPerTurn: { health: -2 },
        // Recurring deltas are totals for the effect, not values multiplied by stacks.
        stacks: 3,
        duration: { unit: 'turns', remaining: 1 },
        appliedTurn: 0,
      },
      {
        id: 'expired-poison', name: 'Просроченный яд', description: 'Уже выветрился.', category: 'poison', severity: 20,
        source: 'Старая рана', effects: [], resourceDeltasPerTurn: { health: -5 }, stacks: 1,
        duration: { unit: 'indefinite', expiresTurn: 1 }, appliedTurn: 0,
      },
    ]

    const committed = commitTurn(campaign, 'Сжимаю зубы и иду дальше', 'continue', {
      narrative: 'Яд обжигает кровь, но ты продолжаешь путь.',
      suggestions: ['Найти противоядие', 'Остановиться'],
      activeLoreIds: [],
      recalledMemoryIds: [],
      statePatch: {},
    })

    expect(committed.player.resources.find((resource) => resource.key === 'health')?.value).toBe(8)
    expect(committed.player.statusEffects).toEqual([])
    expect(committed.messages.at(-1)?.stateChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'health', delta: -2 }),
      expect.objectContaining({ kind: 'condition', label: 'Яд скорпиона', tone: 'positive' }),
    ]))
  })

  it('advances scene- and day-based effect durations only when their clocks move', () => {
    const campaign = createDemoCampaign()
    campaign.player.statusEffects = [
      {
        id: 'scene-effect', name: 'До конца встречи', description: 'Действует в текущей сцене.', category: 'buff', severity: 10,
        source: 'Клятва', effects: [], stacks: 1, duration: { unit: 'scenes', remaining: 1 }, appliedTurn: 0,
      },
      {
        id: 'day-effect', name: 'Двухдневная хворь', description: 'Проходит со временем.', category: 'disease', severity: 20,
        source: 'Холод', effects: [], stacks: 1, duration: { unit: 'days', remaining: 3 }, appliedTurn: 0,
      },
    ]

    const unchangedClocks = applyPatch(campaign, { scene: { weather: 'Туман' } }, 1)
    expect(unchangedClocks.player.statusEffects.find((effect) => effect.id === 'scene-effect')?.duration.remaining).toBe(1)
    expect(unchangedClocks.player.statusEffects.find((effect) => effect.id === 'day-effect')?.duration.remaining).toBe(3)

    const advanced = applyPatch(campaign, {
      scene: { title: 'Следующая сцена' },
      world: { calendarDayDelta: 2 },
    }, 1)
    expect(advanced.player.statusEffects.some((effect) => effect.id === 'scene-effect')).toBe(false)
    expect(advanced.player.statusEffects.find((effect) => effect.id === 'day-effect')?.duration.remaining).toBe(1)
  })

  it('upserts and removes structured status effects without touching legacy conditions', () => {
    const campaign = createDemoCampaign()
    campaign.player.conditions = ['Промок']
    const affected = applyPatch(campaign, {
      upsertStatusEffects: [{
        id: 'blessing-1', name: 'Благословение пути', description: 'Шаг становится легче.', category: 'blessing', severity: 25,
        source: 'Дорожный алтарь', effects: ['Уверенный шаг'], checkModifiers: { finesse: 2 }, stacks: 1, duration: { unit: 'scenes', remaining: 2 },
      }],
    }, 1)
    expect(affected.player.statusEffects[0]).toMatchObject({ id: 'blessing-1', appliedTurn: 1, checkModifiers: { finesse: 2 } })
    expect(affected.player.conditions).toEqual(['Промок'])

    const cleared = applyPatch(affected, { removeStatusEffectIds: ['blessing-1'] }, 2)
    expect(cleared.player.statusEffects).toEqual([])
    expect(cleared.player.conditions).toEqual(['Промок'])
  })

  it('produces a typed receipt for character, inventory, social, quest, scene and world changes', () => {
    const campaign = createDemoCampaign()
    const npc = campaign.npcs[0]
    const after = applyPatch(campaign, {
      playerProfile: { lifeState: 'incapacitated', levelDelta: 1 },
      currencyDeltas: { test: 5 },
      inventory: [{ operation: 'add', item: { id: 'receipt-item', name: 'Ключ', description: 'Открывает дверь лазарета.', category: 'quest', quantity: 1, rarity: 'common', equipped: false, effects: ['Открывает запертую дверь'] } }],
      relationships: [{ npcId: npc.id, delta: -4 }],
      quests: [{ operation: 'add', quest: { id: 'receipt-quest', title: 'Выжить', description: 'Вернуться в сознание.', status: 'active', objectives: [] } }],
      scene: { location: 'Лазарет', tension: 80 },
      world: { addRules: ['Раны требуют лечения.'], calendarDayDelta: 1 },
      factionReputationDeltas: { 'Латунный хор': 3 },
    }, 1)

    const changes = diffCampaignState(campaign, after)
    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'health', label: 'Состояние жизни', after: 'incapacitated' }),
      expect.objectContaining({ kind: 'character', label: 'Уровень', delta: 1 }),
      expect.objectContaining({ kind: 'currency', label: 'test', delta: 5 }),
      expect.objectContaining({ kind: 'inventory', entityId: 'receipt-item' }),
      expect.objectContaining({ kind: 'relationship', entityId: npc.id, delta: -4 }),
      expect.objectContaining({ kind: 'quest', entityId: 'receipt-quest' }),
      expect.objectContaining({ kind: 'scene', label: 'Место' }),
      expect.objectContaining({ kind: 'world', label: 'Правило мира' }),
      expect.objectContaining({ kind: 'reputation', delta: 3 }),
    ]))
  })

  it('reports every rejected state reference instead of silently losing it', () => {
    const campaign = createDemoCampaign()
    const committed = commitTurn(campaign, 'Проверяю невозможные изменения', 'do', {
      narrative: 'Мир не принимает несуществующие ссылки.',
      suggestions: ['Продолжить', 'Осмотреться'],
      activeLoreIds: [],
      recalledMemoryIds: [],
      statePatch: {
        statDeltas: { ghostStat: 3 },
        resourceDeltas: { ghostResource: -2 },
        inventory: [{ operation: 'update', targetId: 'missing-item', item: { quantity: 2 } }],
        abilityChanges: [{ abilityId: 'missing-ability', masteryDelta: 5 }],
        artifactChanges: [{ itemId: 'missing-artifact', bondDelta: 2 }],
        removeStatusEffectIds: ['missing-effect'],
        relationships: [{ npcId: 'missing-npc-relation', delta: 1 }],
        npcs: [{ operation: 'update', targetId: 'missing-npc-update', npc: { currentGoal: 'Новая цель' } }],
        quests: [{ operation: 'complete', targetId: 'missing-quest' }],
      },
    })

    const warnings = committed.messages.at(-1)?.stateChanges?.filter((change) => change.kind === 'system') ?? []
    expect(warnings).toHaveLength(9)
    expect(warnings.every((warning) => warning.tone === 'warning')).toBe(true)
    expect(warnings.map((warning) => warning.detail)).toEqual(expect.arrayContaining([
      expect.stringContaining('statePatch.statDeltas.ghostStat'),
      expect.stringContaining('statePatch.resourceDeltas.ghostResource'),
      expect.stringContaining('statePatch.inventory[0].targetId'),
      expect.stringContaining('statePatch.abilityChanges[0].abilityId'),
      expect.stringContaining('statePatch.artifactChanges[0].itemId'),
      expect.stringContaining('statePatch.removeStatusEffectIds[0]'),
      expect.stringContaining('statePatch.relationships[0].npcId'),
      expect.stringContaining('statePatch.npcs[0].targetId'),
      expect.stringContaining('statePatch.quests[0].targetId'),
    ]))
  })

  it('diffs persistent knowledge, social graph, mysteries, plans and timeline domains', () => {
    const campaign = createDemoCampaign()
    const npc = campaign.npcs[0]
    const otherId = 'npc-social-other'
    const after = applyPatch(campaign, {
      npcs: [
        {
          operation: 'update',
          targetId: npc.id,
          npc: {
            lastSeen: 'У северных ворот',
            initiative: { intent: 'Найти героя', nextMove: 'Идти к воротам', trigger: 'На рассвете', urgency: 65, blockedBy: [], lastAdvancedTurn: 1, visibility: 'known' },
            knowledge: [{ id: 'fact-1', subject: 'Герой', statement: 'Герой прошёл через ворота.', status: 'known', confidence: 90, source: 'Свидетель', secret: false }],
          },
        },
        {
          operation: 'add',
          npc: { id: otherId, name: 'Северный дозорный', role: 'Дозорный', description: 'Следит за воротами.', disposition: 'Насторожен', relationship: 0, status: 'active', currentGoal: 'Охранять ворота', lastSeen: 'Северные ворота', notes: [] },
        },
      ],
      socialLinks: [{ id: 'social-1', fromNpcId: npc.id, toNpcId: otherId, kind: 'trust', label: 'Доверие', score: 25, secret: false, notes: [] }],
      lore: [{ id: 'lore-new', title: 'Северные ворота', type: 'location', content: 'Ворота открываются лишь на рассвете.', keys: ['ворота'], enabled: true, alwaysOn: false, secret: false, discovered: true, priority: 60 }],
      memories: [{ kind: 'fact', content: 'Герой видел знак на северных воротах.', tags: ['ворота'], importance: 70 }],
      upsertMysteryCases: [{ id: 'mystery-new', title: 'Знак на воротах', premise: 'Кто оставил знак?', truth: 'Знак оставил дозорный.', status: 'open', clues: [], redHerrings: [], revelationRules: ['Найти свидетеля'], createdTurn: 1 }],
      upsertAntagonistPlans: [{ id: 'plan-new', ownerNpcId: npc.id, title: 'Закрыть ворота', objective: 'Не выпустить героя', method: 'Поднять тревогу', currentStep: 0, pressure: 55, resources: ['Стража'], knowledge: [], steps: [{ id: 'step-new', title: 'Поднять тревогу', trigger: 'Герой у ворот', consequence: 'Ворота закрываются', status: 'active' }], weaknesses: ['Смена караула'], status: 'active', secret: false, lastAdvancedTurn: 1 }],
      events: [{ title: 'Знак замечен', description: 'Герой запомнил знак на воротах.', category: 'mystery' }],
    }, 1)

    const changes = diffCampaignState(campaign, after)
    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'character', label: expect.stringContaining('последнее появление') }),
      expect.objectContaining({ kind: 'knowledge', label: expect.stringContaining('знания') }),
      expect.objectContaining({ kind: 'relationship', entityId: 'social-1' }),
      expect.objectContaining({ kind: 'knowledge', entityId: 'lore-new' }),
      expect.objectContaining({ kind: 'knowledge', label: 'Новая память' }),
      expect.objectContaining({ kind: 'knowledge', entityId: 'mystery-new' }),
      expect.objectContaining({ kind: 'world', entityId: 'plan-new' }),
      expect.objectContaining({ kind: 'knowledge', label: 'Знак замечен', source: 'timeline' }),
    ]))
  })

  it('damages an NPC without deleting its unrelated resources, stats or status effects', () => {
    const campaign = createDemoCampaign()
    const npc = campaign.npcs[0]
    npc.stats = [
      { key: 'strength', label: 'Сила', value: 6, max: 10 },
      { key: 'reflex', label: 'Рефлексы', value: 8, max: 10 },
    ]
    npc.resources = [
      { key: 'health', label: 'Здоровье', value: 10, max: 10, kind: 'health' },
      { key: 'focus', label: 'Фокус', value: 5, max: 5, kind: 'focus' },
    ]
    npc.statusEffects = [{
      id: 'old-effect', name: 'Настороженность', description: 'Готов к нападению.', category: 'buff', severity: 20,
      source: 'Засада', effects: ['Не застать врасплох'], stacks: 1, duration: { unit: 'indefinite' }, appliedTurn: 0,
    }]

    const after = applyPatch(campaign, { npcs: [{
      operation: 'update', targetId: npc.id, npc: {
        resourceDeltas: { health: -3 },
        statDeltas: { strength: -1 },
        notes: ['Акира сломал ему палец.'],
        upsertStatusEffects: [{
          name: 'Сломанный палец', description: 'Палец травмирован захватом.', category: 'injury', severity: 45,
          source: 'Захват Акиры', effects: ['Хуже удерживает оружие'], checkModifiers: { strength: -2 }, stacks: 1,
          duration: { unit: 'days', remaining: 14 },
        }],
      },
    }] }, 3)

    const updated = after.npcs.find((entry) => entry.id === npc.id)!
    expect(updated.resources).toHaveLength(2)
    expect(updated.resources?.find((resource) => resource.key === 'health')?.value).toBe(7)
    expect(updated.resources?.find((resource) => resource.key === 'focus')?.value).toBe(5)
    expect(updated.stats).toHaveLength(2)
    expect(updated.stats?.find((stat) => stat.key === 'strength')?.value).toBe(5)
    expect(updated.statusEffects?.map((effect) => effect.name)).toEqual(['Настороженность', 'Сломанный палец'])
    expect(updated.notes).toContain('Акира сломал ему палец.')
    expect(diffCampaignState(campaign, after)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'health', label: `${npc.name}: Здоровье`, delta: -3 }),
      expect.objectContaining({ kind: 'stat', label: `${npc.name}: Сила`, delta: -1 }),
      expect.objectContaining({ kind: 'condition', label: expect.stringContaining('Сломанный палец') }),
    ]))
  })

  it('applies absolute progression, every history entry and reputation notes losslessly', () => {
    const campaign = createDemoCampaign()
    const ability = campaign.player.abilities[0]
    ability.mastery = 10
    ability.history = []
    const item = campaign.inventory[0]
    item.history = []
    item.artifact = {
      sentient: false, awakened: true, attunement: 12, bond: 0,
      requirements: [], passiveEffects: [], combinedEffects: [], failureModes: [], components: [],
      powers: [{ id: 'power-speed', name: 'Ускорение', description: 'Ускоряет восприятие.', mastery: 15, costs: [], limitations: [] }],
      drawbacks: [], evolutionPaths: [], secrets: [],
    }
    const initialReputation = campaign.factionReputation?.find((entry) => entry.factionName === 'Латунный хор')
    if (initialReputation) Object.assign(initialReputation, { value: 0, label: 'Нейтрально', notes: [] })

    const after = applyPatch(campaign, {
      abilityChanges: [
        { abilityId: ability.id, mastery: 40, history: { title: 'Засада', description: 'Ускорение помогло обезвредить лидера.' } },
        { abilityId: ability.id, history: { title: 'Точный контроль', description: 'Герой остановился в нужной точке.' } },
      ],
      artifactChanges: [
        { itemId: item.id, mastery: 3, attunement: 50, bond: 30, history: { title: 'Перегрузка', description: 'Имплант выдержал резкий манёвр.' } },
        { itemId: item.id, history: { title: 'Остывание', description: 'Система штатно сбросила тепло.' } },
      ],
      upsertFactionReputation: [{ factionName: 'Латунный хор', value: -20, label: 'Враждебность', notes: ['Лидер унижен при подчинённых.'] }],
    }, 3)

    expect(after.player.abilities.find((entry) => entry.id === ability.id)?.mastery).toBe(40)
    expect(after.player.abilities.find((entry) => entry.id === ability.id)?.history?.map((entry) => entry.title)).toEqual(['Засада', 'Точный контроль'])
    expect(after.inventory.find((entry) => entry.id === item.id)?.artifact).toMatchObject({ mastery: 3, attunement: 50, bond: 30 })
    expect(after.inventory.find((entry) => entry.id === item.id)?.history?.map((entry) => entry.title)).toEqual(['Перегрузка', 'Остывание'])
    expect(after.factionReputation?.find((entry) => entry.factionName === 'Латунный хор')).toMatchObject({ value: -20, label: 'Враждебность', notes: ['Лидер унижен при подчинённых.'] })
    expect(diffCampaignState(campaign, after)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'ability', entityId: campaign.player.id, delta: 30 }),
      expect.objectContaining({ kind: 'artifact', label: `${item.name}: общее освоение`, after: 3 }),
      expect.objectContaining({ kind: 'artifact', label: `${item.name}: Настройка`, delta: 38 }),
      expect.objectContaining({ kind: 'reputation', label: 'Латунный хор', delta: -20 }),
    ]))
  })

  it('removes any actually lost item, including rare items and part of a stack', () => {
    const campaign = createDemoCampaign()
    const rare = campaign.inventory.find((item) => item.rarity === 'rare')!
    rare.quantity = 3

    const partiallyRemoved = applyPatch(campaign, { inventory: [{ operation: 'remove', targetId: rare.id, quantity: 2, reason: 'Два экземпляра сгорели.' }] }, 1)
    expect(partiallyRemoved.inventory.find((item) => item.id === rare.id)?.quantity).toBe(1)

    const fullyRemoved = applyPatch(partiallyRemoved, { inventory: [{ operation: 'remove', targetId: rare.id, reason: 'Последний экземпляр украден.' }] }, 2)
    expect(fullyRemoved.inventory.some((item) => item.id === rare.id)).toBe(false)
    expect(diffCampaignState(partiallyRemoved, fullyRemoved)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'inventory', entityId: rare.id, tone: 'negative' }),
    ]))
  })

  it('tracks full NPC abilities, their costs and evolving strategic intelligence', () => {
    const campaign = createDemoCampaign()
    const npc = campaign.npcs[0]
    npc.resources = [{ key: 'focus', label: 'Фокус', value: 10, max: 10, kind: 'focus' }]
    const abilityId = 'npc-ability-forecast'
    const after = applyPatch(campaign, { npcs: [{ operation: 'update', targetId: npc.id, npc: {
      upsertAbilities: [{
        id: abilityId, name: 'Предваряющий расчёт', description: 'Сопоставляет микродвижения и пространство, чтобы подготовить несколько ответов до начала обмена ударами.',
        rank: 'Эксперт', source: 'Годы полевой аналитики', kind: 'reaction', mastery: 84, costs: [{ resource: 'focus', amount: 2 }],
        effects: ['Позволяет заранее выбрать линию уклонения и контратаку.'], limitations: ['Ошибается при полностью новом поведении цели.'], requirements: ['Видеть цель и её окружение.'],
        progression: 'Точность растёт на подтверждённых наблюдениях.', evolutionPaths: [], history: [{ title: 'Раскрытие', description: 'Мира показала истинную глубину расчёта.' }], tags: ['анализ', 'контратака'],
        category: 'perception', scale: 'Одна схватка и ближайшее пространство', activation: 'Непрерывное наблюдение за позой и траекторией.',
        capabilities: ['Строит несколько вероятных ответов.', 'Отбрасывает ветви после новой информации.'], synergies: ['Подготовленные ловушки'], counters: ['Новые и хаотичные действия'],
        examples: ['Замечает перенос веса и заранее уходит с линии выпада.'], canonStatus: 'original',
      }],
      resourceDeltas: { focus: -2 },
      abilityChanges: [{ abilityId, masteryDelta: 2, history: { title: 'Адаптация', description: 'Перестроила контрплан после ложного выпада.' } }],
      strategy: {
        intelligence: 91, tacticalSkill: 88, strategicSkill: 85, predictionSkill: 92, adaptability: 89, deceptionSkill: 76, riskTolerance: 40,
        planningHorizon: 'Три вероятных развилки', decisionStyle: 'Проверяет гипотезы малыми провокациями.', currentPlan: 'Вынудить героя повторить знакомый рывок.',
        observedPlayerPatterns: ['После угрозы герой сокращает дистанцию.'], strengths: ['Быстро отбрасывает неверную гипотезу.'], blindSpots: ['Мало данных о новой силе героя.'],
        contingencies: ['Разорвать дистанцию.', 'Перевести бой в тесный проход.'], visibility: 'known', lastUpdatedTurn: 1,
      },
    } }] }, 5)

    const updated = after.npcs.find((entry) => entry.id === npc.id)!
    const ability = updated.abilities?.find((entry) => entry.id === abilityId)
    expect(ability).toMatchObject({ mastery: 86, category: 'perception', activation: expect.any(String) })
    expect(ability?.history?.map((entry) => entry.title)).toEqual(['Раскрытие', 'Адаптация'])
    expect(updated.resources?.[0].value).toBe(8)
    expect(updated.strategy).toMatchObject({ intelligence: 91, predictionSkill: 92, observedPlayerPatterns: ['После угрозы герой сокращает дистанцию.'], lastUpdatedTurn: 5 })
    expect(diffCampaignState(campaign, after)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'ability', label: expect.stringContaining('Предваряющий расчёт') }),
      expect.objectContaining({ kind: 'character', label: expect.stringContaining('стратегия') }),
    ]))
  })
})
