import { describe, expect, it } from 'vitest'
import type { AbilityDraft, Campaign, NarrativeEventProposal, TurnPatch } from './types'
import { createDemoCampaign } from '../src/lib/demo'
import { commitTurn, rewindLastTurn } from '../src/lib/engine'
import {
  applyNarrativeEventProposal,
  defaultEventDirectorState,
  narrativeEventComplianceIssues,
  prepareEventDirectorState,
  shouldConsultEventDirector,
  validateNarrativeEventProposal,
} from './event-director'

function proposal(overrides: Partial<NarrativeEventProposal> = {}): NarrativeEventProposal {
  return {
    mode: 'seed',
    lifecycleStage: 'seeded',
    concept: 'В дальнем городе неизвестный исследователь замечает устойчивую аномалию памяти.',
    category: 'anomaly',
    magnitude: 'subtle',
    miracleKind: 'none',
    originKind: 'unknown',
    sourceIds: [],
    causeIds: [],
    scopeIds: [],
    participantIds: [],
    affectedDomains: ['process'],
    knowledgeChannel: 'Пока скрыто от героя.',
    trigger: 'Три независимых прибора зарегистрировали одинаковое отклонение.',
    arrivalMethod: 'Событие развивается вдали от текущей сцены.',
    observableSigns: [],
    immediateEffects: [],
    persistentEffects: [],
    counterplay: [],
    cancellationConditions: ['Эксперимент будет остановлен до повторной проверки.'],
    canonReasoning: 'Аномалия использует уже установленные свойства мира.',
    pacingReasoning: 'Скрытое зерно не перегружает текущую передышку.',
    noveltyReasoning: 'Недавние линии не были связаны с удалённым исследованием памяти.',
    minimumDelay: 2,
    ...overrides,
  }
}

function completeAbility(id = 'ability-event'): AbilityDraft {
  return {
    id,
    name: 'Резонанс следа',
    description: 'Позволяет различать остаточный отпечаток уже произошедшего изменения.',
    rank: 'Пробуждённая',
    source: 'Нейронная адаптация после контакта с аномалией.',
    kind: 'passive',
    mastery: 8,
    costs: [],
    effects: ['Герой замечает устойчивые следы изменения среды.'],
    limitations: ['Не раскрывает причину следа без исследования.'],
    requirements: ['Физический контакт с областью изменения.'],
    progression: 'Точность растёт после сопоставления следов с подтверждёнными событиями.',
    evolutionPaths: [],
    history: [{ title: 'Первое проявление', description: 'Способность оформилась после контакта с аномалией.' }],
    tags: ['восприятие', 'аномалия'],
    category: 'perception',
    scale: 'Личная чувствительность в пределах текущего места.',
    activation: 'Возникает непроизвольно при близком контакте, затем может удерживаться вниманием.',
    capabilities: ['Отличает свежий след изменения от обычного фона.'],
    synergies: [],
    counters: ['Экранирование источника', 'Хаотичный энергетический шум'],
    examples: ['Определить, что комната была недавно изменена аномалией.'],
    techniques: [],
    canonStatus: 'original',
  }
}

