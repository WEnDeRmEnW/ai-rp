import { describe, expect, it } from 'vitest'
import type { TurnPatch } from '../shared/types'
import { createDemoCampaign } from '../src/lib/demo'
import { mergeAuditPatch, mergePatches, sanitizePlan } from './orchestrator'
import { turnPlanSchema } from './schemas'

describe('turn patch merging', () => {
  it('keeps supplemental consequences without applying the same relationship, level or NPC field twice', () => {
    const merged = mergeAuditPatch({
      playerProfile: { levelDelta: 1, goal: 'Выжить' },
      relationships: [{ npcId: 'npc-raven', delta: -4, dimensions: { fear: 2 } }],
      npcs: [{ operation: 'update', targetId: 'npc-raven', npc: { currentGoal: 'Перехватить героя' } }],
      scene: { tension: 80 },
    }, {
      playerProfile: { levelDelta: 1, goal: 'Выжить', appearance: 'Порванный плащ' },
      relationships: [{ npcId: 'npc-raven', delta: -4, dimensions: { fear: 2, suspicion: 3 }, note: 'Запомнил угрозу' }],
      npcs: [{ operation: 'update', targetId: 'npc-raven', npc: { currentGoal: 'Перехватить героя', lastSeen: 'На крыше башни' } }],
      scene: { tension: 80, weather: 'Гроза' },
    })

    expect(merged.playerProfile).toEqual({ levelDelta: 1, goal: 'Выжить', appearance: 'Порванный плащ' })
    expect(merged.relationships).toEqual([
      { npcId: 'npc-raven', delta: -4, dimensions: { fear: 2 } },
      { npcId: 'npc-raven', delta: 0, dimensions: { suspicion: 3 }, note: 'Запомнил угрозу' },
    ])
    expect(merged.npcs).toEqual([
      { operation: 'update', targetId: 'npc-raven', npc: { currentGoal: 'Перехватить героя' } },
      { operation: 'update', targetId: 'npc-raven', npc: { lastSeen: 'На крыше башни' } },
    ])
    expect(merged.scene).toEqual({ tension: 80, weather: 'Гроза' })
  })

  it('keeps authored quest, event, lore and faction changes while accepting only omitted fields', () => {
    const merged = mergeAuditPatch({
      quests: [{ operation: 'update', targetId: 'quest-tower', quest: { description: 'Войти через верхний ярус.' } }],
      threads: [{ operation: 'update', targetId: 'thread-debt', thread: { detail: 'Долг должен быть возвращён до рассвета.' } }],
      worldEvents: [{ operation: 'update', targetId: 'event-storm', event: { description: 'Буря накрывает северный район.' } }],
      lore: [{ id: 'lore-signal', title: 'Сигнал башни', type: 'fact', content: 'Источник находится наверху.', keys: ['башня'], enabled: true, alwaysOn: false, secret: false, discovered: true, priority: 60 }],
      upsertFactionReputation: [{ factionName: 'Стража', value: -10, notes: ['Обнаружено проникновение'] }],
    }, {
      quests: [{ operation: 'update', targetId: 'quest-tower', quest: { description: 'Заменённый аудитором текст.', reward: 'Ключ от шлюза' } }],
      threads: [{ operation: 'update', targetId: 'thread-debt', thread: { detail: 'Заменённый аудитором текст.', dueTurn: 8 } }],
      worldEvents: [{ operation: 'update', targetId: 'event-storm', event: { description: 'Заменённый аудитором текст.', visibility: 'rumored' } }],
      lore: [{ id: 'other-id', title: 'Сигнал башни', type: 'fact', content: 'Противоречащая версия.', keys: ['башня'], enabled: true, alwaysOn: false, secret: false, discovered: true, priority: 90 }],
      upsertFactionReputation: [{ factionName: 'Стража', value: -25, notes: ['Повтор того же последствия'] }],
    })

    expect(merged.quests).toEqual([
      { operation: 'update', targetId: 'quest-tower', quest: { description: 'Войти через верхний ярус.' } },
      { operation: 'update', targetId: 'quest-tower', quest: { reward: 'Ключ от шлюза' } },
    ])
    expect(merged.threads?.[1]).toEqual({ operation: 'update', targetId: 'thread-debt', thread: { dueTurn: 8 } })
    expect(merged.worldEvents?.[1]).toEqual({ operation: 'update', targetId: 'event-storm', event: { visibility: 'rumored' } })
    expect(merged.lore).toHaveLength(1)
    expect(merged.upsertFactionReputation).toEqual([{ factionName: 'Стража', value: -10, notes: ['Обнаружено проникновение'] }])
  })

  it('preserves newly discovered clues and new steps in an evolving antagonist plan', () => {
    const campaign = createDemoCampaign()
    const ownerNpcId = campaign.npcs[0].id
    campaign.mysteryCases = [{
      id: 'mystery-signal', title: 'Источник сигнала', premise: 'Кто ведёт передачу?', truth: 'Передатчик спрятан в башне.',
      status: 'open', clues: [
        { id: 'clue-old', title: 'Частота', detail: 'Военная полоса.', location: 'Рынок', source: 'Сканер', discovered: true, essential: true },
        { id: 'clue-pattern', title: 'Ритм', detail: 'Импульсы повторяются по расписанию.', location: 'Рынок', source: 'Сканер', discovered: false, essential: false },
        { id: 'clue-power', title: 'Мощность', detail: 'Передатчик находится выше уровня улиц.', location: 'Рынок', source: 'Сканер', discovered: false, essential: true },
      ],
      redHerrings: [], revelationRules: ['Найти передатчик'], createdTurn: 0,
    }]
    campaign.antagonistPlans = [{
      id: 'plan-raven', ownerNpcId, title: 'Перехват', objective: 'Забрать ключ', method: 'Засада', currentStep: 0, pressure: 40,
      resources: ['Наблюдатель'], knowledge: ['Герой идёт к башне'],
      steps: [{ id: 'step-watch', title: 'Наблюдение', trigger: 'Герой выходит на площадь', consequence: 'Маршрут раскрыт', status: 'active' }],
      weaknesses: ['Один канал связи'], status: 'active', secret: true, lastAdvancedTurn: 0,
    }]
    const plan = turnPlanSchema.parse({
      outcome: 'Расследование и вражеский план развиваются.',
      beats: ['Герой находит след.', 'Противник готовит второй этап.'],
      suggestions: ['Проверить башню', 'Сменить маршрут'],
      statePatch: {
        upsertMysteryCases: [
          {
            ...campaign.mysteryCases[0],
            clues: [
              ...campaign.mysteryCases[0].clues,
              { id: 'clue-new', title: 'Эхо башни', detail: 'Сигнал отражается от верхнего яруса.', location: 'Башня', source: 'Личное наблюдение', discovered: true, essential: true },
            ],
          },
          {
            id: 'mystery-new', title: 'Пропавший курьер', premise: 'Куда исчез курьер?', truth: 'Его удерживают в доках.', status: 'open',
            clues: [
              { id: 'courier-route', title: 'Маршрут', detail: 'Последний маршрут вёл к докам.', location: 'Архив', source: 'Накладная', discovered: true, essential: true },
              { id: 'courier-mark', title: 'Знак', detail: 'На сумке был знак портовой артели.', location: 'Рынок', source: 'Свидетель', discovered: false, essential: false },
              { id: 'courier-clock', title: 'Время', detail: 'Курьер исчез во время пересменки.', location: 'Док', source: 'Журнал', discovered: false, essential: true },
            ],
            redHerrings: [], revelationRules: ['Опросить свидетелей'], createdTurn: 999,
          },
        ],
        upsertAntagonistPlans: [{
          ...campaign.antagonistPlans[0], currentStep: 1, pressure: 55, lastAdvancedTurn: 1,
          steps: [
            { ...campaign.antagonistPlans[0].steps[0], status: 'completed' },
            { id: 'step-ambush', title: 'Засада в башне', trigger: 'Герой входит внутрь', consequence: 'Выходы блокируются', status: 'pending' },
          ],
        }],
      },
    })

    const patch = sanitizePlan(campaign, plan).plan.statePatch
    expect(patch.upsertMysteryCases).toHaveLength(2)
    expect(patch.upsertMysteryCases?.find((entry) => entry.id === 'mystery-signal')?.clues.map((clue) => clue.id)).toEqual(['clue-old', 'clue-pattern', 'clue-power', 'clue-new'])
    expect(patch.upsertMysteryCases?.find((entry) => entry.id === 'mystery-new')?.createdTurn).toBe(1)
    expect(patch.upsertAntagonistPlans?.[0].steps.map((step) => step.id)).toEqual(['step-watch', 'step-ambush'])
  })

  it('surfaces invalid NPC, faction and social references instead of silently losing them', () => {
    const campaign = createDemoCampaign()
    const npc = campaign.npcs[0]
    npc.strategy = undefined
    npc.dossier = undefined
    const plan = turnPlanSchema.parse({
      outcome: 'Персонаж меняет цель, но модель путает несколько идентификаторов.',
      beats: ['Цель персонажа меняется.'],
      suggestions: ['Продолжить', 'Проверить сведения'],
      statePatch: {
        npcs: [{
          operation: 'update', targetId: npc.id, npc: {
            currentGoal: 'Добраться до башни',
            resourceDeltas: { ghost_resource: -3 },
            statDeltas: { ghost_stat: 2 },
            strategy: { currentPlan: 'Подготовить обход' },
            dossier: { revealedSections: ['strategyOverview'] },
          },
        }],
        factionReputationDeltas: { 'Несуществующая фракция': -5 },
        socialLinks: [{ id: 'bad-link', fromNpcId: npc.id, toNpcId: 'ghost-npc', kind: 'trust', label: 'Доверие', score: 10, secret: false, notes: [] }],
      },
    })

    const sanitized = sanitizePlan(campaign, plan)
    const npcPatch = sanitized.plan.statePatch.npcs?.[0]
    expect(npcPatch?.operation).toBe('update')
    if (npcPatch?.operation !== 'update') throw new Error('Expected NPC update')
    expect(npcPatch.npc).toEqual({ currentGoal: 'Добраться до башни', resourceDeltas: {}, statDeltas: {} })
    expect(sanitized.plan.statePatch.factionReputationDeltas).toEqual({})
    expect(sanitized.plan.statePatch.socialLinks).toEqual([])
    expect(sanitized.rejections.map((entry) => entry.message)).toEqual(expect.arrayContaining([
      expect.stringContaining('неизвестной характеристики'),
      expect.stringContaining('неизвестного ресурса'),
      expect.stringContaining('неполный новый раздел «strategy»'),
      expect.stringContaining('неполный новый раздел «dossier»'),
      expect.stringContaining('неизвестной фракции'),
      expect.stringContaining('социальная связь'),
    ]))
  })

  it('rejects unknown world removals and removal of a character outside the party before applying a turn', () => {
    const campaign = createDemoCampaign()
    const npcId = campaign.npcs[0].id
    const plan = turnPlanSchema.parse({
      outcome: 'Модель попыталась удалить объекты, которых нет в текущем состоянии.',
      beats: ['Мир остаётся целостным.'],
      suggestions: ['Продолжить', 'Осмотреться'],
      statePatch: {
        party: { removeNpcIds: [npcId] },
        world: {
          removeRules: ['Несуществующее правило'],
          resolveMysteries: ['Несуществующая тайна'],
          removeFactions: ['Несуществующая фракция'],
          removeLocations: ['Несуществующая локация'],
          removeRouteIds: ['route-missing'],
          removePlaceIds: ['place-missing'],
          retireProcessIds: ['process-missing'],
          removeLawIds: ['law-missing'],
          removeMechanicIds: ['mechanic-missing'],
          removeInterfaceModuleIds: ['module-missing'],
        },
      },
    })

    const sanitized = sanitizePlan(campaign, plan)
    expect(sanitized.plan.statePatch.party?.removeNpcIds).toEqual([])
    expect(sanitized.plan.statePatch.world).toMatchObject({
      removeRules: undefined,
      resolveMysteries: undefined,
      removeFactions: undefined,
      removeLocations: undefined,
      removeRouteIds: undefined,
      removePlaceIds: undefined,
      retireProcessIds: undefined,
      removeLawIds: undefined,
      removeMechanicIds: undefined,
      removeInterfaceModuleIds: undefined,
    })
    expect(sanitized.rejections.map((entry) => entry.message)).toEqual(expect.arrayContaining([
      expect.stringContaining('неизвестного правила'),
      expect.stringContaining('неизвестной тайны'),
      expect.stringContaining('неизвестной фракции'),
      expect.stringContaining('неизвестной локации'),
      expect.stringContaining('неизвестного маршрута'),
      expect.stringContaining('неизвестного места'),
      expect.stringContaining('неизвестного внешнего процесса'),
      expect.stringContaining('неизвестного закона'),
      expect.stringContaining('неизвестной механики'),
      expect.stringContaining('неизвестного модуля'),
      expect.stringContaining('нет в отряде'),
    ]))
  })

  it('preserves simultaneous world rules, mechanics, interface modules and nested presentation changes', () => {
    const background = {
      world: {
        system: { summary: 'Нейронная нагрузка меняет состояние имплантов.' },
        presentation: { labels: { scene: 'Сейчас' }, categoryLabels: { artifact: 'Киберимплант' } },
        upsertLaws: [{ id: 'law-neural', title: 'Нейронный предел' }],
        upsertMechanics: [{ id: 'mechanic-strain', name: 'Нейронная нагрузка' }],
        upsertInterfaceModules: [{ id: 'module-neural', title: 'Состояние кибернетики' }],
        removeInterfaceModuleIds: ['module-old'],
      },
    } as TurnPatch
    const foreground = {
      world: {
        system: { progression: 'Импланты развиваются через настройку и безопасные испытания.' },
        presentation: { labels: { resources: 'Нагрузка' }, rarityLabels: { legendary: 'Единственный прототип' } },
        upsertLaws: [{ id: 'law-corp', title: 'Корпоративный контроль' }],
        upsertMechanics: [{ id: 'mechanic-scan', name: 'Удалённое сканирование' }],
        upsertInterfaceModules: [{ id: 'module-corp', title: 'Внимание корпорации' }],
        removeLawIds: ['law-obsolete'],
      },
    } as TurnPatch

    const merged = mergePatches(background, foreground)

    expect(merged.world?.upsertLaws?.map((entry) => entry.id)).toEqual(['law-neural', 'law-corp'])
    expect(merged.world?.upsertMechanics?.map((entry) => entry.id)).toEqual(['mechanic-strain', 'mechanic-scan'])
    expect(merged.world?.upsertInterfaceModules?.map((entry) => entry.id)).toEqual(['module-neural', 'module-corp'])
    expect(merged.world?.removeInterfaceModuleIds).toEqual(['module-old'])
    expect(merged.world?.removeLawIds).toEqual(['law-obsolete'])
    expect(merged.world?.system).toMatchObject({
      summary: 'Нейронная нагрузка меняет состояние имплантов.',
      progression: 'Импланты развиваются через настройку и безопасные испытания.',
    })
    expect(merged.world?.presentation).toMatchObject({
      labels: { scene: 'Сейчас', resources: 'Нагрузка' },
      categoryLabels: { artifact: 'Киберимплант' },
      rarityLabels: { legendary: 'Единственный прототип' },
    })
  })
})
