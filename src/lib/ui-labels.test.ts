import { describe, expect, it } from 'vitest'
import { isTechnicalReceiptText, localizeTechnicalText, resourceUiLabel, sanitizeReceiptText, uiLabel } from './ui-labels'

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

  it('scrubs implementation paths, identifiers and unknown internal enum values from receipts', () => {
    const dirty = 'statePatch.upsertAntagonistPlans[0].ownerNpcId: active_mode «3253e2ff-5f57-4b60-9c3b-4605a20018d0»'
    const safe = sanitizeReceiptText(dirty)
    expect(safe).not.toMatch(/statePatch|ownerNpcId|active_mode|3253e2ff/u)
    expect(isTechnicalReceiptText(dirty)).toBe(true)
    expect(sanitizeReceiptText('Статус: open → solved')).toBe('Статус: Открыто → Раскрыто')
    expect(sanitizeReceiptText('Получен sandevistan')).toBe('Получен sandevistan')
  })
})
