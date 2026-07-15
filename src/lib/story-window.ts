import type { StoryMessage } from '../../shared/types'

export const DEFAULT_STORY_WINDOW_TURNS = 24

export function selectStoryWindow(messages: StoryMessage[], requestedTurnCount = DEFAULT_STORY_WINDOW_TURNS) {
  const turns = [...new Set(messages.map((message) => message.turn))]
  const visibleTurnCount = Math.min(turns.length, Math.max(1, requestedTurnCount))
  const visibleTurns = new Set(turns.slice(-visibleTurnCount))
  return {
    messages: messages.filter((message) => visibleTurns.has(message.turn)),
    totalTurnCount: turns.length,
    visibleTurnCount,
    hiddenTurnCount: Math.max(0, turns.length - visibleTurnCount),
  }
}
