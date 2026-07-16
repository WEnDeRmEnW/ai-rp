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
  it('renders every real control in Russian and saves nested permissions without losing defaults', async () => {
    const campaign = createDemoCampaign()
    let savedCampaign: Campaign | undefined
    const onCampaign = vi.fn(async (updater: (value: Campaign) => Campaign) => {
      savedCampaign = updater(structuredClone(campaign))
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

    await waitFor(() => expect(onCampaign).toHaveBeenCalledOnce())
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
})
