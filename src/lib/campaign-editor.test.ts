import { describe, expect, it } from 'vitest'
import { createDemoCampaign } from './demo'
import { applyPatch } from './engine'

describe('campaign customization engine', () => {
  it('can update the world profile, system, scene and adaptive presentation without a story turn', () => {
    const campaign = createDemoCampaign()
    const next = applyPatch(campaign, {
      world: {
        name: 'Новый мир',
        tone: 'Мрачный реализм',
        system: { progression: 'Рост только через доказанный опыт.', consequences: 'Раны и долги сохраняются.' },
        presentation: { accent: '#ff3355', motif: 'Алый разлом', labels: { abilities: 'Техники' } },
      },
      scene: { title: 'После разлома', tension: 77 },
      playerProfile: { personality: 'Осторожный и наблюдательный.' },
    }, campaign.turn)

    expect(next.turn).toBe(campaign.turn)
    expect(next.world.name).toBe('Новый мир')
    expect(next.world.system?.progression).toBe('Рост только через доказанный опыт.')
    expect(next.world.presentation?.accent).toBe('#ff3355')
    expect(next.world.presentation?.labels.abilities).toBe('Техники')
    expect(next.scene).toMatchObject({ title: 'После разлома', tension: 77 })
    expect(next.player.personality).toBe('Осторожный и наблюдательный.')
  })
})
