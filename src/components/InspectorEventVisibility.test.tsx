// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Campaign, NarrativeEventRecord } from '../../shared/types'
import { createDemoCampaign } from '../lib/demo'
import { Inspector } from './Inspector'

afterEach(cleanup)

const formingEvent: NarrativeEventRecord = {
  id: 'event-forming',
  stage: 'foreshadowed',
  signature: 'anomaly|notable|unknown|scene|station|lights',
  createdTurn: 8,
  lastAdvancedTurn: 11,
  nextEligibleTurn: 13,
  concept: 'За стеной станции формируется проход в архив утраченных минут.',
  category: 'anomaly',
  magnitude: 'notable',
  miracleKind: 'none',
  originKind: 'unknown',
  sourceIds: [],
  causeIds: [],
  scopeIds: [],
  participantIds: [],
  affectedDomains: ['scene'],
  knowledgeChannel: 'Наблюдаемый сбой часов.',
  trigger: 'Три часовщика зарегистрировали одинаковую пропажу секунды.',
  arrivalMethod: 'Сбой распространяется по связанным станционным часам.',
  observableSigns: ['Все часы в зале одновременно пропускают одну и ту же секунду.'],
  immediateEffects: [],
  persistentEffects: [],
  counterplay: [],
  cancellationConditions: [],
  canonReasoning: 'Следует правилам времени этого мира.',
  pacingReasoning: 'Тихий предвестник во время исследования.',
  noveltyReasoning: 'Не повторяет недавние социальные события.',
  minimumDelay: 2,
}

function campaignWithReveal(revealMode: 'world-only' | 'indicator' | 'transparent'): Campaign {
  const campaign = createDemoCampaign()
  campaign.settings.eventDirector = {
    ...campaign.settings.eventDirector!,
    revealMode,
  }
  campaign.eventDirectorState = {
    ...campaign.eventDirectorState!,
    activeEvents: [formingEvent],
  }
  return campaign
}

function view(campaign: Campaign) {
  return <Inspector
    campaign={campaign}
    open
    activeTab="scene"
    onTabChange={vi.fn()}
    onClose={vi.fn()}
    onUpdate={async () => undefined}
  />
}

describe('event director disclosure in the inspector', () => {
  it('keeps hidden calculations invisible by default and reveals only the selected level of detail', () => {
    HTMLElement.prototype.scrollTo = vi.fn()
    const { rerender } = render(view(campaignWithReveal('world-only')))
    expect(screen.queryByText('В мире назревают перемены')).toBeNull()
    expect(screen.queryByText(formingEvent.concept)).toBeNull()

    rerender(view(campaignWithReveal('indicator')))
    expect(screen.getByText('В мире назревают перемены')).toBeTruthy()
    expect(screen.queryByText(formingEvent.concept)).toBeNull()
    expect(screen.getByText(/Полная причина откроется только через наблюдение/)).toBeTruthy()

    rerender(view(campaignWithReveal('transparent')))
    expect(screen.getByText(formingEvent.concept)).toBeTruthy()
    expect(screen.getByText(formingEvent.observableSigns[0])).toBeTruthy()
  })
})
