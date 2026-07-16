import { describe, expect, it } from 'vitest'
import type { WorldIdea } from './types'
import { assessWorldIdeaNovelty, worldIdeaSummary } from './world-idea-novelty'

function idea(overrides: Partial<WorldIdea> = {}): WorldIdea {
  return {
    title: 'Мнемос',
    tagline: 'Память можно хранить, продавать и красть.',
    corePremise: 'Воспоминания являются осязаемой субстанцией: их извлекают, хранят в кристаллах и используют как валюту.',
    inspiration: 'Подробный мир торговли памятью.',
    genre: 'Социальная фантастика',
    tone: 'Меланхоличный',
    heroName: 'Лио',
    heroConcept: 'Курьер потерянных воспоминаний.',
    opening: 'На рынке герой находит собственное детское воспоминание.',
    pillars: [
      { title: 'Банки памяти', description: 'Хранят опыт.', worldImpact: 'Контролируют экономику.' },
      { title: 'Пустоши', description: 'Лишены прошлого.', worldImpact: 'Создают миграцию.' },
      { title: 'Чистые линии', description: 'Защищают память.', worldImpact: 'Удерживают власть.' },
    ],
    signatureMechanic: {
      name: 'Извлечение памяти',
      principle: 'Опыт можно отделить от личности.',
      playerUse: 'Герой обменивает воспоминания на доступ и навыки.',
      worldConsequences: ['Личность меняется', 'Рынок краденой памяти растёт'],
    },
    livingWorld: {
      everydayLife: 'Люди страхуют важные воспоминания.',
      autonomousForces: ['Банки памяти', 'Архивисты', 'Пустынные общины'],
      distantHorizons: ['Пустошь', 'Города хранилищ', 'Чистые линии'],
    },
    centralTensions: ['Память против личности', 'Рынок против достоинства', 'Забвение против свободы'],
    uniquePromises: ['Торговать опытом', 'Возвращать прошлое', 'Менять общественную память'],
    avoidedCliches: ['Нет избранного', 'Нет стандартной маны', 'Нет безликой империи'],
    originalityScore: 90,
    ...overrides,
  }
}

describe('world idea novelty gate', () => {
  it('rejects an exact repeated world even when formatting and letter case change', () => {
    const candidate = idea()
    const previous = worldIdeaSummary(candidate).toLocaleUpperCase('ru-RU').replace(/Ё/gu, 'Е').replace(/[.:]/gu, ' ')
    const result = assessWorldIdeaNovelty(candidate, [previous])

    expect(result.novel).toBe(false)
    expect(result.similarity).toBeGreaterThan(0.85)
  })

  it('rejects the same causal concept under a lightly changed title', () => {
    const candidate = idea({ title: 'Архив Мнемоса' })
    const result = assessWorldIdeaNovelty(candidate, [
      'Мнемос: Воспоминания — материальная субстанция, которую извлекают из людей, сохраняют в кристаллах и продают как валюту.\nМеханика: Извлечение памяти. Опыт отделяют от личности.',
    ])

    expect(result.novel).toBe(false)
    expect(result.reason).toMatch(/фундамент|пересказ|близка/u)
  })

  it('allows a genuinely different world even if both concepts are suitable for long roleplay', () => {
    const candidate = idea({
      title: 'Сады Непрожитых Имен',
      corePremise: 'Города выращивают общественные имена как живые сады, а безымянные люди меняют юридическую личность через признанные поступки.',
      signatureMechanic: {
        name: 'Признание имени',
        principle: 'Поступок меняет личность только после независимого общественного свидетельства.',
        playerUse: 'Герой собирает свидетельства и оспаривает закреплённые роли.',
        worldConsequences: ['Меняется наследование', 'Появляются общины безымянных'],
      },
    })
    const result = assessWorldIdeaNovelty(candidate, [worldIdeaSummary(idea())])

    expect(result.novel).toBe(true)
    expect(result.similarity).toBeLessThan(0.7)
  })
})
