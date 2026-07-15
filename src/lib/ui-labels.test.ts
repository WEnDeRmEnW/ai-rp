import { describe, expect, it } from 'vitest'
import { localizeTechnicalText, resourceUiLabel, uiLabel } from './ui-labels'

describe('Russian interface labels', () => {
  it('never exposes common technical enum values to the player', () => {
    expect(`${uiLabel('mystery')} · ${uiLabel('open')}`).toBe('Тайна · Открыто')
    expect(`${uiLabel('rumor')} · ${uiLabel('active')}`).toBe('Слух · Активно')
    expect(uiLabel('reality')).toBe('Реальность')
    expect(uiLabel('dormant')).toBe('Неактивно')
    expect(uiLabel('unknown_internal_value', 'Сюжетная линия')).toBe('Сюжетная линия')
  })

  it('localizes old saved receipts and uses the authored resource label', () => {
    expect(localizeTechnicalText('Статус: open → solved · NPC active')).toBe('Статус: Открыто → Раскрыто · персонаж Активно')
    expect(resourceUiLabel('focus', [{ key: 'focus', label: 'Концентрация' }])).toBe('Концентрация')
    expect(resourceUiLabel('health')).toBe('Здоровье')
  })

  it('makes old English genre combinations readable in the interface', () => {
    expect(localizeTechnicalText('adventure, drama')).toBe('Приключение, Драма')
    expect(localizeTechnicalText('knowledge и chakra')).toBe('знания и Чакра')
  })
})
