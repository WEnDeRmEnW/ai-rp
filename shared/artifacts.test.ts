import { describe, expect, it } from 'vitest'
import type { InventoryItem } from './types'
import {
  artifactNoveltyIssues,
  artifactPlayerView,
  compareArtifactToRegistry,
  updateArtifactRegistry,
} from './artifacts'

function artifact(id: string, concept: string, form: string, mechanic: string): InventoryItem {
  const powerId = `${id}-power`
  const componentId = `${id}-component`
  return {
    id,
    name: `Артефакт ${id}`,
    description: `Наблюдаемая оболочка предмета ${id}, не раскрывающая его тайный принцип.`,
    category: 'artifact',
    quantity: 1,
    rarity: 'rare',
    equipped: false,
    effects: ['Известный владельцу внешний эффект.'],
    origin: 'Скрытая мастерская на краю мира.',
    discoveredTurn: 2,
    history: [],
    artifact: {
      sentient: false,
      awakened: true,
      attunement: 20,
      bond: 0,
      classification: 'Авторский инструмент',
      powerSource: 'Невскрытый источник',
      operatingPrinciple: concept,
      scale: 'local',
      creativeIdentity: {
        coreFantasy: concept,
        centralConcept: concept,
        physicalForm: form,
        originPattern: 'Создан мастером для одной невозможной операции.',
        interactionModel: mechanic,
        signatureExperience: `Владелец должен ${mechanic}, после чего предмет меняет наблюдаемое условие.`,
        conceptualDomains: [concept],
        mechanicVerbs: [mechanic],
        motifs: [form],
        differentiation: ['Не использует запас безымянной энергии.', 'Работает через физический жест владельца.'],
      },
      presentation: {
        layout: 'schematic', motif: form, symbol: '◇', accent: '#61d5c7', secondary: '#a985ff',
        surface: 'metal', glow: 'soft', headerStyle: 'technical', density: 'comfortable',
        sectionOrder: ['identity', 'powers', 'components', 'origin'], summary: `Краткий открытый образ ${id}.`,
      },
      discovery: {
        awareness: 20,
        revealedSections: ['identity'],
        powerKnowledge: { [powerId]: 'hidden' },
        componentKnowledge: { [componentId]: 'hinted' },
        evidence: [],
        updatedTurn: 2,
      },
      requirements: [],
      passiveEffects: [],
      combinedEffects: [],
      failureModes: ['Тайный режим отказа.'],
      components: [{ id: componentId, name: 'Скрытый узел', description: 'Секретный компонент.', role: 'Секретная роль.', status: 'active', capabilities: ['Скрытая функция.'], required: true }],
      powers: [{ id: powerId, name: 'Скрытая сила', description: 'Секретная механика.', mastery: 0, costs: [], limitations: [], activation: mechanic, capabilities: ['Скрытое действие.'], counters: ['Скрытая контрмера.'], examples: ['Скрытый пример.'], techniques: [] }],
      drawbacks: ['Тайная цена.'],
      evolutionPaths: [],
      secrets: ['Главная тайна предмета.'],
    },
  }
}

describe('artifact campaign uniqueness and disclosure', () => {
  it('keeps hidden names, mechanics, origin and weaknesses out of the player-safe view', () => {
    const source = artifact('one', 'переписывать вес обещаний', 'кольцо из разомкнутых букв', 'провести пальцем по обещанию')
    const visible = artifactPlayerView(source)

    expect(visible.origin).toBeUndefined()
    expect(visible.artifact?.powers).toEqual([])
    expect(visible.artifact?.components).toEqual([])
    expect(visible.artifact?.operatingPrinciple).toBeUndefined()
    expect(visible.artifact?.failureModes).toEqual([])
    expect(JSON.stringify(visible)).not.toContain('Скрытая сила')
    expect(JSON.stringify(visible)).not.toContain('Главная тайна')
  })

  it('detects a six-axis repeat and permits only a causally documented lineage', () => {
    const first = artifact('one', 'переписывать вес обещаний', 'кольцо из разомкнутых букв', 'провести пальцем по обещанию')
    const registry = updateArtifactRegistry([], first, 'active', 2)
    const duplicate = artifact('two', 'переписывать вес обещаний', 'кольцо из разомкнутых букв', 'провести пальцем по обещанию')

    expect(compareArtifactToRegistry(duplicate, registry)[0]?.allowedReuse).toBe(false)
    expect(artifactNoveltyIssues(duplicate, registry).length).toBeGreaterThan(0)

    duplicate.artifact!.creativeIdentity = {
      ...duplicate.artifact!.creativeIdentity!,
      lineageId: 'lineage-oathsmith',
      resemblanceKind: 'set',
      resemblanceReason: 'Обе реликвии входят в документированную серию одного кузнеца клятв.',
      relatedArtifactIds: ['one'],
    }
    first.artifact!.creativeIdentity = { ...first.artifact!.creativeIdentity!, lineageId: 'lineage-oathsmith' }
    const lineageRegistry = updateArtifactRegistry([], first, 'active', 2)
    expect(compareArtifactToRegistry(duplicate, lineageRegistry)[0]?.allowedReuse).toBe(true)
    expect(artifactNoveltyIssues(duplicate, lineageRegistry)).toEqual([])
  })

  it('retains fingerprints when an artifact is lost or destroyed', () => {
    const source = artifact('one', 'сворачивать тень в маршрут', 'тканая карта без поверхности', 'завязать узел на собственной тени')
    const active = updateArtifactRegistry([], source, 'active', 2)
    const lost = updateArtifactRegistry(active, source, 'lost', 8)
    const destroyed = updateArtifactRegistry(lost, source, 'destroyed', 12)

    expect(destroyed).toHaveLength(1)
    expect(destroyed[0]).toMatchObject({ artifactId: 'one', status: 'destroyed', createdTurn: 2, lastChangedTurn: 12 })
    expect(destroyed[0].fingerprint.centralConcept).toContain('сворачивать тень')
  })
})
