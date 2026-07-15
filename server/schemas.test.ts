import { describe, expect, it } from 'vitest'
import { backgroundSimulationSchema, campaignEditResponseSchema, consequenceAuditSchema, turnPatchSchema, turnPlanSchema, worldQualityReviewSchema } from './schemas'

const plan = (relationships: unknown) => ({
  outcome: 'NPC стал относиться к герою теплее.',
  beats: ['NPC оценил поступок героя.'],
  suggestions: ['Продолжить разговор', 'Сменить тему'],
  statePatch: { relationships },
})

describe('campaign editor contract', () => {
  it('accepts real world, presentation and settings corrections in one checked response', () => {
    const parsed = campaignEditResponseSchema.parse({
      summary: 'Мир и стиль обновлены.',
      campaignPatch: { title: 'Новая ветвь' },
      settingsPatch: { proseStyle: 'cinematic', npcAutonomy: 'independent', worldDynamics: 'volatile' },
      statePatch: { world: { name: 'Город Разлома', system: { progression: 'Опыт меняет доступные техники.' }, presentation: { accent: '#33ffaa', labels: { abilities: 'Техники' } } } },
    })
    expect(parsed.settingsPatch?.worldDynamics).toBe('volatile')
    expect(parsed.statePatch.world?.system?.progression).toContain('Опыт')
    expect(parsed.statePatch.world?.presentation?.labels?.abilities).toBe('Техники')
  })
})

describe('persistent living-world patches', () => {
  it('accepts causal laws, mechanics and enriched factions from DeepSeek without placeholder fields', () => {
    const parsed = turnPatchSchema.parse({
      world: {
        upsertLaws: [{
          id: 'law-open-sky', title: 'Право открытого неба', description: 'Небесные пути нельзя перекрывать без решения трёх портов.',
          scope: 'Воздушные гавани', authority: 'Совет трёх портов', status: 'оспаривается', visibility: 'известно', consequences: ['Портовое эмбарго'],
        }],
        upsertMechanics: [{
          id: 'mechanic-wind-debt', name: 'Долг ветра', description: 'Использование чужого воздушного коридора создаёт политическое обязательство.',
          category: 'политика', trigger: 'Корабль проходит через охраняемый коридор без оплаты.', effects: ['Владелец коридора получает рычаг влияния'],
          source: 'Договор воздушных гаваней', discovered: 'да', status: 'зарождается',
        }],
        upsertFactions: [{
          name: 'Северная эскадра', description: 'Союз капитанов северных маршрутов.', attitude: 'Оценивает выгоду сотрудничества', status: 'распалась', power: '37%',
          influence: 'Контролировала два воздушных коридора.', territory: ['Северный порт'], resources: ['Три корабля'], goals: ['Сохранить маршруты'],
          currentMove: 'Договаривается о слиянии.', publicFace: 'Торговая охрана.', origin: 'Создана после шторма.', secrets: [],
        }],
      },
    })

    expect(parsed.world?.upsertLaws?.[0]).toMatchObject({ status: 'contested', visibility: 'known' })
    expect(parsed.world?.upsertMechanics?.[0]).toMatchObject({ category: 'political', status: 'emerging', discovered: true })
    expect(parsed.world?.upsertFactions?.[0]).toMatchObject({ status: 'dissolved', power: 37, territory: ['Северный порт'] })
  })

  it('accepts a hierarchical atlas, autonomous processes and explicit active-state cleanup', () => {
    const parsed = turnPatchSchema.parse({
      world: {
        upsertPlaces: [{
          id: 'place-capital', name: 'Столица', kind: 'город', description: 'Политический и торговый центр страны.', scale: 'крупный город',
          population: 'два миллиона жителей', government: 'Выборный совет', economy: 'Порты и производство', culture: ['Квартальные союзы'],
          notableFacts: ['Здесь заседает совет'], currentSituation: 'Портовые рабочие готовят забастовку.', visibility: 'известно',
        }],
        upsertProcesses: [{
          id: 'process-strike', title: 'Портовая забастовка', description: 'Рабочие требуют нового договора.', scopeIds: ['place-capital'],
          involvedFactionNames: ['Гильдия доков'], drivers: ['Снижение оплаты'], obstacles: ['Запасы владельцев'], stage: 'Переговоры сорваны.',
          momentum: '64%', direction: 'усиливается', status: 'активно', visibility: 'слухи', nextMilestone: 'Остановка ночной смены', consequences: ['Дефицит товаров'],
        }],
      },
      cleanup: { quests: [{ targetId: 'quest-done', reason: 'Награда получена, новых обязательств нет.' }] },
    })

    expect(parsed.world?.upsertPlaces?.[0]).toMatchObject({ kind: 'city', visibility: 'known' })
    expect(parsed.world?.upsertProcesses?.[0]).toMatchObject({ momentum: 64, direction: 'rising', status: 'active', visibility: 'rumored' })
    expect(parsed.cleanup?.quests?.[0].targetId).toBe('quest-done')
  })
})

