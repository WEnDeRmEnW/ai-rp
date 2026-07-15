import type { StateChange } from '../../shared/types'
import { sanitizeReceiptText, uiLabel } from './ui-labels'

const MAX_COMPACT_TRANSITION_LENGTH = 48

function normalizedDetail(detail: string) {
  return sanitizeReceiptText(detail)
    .replace(/−/gu, '-')
    .replace(/\s*(?:->|⇒|→)\s*/gu, ' → ')
}

export function formatStateChangeTransition(change: StateChange) {
  if (change.before !== undefined && change.after !== undefined) {
    const before = typeof change.before === 'string' ? uiLabel(change.before, '') : String(change.before)
    const after = typeof change.after === 'string' ? uiLabel(change.after, '') : String(change.after)
    if (!before || !after) return undefined
    const transition = `${before} → ${after}`
    if (transition.length > MAX_COMPACT_TRANSITION_LENGTH || /[\r\n]/.test(transition)) return undefined
    if (normalizedDetail(change.detail).includes(transition)) return undefined
    return transition
  }
  if (change.delta !== undefined) {
    const delta = `${change.delta > 0 ? '+' : ''}${change.delta}`
    if (normalizedDetail(change.detail).includes(delta)) return undefined
    return delta
  }
  return undefined
}
