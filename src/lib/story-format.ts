export type StoryBlockKind = 'narration' | 'dialogue' | 'thought'

export interface StoryBlock {
  kind: StoryBlockKind
  text: string
}

const dialogueStart = /^[—–-]\s+/u
const thoughtMarkers = [
  /^\*([^*][\s\S]*?)\*$/u,
  /^_([^_][\s\S]*?)_$/u,
  /^\[\[thought\]\]([\s\S]*?)\[\[\/thought\]\]$/iu,
]

export function formatStoryText(content: string): StoryBlock[] {
  return content
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((text) => {
      for (const marker of thoughtMarkers) {
        const match = text.match(marker)
        if (match?.[1]?.trim()) return { kind: 'thought' as const, text: match[1].trim() }
      }

      return { kind: dialogueStart.test(text) ? 'dialogue' as const : 'narration' as const, text }
    })
}
