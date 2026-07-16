import { BookOpenCheck, BrainCircuit, Eye, EyeOff, LoaderCircle, Send, ShieldCheck, Square, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Campaign, OperationProgress, ProviderConfig, WorldQuestionMessage, WorldQuestionScope } from '../../shared/types'
import { askWorldQuestion } from '../lib/api'
import './world-question.css'

interface WorldQuestionPanelProps {
  open: boolean
  campaign: Campaign
  provider: ProviderConfig
  onClose: () => void
}

interface ChatEntry extends WorldQuestionMessage {
  id: string
  createdAt: string
  scope?: WorldQuestionScope
}

const quickQuestions = [
  'Что сейчас происходит и что мой герой точно видит?',
  'На что сейчас способны мои силы и техники?',
  'Что важного есть в моём инвентаре?',
  'Кто сейчас рядом и что мне о них известно?',
  'Какие угрозы, задачи и незавершённые дела мне известны?',
]

function storageKey(campaignId: string) {
  return `letopis-world-questions-${campaignId}`
}

function readHistory(campaignId: string): ChatEntry[] {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(campaignId)) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter((entry): entry is ChatEntry => (
      entry
      && typeof entry === 'object'
      && typeof entry.id === 'string'
      && (entry.role === 'user' || entry.role === 'assistant')
      && typeof entry.content === 'string'
      && entry.content.trim().length > 0
    )).slice(-30)
  } catch {
    return []
  }
}

function inlineText(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => (
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : <span key={index}>{part}</span>
  ))
}

function AnswerText({ children }: { children: string }) {
  const blocks = children.trim().split(/\n{2,}/).filter(Boolean)
  return <div className="world-question-answer">
    {blocks.map((block, blockIndex) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
      if (lines.length === 1 && /^#{1,3}\s+/.test(lines[0])) {
        return <h4 key={blockIndex}>{inlineText(lines[0].replace(/^#{1,3}\s+/, ''))}</h4>
      }
      if (lines.every((line) => /^[-•]\s+/.test(line))) {
        return <ul key={blockIndex}>{lines.map((line, lineIndex) => <li key={lineIndex}>{inlineText(line.replace(/^[-•]\s+/, ''))}</li>)}</ul>
      }
      if (lines.every((line) => /^\d+[.)]\s+/.test(line))) {
        return <ol key={blockIndex}>{lines.map((line, lineIndex) => <li key={lineIndex}>{inlineText(line.replace(/^\d+[.)]\s+/, ''))}</li>)}</ol>
      }
      return <p key={blockIndex}>{lines.map((line, lineIndex) => <span key={lineIndex}>{inlineText(line)}{lineIndex < lines.length - 1 && <br />}</span>)}</p>
    })}
  </div>
}

