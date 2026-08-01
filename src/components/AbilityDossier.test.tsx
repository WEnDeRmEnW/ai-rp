// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Ability, WorldCapabilitySystem } from '../../shared/types'
import { AbilityCard, AbilityDossier } from './Inspector'

afterEach(cleanup)

const system: WorldCapabilitySystem = {
  id: 'craft-system', title: 'Искусства города', summary: 'Возможности этого мира.',
  masteryMeaning: 'Насколько уверенно владелец применяет возможность.',
  powerMeaning: 'Какой объективный предел у возможности.',
  availabilityMeaning: 'Можно ли применить возможность прямо сейчас.',
  groups: [{ id: 'social-craft', label: 'Городское влияние', description: 'Связи, репутация и договоры.', natureKinds: ['social'], icon: 'network', accent: '#5ed6bc', secondary: '#a985ff', reason: 'Опирается на людей, а не магию.' }],
  tiers: [{ id: 'district', label: 'Районный вес', order: 2, description: 'Влияет на один район.', scope: 'район', evidenceRequirements: ['Подтверждённая сеть контактов'] }],
  comparisonRules: [], createdTurn: 0, lastChangedTurn: 0,
}

const authoredAbility: Ability = {
  id: 'ability-influence', name: 'Сеть взаимных услуг', description: 'Владелец умеет превращать репутацию в реальные договорённости.',
  kind: 'active', mastery: 64, costs: [], effects: ['Находит человека, готового выполнить разумную услугу.'],
  limitations: ['Контакты вправе отказать.'], requirements: [], capabilities: ['Запросить помощь в знакомом районе.'],
  synergies: ['Достоверная информация'], counters: ['Изоляция от городской сети'], examples: ['Организовать безопасный проход.'], techniques: [], history: [], evolutionPaths: [], tags: [],
  profile: {
    nature: { kind: 'social', groupId: 'social-craft', label: 'Социальное мастерство', explanation: 'Работает через реальные отношения.' },
    creativeIdentity: {
      coreFantasy: 'Город отвечает на правильно названный долг.', centralPrinciple: 'Каждая услуга создаёт проверяемое обязательство.',
      originPattern: 'Годы личных договорённостей в портовых кварталах.', interactionModel: 'Назвать нужного человека, долг и допустимую цену.',
      signatureExperience: 'Разрозненные знакомые складываются в рабочий маршрут.', mechanicVerbs: ['связать', 'договориться'], sensoryMotifs: ['карта нитей'], differentiation: ['Не подчиняет чужую волю.'],
    },
    ownerExpression: { summary: 'Никогда не давит первым и оставляет собеседнику выход.', priorities: ['Взаимная выгода'], habits: [], signatures: ['Точная формулировка долга'], avoids: ['Пустые угрозы'] },
    standing: { systemId: 'craft-system', tierId: 'district', tierLabel: 'Районный вес', basis: 'Проверенные контакты.', ceiling: 'Способна согласовать действия нескольких независимых групп.', scope: 'Один городской район.', evidence: ['Три успешных соглашения'], uncertainties: [] },
    facets: [{ key: 'reach', label: 'Охват', value: 58, description: 'Число доступных социальных путей.' }],
    presentation: { layout: 'network', icon: 'network', symbol: '⌘', motif: 'карта связей', accent: '#5ed6bc', secondary: '#a985ff', density: 'comfortable', sectionOrder: ['identity', 'source', 'principle', 'availability', 'techniques'], summary: 'Договоры образуют живую сеть.' },
    discovery: { awareness: 100, revealedSections: ['identity', 'principle', 'source', 'standing', 'facets', 'availability', 'techniques', 'counterplay', 'progression', 'history'], techniqueKnowledge: {}, evidence: [], updatedTurn: 1 },
    developmentSeeds: [],
  },
}

function openFold(label: string) {
  const details = screen.getByText(label).closest('details')
  expect(details).not.toBeNull()
  details!.open = true
  fireEvent(details!, new Event('toggle'))
}

describe('authored ability UI', () => {
  it('separates mastery, real standing and current availability on a compact themed card', () => {
    const onToggle = vi.fn()
    const { container } = render(<AbilityCard ability={authoredAbility} expanded={false} onToggle={onToggle} capabilitySystem={system} />)

    const card = container.querySelector('.ability-card--authored')
    expect(card).toHaveClass('layout-network', 'density-comfortable')
    expect(card).toHaveAttribute('data-ability-layout', 'network')
    expect(card).toHaveStyle({ '--ability-accent': '#5ed6bc', '--ability-secondary': '#a985ff' })
    expect(screen.getByText('Освоение')).toBeInTheDocument()
    expect(screen.getByText('64%')).toBeInTheDocument()
    expect(screen.getByText('Реальный класс')).toBeInTheDocument()
    expect(screen.getByText('Районный вес')).toBeInTheDocument()
    expect(screen.getByText('Без отдельного счётчика')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /открыть досье способности/iu }))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('does not invent resource, charge or cooldown blocks and mounts collapsed sections lazily', () => {
    render(<AbilityDossier ability={authoredAbility} system={system} ownerName="Лея" onClose={vi.fn()} />)

    expect(screen.getByText('Освоение владельцем')).toBeInTheDocument()
    expect(screen.getByText('Реальный класс')).toBeInTheDocument()
    expect(screen.getByText('У способности нет отдельной шкалы зарядов, маны или отката.')).toBeInTheDocument()
    expect(screen.queryByText('Доступность и применение')).not.toBeInTheDocument()
    expect(screen.queryByText('Реальная цена')).not.toBeInTheDocument()
    expect(screen.queryByText('Годы личных договорённостей в портовых кварталах.')).not.toBeInTheDocument()

    openFold('Источник')
    expect(screen.getByText('Годы личных договорённостей в портовых кварталах.')).toBeInTheDocument()
  })

  it('shows only usage mechanics that actually exist', () => {
    const metered: Ability = structuredClone(authoredAbility)
    metered.costs = [{ resource: 'focus', amount: 2 }]
    metered.cooldown = 'До конца текущей сцены'
    metered.profile!.availability = { state: 'limited', reasons: ['Связь нестабильна.'], charges: { current: 1, max: 3, label: 'Окна связи' }, nextReady: { unit: 'scene', value: 2 } }

    render(<AbilityDossier ability={metered} system={system} resources={[{ key: 'focus', label: 'Концентрация', value: 8, max: 10, color: '#fff' }]} onClose={vi.fn()} />)
    openFold('Доступность и применение')

    expect(screen.getByText('Реальная цена')).toBeInTheDocument()
    expect(screen.getByText('2 Концентрация')).toBeInTheDocument()
    expect(screen.getByText('Восстановление')).toBeInTheDocument()
    expect(screen.getByText('Окна связи')).toBeInTheDocument()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    expect(screen.getByText('через 2 сцен.')).toBeInTheDocument()
  })
})
