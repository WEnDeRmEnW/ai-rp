import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorldIdea, WorldIdeaRequest } from '../shared/types'
import { worldIdeaSummary } from '../shared/world-idea-novelty'

const providerMocks = vi.hoisted(() => ({
  completeJson: vi.fn(),
  completeText: vi.fn(),
}))

vi.mock('./provider.js', () => providerMocks)

import { generateWorldIdea } from './orchestrator'

function makeIdea(title: string, corePremise: string, mechanic: string): WorldIdea {
  return {
    title,
    tagline: `${title} меняет привычные правила жизни.`,
    corePremise,
    inspiration: `${corePremise}\n\nОбщества приспособили к этому законы, быт, экономику и дальние маршруты. У каждой силы есть собственные интересы и способы действовать без героя.`,
    genre: 'Социальная фантастика и приключение',
    tone: 'Живой, исследовательский, с серьёзными последствиями',
    heroName: 'Иара',
    heroConcept: 'Обычная путешественница, чья профессия позволяет видеть противоречия между правилами разных обществ.',
    opening: 'На городской площади привычная процедура даёт невозможный результат, и несколько сторон требуют от героини выбрать, кому передать свидетельство.',
    pillars: [
      { title: 'Повседневность', description: 'Обычные люди приспосабливают правило мира к работе и семье.', worldImpact: 'Быт создаёт новые профессии и конфликты.' },
      { title: 'Власть', description: 'Институты спорят о праве толковать необычное правило.', worldImpact: 'Законы различаются между регионами.' },
      { title: 'Горизонты', description: 'Удалённые общества нашли другие применения тому же явлению.', worldImpact: 'Путешествия меняют представление о норме.' },
    ],
    signatureMechanic: {
      name: mechanic,
      principle: `${mechanic} действует по наблюдаемому причинному правилу и допускает проверку.`,
      playerUse: 'Героиня собирает свидетельства, выбирает посредников и принимает последствия спорных решений.',
      worldConsequences: ['Решения меняют доступ к институтам', 'Удалённые силы корректируют собственные планы'],
    },
    livingWorld: {
      everydayLife: 'Люди работают, торгуют, спорят и растят детей, используя правило мира в повседневных задачах.',
      autonomousForces: ['Союз городских посредников', 'Независимые общины дорог', 'Архив региональных договоров'],
      distantHorizons: ['Прибрежная республика', 'Внутренние сады', 'Кочующие судебные дома'],
    },
    centralTensions: ['Свобода против общего договора', 'Память против права измениться', 'Местный закон против дальних последствий'],
    uniquePromises: ['Решать конфликты несколькими способами', 'Видеть жизнь мира без героя', 'Менять отношения регионов причинными поступками'],
    avoidedCliches: ['Нет избранного спасителя', 'Нет безликой злой империи', 'Нет стандартной шкалы маны'],
    originalityScore: 90,
  }
}

const duplicate = makeIdea(
  'Мнемос',
  'Воспоминания являются осязаемой субстанцией: их извлекают, хранят в кристаллах и используют как валюту.',
  'Извлечение памяти',
)
const distinct = makeIdea(
  'Сады Непрожитых Имен',
  'Города выращивают общественные имена как живые сады, а безымянные люди меняют юридическую личность через признанные поступки.',
  'Признание имени',
)
const passingReview = {
  pass: true,
  originality: 93,
  coherence: 90,
  longTermDepth: 92,
  playability: 89,
  livingWorld: 94,
  detectedCliches: [],
  issues: [],
  rewriteInstructions: 'Концепция готова.',
}
const request: WorldIdeaRequest = {
  hint: '',
  contentBoundaries: '',
  previousIdeas: [worldIdeaSummary(duplicate)],
  creativeSeed: 'integration-seed-123456',
  provider: {
    provider: 'ollama',
    model: 'deepseek-v4-flash:cloud',
    baseUrl: 'https://ollama.com/v1',
    temperature: 0.9,
  },
}

beforeEach(() => {
  providerMocks.completeJson.mockReset()
  providerMocks.completeText.mockReset()
})

describe('server world idea regeneration', () => {
  it('rejects a real repeated concept before review and automatically asks for another direction', async () => {
    providerMocks.completeJson
      .mockResolvedValueOnce(duplicate)
      .mockResolvedValueOnce(distinct)
      .mockResolvedValueOnce(passingReview)

    const result = await generateWorldIdea(request)

    expect(result.title).toBe(distinct.title)
    expect(result.originalityScore).toBe(92)
    expect(providerMocks.completeJson).toHaveBeenCalledTimes(3)
    const retryPrompt = providerMocks.completeJson.mock.calls[1]![1] as Array<{ content: string }>
    expect(retryPrompt[1]!.content).toContain('Мнемос')
  })

  it('never returns the old world when every generated candidate repeats it', async () => {
    providerMocks.completeJson.mockResolvedValue(duplicate)

    await expect(generateWorldIdea(request)).rejects.toThrow(/несколько раз повторил/u)
    expect(providerMocks.completeJson).toHaveBeenCalledTimes(3)
  })
})