describe('DeepSeek-compatible relationship patches', () => {
  it('wraps one relationship object into an array without inventing values', () => {
    const parsed = turnPlanSchema.parse(plan({ npcId: 'npc-1', delta: 4, note: 'Герой помог NPC.' }))

    expect(parsed.statePatch.relationships).toEqual([
      { npcId: 'npc-1', delta: 4, note: 'Герой помог NPC.' },
    ])
  })

  it('converts an id-keyed object while preserving the model values', () => {
    const parsed = turnPlanSchema.parse(plan({ 'npc-2': { delta: -3, note: 'Герой нарушил обещание.' } }))

    expect(parsed.statePatch.relationships).toEqual([
      { npcId: 'npc-2', delta: -3, note: 'Герой нарушил обещание.' },
    ])
  })
})

describe('DeepSeek-compatible nested mutations', () => {
  it('converts a DeepSeek party array into membership and exact party roles', () => {
    const parsed = turnPatchSchema.parse({
      party: [
        { npcId: 'lis_001', role: 'проводник' },
        { npcId: 'ryzhaya_001', role: 'боец прикрытия' },
      ],
    })

    expect(parsed.party).toEqual({
      addNpcIds: ['lis_001', 'ryzhaya_001'],
      roles: { lis_001: 'проводник', ryzhaya_001: 'боец прикрытия' },
    })
  })

  it('nests flat NPC, thread and world-event fields without changing their values', () => {
    const parsed = backgroundSimulationSchema.parse({
      signals: ['Шторм усиливается.'],
      statePatch: {
        npcs: [{ operation: 'update', targetId: 'npc-orvin', notes: ['Решил предупредить Лиора.'], currentGoal: 'Остановить экспедицию.' }],
        threads: [{ id: 'thread-warning', type: 'rumor', title: 'Предупреждение Орвина', detail: 'В течениях есть аномалия.', participantIds: ['npc-orvin'], status: 'active', secret: true, createdTurn: 0 }],
        worldEvents: [{ operation: 'update', targetId: 'event-storm', description: 'Шторм подходит к маяку.' }],
      },
    })

    expect(parsed.statePatch.npcs?.[0]).toEqual({
      operation: 'update', targetId: 'npc-orvin', npc: { notes: ['Решил предупредить Лиора.'], currentGoal: 'Остановить экспедицию.' },
    })
    expect(parsed.statePatch.threads?.[0]).toEqual({
      operation: 'add', thread: { id: 'thread-warning', type: 'rumor', title: 'Предупреждение Орвина', detail: 'В течениях есть аномалия.', participantIds: ['npc-orvin'], status: 'active', secret: true, createdTurn: 0 },
    })
    expect(parsed.statePatch.worldEvents?.[0]).toEqual({
      operation: 'update', targetId: 'event-storm', event: { description: 'Шторм подходит к маяку.' },
    })
  })

  it('normalizes detailed ability and long-running story systems without placeholders', () => {
    const parsed = turnPlanSchema.parse({
      outcome: 'The relic responds and the investigation advances.',
      beats: ['The ability leaves a measurable cost.'],
      suggestions: ['Inspect the relic', 'Follow the clue'],
      statePatch: {
        abilityChanges: [{ abilityId: 42, kind: 'активная', masteryDelta: '4%', costs: { focus: '2 points' }, requirements: 'Direct contact', progression: 'Practice under pressure', tags: 'memory' }],
        artifactChanges: [{ itemId: 77, bondDelta: '+6', awakened: 'да', addPowers: { echo: { description: 'Reads an emotional trace.', mastery: '12/100', costs: { focus: 1 }, limitations: 'Once per scene' } } }],
        upsertInfluenceAssets: { favor: { id: 'favor-1', kind: 'услуга', title: 'Archive access', description: 'One supervised visit.', holderId: 'player-1', targetId: 'npc-1', value: '40/100', status: 'активно', source: 'A kept promise', secret: 'нет', acquiredTurn: '3' } },
      },
    })

    expect(parsed.statePatch.abilityChanges?.[0]).toMatchObject({ abilityId: '42', kind: 'active', masteryDelta: 4, costs: [{ resource: 'focus', amount: 2 }], requirements: ['Direct contact'], tags: ['memory'] })
    expect(parsed.statePatch.artifactChanges?.[0]).toMatchObject({ itemId: '77', bondDelta: 6, awakened: true })
    expect(parsed.statePatch.artifactChanges?.[0].addPowers?.[0]).toMatchObject({ name: 'echo', mastery: 12, costs: [{ resource: 'focus', amount: 1 }], limitations: ['Once per scene'] })
    expect(parsed.statePatch.upsertInfluenceAssets?.[0]).toMatchObject({ kind: 'favor', value: 40, status: 'active', secret: false, acquiredTurn: 3 })
  })

  it('accepts a substantive Sandevistan upgrade for the technique, artifact power and component', () => {
    const parsed = turnPatchSchema.parse({
      abilityChanges: [{
        abilityId: 'ability-sandevistan', rank: 'Mk II', description: 'Два окна ускорения.',
        costs: [{ resource: 'energy', amount: 6 }], capabilities: ['Два последовательных рывка'],
        effects: ['Ускорение восприятия и моторики'], limitations: ['Полное охлаждение после второго окна'],
      }],
      artifactChanges: [{
        itemId: 'item-sandevistan', itemDescription: 'Militech Falcon Mk II после аппаратной модернизации.',
        itemEffects: ['Два окна ускорения'], operatingPrinciple: 'Двухфазное ускорение нейросигналов',
        powerChanges: [{ powerId: 'power-time-dilation', masteryDelta: 4, description: 'Два последовательных окна.', costs: [{ resource: 'energy', amount: 6 }], capabilities: ['Двойной рывок'], limitations: ['Цикл охлаждения'] }],
        componentChanges: [{ componentId: 'component-cooling', name: 'Двухступенчатое охлаждение', status: 'active', addCapabilities: ['Промежуточный сброс тепла'] }],
        history: { title: 'Модернизация Mk II', description: 'Обновлены контроллер и теплоотвод.' },
      }],
    })

    expect(parsed.abilityChanges?.[0]).toMatchObject({ abilityId: 'ability-sandevistan', rank: 'Mk II', capabilities: ['Два последовательных рывка'] })
    expect(parsed.artifactChanges?.[0]).toMatchObject({ itemId: 'item-sandevistan', itemEffects: ['Два окна ускорения'], operatingPrinciple: 'Двухфазное ускорение нейросигналов' })
    expect(parsed.artifactChanges?.[0].powerChanges?.[0]).toMatchObject({ powerId: 'power-time-dilation', masteryDelta: 4, costs: [{ resource: 'energy', amount: 6 }] })
    expect(parsed.artifactChanges?.[0].componentChanges?.[0]).toMatchObject({ componentId: 'component-cooling', status: 'active' })
  })
})