describe('universal narrative event director', () => {
  it('accumulates readiness deterministically and keeps the hidden clock compact', () => {
    const campaign = createDemoCampaign()
    campaign.eventDirectorState = defaultEventDirectorState(0)
    const first = prepareEventDirectorState(campaign)
    expect(first.lastEvaluatedTurn).toBe(1)
    expect(first.surpriseCharge).toBeGreaterThan(0)
    expect(first.surpriseCharge).toBeLessThan(10)

    campaign.turn = 10
    campaign.eventDirectorState = first
    const later = prepareEventDirectorState(campaign)
    expect(later.lastEvaluatedTurn).toBe(11)
    expect(later.surpriseCharge).toBeGreaterThanOrEqual(30)
    expect(later.activeEvents).toEqual([])
  })

  it('stores a hidden seed, advances the same stable event and records only a compact signature', () => {
    const campaign = createDemoCampaign()
    campaign.eventDirectorState = { ...defaultEventDirectorState(0), surpriseCharge: 100 }
    const seed = proposal()
    expect(validateNarrativeEventProposal(campaign, campaign.eventDirectorState, seed)).toEqual([])

    const seeded = applyNarrativeEventProposal(campaign, campaign.eventDirectorState, seed, () => 'event-hidden-1')
    expect(seeded.activeEvents).toHaveLength(1)
    expect(seeded.activeEvents[0]).toMatchObject({ id: 'event-hidden-1', stage: 'seeded' })
    expect(seeded.recentSignatures).toEqual([])

    campaign.turn = 4
    campaign.eventDirectorState = seeded
    const manifested = proposal({
      mode: 'manifest',
      existingEventId: 'event-hidden-1',
      lifecycleStage: 'manifested',
      magnitude: 'major',
      affectedDomains: ['scene'],
      arrivalMethod: 'Наблюдаемый эффект достигает текущего места по установленному маршруту.',
      observableSigns: ['На поверхности предметов проступает одинаковый остаточный рисунок.'],
      immediateEffects: [{ domain: 'scene', operation: 'update', requirement: 'Напряжение и наблюдаемая обстановка сцены отражают проявление аномалии.', observable: true, mandatory: true }],
      counterplay: ['Покинуть область устойчивого следа.', 'Изолировать предмет-носитель.'],
    })
    expect(validateNarrativeEventProposal(campaign, seeded, manifested)).toEqual([])
    const next = applyNarrativeEventProposal(campaign, seeded, manifested, () => 'unused')
    expect(next.activeEvents[0]).toMatchObject({ id: 'event-hidden-1', stage: 'manifested', createdTurn: 1 })
    expect(next.recentSignatures).toHaveLength(1)
    expect(next.recentSignatures[0]).toMatchObject({ category: 'anomaly', magnitude: 'major', outcome: 'manifested', turn: 5 })
    expect(next.history[0]).toMatchObject({
      id: 'event-hidden-1',
      causeIds: [],
      participantIds: [],
      keyConsequences: ['Напряжение и наблюдаемая обстановка сцены отражают проявление аномалии.'],
      outcome: 'manifested',
    })
  })

  it('does not call the model on every turn after an honest no-event decision', () => {
    const campaign = createDemoCampaign()
    campaign.eventDirectorState = { ...defaultEventDirectorState(0), surpriseCharge: 46 }
    const declined = applyNarrativeEventProposal(campaign, campaign.eventDirectorState, {
      mode: 'none',
      reason: 'Текущая передышка уже содержит достаточно значимых последствий.',
    }, () => 'unused')
    expect(declined.surpriseCharge).toBe(42)
    expect(declined.nextEvaluationTurn).toBe(5)

    campaign.turn = 1
    campaign.eventDirectorState = declined
    expect(shouldConsultEventDirector(campaign, prepareEventDirectorState(campaign))).toBe(false)
    campaign.turn = 4
    expect(shouldConsultEventDirector(campaign, prepareEventDirectorState(campaign))).toBe(true)
  })

  it('rejects unknown causes, player decisions, premature reality changes and near-duplicate patterns', () => {
    const campaign = createDemoCampaign()
    const state = { ...defaultEventDirectorState(0), surpriseCharge: 100 }
    const invalid = proposal({
      mode: 'manifest',
      lifecycleStage: 'manifested',
      magnitude: 'major',
      category: 'law_change',
      sourceIds: ['unknown-source'],
      causeIds: ['unknown-cause'],
      affectedDomains: ['player', 'law'],
      immediateEffects: [
        { domain: 'player', operation: 'update', requirement: 'Герой решил принять сторону нового закона.', observable: true, mandatory: true },
        { domain: 'law', operation: 'create', targetId: 'law-new', requirement: 'Создать новый действующий закон мира.', observable: true, mandatory: true },
      ],
      counterplay: ['Исследовать аномалии и оспорить объяснение.'],
    })
    const issues = validateNarrativeEventProposal(campaign, state, invalid)
    expect(issues).toEqual(expect.arrayContaining([
      expect.stringContaining('ранее заложенной арки'),
      expect.stringContaining('неизвестную сущность'),
      expect.stringContaining('внутреннее решение'),
    ]))

    const duplicateState = {
      ...state,
      recentSignatures: [{
        signature: 'different-but-related',
        category: 'anomaly' as const,
        magnitude: 'subtle' as const,
        originKind: 'unknown' as const,
        affectedDomains: ['process' as const],
        turn: 0,
        outcome: 'manifested' as const,
      }],
    }
    expect(validateNarrativeEventProposal(campaign, duplicateState, proposal())).toContain('Событие слишком похоже на недавний сюжетный рисунок и не является развитием прежней линии.')
  })

  it('requires a genuinely complete ability record instead of accepting a prose-only awakening', () => {
    const event = proposal({
      mode: 'manifest',
      lifecycleStage: 'manifested',
      category: 'power_shift',
      magnitude: 'notable',
      originKind: 'player',
      affectedDomains: ['ability'],
      arrivalMethod: 'Способность впервые объективно проявляется при контакте с аномалией.',
      observableSigns: ['Герой различает след, недоступный обычному восприятию.'],
      immediateEffects: [{ domain: 'ability', operation: 'create', targetId: 'ability-event', requirement: 'Добавить полную постоянную способность героя.', observable: true, mandatory: true }],
    })
    const incompletePatch: TurnPatch = {
      addAbilities: [{ id: 'ability-event', name: 'Резонанс следа', description: 'Новая сила.' }],
    }
    expect(narrativeEventComplianceIssues(event, incompletePatch)).toEqual([
      'ability/create: Добавить полную постоянную способность героя.',
    ])

    const completePatch: TurnPatch = { addAbilities: [completeAbility()] }
    expect(narrativeEventComplianceIssues(event, completePatch)).toEqual([])
  })

  it('distinguishes divine events from a true miracle and enforces the last-resort miracle rules', () => {
    const campaign = createDemoCampaign()
    const directMiracle = proposal({
      mode: 'manifest',
      lifecycleStage: 'manifested',
      category: 'divine',
      magnitude: 'notable',
      miracleKind: 'intervention',
      originKind: 'deity',
      affectedDomains: ['player', 'scene'],
      concept: 'Неизвестная высшая сила на один миг останавливает смертельное разрушение тела героя.',
      trigger: 'Герою грозит немедленная гибель, обычной помощи поблизости нет.',
      arrivalMethod: 'Смертельный удар замирает на границе тела, возвращая герою возможность действовать.',
      observableSigns: ['На один вдох движение вокруг смертельной раны прекращается.'],
      immediateEffects: [
        { domain: 'player', operation: 'update', requirement: 'Зафиксировать тяжёлое ранение, но не смерть героя.', observable: true, mandatory: true },
        { domain: 'scene', operation: 'update', requirement: 'Открыть краткий путь для самостоятельного действия или отступления.', observable: true, mandatory: true },
      ],
      counterplay: ['Герой должен сам воспользоваться коротким окном и выбрать дальнейшее действие.'],
    })
    expect(validateNarrativeEventProposal(campaign, { ...defaultEventDirectorState(0), surpriseCharge: 97 }, directMiracle)).toContain(
      'Для прямого чуда ещё не накоплена исключительная готовность истории.',
    )
    expect(validateNarrativeEventProposal(campaign, { ...defaultEventDirectorState(0), surpriseCharge: 100 }, directMiracle)).toEqual([])

    const unfair = {
      ...directMiracle,
      immediateEffects: [
        ...directMiracle.immediateEffects,
        { domain: 'npc' as const, operation: 'remove' as const, targetId: campaign.npcs[0].id, requirement: 'Чудо уничтожает врага вместо героя.', observable: true, mandatory: true },
      ],
      affectedDomains: [...directMiracle.affectedDomains, 'npc' as const],
    }
    expect(validateNarrativeEventProposal(campaign, { ...defaultEventDirectorState(0), surpriseCharge: 100 }, unfair)).toContain(
      'Прямое чудо пытается превратить спасение в победу либо стереть уже произошедшие последствия.',
    )

    const divineButOrdinary = proposal({
      mode: 'manifest',
      lifecycleStage: 'manifested',
      category: 'divine',
      magnitude: 'subtle',
      miracleKind: 'none',
      originKind: 'deity',
      affectedDomains: ['scene'],
      concept: 'Жрец замечает на храмовой стене известный знак своего божества.',
      trigger: 'Наступил установленный храмовый праздник.',
      arrivalMethod: 'Знак нанесён служителями в рамках обычного обряда.',
      observableSigns: ['На стене появляется праздничная печать.'],
      immediateEffects: [{ domain: 'scene', operation: 'update', requirement: 'Отразить наблюдаемый храмовый обряд.', observable: true, mandatory: true }],
    })
    expect(validateNarrativeEventProposal(campaign, { ...defaultEventDirectorState(0), surpriseCharge: 50 }, divineButOrdinary)).toEqual([])
  })

  it('checks every modern event domain against the exact target and canonical operation', () => {
    const event = proposal({
      mode: 'manifest',
      lifecycleStage: 'manifested',
      category: 'consequence',
      magnitude: 'notable',
      affectedDomains: ['status-effect', 'thread', 'mystery', 'social-link', 'lore', 'faction-reputation', 'metric'],
      arrivalMethod: 'Последствия одновременно проявляются в теле, связях и наблюдаемых системах мира.',
      observableSigns: ['Новые последствия доступны герою напрямую или через достоверные сведения.'],
      immediateEffects: [
        { domain: 'status-effect', operation: 'create', targetId: 'effect-event', requirement: 'Добавить точный устойчивый эффект.', observable: true, mandatory: true },
        { domain: 'thread', operation: 'create', targetId: 'thread-event', requirement: 'Создать причинную сюжетную нить.', observable: true, mandatory: true },
        { domain: 'mystery', operation: 'reveal', targetId: 'mystery-event', requirement: 'Открыть настоящую улику тайны.', observable: true, mandatory: true },
        { domain: 'social-link', operation: 'remove', targetId: 'link-ended', requirement: 'Удалить прекратившуюся связь NPC.', observable: true, mandatory: true },
        { domain: 'lore', operation: 'remove', targetId: 'lore-obsolete', requirement: 'Отключить опровергнутое правило лора.', observable: true, mandatory: true },
        { domain: 'faction-reputation', operation: 'update', targetId: 'Северный союз', requirement: 'Изменить отношение точной фракции.', observable: true, mandatory: true },
        { domain: 'metric', operation: 'update', targetId: 'wanted', requirement: 'Изменить настоящий показатель розыска.', observable: true, mandatory: true },
      ],
    })
    const wrongTargets: TurnPatch = {
      upsertStatusEffects: [{ id: 'effect-other', name: 'Иной эффект', description: 'Не относится к событию.', category: 'other', severity: 10, source: 'другое', effects: [], stacks: 1, duration: { unit: 'turns', remaining: 1 } }],
      threads: [{ operation: 'add', thread: { id: 'thread-other', type: 'rumor', title: 'Другая нить', detail: 'Не та линия.', participantIds: [], status: 'active', secret: false, createdTurn: 1 } }],
      upsertMysteryCases: [{ id: 'mystery-event', title: 'Тайна', premise: 'Есть вопрос.', truth: 'Ответ скрыт.', status: 'open', clues: [{ id: 'clue-hidden', title: 'След', detail: 'Пока скрыт.', location: 'Архив', source: 'Запись', discovered: false, essential: true }], redHerrings: [], revelationRules: [], createdTurn: 1 }],
      lore: [{ id: 'lore-obsolete', title: 'Старое правило', type: 'rule', content: 'Опровергнуто.', keys: ['старое'], enabled: true, alwaysOn: false, secret: false, discovered: true, priority: 10 }],
      factionReputationDeltas: { 'Южный союз': 5 },
      world: { metricDeltas: { suspicion: 5 } },
    }
    expect(narrativeEventComplianceIssues(event, wrongTargets)).toHaveLength(7)

    const correctPatch: TurnPatch = {
      upsertStatusEffects: [{ id: 'effect-event', name: 'Метка события', description: 'Устойчивый наблюдаемый след.', category: 'other', severity: 25, source: 'событие', effects: ['След остаётся заметным.'], stacks: 1, duration: { unit: 'indefinite' } }],
      threads: [{ operation: 'add', thread: { id: 'thread-event', type: 'witness', title: 'Свидетель события', detail: 'Свидетель сохранил доказательство.', participantIds: [], status: 'active', secret: false, createdTurn: 1 } }],
      upsertMysteryCases: [{ id: 'mystery-event', title: 'Тайна', premise: 'Есть вопрос.', truth: 'Ответ скрыт.', status: 'open', clues: [{ id: 'clue-open', title: 'Открытый след', detail: 'Герой действительно обнаружил улику.', location: 'Архив', source: 'Запись', discovered: true, essential: true }], redHerrings: [], revelationRules: [], createdTurn: 1 }],
      removeSocialLinkIds: ['link-ended'],
      lore: [{ id: 'lore-obsolete', title: 'Старое правило', type: 'rule', content: 'Опровергнуто.', keys: ['старое'], enabled: false, alwaysOn: false, secret: false, discovered: true, priority: 10 }],
      factionReputationDeltas: { 'Северный союз': -8 },
      world: { metricDeltas: { wanted: 12 } },
    }
    expect(narrativeEventComplianceIssues(event, correctPatch)).toEqual([])
  })

  it('restores hidden event state together with the rest of the campaign on rewind', () => {
    const campaign = createDemoCampaign()
    const originalState = structuredClone(campaign.eventDirectorState)
    const changedState = { ...defaultEventDirectorState(1), surpriseCharge: 57 }
    const committed = commitTurn(campaign, 'Я жду.', 'continue', {
      narrative: 'Проходит несколько спокойных минут.',
      suggestions: ['Осмотреться', 'Продолжить ждать'],
      statePatch: { eventDirectorState: changedState },
      activeLoreIds: [],
      recalledMemoryIds: [],
    })
    expect(committed.eventDirectorState?.surpriseCharge).toBe(57)
    expect(rewindLastTurn(committed).eventDirectorState).toEqual(originalState)
  })

  it('does not mutate the campaign while evaluating readiness', () => {
    const campaign: Campaign = createDemoCampaign()
    const before = structuredClone(campaign)
    prepareEventDirectorState(campaign)
    expect(campaign).toEqual(before)
  })
})
