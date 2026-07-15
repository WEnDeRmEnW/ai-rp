import type { StateChange } from '../../shared/types'
import { uiLabel } from './ui-labels'

const MAX_COMPACT_TRANSITION_LENGTH = 48

export function formatStateChangeTransition(change: StateChange) {
  if (change.before !== undefined && change.after !== undefined) {
    const before = typeof change.before === 'string' ? uiLabel(change.before, change.before) : String(change.before)
    const after = typeof change.after === 'string' ? uiLabel(change.after, change.after) : String(change.after)
    const transition = `${before} → ${after}`
    if (transition.length > MAX_COMPACT_TRANSITION_LENGTH || /[\r\n]/.test(transition)) return undefined
    return transition
  }
  if (change.delta !== undefined) return `${change.delta > 0 ? '+' : ''}${change.delta}`
  return undefined
}
