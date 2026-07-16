export type StoryBlockKind = 'narration' | 'dialogue' | 'thought' | 'transition' | 'heading' | 'choice'

export interface StoryBlock {
  kind: StoryBlockKind
  text: string
  speaker?: string
}

const dialogueStart = /^[—–-]\s+/u
const sceneBreak = /^(?:\*\s*\*\s*\*|[-—–]{3,}|[•·◦]\s*[•·◦]\s*[•·◦])$/u
const markdownHeading = /^#{1,3}\s+(.+)$/u
const boldHeading = /^\*\*([^*\n]{1,100})\*\*:?$/u
const asciiChoice = /^-\s+(.+)$/u
const thoughtMarkers = [
  /^\*([^*][\s\S]*?)\*$/u,
  /^_([^_][\s\S]*?)_$/u,
  /^\[\[thought\]\]([\s\S]*?)\[\[\/thought\]\]$/iu,
  /^(?:мысль|внутренний голос)\s*:\s*(.+)$/iu,
]
const bracketedSpeaker = /^\[([^\]\n]{1,40})\]\s*:?\s*([—–-]\s+.+)$/u
const namedSpeaker = /^([А-ЯЁA-Z][\p{L}\p{M}'’.-]*(?:\s+[\p{L}\p{M}'’.-]+){0,3})\s*:\s*([—–-]\s+.+)$/u
const sentenceBoundary = /(?<=[.!?…])\s+(?=[А-ЯЁA-Z«—–-])/u
const LONG_PARAGRAPH = 520
const TARGET_PARAGRAPH = 330
const COMPACT_PARAGRAPH = 105
const MAX_COMBINED_PARAGRAPH = 270

export function buildStoryWaypoints(turns: number[], limit = 18) {
  const unique = [...new Set(turns.filter(Number.isFinite))].sort((left, right) => left - right)
  if (unique.length <= limit || limit < 2) return unique

  const waypoints = Array.from({ length: limit }, (_, index) => {
    const sourceIndex = Math.round(index * (unique.length - 1) / (limit - 1))
    return unique[sourceIndex]
  })
  return [...new Set(waypoints)]
}

function cleanText(value: string) {
  return value.replace(/\r\n?/gu, '\n').replace(/[\t\f\v]+/gu, ' ').trim()
}

function cleanInlineMarkdown(value: string) {
  return value.replace(/\*\*([^*]+)\*\*/gu, '$1').replace(/__([^_]+)__/gu, '$1')
}

function classifyBlock(value: string): StoryBlock {
  const text = cleanText(value)
  if (sceneBreak.test(text)) return { kind: 'transition', text: '' }

  const heading = text.match(markdownHeading)
  if (heading?.[1]) return { kind: 'transition', text: heading[1].trim() }

  const strongHeading = text.match(boldHeading)
  if (strongHeading?.[1]) return { kind: 'heading', text: strongHeading[1].trim().replace(/:\s*$/u, '') }

  const choice = text.match(asciiChoice)
  if (choice?.[1]) return { kind: 'choice', text: cleanInlineMarkdown(choice[1].trim()) }

  for (const marker of thoughtMarkers) {
    const match = text.match(marker)
    if (match?.[1]?.trim()) return { kind: 'thought', text: match[1].trim() }
  }

  const speakerMatch = text.match(bracketedSpeaker) ?? text.match(namedSpeaker)
  if (speakerMatch?.[1] && speakerMatch[2]) {
    return { kind: 'dialogue', speaker: speakerMatch[1].trim(), text: speakerMatch[2].trim() }
  }

  return { kind: dialogueStart.test(text) ? 'dialogue' : 'narration', text: cleanInlineMarkdown(text) }
}

function hasStructuralLine(lines: string[]) {
  return lines.some((line) => {
    const block = classifyBlock(line)
    return block.kind !== 'narration'
  })
}

function splitSourceParagraph(paragraph: string): StoryBlock[] {
  const lines = paragraph.split(/\n+/u).map(cleanText).filter(Boolean)
  if (!lines.length) return []
  if (lines.length === 1 || !hasStructuralLine(lines)) return [classifyBlock(lines.join(' '))]
  return lines.map(classifyBlock)
}

function splitLongNarration(block: StoryBlock): StoryBlock[] {
  if (block.kind !== 'narration' || block.text.length <= LONG_PARAGRAPH) return [block]
  const sentences = block.text.split(sentenceBoundary).map(cleanText).filter(Boolean)
  if (sentences.length < 2) return [block]

  const paragraphs: StoryBlock[] = []
  let current = ''
  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence
    if (current && (candidate.length > LONG_PARAGRAPH || current.length >= TARGET_PARAGRAPH)) {
      paragraphs.push({ kind: 'narration', text: current })
      current = sentence
    } else {
      current = candidate
    }
  }
  if (current) paragraphs.push({ kind: 'narration', text: current })
  return paragraphs
}

function compactShortNarration(blocks: StoryBlock[]) {
  return blocks.reduce<StoryBlock[]>((result, block) => {
    const previous = result.at(-1)
    const canCombine = block.kind === 'narration'
      && previous?.kind === 'narration'
      && block.text.length <= COMPACT_PARAGRAPH
      && previous.text.length <= COMPACT_PARAGRAPH
      && previous.text.length + block.text.length + 1 <= MAX_COMBINED_PARAGRAPH
    if (canCombine && previous) previous.text = `${previous.text} ${block.text}`
    else result.push({ ...block })
    return result
  }, [])
}

/**
 * Turns model prose into calm literary blocks without changing the stored message.
 * Single line wraps are healed, explicit thoughts and dialogue are separated, while
 * oversized or excessively fragmented narration is balanced for long-form reading.
 */
export function formatStoryText(content: string): StoryBlock[] {
  const source = cleanText(content)
  if (!source) return []

  const blocks = source
    .split(/\n\s*\n+/u)
    .flatMap(splitSourceParagraph)
    .flatMap(splitLongNarration)
    .filter((block) => block.kind === 'transition' || Boolean(block.text))

  return compactShortNarration(blocks)
}
