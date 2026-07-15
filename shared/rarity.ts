import type { Rarity } from './types.js'

/** Rarity reflects world-relative scarcity, never raw combat power. */
export function rarityFromKnownCopies(fallback: Rarity, knownCopies?: number): Rarity {
  if (!Number.isFinite(knownCopies) || knownCopies === undefined) return fallback
  const copies = Math.max(1, Math.floor(knownCopies))
  if (copies === 1) return 'legendary'
  if (copies <= 9) return 'epic'
  if (copies <= 99) return 'rare'
  if (copies <= 999) return 'uncommon'
  return 'common'
}
