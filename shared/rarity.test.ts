import { describe, expect, it } from 'vitest'
import { rarityFromKnownCopies } from './rarity'

describe('real item rarity', () => {
  it('derives rarity from the documented number of known copies', () => {
    expect(rarityFromKnownCopies('common', 1)).toBe('legendary')
    expect(rarityFromKnownCopies('common', 7)).toBe('epic')
    expect(rarityFromKnownCopies('common', 64)).toBe('rare')
    expect(rarityFromKnownCopies('legendary', 640)).toBe('uncommon')
    expect(rarityFromKnownCopies('legendary', 6_400)).toBe('common')
  })

  it('keeps the authored rarity when the amount is truly unknown', () => {
    expect(rarityFromKnownCopies('epic', undefined)).toBe('epic')
  })
})
