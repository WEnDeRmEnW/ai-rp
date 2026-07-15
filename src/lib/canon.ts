import type { CanonDocument } from '../../shared/types'
import { tokenize } from '../../shared/context'

const MAX_DOCUMENT_BYTES = 8_000_000
const MAX_CHUNKS = 5_000
const CHUNK_SIZE = 1_600

function chunkText(text: string): string[] {
  const paragraphs = text.replace(/\r\n?/g, '\n').split(/\n{2,}/).map((value) => value.trim()).filter(Boolean)
  const chunks: string[] = []
  let current = ''

  const flush = () => {
    if (current.trim()) chunks.push(current.trim())
    current = ''
  }

  paragraphs.forEach((paragraph) => {
    if (paragraph.length > CHUNK_SIZE) {
      flush()
      for (let offset = 0; offset < paragraph.length; offset += CHUNK_SIZE) chunks.push(paragraph.slice(offset, offset + CHUNK_SIZE).trim())
      return
    }
    if (current.length + paragraph.length + 2 > CHUNK_SIZE) flush()
    current += `${current ? '\n\n' : ''}${paragraph}`
  })
  flush()
  return chunks.slice(0, MAX_CHUNKS)
}

function extractKeys(text: string): string[] {
  const counts = new Map<string, number>()
  tokenize(text).forEach((token) => counts.set(token, (counts.get(token) ?? 0) + 1))
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, 10).map(([token]) => token)
}

export async function readCanonDocument(file: File): Promise<CanonDocument> {
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error('Документ канона слишком большой. Максимум — 8 МБ.')
  const extension = file.name.split('.').pop()?.toLocaleLowerCase()
  if (!extension || !['txt', 'md', 'json'].includes(extension)) throw new Error('Поддерживаются файлы TXT, Markdown и JSON.')
  const raw = await file.text()
  const text = extension === 'json' ? JSON.stringify(JSON.parse(raw), null, 2) : raw
  const chunks = chunkText(text)
  if (!chunks.length) throw new Error('В документе нет текста.')
  return {
    id: crypto.randomUUID(),
    title: file.name.replace(/\.[^.]+$/, ''),
    chunks: chunks.map((chunk) => ({ id: crypto.randomUUID(), text: chunk, keys: extractKeys(chunk) })),
    createdAt: new Date().toISOString(),
  }
}
