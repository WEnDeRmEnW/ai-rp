import { describe, expect, it } from 'vitest'
import type { NPC, NPCDossierSection, StateChange, TurnPatch } from '../../shared/types'
import { createDemoCampaign } from './demo'
import { applyPatch, commitTurn, describePatch, rewindLastTurn } from './engine'
import { diffCampaignState } from './state-changes'

function revealNpc(npc: NPC, sections: NPCDossierSection[], statKeys: string[] = [], resourceKeys: string[] = [], abilityIds: string[] = []) {
  npc.dossier = { familiarity: 'familiar', revealedSections: sections, revealedStatKeys: statKeys, revealedResourceKeys: resourceKeys, revealedAbilityIds: abilityIds, evidence: [], updatedTurn: 0 }
}

type InterfaceModuleDraft = NonNullable<NonNullable<TurnPatch['world']>['upsertInterfaceModules']>[number]

function interfaceModule(id: string, title: string, priority: number, elements?: InterfaceModuleDraft['elements']): InterfaceModuleDraft {
  return {
    id,
    title,
    description: `Живой модуль «${title}».`,
    placement: 'dashboard',
    visual: 'cards',
    icon: 'pulse',
    accent: '#71d3b1',
    secondary: '#e7b96b',
    priority,
    visibility: 'known',
    reason: 'Показатель важен для этого мира.',
    updatePolicy: 'Обновлять при изменении соответствующего состояния.',
    collapsible: true,
    collapsedByDefault: false,
    elements: elements ?? [{ id: `${id}-value`, label: 'Значение', kind: 'value', value: 1, state: 'normal', links: [] }],
  }
}

function legendaryFigure(characterId?: string): NonNullable<NonNullable<TurnPatch['world']>['upsertLegends']>[number] {
  return {
    id: 'legend-rin',
    characterId,
    name: 'Рин, Хранительница последнего пути',
    aliases: ['Рин Астэр'],
    titles: ['Хранительница последнего пути'],
    epithet: 'Та, кто вывела караван сквозь погасшую сеть',
    role: 'Живая защитница путей и полевой стратег',
    summary: 'Рин спасла несколько поселений, связав разрозненные пути в работающий маршрут эвакуации.',
    origin: 'Полевой связной Центральной области.',
    era: 'Текущая эпоха',
    stage: 'legendary',
    lifeStatus: 'living',
    scope: 'regional',
    truthStatus: 'confirmed',
    renown: 74,
    influence: 63,
    reputation: 'Перевозчики доверяют её маршрутам, а Хранители опасаются независимости её решений.',
    knownFeats: ['Вывела караван из зоны цепного отказа', 'Сорвала закрытие нейтральной переправы'],
    disputedClaims: ['Будто бы она заранее знает каждый обвал пути'],
    associatedFactionNames: [],
    relatedNpcIds: [],
    successorNpcIds: [],
    deeds: [
      {
        id: 'deed-caravan',
        title: 'Путь сквозь отказ',
        summary: 'Рин проложила маршрут между гаснущими узлами и вывела караван до обрушения сети.',
        era: 'Текущая эпоха',
        scale: 'regional',
        scopeIds: [],
        factionNames: [],
        witnesses: ['Экипажи каравана'],
        consequences: ['Поселения получили припасы', 'Маршрут эвакуации сохранился в полевых картах'],
        truth: 'confirmed',
        visibility: 'known',
        renownImpact: 24,
      },
      {
        id: 'deed-bridge',
        title: 'Ночь закрытого моста',
        summary: 'Рин добилась отсрочки силового закрытия переправы и вывела гражданских.',
        era: 'Текущая эпоха',
        scale: 'local',
        scopeIds: [],
        factionNames: [],
        witnesses: ['Береговые старосты'],
        consequences: ['Переправа сохранила нейтралитет', 'Приказ о закрытии был оспорен'],
        truth: 'confirmed',
        visibility: 'rumored',
        renownImpact: 18,
      },
    ],
    myths: [{
      id: 'myth-map',
      title: 'Карта, видящая будущее',
      claim: 'Рин будто бы читает разрушение пути до первых признаков.',
      origin: 'Рассказы спасённых перевозчиков',
      spread: 'Передаётся между караванами.',
      believers: ['Молодые проводники'],
      distortion: 'Её прогноз основан на наблюдениях и расчёте, а не на ясновидении.',
      truth: 'distorted',
      visibility: 'rumored',
    }],
    legacies: [{
      id: 'legacy-route',
      name: 'Полевой протокол Рин',
      kind: 'school',
      description: 'Метод проверки маршрута через независимые наблюдения и запасные развилки.',
      status: 'Используется несколькими караванами',
      holderNpcIds: characterId ? [characterId] : [],
      scopeIds: [],
      factionNames: [],
      accessConditions: ['Пройти маршрут вместе с опытным проводником'],
      consequences: ['Снижает риск цепной ошибки', 'Требует времени и нескольких наблюдателей'],
      visibility: 'known',
    }],
    currentState: {
      activity: 'Проверяет следующий безопасный маршрут.',
      objective: 'Сохранить путь между изолированными поселениями.',
      mobility: 'Перемещается с караванами по доступным дорогам.',
      encounterReadiness: 65,
      encounterConditions: ['Оказаться на маршруте её текущей миссии'],
      blockers: ['Удалённость текущего каравана'],
      signs: ['Полевые метки на развилках'],
      lastConfirmedAt: 'Надёжный отчёт перевозчиков',
    },
    emergence: {
      momentum: 58,
      nextMilestone: 'Успешно открыть постоянный безопасный путь',
      qualifyingSigns: ['Свершения подтверждены независимыми свидетелями'],
      disqualifiers: ['Доказанная подделка полевых отчётов'],
    },
    canon: {
      status: 'original',
      source: 'Состояние кампании',
      continuity: 'Основная линия кампании',
      anchorFacts: ['Рин жива', 'Её прогноз не является ясновидением'],
      forbiddenContradictions: ['Нельзя телепортировать Рин к герою', 'Нельзя приписывать ей всеведение'],
      divergenceNotes: [],
    },
    discovery: {
      visibility: 'known',
      awareness: 54,
      revealedSections: ['identity', 'summary', 'status', 'deeds', 'myths', 'legacies'],
      evidence: [{
        id: 'evidence-caravan',
        section: 'deeds',
        summary: 'Спасённые экипажи независимо подтвердили маршрут.',
        source: 'Свидетельства каравана',
        reliability: 91,
      }],
    },
  }
}

