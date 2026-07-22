import { describe, expect, it } from 'vitest'
import type { Ability, InventoryItem } from './types'
import { itemOwnedAbilityMatch, separatePersonalAbilities } from './ability-ownership'

const item = {
  id: 'gauntlet',
  name: 'Перчатка абсолютного вектора',
  description: 'Артефакт управляет направлением приложенной силы.',
  category: 'artifact',
  quantity: 1,
  rarity: 'legendary',
  equipped: true,
  effects: [],
  discoveredTurn: 0,
  history: [],
  artifact: {
    sentient: false, awakened: true, attunement: 80, bond: 0, requirements: [], passiveEffects: [], combinedEffects: [], failureModes: [], components: [], drawbacks: [], evolutionPaths: [], secrets: [],
    powers: [{
      id: 'vector-return', name: 'Возврат вектора', description: 'Разворачивает направление приложенной к владельцу силы.', mastery: 80,
      costs: [], limitations: [], category: 'control', capabilities: ['Возвращает импульс к его источнику', 'Меняет направление движения'], techniques: [],
    }],
  },
} satisfies InventoryItem

const duplicate: Ability = {
  id: 'personal-vector-return',
  name: 'Возврат вектора',
  description: 'Разворачивает направление приложенной к владельцу силы.',
  source: 'Предмет: Перчатка абсолютного вектора',
  costs: [], limitations: [], requirements: ['Перчатка должна оставаться у владельца'],
  capabilities: ['Возвращает импульс к его источнику', 'Меняет направление движения'],
}

describe('personal and item ability ownership', () => {
  it('recognizes an item projection copied into personal abilities', () => {
    expect(itemOwnedAbilityMatch(duplicate, [item])).toMatchObject({ itemId: item.id, powerId: 'vector-return' })
    expect(separatePersonalAbilities([duplicate], [item])).toMatchObject({ personal: [], itemOwned: [{ ability: duplicate }] })
  })

  it('keeps an independent personal ability that only shares a broad theme', () => {
    const personal: Ability = {
      id: 'personal-motion-sense', name: 'Чувство движения', description: 'Герой замечает перемещение воздуха благодаря долгой тренировке.',
      source: 'Многолетняя личная тренировка', costs: [], limitations: [], requirements: [], capabilities: ['Предчувствует близкое движение'],
    }
    expect(itemOwnedAbilityMatch(personal, [item])).toBeUndefined()
  })

  it('keeps a learned personal technique even when a named item was used for training', () => {
    const trained: Ability = {
      id: 'trained-vector-footwork', name: 'Векторный шаг', description: 'Выученная работа ногами и корпусом для ухода с линии импульса.',
      source: 'Личная тренировка с Перчаткой абсолютного вектора', costs: [], limitations: [], requirements: [], capabilities: ['Смещается с линии атаки'],
      profile: {
        nature: { kind: 'trained', groupId: 'martial', label: 'Навык', explanation: 'Освоенная телесная техника.' },
      } as Ability['profile'],
    }
    expect(itemOwnedAbilityMatch(trained, [item])).toBeUndefined()
  })

  it('keeps a power after an explicitly permanent transfer from an artifact', () => {
    const transferred: Ability = {
      ...duplicate,
      id: 'transferred-vector-return',
      source: 'После необратимого слияния сила навсегда встроена в тело и сохраняется без предмета.',
      requirements: [],
    }
    expect(itemOwnedAbilityMatch(transferred, [item])).toBeUndefined()
  })
})
