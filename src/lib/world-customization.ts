import type { DashboardSectionId, InspectorTabId, World, WorldInterfaceBlueprint, WorldPresentation, WorldSystem } from '../../shared/types'

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
    common: 'Обычный', uncommon: 'Необычный', rare: 'Редкий', exceptional: 'Исключительный', epic: 'Эпический',
    legendary: 'Легендарный', mythic: 'Мифический', transcendent: 'Трансцендентный',
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
  const presentation = world.presentation
  if (!presentation) return legacyPresentation
  return {
    ...legacyPresentation,
    ...presentation,
    labels: { ...legacyPresentation.labels, ...presentation.labels },
    categoryLabels: { ...legacyPresentation.categoryLabels, ...presentation.categoryLabels },
    rarityLabels: { ...legacyPresentation.rarityLabels, ...presentation.rarityLabels },
  }
}

export function getWorldSystem(world: World): WorldSystem {
  return { ...legacySystem, ...world.system, equipmentSlots: world.system?.equipmentSlots ?? legacySystem.equipmentSlots }
}

const defaultTabOrder: InspectorTabId[] = ['dashboard', 'scene', 'hero', 'inventory', 'changes', 'world']
const defaultDashboardSections: DashboardSectionId[] = ['scene', 'stakes', 'modules', 'worldPulse', 'openLoops', 'mechanics', 'interfaceHealth']

/**
 * Resolves a safe, recoverable right-panel layout for both legacy and AI-designed worlds.
 * All six primary screens are always available. A world may rename them, but neither
 * an AI-authored blueprint nor an old save may remove useful navigation.
 */
export function getWorldInterfaceBlueprint(world: World): WorldInterfaceBlueprint {
  const labels = getWorldPresentation(world).labels
  const defaults: Record<InspectorTabId, string> = {
    dashboard: 'Пульт',
    scene: labels.scene,
    hero: labels.character,
    inventory: labels.inventory,
    changes: 'Изменения',
    world: labels.world,
  }
  const stored = world.interfaceBlueprint
  const storedTabs = new Map(stored?.tabs.map((tab) => [tab.id, tab]))
  const tabs = defaultTabOrder.map((id) => ({
    id,
    label: storedTabs.get(id)?.label?.trim() || defaults[id],
    visible: true,
  }))
  const visibleIds = new Set(tabs.filter((tab) => tab.visible).map((tab) => tab.id))
  const requestedDefault = stored?.defaultTab
  const defaultTab = requestedDefault && visibleIds.has(requestedDefault) ? requestedDefault : 'dashboard'
  const sections = (stored?.dashboardSections ?? defaultDashboardSections).filter((section, index, values) => defaultDashboardSections.includes(section) && values.indexOf(section) === index)
  for (const section of defaultDashboardSections) if (!sections.includes(section)) sections.push(section)
  return {
    title: stored?.title?.trim() || world.name,
    subtitle: stored?.subtitle?.trim() || world.tagline,
    defaultTab,
    tabs,
    dashboardSections: sections,
    reason: stored?.reason?.trim() || 'Безопасный пульт собран из актуального состояния мира.',
    updatedTurn: stored?.updatedTurn ?? 0,
  }
}