describe('state engine', () => {
  it('keeps legendary figures causal, linked to living characters and server-stamped without leaking turn fields into model patches', () => {
    const campaign = createDemoCampaign()
    const npc = campaign.npcs[0]
    campaign.world.legendarium = {
      name: 'Память путей',
      summary: 'Легендой становится тот, чьи решения сохраняют путь для других.',
      recognitionRules: ['Подтверждённое свершение с устойчивым последствием'],
      transmissionChannels: ['Свидетельства караванов'],
      distortionForces: ['Устные преувеличения'],
      memoryKeepers: ['Проводники'],
      erasureForces: ['Гибель архивов'],
      successionRules: ['Метод должен быть воспроизведён учеником'],
      encounterRules: ['Встреча следует из маршрута и цели'],
      thresholds: [
        { stage: 'notable', minRenown: 20, requirements: ['Одно свершение'] },
        { stage: 'renowned', minRenown: 40, requirements: ['Известность нескольких поселений'] },
        { stage: 'legendary', minRenown: 70, requirements: ['Несколько подтверждённых свершений'] },
        { stage: 'mythic', minRenown: 90, requirements: ['Изменение эпохи'] },
      ],
      updatedTurn: 0,
    }

    const added = applyPatch(campaign, { world: { upsertLegends: [legendaryFigure(npc.id)] } }, 5)
    const legend = added.world.legends?.[0]
    expect(legend).toMatchObject({
      id: 'legend-rin',
      characterId: npc.id,
      createdTurn: 5,
      lastChangedTurn: 5,
      currentState: { lastUpdatedTurn: 5 },
      emergence: { lastEvaluatedTurn: 5 },
      discovery: { updatedTurn: 5, evidence: [{ learnedTurn: 5 }] },
    })

    const update = legendaryFigure(npc.id)
    update.renown = 79
    update.discovery.awareness = 68
    update.discovery.revealedSections.push('whereabouts')
    update.discovery.evidence.push({
      id: 'evidence-location',
      section: 'whereabouts',
      summary: 'Курьер подтвердил её текущий маршрут.',
      source: 'Полевой курьер',
      reliability: 84,
    })
    const evolved = applyPatch(added, { world: { upsertLegends: [update] } }, 8)
    expect(evolved.world.legends?.[0]).toMatchObject({
      id: 'legend-rin',
      createdTurn: 5,
      lastChangedTurn: 8,
      renown: 79,
      discovery: { awareness: 68, updatedTurn: 8 },
    })
    expect(evolved.world.legends?.[0].discovery.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'evidence-caravan', learnedTurn: 5 }),
      expect.objectContaining({ id: 'evidence-location', learnedTurn: 8 }),
    ]))

    const diagnostics: StateChange[] = []
    const rejected = applyPatch(campaign, { world: { upsertLegends: [legendaryFigure()] } }, 5, diagnostics)
    expect(rejected.world.legends).toEqual([])
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ detail: expect.stringContaining('не связана с симулируемым героем или NPC') }),
    ]))

    const playerLegend = applyPatch(campaign, { world: { upsertLegends: [legendaryFigure(campaign.player.id)] } }, 5)
    expect(playerLegend.world.legends?.[0]?.characterId).toBe(campaign.player.id)
  })

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
    expect(next.world.chronicle).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'quest-done', kind: 'quest', outcome: 'Ворота запечатаны.' }),
      expect.objectContaining({ sourceId: 'thread-done', kind: 'thread', outcome: 'Обещание исполнено.' }),
    ]))
    expect(next.archives).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Закрыть ворота', tags: expect.arrayContaining(['world-chronicle', 'quest']) }),
    ]))
  })

  it('keeps explicit causal chains across countries and rejects unknown causal references', () => {
    const campaign = createDemoCampaign()
    campaign.world.places = [{
      id: 'place-north', name: 'Северная держава', kind: 'country', description: 'Союз северных городов.', scale: 'страна',
      culture: [], notableFacts: [], currentSituation: 'Совет обсуждает границы.', visibility: 'known', createdTurn: 0, lastChangedTurn: 0,
    }]
    campaign.world.processes = [{
      id: 'process-border', title: 'Пограничный кризис', description: 'Соседи стягивают силы.', scopeIds: ['place-north'],
      involvedFactionNames: [], drivers: ['Спор о границе'], obstacles: ['Дипломатия'], stage: 'Идут переговоры.', momentum: 60,
      direction: 'rising', status: 'active', visibility: 'rumored', nextMilestone: 'Ответ совета', consequences: ['Закрытие дорог'],
      createdTurn: 0, lastAdvancedTurn: 0, scale: 'national',
    }]
    const diagnostics: StateChange[] = []
    const next = applyPatch(campaign, {
      worldEvents: [{ operation: 'add', event: {
        id: 'event-embargo', title: 'Торговое эмбарго', description: 'Совет закрывает северные дороги.', status: 'scheduled',
        visibility: 'known', involvedIds: [], createdTurn: 2, scale: 'national', scopeIds: ['place-north', 'place-missing'],
        causeIds: ['process-border', 'cause-missing'], consequences: ['Рост цен в столице'],
      } }],
      threads: [{ operation: 'add', thread: {
        id: 'thread-smugglers', type: 'rumor', title: 'Путь контрабандистов', detail: 'Купцы ищут обход эмбарго.',
        participantIds: [campaign.player.id], status: 'active', secret: false, createdTurn: 2, scale: 'regional',
        scopeIds: ['place-north'], causeIds: ['event-embargo'],
      } }],
    }, 2, diagnostics)

    expect(next.worldEvents?.find((event) => event.id === 'event-embargo')).toMatchObject({
      id: 'event-embargo', scale: 'national', scopeIds: ['place-north'], causeIds: ['process-border'], consequences: ['Рост цен в столице'], lastChangedTurn: 2,
    })
    expect(next.threads?.find((thread) => thread.id === 'thread-smugglers')).toMatchObject({ id: 'thread-smugglers', causeIds: ['event-embargo'], scopeIds: ['place-north'], lastChangedTurn: 2 })
    expect(diagnostics.map((entry) => entry.detail)).toEqual(expect.arrayContaining([
      expect.stringContaining('place-missing'),
      expect.stringContaining('cause-missing'),
    ]))
  })

  it('compacts only stale terminal world state and never removes active hidden state', () => {
    const campaign = createDemoCampaign()
    campaign.world.processes = [
      {
        id: 'process-active', title: 'Тихая экспансия', description: 'Сеть агентов растёт.', scopeIds: [], involvedFactionNames: [],
        drivers: ['Инвестиции'], obstacles: [], stage: 'Вербовка', momentum: 40, direction: 'rising', status: 'active', visibility: 'hidden',
        nextMilestone: 'Новая ячейка', consequences: ['Рост влияния'], createdTurn: 0, lastAdvancedTurn: 0,
      },
      {
        id: 'process-finished', title: 'Старая блокада', description: 'Порты были закрыты.', scopeIds: [], involvedFactionNames: [],
        drivers: ['Война'], obstacles: [], stage: 'Блокада снята', momentum: 0, direction: 'declining', status: 'resolved', visibility: 'known',
        nextMilestone: 'Нет', consequences: ['Торговля восстановлена'], createdTurn: 0, lastAdvancedTurn: 2, scale: 'regional',
      },
    ]
    campaign.worldEvents = [{
      id: 'event-hidden-active', title: 'Тайная подготовка', description: 'Неизвестная сила готовится.', status: 'scheduled', visibility: 'hidden', involvedIds: [], createdTurn: 0,
    }]

    const next = applyPatch(campaign, {}, 8)

    expect(next.world.processes?.map((process) => process.id)).toEqual(['process-active'])
    expect(next.worldEvents?.map((event) => event.id)).toEqual(['event-hidden-active'])
    expect(next.world.chronicle).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'process-finished', kind: 'process', outcome: 'Блокада снята', scale: 'regional' }),
    ]))
  })

  it('keeps rumored chronicle facts out of the narrator-facing general archive', () => {
    const campaign = createDemoCampaign()
    campaign.archives = []
    campaign.world.processes = [{
      id: 'process-rumored-finished', title: 'Тайная смена власти', description: 'Совет уже заменил правителя двойником.', scopeIds: [], involvedFactionNames: [],
      drivers: ['Заговор'], obstacles: [], stage: 'Двойник занял трон', momentum: 0, direction: 'declining', status: 'resolved', visibility: 'rumored',
      nextMilestone: 'Нет', consequences: ['Неизвестные приказы'], createdTurn: 0, lastAdvancedTurn: 1, scale: 'national',
    }]

    const next = applyPatch(campaign, {}, 8)

    expect(next.world.chronicle).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'process-rumored-finished', visibility: 'rumored', outcome: 'Двойник занял трон' }),
    ]))
    expect(next.archives?.some((archive) => archive.tags.includes('process-rumored-finished'))).toBe(false)
  })

  it('treats ability progression history as append-only across empty patches and targeted updates', () => {
    const campaign = createDemoCampaign()
    const first = campaign.player.abilities[0]
    first.history = [{ id: 'history-first', turn: 0, title: 'Первое пробуждение', description: 'Способность впервые проявилась.' }]
    const second = structuredClone(first)
    second.id = 'ability-second'
    second.name = 'Вторая техника'
    second.history = [{ id: 'history-second', turn: 0, title: 'Обучение', description: 'Герой освоил основу.' }]
    campaign.player.abilities.push(second)

    const untouched = applyPatch(campaign, {}, 1)
    expect(untouched.player.abilities.map((ability) => ability.history?.map((entry) => entry.id))).toEqual([
      ['history-first'], ['history-second'],
    ])

    const updated = applyPatch(campaign, {
      addAbilities: [{ ...structuredClone(first), mastery: (first.mastery ?? 0) + 4, history: [] }],
      abilityChanges: [{ abilityId: first.id, masteryDelta: 1, history: { title: 'Практика', description: 'Техника выдержала нагрузку.' } }],
    }, 2)
    expect(updated.player.abilities.find((ability) => ability.id === first.id)?.history).toEqual([
      expect.objectContaining({ id: 'history-first' }),
      expect.objectContaining({ title: 'Практика' }),
    ])
    expect(updated.player.abilities.find((ability) => ability.id === second.id)?.history).toEqual([
      expect.objectContaining({ id: 'history-second' }),
    ])
  })

  it('treats full ability upserts as authoritative cards while preserving progression history', () => {
    const campaign = createDemoCampaign()
    const ability = campaign.player.abilities[0]
    ability.effects = ['Устаревший одиночный импульс', 'Старый побочный эффект']
    ability.limitations = ['Требуется старый стабилизатор']
    ability.capabilities = ['Один рывок']
    ability.counters = ['Старая помеха']
    ability.evolutionPaths = [{ id: 'obsolete-path', name: 'Устаревшая ветвь', description: 'Больше не существует.', requirement: 'Нет', unlocked: false }]
    ability.history = [{ id: 'history-before-rebuild', turn: 1, title: 'Старая версия', description: 'Зафиксирована до перестройки.' }]

    const npc = campaign.npcs[0]
    const npcAbility = { ...structuredClone(ability), id: 'npc-ability-rebuilt', name: 'Контур противодействия' }
    npc.abilities = [npcAbility]

    const replacement = {
      ...structuredClone(ability),
      description: 'Полностью перестроенная версия способности.',
      effects: ['Два управляемых импульса'],
      limitations: [],
      capabilities: ['Двойной рывок'],
      counters: ['ЭМИ нового поколения'],
      evolutionPaths: [],
      techniques: [],
      history: [{ title: 'Полная перестройка', description: 'Старые модули и ограничения удалены.' }],
    }
    const npcReplacement = { ...replacement, id: npcAbility.id, name: npcAbility.name }

    const next = applyPatch(campaign, {
      addAbilities: [replacement],
      npcs: [{ operation: 'update', targetId: npc.id, npc: { upsertAbilities: [npcReplacement] } }],
    }, 5)

    for (const rebuilt of [
      next.player.abilities.find((entry) => entry.id === ability.id),
      next.npcs.find((entry) => entry.id === npc.id)?.abilities?.find((entry) => entry.id === npcAbility.id),
    ]) {
      expect(rebuilt).toMatchObject({
        effects: ['Два управляемых импульса'], limitations: [], capabilities: ['Двойной рывок'], counters: ['ЭМИ нового поколения'], evolutionPaths: [], techniques: [],
      })
      expect(rebuilt?.effects).not.toContain('Устаревший одиночный импульс')
      expect(rebuilt?.history?.map((entry) => entry.title)).toEqual(['Старая версия', 'Полная перестройка'])
    }
  })

  it('recovers ability history from a snapshot when an older broken turn already erased the current cards', () => {
    const campaign = createDemoCampaign()
    const ability = campaign.player.abilities[0]
    ability.history = [{ id: 'history-snapshot', turn: 0, title: 'Сохранённый след', description: 'Эта запись осталась в снимке.' }]
    const snapshotted = commitTurn(campaign, 'Я жду.', 'do', {
      narrative: 'Проходит несколько спокойных минут.', suggestions: ['Продолжить'], statePatch: {}, activeLoreIds: [], recalledMemoryIds: [],
    })
    const damaged = structuredClone(snapshotted)
    damaged.player.abilities[0].history = []

    const repaired = applyPatch(damaged, {}, 2)

    expect(repaired.player.abilities[0].history).toEqual([expect.objectContaining({ id: 'history-snapshot' })])
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

  it('keeps same-title modules separate and deterministically rejects only the lowest priorities beyond the limit', () => {
    const campaign = createDemoCampaign()
    const diagnostics: StateChange[] = []
    const modules = Array.from({ length: 9 }, (_, index) => interfaceModule(
      `module-${index + 1}`,
      index >= 7 ? 'Одинаковое название' : `Модуль ${index + 1}`,
      index + 1,
    ))

    const next = applyPatch(campaign, { world: { upsertInterfaceModules: modules } }, 4, diagnostics)

    expect(next.world.interfaceModules?.map((module) => module.id)).toEqual([
      'module-9', 'module-8', 'module-7', 'module-6', 'module-5', 'module-4', 'module-3', 'module-2',
    ])
    expect(next.world.interfaceModules?.filter((module) => module.title === 'Одинаковое название').map((module) => module.id)).toEqual(['module-9', 'module-8'])
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityId: 'module-1', detail: expect.stringContaining('превышен лимит 8') }),
    ]))
  })

  it('applies granular interface changes by stable ids and repairs dangling element links with diagnostics', () => {
    const campaign = createDemoCampaign()
    const created = applyPatch(campaign, { world: { upsertInterfaceModules: [interfaceModule('module-thread', 'Нить сюжета', 50, [
      { id: 'beat-a', label: 'Завязка', kind: 'node', state: 'normal', links: ['beat-b'] },
      { id: 'beat-b', label: 'Развилка', kind: 'node', state: 'warning', links: [] },
    ])] } }, 2)
    const diagnostics: StateChange[] = []

    const evolved = applyPatch(created, { world: { interfaceModuleChanges: [{
      moduleId: 'module-thread',
      module: { title: 'Живая нить', priority: 91, pinned: true },
      removeElementIds: ['beat-b', 'missing-element'],
      upsertElements: [{ id: 'beat-c', label: 'Контрмера', kind: 'node', state: 'danger', links: ['beat-a', 'missing-link'] }],
    }] } }, 6, diagnostics)

    expect(evolved.world.interfaceModules?.[0]).toMatchObject({
      id: 'module-thread', title: 'Живая нить', priority: 91, pinned: true, createdTurn: 2, lastChangedTurn: 6,
    })
    expect(evolved.world.interfaceModules?.[0].elements).toEqual([
      expect.objectContaining({ id: 'beat-a', links: [] }),
      expect.objectContaining({ id: 'beat-c', links: ['beat-a'] }),
    ])
    expect(diagnostics.map((entry) => entry.detail)).toEqual(expect.arrayContaining([
      expect.stringContaining('missing-element'),
      expect.stringContaining('missing-link'),
      expect.stringContaining('beat-b'),
    ]))
  })

  it('owns interface blueprint timestamps and applies world metrics with clamping, removals and diagnostics', () => {
    const campaign = createDemoCampaign()
    const diagnostics: StateChange[] = []
    const created = applyPatch(campaign, { world: {
      interfaceBlueprint: {
        title: 'Пульт розыска', subtitle: 'Живая обстановка', defaultTab: 'dashboard',
        tabs: [
          { id: 'dashboard', label: 'Пульт', visible: true }, { id: 'scene', label: 'Сцена', visible: true },
          { id: 'hero', label: 'Герой', visible: true }, { id: 'inventory', label: 'Рюкзак', visible: true },
          { id: 'changes', label: 'Изменения', visible: true }, { id: 'world', label: 'Мир', visible: true },
        ],
        dashboardSections: ['stakes', 'modules'], reason: 'Розыск определяет реакцию города.', updatedTurn: 999,
      },
      upsertMetrics: [
        { id: 'metric-heat', key: 'wanted_heat', label: 'Розыск', description: 'Насколько активно ищут героя.', value: 30, min: 0, max: 100, unit: '%', visibility: 'known', source: 'Городская стража', updatePolicy: 'Растёт после свидетелей.', lastChangedTurn: 999 },
        { id: 'metric-moon', key: 'moon_phase', label: 'Фаза луны', description: 'Влияние ночи.', value: 5, min: 0, max: 10, visibility: 'known', source: 'Календарь', updatePolicy: 'Меняется каждый день.' },
      ],
      metricDeltas: { wanted_heat: 80, missing_metric: 2 },
      removeMetricIds: ['metric-missing'],
    } }, 4, diagnostics)

    expect(created.world.interfaceBlueprint).toMatchObject({ title: 'Пульт розыска', updatedTurn: 4 })
    expect(created.world.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'metric-heat', value: 100, lastChangedTurn: 4 }),
      expect.objectContaining({ id: 'metric-moon', value: 5, lastChangedTurn: 4 }),
    ]))
    expect(diagnostics.map((entry) => entry.entityId)).toEqual(expect.arrayContaining(['metric-missing', 'missing_metric']))

    const evolved = applyPatch(created, { world: { metricDeltas: { 'Розыск': -250 }, removeMetricIds: ['metric-moon'] } }, 8)
    expect(evolved.world.metrics).toEqual([expect.objectContaining({ id: 'metric-heat', value: 0, lastChangedTurn: 8 })])
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

  it('normalizes a newly granted reality-scale artifact immediately', () => {
    const campaign = createDemoCampaign()
    const next = applyPatch(campaign, { inventory: [{ operation: 'add', item: {
      id: 'reality-artifact', name: 'Ось невозможного', description: 'Переназначает границы причин и следствий.',
      category: 'artifact', quantity: 1, rarity: 'mythic', equipped: false, effects: ['Переписывает локальный закон причинности'],
      rarityProfile: {
        basis: 'Ось погасшей реальности', scarcity: 'Единственный экземпляр', knownCopies: 1, recognition: 'Известна архитекторам миров',
        marketImpact: 'Не имеет цены', acquisitionRisk: 100, potency: 100, versatility: 80, worldImpact: 100, provenance: 100,
        limitations: ['Требует согласованного носителя'],
      },
      artifact: {
        sentient: false, awakened: true, attunement: 100, bond: 0, requirements: ['Требует согласованного носителя'],
        passiveEffects: [], combinedEffects: [], failureModes: [], components: [], powers: [], drawbacks: [], evolutionPaths: [], secrets: [], scale: 'cosmic',
      },
    } }] }, 4)
    expect(next.inventory.find((item) => item.id === 'reality-artifact')?.rarity).toBe('transcendent')
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

  it('persists only valid learned NPC facts and keeps unrevealed state out of receipts', () => {
    const campaign = createDemoCampaign()
    const npc = campaign.npcs[0]
    npc.stats = [{ key: 'insight', label: 'Проницательность', value: 72 }]
    npc.resources = [{ key: 'health', label: 'Здоровье', value: 40, max: 50 }]
    npc.abilities = [{ id: 'npc-ability-seal', name: 'Латунная печать', description: 'Запирает проход.', kind: 'active', mastery: 60, costs: [], effects: [], limitations: [], requirements: [], progression: '', evolutionPaths: [], history: [], tags: [] }]

    const hurt = applyPatch(campaign, { npcs: [{ operation: 'update', targetId: npc.id, npc: { resourceDeltas: { health: -5 } } }] }, 2)
    expect(diffCampaignState(campaign, hurt).some((change) => change.entityId === npc.id && change.kind === 'resource')).toBe(false)

    const revealed = applyPatch(hurt, { npcs: [{ operation: 'update', targetId: npc.id, npc: { dossier: {
      familiarity: 'acquainted', revealedSections: ['relationship'], revealedStatKeys: ['insight', 'missing-stat'],
      revealedResourceKeys: ['health', 'missing-resource'], revealedAbilityIds: ['npc-ability-seal', 'missing-ability'],
      evidence: [{ id: 'evidence-scan', section: 'resources', summary: 'Сканер оценил состояние Миры.', source: 'медицинский сканер', learnedTurn: 99 }], updatedTurn: 99,
    } } }] }, 3)

    expect(revealed.npcs[0].dossier).toMatchObject({ revealedStatKeys: ['insight'], revealedResourceKeys: ['health'], revealedAbilityIds: ['npc-ability-seal'], updatedTurn: 3 })
    expect(revealed.npcs[0].dossier?.evidence[0].learnedTurn).toBe(3)
    expect(diffCampaignState(hurt, revealed)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'knowledge', detail: 'Сканер оценил состояние Миры.' })]))

    const extended = applyPatch(revealed, { npcs: [{ operation: 'update', targetId: npc.id, npc: { dossier: {
      familiarity: 'familiar', evidence: [{ id: 'evidence-dialogue', section: 'personality', summary: 'Мира призналась, что боится опоздать.', source: 'разговор', learnedTurn: 4 }],
    } } }] }, 4)
    expect(extended.npcs[0].dossier?.revealedResourceKeys).toEqual(['health'])
    expect(extended.npcs[0].dossier?.evidence.map((entry) => entry.id)).toEqual(['evidence-scan', 'evidence-dialogue'])
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

  it('adds and independently develops nested techniques for abilities and artifact powers', () => {
    const campaign = createDemoCampaign()
    const ability = campaign.player.abilities[0]
    ability.techniques = []
    const item = campaign.inventory[0]
    item.artifact = {
      sentient: false, awakened: true, attunement: 60, bond: 0, requirements: [], passiveEffects: [], combinedEffects: [], failureModes: [], components: [], drawbacks: [], evolutionPaths: [], secrets: [],
      powers: [{ id: 'gravity-power', name: 'Гравитация', description: 'Управляет направлением силы притяжения.', mastery: 55, costs: [], limitations: [], techniques: [] }],
    }
    const technique = {
      id: 'almighty-push', name: 'Отталкивание', description: 'Создаёт направленную волну, отбрасывающую цели от владельца.', kind: 'active' as const, category: 'control' as const,
      mastery: 64, activation: 'Сфокусировать гравитационный импульс.', scale: 'Конус перед владельцем', costs: [{ resource: 'focus', amount: 2 }], effects: ['Отбрасывает незакреплённые цели'], requirements: ['Свободная линия воздействия'], limitations: ['Тяжёлые цели сдвигаются слабее'], unlocked: true,
    }

    const added = applyPatch(campaign, {
      abilityChanges: [{ abilityId: ability.id, addTechniques: [technique] }],
      artifactChanges: [{ itemId: item.id, powerChanges: [{ powerId: 'gravity-power', addTechniques: [{ ...technique, id: 'artifact-push' }] }] }],
    }, 4)
    expect(added.player.abilities[0].techniques?.[0]).toMatchObject({ id: 'almighty-push', mastery: 64 })
    expect(added.inventory[0].artifact?.powers[0].techniques?.[0]).toMatchObject({ id: 'artifact-push', mastery: 64 })

    const evolved = applyPatch(added, {
      abilityChanges: [{ abilityId: ability.id, techniqueChanges: [{ techniqueId: 'almighty-push', masteryDelta: 8, scale: 'Круговая волна' }] }],
      artifactChanges: [{ itemId: item.id, powerChanges: [{ powerId: 'gravity-power', techniqueChanges: [{ techniqueId: 'artifact-push', mastery: 80, unlocked: false }] }] }],
    }, 5)
    expect(evolved.player.abilities[0].techniques?.[0]).toMatchObject({ mastery: 72, scale: 'Круговая волна' })
    expect(evolved.inventory[0].artifact?.powers[0].techniques?.[0]).toMatchObject({ mastery: 80, unlocked: false })

    const removed = applyPatch(evolved, { abilityChanges: [{ abilityId: ability.id, removeTechniqueIds: ['almighty-push'] }] }, 6)
    expect(removed.player.abilities[0].techniques).toEqual([])
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

  it('does not advance recurring effects when a patch is an out-of-story campaign edit', () => {
    const campaign = createDemoCampaign()
    const health = campaign.player.resources.find((resource) => resource.kind === 'health') ?? campaign.player.resources[0]
    health.value = 10
    health.max = 10
    campaign.player.statusEffects = [{
      id: 'effect-editor-safe', name: 'Кровотечение', category: 'injury', description: 'Требует сюжетного времени.',
      source: 'Рана', severity: 50, stacks: 1, duration: { unit: 'turns', remaining: 3 }, effects: ['Потеря здоровья'],
      resourceDeltasPerTurn: { [health.key]: -2 }, hidden: false, appliedTurn: 0,
    }]
    const applyOutOfStoryEdit = applyPatch as unknown as typeof applyPatch & ((base: typeof campaign, patch: TurnPatch, turn: number, diagnostics: StateChange[], options: { advanceStatusClock: false }) => typeof campaign)

    const edited = applyOutOfStoryEdit(campaign, { playerProfile: { appearance: 'Перевязано плечо' } }, campaign.turn, [], { advanceStatusClock: false })

    expect(edited.player.resources.find((resource) => resource.key === health.key)?.value).toBe(10)
    expect(edited.player.statusEffects?.[0].duration).toEqual({ unit: 'turns', remaining: 3 })
    expect(edited.player.appearance).toBe('Перевязано плечо')
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
    revealNpc(npc, ['relationship'])
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

  it('rejects a service operation used as an NPC name but applies the rest of the plot update', () => {
    const campaign = createDemoCampaign()
    const npc = campaign.npcs[0]
    const originalName = npc.name
    const diagnostics: StateChange[] = []

    const updated = applyPatch(campaign, {
      npcs: [{
        operation: 'update',
        targetId: npc.id,
        npc: {
          name: 'update',
          currentGoal: 'Найти источник нейронной нестабильности',
          lastSeen: 'Клиника кибернетика',
        },
      }],
    }, 1, diagnostics)

    expect(updated.npcs[0].name).toBe(originalName)
    expect(updated.npcs[0]).toMatchObject({
      currentGoal: 'Найти источник нейронной нестабильности',
      lastSeen: 'Клиника кибернетика',
    })
    expect(diagnostics).toEqual([expect.objectContaining({
      kind: 'system',
      detail: expect.stringContaining('npc.name'),
    })])
  })

  it('diffs persistent knowledge, social graph, mysteries, plans and timeline domains', () => {
    const campaign = createDemoCampaign()
    const npc = campaign.npcs[0]
    revealNpc(npc, ['description', 'initiative'])
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
            dossier: { ...npc.dossier!, evidence: [{ id: 'evidence-gate', section: 'description', summary: 'Миру видели у северных ворот.', source: 'личное наблюдение', learnedTurn: 1 }], updatedTurn: 1 },
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
      expect.objectContaining({ kind: 'knowledge', label: expect.stringContaining('новые сведения') }),
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
    revealNpc(npc, ['stats', 'resources', 'conditions'], ['strength', 'reflex'], ['health', 'focus'])

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
      dossier: { familiarity: 'familiar', revealedSections: ['resources', 'strategyOverview', 'strategyMetrics'], revealedStatKeys: [], revealedResourceKeys: ['focus'], revealedAbilityIds: [abilityId], evidence: [{ id: 'evidence-forecast', section: 'abilities', summary: 'Мира применила предваряющий расчёт в бою.', source: 'личное наблюдение', learnedTurn: 5 }], updatedTurn: 5 },
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

  it('tracks a tactical conflict across exchanges and archives its actual outcome', () => {
    const campaign = createDemoCampaign()
    const npc = campaign.npcs[0]
    const conflict = {
      id: 'conflict-platform', kind: 'combat' as const, title: 'Схватка на платформе', round: 1, phase: 'Противники проверяют дистанцию.', stakes: 'Контроль над выходом.',
      terrain: ['Узкая платформа'], hazards: ['Приближающийся поезд'], momentum: 'contested' as const,
      participants: [
        { entityId: campaign.player.id, side: 'player' as const, objective: 'Прорваться к выходу.', position: 'У колонны.', readiness: 68, morale: 80, intent: 'Сменить угол атаки.', lastAction: 'Занял укрытие.', advantages: ['Укрытие'], vulnerabilities: [], visibility: 'known' as const },
        { entityId: npc.id, side: 'opposition' as const, objective: 'Задержать героя.', position: 'Между героем и выходом.', readiness: 92, morale: 74, intent: 'Вынудить героя повторить рывок.', lastAction: 'Перекрыл проход.', advantages: ['Контроль выхода'], vulnerabilities: ['Открытый левый фланг'], visibility: 'rumored' as const },
      ],
      startedTurn: 2, lastUpdatedTurn: 2,
    }
    const started = applyPatch(campaign, { conflict: { operation: 'start', state: conflict } }, 3)
    expect(started.activeConflict).toMatchObject({ id: conflict.id, round: 1, lastUpdatedTurn: 3 })
    expect(diffCampaignState(campaign, started)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'conflict', tone: 'warning' })]))

    const updatedState = structuredClone(started.activeConflict!)
    updatedState.round = 2
    updatedState.momentum = 'opposition'
    updatedState.participants[0]!.readiness = 42
    const updated = applyPatch(started, { conflict: { operation: 'update', state: updatedState } }, 4)
    expect(updated.activeConflict).toMatchObject({ round: 2, momentum: 'opposition', lastUpdatedTurn: 4 })

    const resolved = applyPatch(updated, { conflict: { operation: 'resolve', outcome: 'Герой оторвался от преследования, но потерял путь к главному выходу.' } }, 5)
    expect(resolved.activeConflict).toBeUndefined()
    expect(resolved.timeline).toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Завершено: Схватка на платформе', description: expect.stringContaining('оторвался') })]))
  })

  it('rejects invalid conflict participants and a second simultaneous encounter', () => {
    const campaign = createDemoCampaign()
    const npc = campaign.npcs[0]
    const diagnostics: import('../../shared/types').StateChange[] = []
    const baseState = {
      id: 'conflict-one', kind: 'combat' as const, title: 'Первое столкновение', round: 1, phase: 'Начало.', stakes: 'Выход.', terrain: [], hazards: [], momentum: 'contested' as const,
      participants: [
        { entityId: campaign.player.id, side: 'player' as const, objective: 'Уйти.', position: 'У двери.', readiness: 50, morale: 50, intent: 'Открыть дверь.', lastAction: 'Осмотрелся.', advantages: [], vulnerabilities: [], visibility: 'known' as const },
        { entityId: npc.id, side: 'opposition' as const, objective: 'Остановить.', position: 'В проходе.', readiness: 50, morale: 50, intent: 'Перекрыть дверь.', lastAction: 'Подошёл.', advantages: [], vulnerabilities: [], visibility: 'known' as const },
      ], startedTurn: 0, lastUpdatedTurn: 0,
    }
    const active = applyPatch(campaign, { conflict: { operation: 'start', state: baseState } }, 1)
    const rejected = applyPatch(active, { conflict: { operation: 'start', state: { ...baseState, id: 'conflict-two' } } }, 2, diagnostics)
    expect(rejected.activeConflict?.id).toBe('conflict-one')
    expect(diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'system', detail: expect.stringContaining('нельзя начать новое') })]))
  })

  it('tracks story pacing and causal world pressure through escalation and resolution', () => {
    const campaign = createDemoCampaign()
    const pressure = {
      id: 'pressure-corporate-hunt', sourceKind: 'corporation' as const, sourceName: 'Латунный хор', targetIds: [campaign.player.id],
      cause: 'Свидетель передал запись нападения службе безопасности.', objective: 'Установить личность героя и вернуть похищенный прототип.',
      tier: 'serious' as const, stage: 'investigating' as const, reach: 'Городские камеры, информаторы и контракты охраны.',
      knowledge: ['На записи виден силуэт героя.'], signs: ['На месте происшествия опрашивают свидетелей.'],
      measures: [{ id: 'measure-camera-trace', name: 'Сверка камер', trigger: 'Следователь получает записи соседних кварталов.', method: 'Аналитики сопоставляют маршрут по времени.', effects: ['Сужается район поиска.'], counterplay: ['Сменить маршрут или уничтожить связующую запись.'], tradeoffs: ['Требует времени и доступа к частным камерам.'], status: 'preparing' as const }],
      counterplay: ['Подбросить правдоподобный ложный след.'], escalationTrigger: 'Личность героя подтверждена двумя независимыми источниками.',
      deescalationConditions: ['Прототип возвращён.', 'Ответственный следователь убеждён в невиновности героя.'], visibility: 'rumored' as const, createdTurn: 1, lastAdvancedTurn: 1,
    }

    const pressured = applyPatch(campaign, {
      pacing: { beat: 'rising', intensity: 74, challengeTier: 'hard', reason: 'Расследование начинает приближаться к герою.' },
      upsertWorldPressures: [pressure],
    }, 1)
    expect(pressured.pacing).toMatchObject({ beat: 'rising', intensity: 74, challengeTier: 'hard', consecutivePressureTurns: 1, updatedTurn: 1 })
    expect(pressured.worldPressures).toEqual([expect.objectContaining({ id: pressure.id, stage: 'investigating', createdTurn: 1 })])

    const respite = applyPatch(pressured, {
      pacing: { beat: 'respite', intensity: 20, challengeTier: 'light', reason: 'Герой получил короткую безопасную паузу.' },
      upsertWorldPressures: [{ ...pressure, stage: 'resolved', lastAdvancedTurn: 2 }],
      cleanup: { worldPressures: [{ targetId: pressure.id, reason: 'Ложный след подтвердился, расследование закрыто.' }] },
    }, 2)
    expect(respite.pacing).toMatchObject({ beat: 'respite', consecutivePressureTurns: 0, lastRespiteTurn: 2 })
    expect(respite.worldPressures).toEqual([])
    expect(respite.timeline).toEqual(expect.arrayContaining([expect.objectContaining({ title: expect.stringContaining('Латунный хор') })]))
    expect(diffCampaignState(pressured, respite)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'scene', label: 'Ритм истории' }),
      expect.objectContaining({ kind: 'world', label: expect.stringContaining('Давление') }),
    ]))
  })

  it('removes an exact NPC social link without affecting the remaining network', () => {
    const campaign = createDemoCampaign()
    const first = campaign.npcs[0]
    if (!first) throw new Error('Demo campaign needs an NPC')
    const second = { ...structuredClone(first), id: 'npc-social-second', name: 'Второй свидетель' }
    campaign.npcs.push(second)
    campaign.socialLinks = [
      { id: 'link-ended', fromNpcId: first.id, toNpcId: second.id, kind: 'trust', label: 'Распавшийся союз', score: 20, secret: false, notes: [] },
      { id: 'link-kept', fromNpcId: second.id, toNpcId: first.id, kind: 'debt', label: 'Невыплаченный долг', score: 45, secret: false, notes: [] },
    ]
    const next = applyPatch(campaign, { removeSocialLinkIds: ['link-ended'] }, 2)
    expect(next.socialLinks?.map((link) => link.id)).toEqual(['link-kept'])
    expect(describePatch({ removeSocialLinkIds: ['link-ended'] })).toContain('Связь NPC прекратилась')
  })
})