describe('canon quality gate', () => {
  const review = {
    pass: true,
    coverage: 100,
    issues: [],
    missingCapabilities: [],
    coverageAudit: [{ capability: 'Управление временем', importance: 'core', status: 'covered', location: 'inventory[0].artifact.powers[0]', detail: 'Полностью описано.' }],
    constraintAudit: [{ constraint: '10 stoneEnergy', location: 'inventory[0].artifact.powers[0].costs', verdict: 'unsupported', basis: 'Такого ресурса нет в выбранном каноне.' }],
    rewriteInstructions: 'Исправления не требуются.',
  }

  it('does not allow a passing review with an unsupported invented cost', () => {
    expect(worldQualityReviewSchema.safeParse(review).success).toBe(false)
  })

  it('accepts a complete audit when every core capability is covered and constraints are grounded', () => {
    expect(worldQualityReviewSchema.safeParse({
      ...review,
      constraintAudit: [{ ...review.constraintAudit[0], verdict: 'canonical' }],
    }).success).toBe(true)
  })
})

describe('consequence completeness audit', () => {
  const allDomains = [
    'HP', 'ресурсы', 'attributes', 'эффекты', 'рюкзак', 'снаряжение', 'навыки', 'реликвии',
    'деньги', 'социальные связи', 'задания', 'NPC', 'scene/time', 'состояние мира', 'память и знания',
  ]

  it('normalizes every audit domain and its supplemental state patch without dropping values', () => {
    const parsed = consequenceAuditSchema.parse({
      pass: false,
      narrativePass: true,
      narrativeIssues: [],
      verifiedDomains: allDomains,
      omissions: [{
        domain: 'здоровье',
        evidence: 'Удар в тексте явно ранил героя.',
        requiredChange: 'Уменьшить здоровье и добавить рану.',
        resolutionPath: 'resourceDeltas.health и upsertStatusEffects.',
        severity: 'high',
      }],
      statePatch: {
        playerProfile: { lifeState: 'без сознания' },
        upsertResources: [{ key: 'health', label: 'Здоровье', value: '4', max: '10', kind: 'здоровье', aliases: 'хп' }],
        upsertStatusEffects: [{
          name: 'Глубокая рана', description: 'Кровоточащая рана на боку.', category: 'ранение', severity: '70',
          source: 'Удар клинком', effects: 'Постепенная потеря сил', stacks: '1',
          resourceDeltasPerTurn: { health: '-2' }, checkModifiers: { '*': '-1' },
          duration: { ходы: '3' }, appliedTurn: '14', hidden: false,
        }],
        inventory: [{ operation: 'update', targetId: 'relic-1', item: { state: 'повреждён', charges: '0', maxCharges: '3' } }],
      },
    })

    expect(parsed.verifiedDomains).toEqual([
      'health', 'resources', 'stats', 'conditions', 'inventory', 'equipment', 'abilities', 'artifacts',
      'currency', 'relationships', 'quests', 'characters', 'scene_time', 'world', 'knowledge',
    ])
    expect(parsed.omissions[0].domain).toBe('health')
    expect(parsed.statePatch.playerProfile?.lifeState).toBe('unconscious')
    expect(parsed.statePatch.upsertResources?.[0]).toMatchObject({ kind: 'health', aliases: ['хп'], value: 4, max: 10 })
    expect(parsed.statePatch.upsertStatusEffects?.[0]).toMatchObject({ category: 'injury', appliedTurn: 14, resourceDeltasPerTurn: { health: -2 }, checkModifiers: { '*': -1 }, duration: { unit: 'turns', remaining: 3 } })
    expect(parsed.statePatch.inventory?.[0].item).toMatchObject({ state: 'damaged', charges: 0, maxCharges: 3 })
  })

  it('rejects an audit that repeats a domain instead of checking all fifteen', () => {
    const duplicated = [...allDomains.slice(0, -1), 'мир']
    const result = consequenceAuditSchema.safeParse({ pass: true, narrativePass: true, narrativeIssues: [], verifiedDomains: duplicated, omissions: [], statePatch: {} })

    expect(result.success).toBe(false)
  })
})

