import { describe, expect, it } from 'vitest'
import { legendCharacterDisplayName, legendNameLooksLikeEvent, legendRepresentsCharacter } from './legend-identity'

const base = {
  characterId: undefined,
  name: 'Аурел Семипечатный',
  aliases: ['Аурел Неподписанный'],
  titles: ['Первый хранитель общего закона'],
  epithet: 'Тот, кто отказался от восьмой печати',
  role: 'Исторический правитель и мастер печатей',
  summary: 'Человек, изменивший устройство семи городов.',
}

describe('legend character identity', () => {
  it('rejects events, places and organizations from the character roster', () => {
    expect(legendRepresentsCharacter({
      ...base,
      name: 'Падение Первозданного Эфира',
      role: 'Катастрофа, изменившая мир',
    })).toBe(false)
    expect(legendRepresentsCharacter({
      ...base,
      name: 'Тайна Забытого Храма',
      role: 'Древнее место силы',
    })).toBe(false)
    expect(legendRepresentsCharacter({
      ...base,
      name: 'Рождение Культа Забвения',
      role: 'Организация, уничтожающая память',
    })).toBe(false)
  })

  it('recognizes biographical event headings and recovers a person title in old saves', () => {
    const legacy = {
      ...base,
      name: 'Восхождение Короля-Феникса',
      titles: ['Король-Феникс', 'Владыка Эфирного Огня'],
      role: 'Легендарный правитель, объединивший разрозненные земли',
    }
    expect(legendNameLooksLikeEvent(legacy.name)).toBe(true)
    expect(legendRepresentsCharacter(legacy)).toBe(true)
    expect(legendCharacterDisplayName(legacy, { id: 'player', name: 'Герой' }, [])).toBe('Король-Феникс')
  })

  it('does not mistake events mentioned inside an individual role for the legend itself', () => {
    expect(legendRepresentsCharacter({
      ...base,
      name: 'Итачи Учиха',
      aliases: [],
      titles: ['Отступник Конохи'],
      role: 'Шиноби клана Учиха, уничтоживший свой клан по приказу Конохи, чтобы предотвратить гражданскую войну.',
    })).toBe(true)
  })

  it('always displays the actual linked player or NPC name', () => {
    const linked = { ...base, characterId: 'npc-1', name: 'Пророчество о возвращении' }
    expect(legendCharacterDisplayName(linked, { id: 'player', name: 'Герой' }, [{ id: 'npc-1', name: 'Лиора Вейн' }])).toBe('Лиора Вейн')
  })
})
