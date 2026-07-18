// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import type { InventoryItem } from '../../shared/types'
import { createDemoCampaign } from '../lib/demo'
import { ArtifactProfileCard } from './Inspector'

afterEach(cleanup)

const hiddenArtifact: InventoryItem = {
  id: 'artifact-hidden', name: 'Непрочитанная линза', description: 'Чёрная линза без видимого изображения.', category: 'artifact', quantity: 1,
  rarity: 'exceptional', equipped: false, effects: [], discoveredTurn: 0, history: [],
  artifact: {
    sentient: false, awakened: true, mastery: 5, attunement: 10, bond: 0,
    classification: 'Ключ к чужой причинности', powerSource: 'Тайный источник', operatingPrinciple: 'Тайный принцип', scale: 'global',
    creativeIdentity: {
      coreFantasy: 'Видеть неслучившиеся причины.', centralConcept: 'Линза читает отброшенные причины.', physicalForm: 'Чёрная линза в разомкнутой оправе.',
      originPattern: 'Создана забытым следователем.', interactionModel: 'Навести на последствие.', signatureExperience: 'Тень причины появляется раньше предмета.',
      conceptualDomains: ['причинность'], mechanicVerbs: ['навести', 'прочитать'], motifs: ['разомкнутая оправа'],
      differentiation: ['Не предсказывает будущее.', 'Работает только с уже наступившим следствием.'],
    },
    presentation: {
      layout: 'constellation', motif: 'разомкнутая причинная цепь', symbol: '◌', accent: '#b788ff', secondary: '#55d6c2',
      surface: 'glass', glow: 'halo', headerStyle: 'inscribed', density: 'cinematic',
      sectionOrder: ['identity', 'powers', 'origin', 'principle'], summary: 'Линза показывает отсутствие там, где должен быть ответ.',
    },
    discovery: {
      awareness: 5, revealedSections: [], powerKnowledge: { 'power-secret': 'hidden' }, componentKnowledge: {}, evidence: [], updatedTurn: 0,
    },
    requirements: [], passiveEffects: [], combinedEffects: [], failureModes: ['Секретный отказ'], components: [],
    powers: [{ id: 'power-secret', name: 'Имя секретной силы', description: 'Скрытая механика.', mastery: 0, costs: [], limitations: [], activation: 'Скрытая активация', capabilities: ['Скрытая возможность'], counters: ['Скрытая контрмера'], examples: ['Скрытый пример'], techniques: [] }],
    drawbacks: [], evolutionPaths: [], secrets: ['Секретное происхождение'],
  },
}

describe('individual artifact card', () => {
  it('uses a safe authored composition without leaking concealed dossier fields', () => {
    const { container } = render(<ArtifactProfileCard item={hiddenArtifact} campaign={createDemoCampaign()} />)

    const card = container.querySelector('.artifact-profile')
    expect(card).toHaveClass('artifact-layout-constellation', 'artifact-surface-glass', 'artifact-glow-halo')
    expect(card).toHaveStyle({ '--artifact-accent': '#b788ff', '--artifact-secondary': '#55d6c2' })
    expect(screen.getAllByText(/не изучена|не установлена|неизвестен/iu).length).toBeGreaterThan(0)
    expect(screen.queryByText('Имя секретной силы')).not.toBeInTheDocument()
    expect(screen.queryByText('Ключ к чужой причинности')).not.toBeInTheDocument()
    expect(screen.queryByText('Секретное происхождение')).not.toBeInTheDocument()
  })
})
