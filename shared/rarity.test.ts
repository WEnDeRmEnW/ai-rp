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

  it('uses one visible score and one class boundary', () => {
    const assessment = assessItemRarity({
      category: 'artifact', rarity: 'mythic', effects: [],
      rarityProfile: {
        basis: 'Пограничный эталон', scarcity: 'Единственный', knownCopies: 1, recognition: 'Известен хранителям мира',
        marketImpact: 'Не продаётся', acquisitionRisk: 99, potency: 99, versatility: 92, worldImpact: 98, provenance: 99,
        limitations: ['Требует настройки', 'Не действует вне родной реальности', 'Подчиняется установленному владельцу'],
      },
    })
    expect(assessment.score).toBeGreaterThanOrEqual(90)
    expect(assessment.rarity).toBe('transcendent')
  })

  it('does not demote a genuine reality authority because it has honest requirements', () => {
    const assessment = assessItemRarity({
      category: 'artifact', rarity: 'mythic', effects: ['Меняет локальные законы причинности'],
      rarityProfile: {
        basis: 'Сердце погибшего слоя реальности', scarcity: 'Существует один экземпляр', knownCopies: 1,
        recognition: 'Распознаётся высшими сущностями', marketImpact: 'Цена невыразима', acquisitionRisk: 100,
        potency: 100, versatility: 80, worldImpact: 100, provenance: 100,
        limitations: ['Нужна воля 18+', 'Действует только в пределах наблюдаемого мира', 'Ошибка вызывает откат', 'Требует согласования с носителем'],
      },
      artifact: {
        sentient: false, awakened: true, attunement: 100, bond: 0,
        requirements: ['Нужна воля 18+'], passiveEffects: [], combinedEffects: [], failureModes: ['Ошибка вызывает откат'],
        components: [], powers: [], drawbacks: ['Требует согласования с носителем'], evolutionPaths: [], secrets: [], scale: 'cosmic',
      },
    })
    expect(assessment.rarity).toBe('transcendent')
  })
})
