import type { World, WorldPresentation, WorldSystem } from '../../shared/types'

const legacyPresentation: WorldPresentation = {
  accent: '#71d3b1',
  accentStrong: '#95e6c9',
  secondary: '#e7b96b',
  surface: 'minimal',
  motif: 'нить истории',
  labels: {
    scene: 'Сцена', character: 'Герой', inventory: 'Рюкзак', world: 'Мир', quests: 'Цели', abilities: 'Способности',
    lore: 'Кодекс', memories: 'Память истории', stats: 'Характеристики', resources: 'Ресурсы', conditions: 'Состояния',
    level: 'Уровень', chapter: 'Глава', turn: 'ход', action: 'Действие', speech: 'Реплика', direction: 'Мета', continue: 'Дальше',
  },
  categoryLabels: {
    weapon: 'Оружие', armor: 'Защита', consumable: 'Расходник', artifact: 'Артефакт', quest: 'Сюжетное', material: 'Материал', other: 'Прочее',
  },
  rarityLabels: {
    common: 'Обычный', uncommon: 'Необычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный',
  },
}

const legacySystem: WorldSystem = {
  name: 'Правила мира',
  summary: 'Характеристики, ресурсы и последствия определяются логикой текущего мира.',
  progression: 'Герой развивается через значимые решения, открытия и последствия.',
  conflictResolution: 'Исход зависит от способностей героя, обстоятельств и заявленного действия.',
  consequences: 'Неудача меняет ситуацию, но не обрывает историю без веской причины.',
  equipmentSlots: [
    { key: 'main-hand', label: 'Основная рука', accepts: ['weapon', 'artifact'] },
    { key: 'body', label: 'Защита', accepts: ['armor'] },
    { key: 'focus', label: 'Активный предмет', accepts: ['artifact', 'other'] },
  ],
}

export function getWorldPresentation(world: World): WorldPresentation {
  return world.presentation ?? legacyPresentation
}

export function getWorldSystem(world: World): WorldSystem {
  return world.system ?? legacySystem
}
