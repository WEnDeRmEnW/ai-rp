// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Campaign, ProviderConfig } from '../../shared/types'
import { createDemoCampaign } from '../lib/demo'
import { defaultInterfacePreferences } from '../lib/interface-preferences'
import { SettingsDialog } from './SettingsDialog'

afterEach(cleanup)

const provider: ProviderConfig = {
  provider: 'ollama',
  model: 'deepseek-v4-flash',
  baseUrl: 'https://ollama.com/v1',
  temperature: 0.8,
}

describe('unexpected event settings', () => {
  it('shows the Ollama fast-review route and saves its real model setting', () => {
    const onProvider = vi.fn()
    render(<SettingsDialog
      open
      provider={provider}
      theme="dark"
      interfacePreferences={defaultInterfacePreferences}
      onClose={vi.fn()}
      onProvider={onProvider}
      onTheme={vi.fn()}
      onInterface={vi.fn()}
      onCampaign={vi.fn(async () => undefined)}
    />)

    const route = screen.getByRole('switch', { name: 'Быстрые служебные проверки' })
    expect(route.getAttribute('aria-checked')).toBe('true')
    fireEvent.change(screen.getByLabelText('Быстрая модель'), { target: { value: 'nemotron-3-nano:30b' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить настройки' }))

    expect(onProvider).toHaveBeenCalledWith(expect.objectContaining({
      useAuxiliaryModel: true,
      auxiliaryModel: 'nemotron-3-nano:30b',
    }))
  })

  it('renders every real control in Russian and saves nested permissions without losing defaults', async () => {
    const campaign = createDemoCampaign()
    let savedCampaign: Campaign | undefined
    let workingCampaign = structuredClone(campaign)
    const onCampaign = vi.fn(async (updater: (value: Campaign) => Campaign) => {
      workingCampaign = updater(structuredClone(workingCampaign))
      savedCampaign = workingCampaign
    })

    render(<SettingsDialog
      open
      provider={provider}
      theme="dark"
      interfacePreferences={defaultInterfacePreferences}
      campaign={campaign}
      onClose={vi.fn()}
      onProvider={vi.fn()}
      onTheme={vi.fn()}
      onInterface={vi.fn()}
      onCampaign={onCampaign}
    />)

    expect(screen.getByText('Неожиданные события')).toBeTruthy()
    expect(screen.getByRole('switch', { name: /Универсальный режиссёр событий/ }).getAttribute('aria-checked')).toBe('true')
    expect((screen.getByLabelText('Частота') as HTMLSelectElement).value).toBe('rare')
    expect((screen.getByLabelText('Раскрытие') as HTMLSelectElement).value).toBe('world-only')

    fireEvent.change(screen.getByLabelText('Частота'), { target: { value: 'balanced' } })
    fireEvent.change(screen.getByLabelText('Раскрытие'), { target: { value: 'indicator' } })
    fireEvent.click(screen.getByText('Тонкая настройка возможностей'))
    const wars = screen.getByRole('switch', { name: /Войны и большие конфликты/ })
    fireEvent.click(wars)
    expect(wars.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить настройки' }))

    await waitFor(() => expect(onCampaign).toHaveBeenCalled())
    expect(savedCampaign?.settings.eventDirector).toMatchObject({
      enabled: true,
      frequency: 'balanced',
      revealMode: 'indicator',
      permissions: {
        wars: false,
        newCharacters: true,
        powerAwakenings: true,
        miracles: true,
      },
    })
  })

  it('autosaves scene quality and does not reset an in-progress choice after a same-campaign refresh', async () => {
    const campaign = createDemoCampaign()
    campaign.settings.qualityMode = 'deep'
    let persisted = structuredClone(campaign)
    const onCampaign = vi.fn(async (updater: (value: Campaign) => Campaign) => {
      persisted = updater(structuredClone(persisted))
    })
    const common = {
      open: true,
      provider,
      theme: 'dark' as const,
      interfacePreferences: defaultInterfacePreferences,
      onClose: vi.fn(),
      onProvider: vi.fn(),
      onTheme: vi.fn(),
      onInterface: vi.fn(),
      onCampaign,
    }
    const view = render(<SettingsDialog {...common} campaign={campaign} />)
    const quality = screen.getByLabelText('Качество сцены') as HTMLSelectElement

    fireEvent.change(quality, { target: { value: 'balanced' } })

    await waitFor(() => expect(persisted.settings.qualityMode).toBe('balanced'))
    expect(screen.getByText('Автосохранение включено')).toBeTruthy()

    const staleBackgroundRefresh = structuredClone(campaign)
    staleBackgroundRefresh.updatedAt = new Date(Date.parse(campaign.updatedAt) + 1).toISOString()
    view.rerender(<SettingsDialog {...common} campaign={staleBackgroundRefresh} />)
    expect((screen.getByLabelText('Качество сцены') as HTMLSelectElement).value).toBe('balanced')
  })
})