describe('lossless DeepSeek turn-patch compatibility', () => {
  it('accepts and normalizes a fully AI-authored adaptive interface module', () => {
    const parsed = turnPatchSchema.parse({ world: { upsertInterfaceModules: [{
      id: 'ui-seal-web', title: 'Пульс печатей', subtitle: 'Узлы расколотого договора',
      description: 'Показывает открытые узлы и давление на текущую печать.', placement: 'мир', visual: 'узлы', icon: 'сеть',
      accent: '#71d3b1', secondary: '#e7b96b', priority: '87%', visibility: 'известно',
      reason: 'Сеть печатей физически связывает открытые территории.', updatePolicy: 'Менять custom-узлы после открытия, разрушения или восстановления печати.',
      collapsible: 'да', collapsedByDefault: 'нет',
      elements: [
        { id: 'seal-active', label: 'Активная печать', kind: 'узел', value: 'Нестабильна', state: 'опасность', binding: { domain: 'своё' }, links: ['seal-core'] },
        { id: 'seal-core', label: 'Сердце сети', kind: 'узел', value: 'Закрыто', state: 'заблокировано', binding: { domain: 'custom' }, links: ['seal-active'] },
        { id: 'seal-pressure', label: 'Давление сцены', kind: 'шкала', min: '0', max: '100', unit: '%', state: 'предупреждение', binding: { domain: 'напряжение сцены' }, links: [] },
      ],
    }] } })

    expect(parsed.world?.upsertInterfaceModules?.[0]).toMatchObject({ placement: 'world', visual: 'nodes', icon: 'network', priority: 87, visibility: 'known', collapsible: true, collapsedByDefault: false })
    expect(parsed.world?.upsertInterfaceModules?.[0].elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'seal-active', kind: 'node', state: 'danger', binding: { domain: 'custom' } }),
      expect.objectContaining({ id: 'seal-pressure', kind: 'meter', state: 'warning', binding: { domain: 'scene.tension' }, min: 0, max: 100 }),
    ]))
  })

  it('accepts inventory loss and detailed NPC ability/strategy updates without flattening them', () => {
    const parsed = turnPatchSchema.parse({
      inventory: [{ operation: 'remove', targetId: 'relic-1', quantity: 2, reason: 'Два осколка уничтожены.' }],
      npcs: [{ operation: 'update', targetId: 'npc-1', npc: {
        upsertAbilities: [{
          id: 'npc-power-1', name: 'Контррасчёт', description: 'Прогнозирует ближайшие действия по наблюдаемым признакам.', kind: 'reaction', mastery: 80,
          costs: [{ resource: 'focus', amount: 2 }], effects: ['Подготавливает ответ.'], limitations: ['Не знает невидимых намерений.'], requirements: ['Наблюдать цель.'],
          progression: 'Уточняется на подтверждённых паттернах.', evolutionPaths: [], history: [{ title: 'Раскрыта', description: 'Применена в бою.' }], tags: ['тактика'],
          category: 'perception', scale: 'Ближняя схватка', activation: 'Анализ движений', capabilities: ['Строит вероятные ветви.'], synergies: [], counters: ['Новая тактика'], examples: ['Уходит с линии удара заранее.'], canonStatus: 'original',
        }],
        abilityChanges: [{ abilityId: 'npc-power-1', masteryDelta: 2, history: { title: 'Адаптация', description: 'Учёл новый выпад.' } }],
        resourceDeltas: { focus: -2 },
        strategy: { intelligence: 90, predictionSkill: 88, observedPlayerPatterns: ['Повторяет прямой выпад.'], contingencies: ['Сменить дистанцию.'] },
      } }],
    })

    expect(parsed.inventory?.[0]).toEqual({ operation: 'remove', targetId: 'relic-1', quantity: 2, reason: 'Два осколка уничтожены.' })
    expect(parsed.npcs?.[0]).toMatchObject({ operation: 'update', targetId: 'npc-1', npc: {
      abilityChanges: [{ abilityId: 'npc-power-1', masteryDelta: 2 }], resourceDeltas: { focus: -2 }, strategy: { intelligence: 90, predictionSkill: 88 },
    } })
  })

  it('accepts the exact alias families from interrupted live turns without losing authored values', () => {
    const parsed = turnPlanSchema.parse({
      outcome: 'Акира обезвредил Ворона.',
      beats: ['Сандевистан сработал в засаде.'],
      suggestions: ['Потребовать объяснений', 'Отпустить Ворона'],
      statePatch: {
        currentScene: { tension: 90 },
        factionReputation: [{ factionName: 'Пепельные вороны', value: -20, label: 'Враждебность', notes: ['Акира сломал палец лидеру.'] }],
        abilityChanges: [{ id: 'ability-sandevistan', mastery: 40, history: [
          { id: 'server-history-1', turn: 3, title: 'Боевое применение', description: 'Обезвредил Ворона.' },
          { id: 'server-history-2', turn: 3, title: 'Контроль скорости', description: 'Остановился без столкновения.' },
        ] }],
        artifactChanges: [{ id: 'item-sandevistan', powerMastery: 3, attunement: 50, bond: 30, history: [
          { id: 'artifact-history-1', turn: 3, title: 'Боевое применение', description: 'Имплант выдержал перегрузку.' },
        ] }],
        memories: [{ id: 'memory-server-id', turn: 3, createdAt: '2026-07-14T00:00:00Z', kind: 'fact', content: 'Ворон запомнил унижение.', tags: ['Ворон'], importance: 80, pinned: true }],
        events: [{ id: 'event-server-id', turn: 3, createdAt: '2026-07-14T00:00:00Z', title: 'Палец сломан', description: 'Конфликт стал личным.', category: 'character' }],
      },
    })

    expect(parsed.statePatch.scene).toEqual({ tension: 90 })
    expect(parsed.statePatch.upsertFactionReputation).toEqual([{ factionName: 'Пепельные вороны', value: -20, label: 'Враждебность', notes: ['Акира сломал палец лидеру.'] }])
    expect(parsed.statePatch.abilityChanges).toEqual([
      { abilityId: 'ability-sandevistan', mastery: 40, history: { title: 'Боевое применение', description: 'Обезвредил Ворона.' } },
      { abilityId: 'ability-sandevistan', history: { title: 'Контроль скорости', description: 'Остановился без столкновения.' } },
    ])
    expect(parsed.statePatch.artifactChanges?.[0]).toEqual({ itemId: 'item-sandevistan', mastery: 3, attunement: 50, bond: 30, history: { title: 'Боевое применение', description: 'Имплант выдержал перегрузку.' } })
    expect(parsed.statePatch.memories?.[0]).toEqual({ kind: 'fact', content: 'Ворон запомнил унижение.', tags: ['Ворон'], importance: 80, pinned: true })
    expect(parsed.statePatch.events?.[0]).toEqual({ title: 'Палец сломан', description: 'Конфликт стал личным.', category: 'character' })
  })

  it('accepts the exact DeepSeek positional ability history from an interrupted turn', () => {
    const parsed = turnPatchSchema.parse({
      abilityChanges: [{
        abilityId: 'ability-sandevistan',
        history: [
          'Боевое применение в засаде',
          'Использовал сандевистан, чтобы обезвредить Ворона, сломав ему палец и продемонстрировав превосходство.',
          'history_ability_001',
          3,
        ],
      }],
    })

    expect(parsed.abilityChanges).toEqual([{
      abilityId: 'ability-sandevistan',
      history: {
        title: 'Боевое применение в засаде',
        description: 'Использовал сандевистан, чтобы обезвредить Ворона, сломав ему палец и продемонстрировав превосходство.',
      },
    }])
  })

  it('canonicalizes flat mutations, explicit id updates and array-shaped deltas', () => {
    const parsed = turnPatchSchema.parse({
      resourceDeltas: [{ key: 'health', delta: -3 }, { resource: 'focus', amount: -2 }],
      inventory: [{ operation: 'update', id: 'item-1', charges: 2, state: 'damaged' }],
      quests: [{ operation: 'update', id: 'quest-1', status: 'completed' }],
      npcs: [{ operation: 'update', id: 'npc-1', resourceDeltas: [{ key: 'health', delta: -4 }], currentGoal: 'Отомстить Акире.' }],
      threads: [{ operation: 'update', id: 'thread-1', detail: 'Конфликт стал личным.' }],
      worldEvents: [{ operation: 'update', id: 'event-1', description: 'Вороны готовят ответ.' }],
    })

    expect(parsed.resourceDeltas).toEqual({ health: -3, focus: -2 })
    expect(parsed.inventory?.[0]).toEqual({ operation: 'update', targetId: 'item-1', item: { charges: 2, state: 'damaged' } })
    expect(parsed.quests?.[0]).toEqual({ operation: 'update', targetId: 'quest-1', quest: { status: 'completed' } })
    expect(parsed.npcs?.[0]).toEqual({ operation: 'update', targetId: 'npc-1', npc: { resourceDeltas: { health: -4 }, currentGoal: 'Отомстить Акире.' } })
    expect(parsed.threads?.[0]).toEqual({ operation: 'update', targetId: 'thread-1', thread: { detail: 'Конфликт стал личным.' } })
    expect(parsed.worldEvents?.[0]).toEqual({ operation: 'update', targetId: 'event-1', event: { description: 'Вороны готовят ответ.' } })
  })

  it('preserves a DeepSeek duration amount by canonicalizing it to remaining', () => {
    const parsed = turnPatchSchema.parse({ upsertStatusEffects: [{
      name: 'Сломанный палец', description: 'Травма после захвата.', category: 'injury', severity: 40,
      source: 'Захват', effects: ['Сложнее удерживать оружие'], stacks: 1,
      duration: { unit: 'turns', amount: 2 },
    }] })

    expect(parsed.upsertStatusEffects?.[0].duration).toEqual({ unit: 'turns', remaining: 2 })
  })
})
