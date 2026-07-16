import { describe, expect, it } from 'vitest'
import { assessItemRarity, rarityFromKnownCopies } from './rarity'

describe('real item rarity', () => {
  it('does not turn a weak unique object into a legendary item', () => {
    const assessment = assessItemRarity({
      category: 'artifact', rarity: 'legendary', effects: ['Создаёт короткий локальный барьер', 'Стабилизирует линию в радиусе трёх метров'],
      rarityProfile: {
        basis: 'Единственный экспериментальный образец', scarcity: 'Других экземпляров не обнаружено', knownCopies: 1,
        recognition: 'Известен узкому кругу', marketImpact: 'Интересен коллекционерам', acquisitionRisk: 80,
      },
    })
    expect(assessment.rarity).toBe('uncommon')
    expect(assessment.scarcity).toBe(100)
    expect(assessment.potency).toBeLessThan(40)
  })

  it('keeps the compatibility helper stable when the amount is unknown', () => {
    expect(rarityFromKnownCopies('epic', undefined)).toBe('epic')
  })

  it('reserves mythic and transcendent ranks for genuinely world-changing items', () => {
    const assessment = assessItemRarity({
      category: 'artifact', rarity: 'common', effects: ['Переписывает причинность'],
      rarityProfile: {
        basis: 'Ядро погибшей вселенной', scarcity: 'Единственное', knownCopies: 1, recognition: 'Узнаваемо высшими сущностями',
        marketImpact: 'Не имеет измеримой цены', acquisitionRisk: 100, potency: 100, versatility: 95, worldImpact: 100, provenance: 100,
        limitations: [], assessment: 'Меняет фундаментальные законы реальности.',
      },
    })
    expect(assessment.rarity).toBe('transcendent')
  })
})