export function WorldQuestionPanel({ open, campaign, provider, onClose }: WorldQuestionPanelProps) {
  const [entries, setEntries] = useState<ChatEntry[]>(() => readHistory(campaign.id))
  const [question, setQuestion] = useState('')
  const [scope, setScope] = useState<WorldQuestionScope>('known')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<OperationProgress>()
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(campaign.id), JSON.stringify(entries.slice(-30)))
    } catch {
      try {
        const compact = entries.slice(-10).map((entry) => ({ ...entry, content: entry.content.slice(0, 6_000) }))
        localStorage.setItem(storageKey(campaign.id), JSON.stringify(compact))
      } catch {
        // A full local storage must never break the campaign UI.
      }
    }
  }, [campaign.id, entries])

  useEffect(() => {
    if (!open) return
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 80)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose, open])

  useEffect(() => {
    if (!open) return
    const feed = feedRef.current
    if (feed && typeof feed.scrollTo === 'function') feed.scrollTo({ top: feed.scrollHeight, behavior: entries.length > 1 ? 'smooth' : 'auto' })
  }, [entries, loading, open])

  useEffect(() => () => abortRef.current?.abort(), [])

  const conversationalHistory = useMemo<WorldQuestionMessage[]>(() => entries.slice(-12).map(({ role, content }) => ({ role, content })), [entries])

  const ask = async (suggestedQuestion?: string) => {
    const content = (suggestedQuestion ?? question).trim()
    if (!content || loading) return
    const controller = new AbortController()
    abortRef.current = controller
    const userEntry: ChatEntry = { id: crypto.randomUUID(), role: 'user', content, createdAt: new Date().toISOString() }
    setEntries((current) => [...current, userEntry].slice(-30))
    setQuestion('')
    setError('')
    setLoading(true)
    setProgress({ percent: 4, stage: 'sending', detail: 'Передаём вопрос справочнику' })
    try {
      const result = await askWorldQuestion({
        campaign,
        question: content,
        scope,
        history: conversationalHistory,
        provider,
      }, controller.signal, setProgress)
      const assistantEntry: ChatEntry = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.answer,
        scope: result.scope,
        createdAt: result.generatedAt,
      }
      setEntries((current) => [...current, assistantEntry].slice(-30))
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setQuestion(content)
      setError(caught instanceof Error ? caught.message : 'Не удалось получить справку. Кампания не изменена.')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setLoading(false)
      setProgress(undefined)
    }
  }

  const clearHistory = () => {
    setEntries([])
    setError('')
    localStorage.removeItem(storageKey(campaign.id))
    inputRef.current?.focus()
  }

  if (!open) return null

  return <div className="world-question-layer">
    <button className="world-question-backdrop" onClick={onClose} tabIndex={-1} aria-label="Закрыть справочник" />
    <section className="world-question-panel" role="dialog" aria-modal="true" aria-labelledby="world-question-title">
      <header className="world-question-header">
        <span className="world-question-mark"><BrainCircuit size={18} /></span>
        <div>
          <strong id="world-question-title">Спросить о мире</strong>
          <small><ShieldCheck size={11} /> Ответ не изменяет историю</small>
        </div>
        {entries.length > 0 && <button className="world-question-icon" onClick={clearHistory} aria-label="Очистить историю вопросов" title="Очистить историю"><Trash2 size={15} /></button>}
        <button className="world-question-icon" onClick={onClose} aria-label="Закрыть справочник"><X size={17} /></button>
      </header>

      <div className="world-question-scope" aria-label="Доступ к сведениям">
        <button className={scope === 'known' ? 'is-active' : ''} onClick={() => setScope('known')} aria-pressed={scope === 'known'}>
          <EyeOff size={14} /><span><b>Без спойлеров</b><small>Только знания героя</small></span>
        </button>
        <button className={scope === 'complete' ? 'is-active is-spoiler' : ''} onClick={() => setScope('complete')} aria-pressed={scope === 'complete'}>
          <Eye size={14} /><span><b>Полная справка</b><small>Включая скрытые тайны</small></span>
        </button>
      </div>

      {scope === 'complete' && <div className="world-question-warning"><Eye size={13} /> Этот режим может раскрыть планы врагов, секреты мира и неоткрытые свойства.</div>}

      <div className="world-question-feed" ref={feedRef} aria-live="polite">
        {entries.length === 0 && !loading && <div className="world-question-empty">
          <BookOpenCheck size={24} />
          <strong>Можно спросить о чём угодно</strong>
          <p>О текущей сцене, персонажах, мире, способностях, предметах, заданиях, правилах или прошлых событиях.</p>
          <div className="world-question-quick">
            {quickQuestions.map((item) => <button key={item} onClick={() => void ask(item)}>{item}</button>)}
          </div>
        </div>}

        {entries.map((entry) => <article key={entry.id} className={`world-question-message is-${entry.role}`}>
          <header>
            <span>{entry.role === 'user' ? 'Вы' : 'Справочник'}</span>
            {entry.role === 'assistant' && <small>{entry.scope === 'complete' ? <><Eye size={10} /> со спойлерами</> : <><EyeOff size={10} /> знания героя</>}</small>}
          </header>
          {entry.role === 'assistant' ? <AnswerText>{entry.content}</AnswerText> : <p>{entry.content}</p>}
        </article>)}

        {loading && <div className="world-question-thinking">
          <LoaderCircle className="spin" size={16} />
          <div><strong>{progress?.detail || 'ИИ изучает кампанию'}</strong><i><span style={{ width: `${Math.max(6, progress?.percent ?? 8)}%` }} /></i></div>
          <button onClick={() => abortRef.current?.abort()} aria-label="Остановить ответ" title="Остановить"><Square size={12} /></button>
        </div>}
      </div>

      {error && <div className="world-question-error" role="alert">{error}</div>}

      <form className="world-question-composer" onSubmit={(event) => { event.preventDefault(); void ask() }}>
        <textarea
          ref={inputRef}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void ask()
            }
          }}
          placeholder="Спросите о мире, сцене, силе, предмете…"
          rows={2}
          aria-label="Вопрос о кампании"
        />
        <button type="submit" disabled={!question.trim() || loading} aria-label="Задать вопрос">
          {loading ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}
        </button>
        <small>Enter — спросить · Shift+Enter — новая строка</small>
      </form>
    </section>
  </div>
}
