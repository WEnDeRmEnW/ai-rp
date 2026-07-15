import { BookmarkPlus, Check, Copy, Dices, GitBranch, RefreshCcw, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Campaign, OperationProgress, StoryMessage } from '../../shared/types'
import { formatStoryText } from '../lib/story-format'
import { getWorldPresentation } from '../lib/world-customization'
import { OperationProgressPanel } from './OperationProgressPanel'
import { StateReceipt } from './StateReceipt'

interface StoryViewProps {
  campaign: Campaign
  generating: boolean
  progress?: OperationProgress
  onSuggestion: (value: string) => void
  onPin: (message: StoryMessage) => void
  onUndo: () => void
  onRetry: () => void
  onBranch: () => void
}

function AssistantMessage({ message, isLast, onSuggestion, onPin, onUndo, onRetry, onBranch }: {
  message: StoryMessage
  isLast: boolean
  onSuggestion: (value: string) => void
  onPin: (message: StoryMessage) => void
  onUndo: () => void
  onRetry: () => void
  onBranch: () => void
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }
  return (
    <article className={`story-turn assistant-turn ${message.failed ? 'is-failed' : ''}`}>
      <div className="living-seam" aria-hidden="true"><span /></div>
      <div className="turn-content">
        <div className="story-prose">
          {formatStoryText(message.content).map((block, index) => (
            <p className={`story-block story-${block.kind}`} key={index}>
              {block.kind === 'thought' && <span className="story-thought-label">Мысль</span>}
              <span>{block.text}</span>
            </p>
          ))}
        </div>
        {message.check?.visibility === 'visible' && <div className={`action-check check-${message.check.outcome}`}><Dices size={14} /><span>{message.check.statLabel}: {message.check.roll} + {message.check.modifier} = <strong>{message.check.total}</strong> против {message.check.target}{message.check.oppositionLabel ? ` · ${message.check.oppositionLabel}: противодействие ${message.check.oppositionModifier && message.check.oppositionModifier > 0 ? '+' : ''}${message.check.oppositionModifier ?? 0}` : ''}</span><b>{message.check.outcome === 'critical' ? 'Критический успех' : message.check.outcome === 'success' ? 'Успех' : message.check.outcome === 'mixed' ? 'Цена успеха' : 'Неудача'}</b></div>}
        <StateReceipt message={message} />
        <div className="turn-toolbar" aria-label="Действия с ответом">
          <button onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Скопировано' : 'Копировать'}</button>
          <button onClick={() => onPin(message)}><BookmarkPlus size={14} /> В память</button>
          {isLast && <button onClick={onRetry}><RefreshCcw size={14} /> Повторить</button>}
          {isLast && <button onClick={onUndo}><RotateCcw size={14} /> Откатить</button>}
          <button onClick={onBranch}><GitBranch size={14} /> Ветка</button>
        </div>
        {isLast && !!message.suggestions?.length && (
          <div className="suggestion-row" aria-label="Возможные действия">
            {message.suggestions.map((suggestion) => <button key={suggestion} onClick={() => onSuggestion(suggestion)}>{suggestion}</button>)}
          </div>
        )}
      </div>
    </article>
  )
}

export function StoryView({ campaign, generating, progress, onSuggestion, onPin, onUndo, onRetry, onBranch }: StoryViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [campaign.messages.length, generating])

  const lastAssistantId = [...campaign.messages].reverse().find((message) => message.role === 'assistant')?.id
  const presentation = getWorldPresentation(campaign.world)
  return (
    <main className="story-scroll" id="main-story">
      <div className="story-column">
        <section className="scene-intro">
          <div className="eyebrow">{presentation.labels.chapter} {Math.max(1, Math.floor(campaign.turn / 12) + 1)} · {presentation.labels.turn} {campaign.turn}</div>
          <h1>{campaign.scene.title}</h1>
          <p>{campaign.scene.weather} · {campaign.world.calendar.label} · {presentation.motif}</p>
          <div className="tension-track" title={`Напряжение сцены: ${campaign.scene.tension}%`}>
            <span style={{ width: `${campaign.scene.tension}%` }} />
          </div>
        </section>

        <div className="story-messages">
          {campaign.messages.map((message) => message.role === 'assistant' ? (
            <AssistantMessage key={message.id} message={message} isLast={message.id === lastAssistantId} onSuggestion={onSuggestion} onPin={onPin} onUndo={onUndo} onRetry={onRetry} onBranch={onBranch} />
          ) : (
            <article className="story-turn player-turn" key={message.id}>
              <div className="player-action-label">{message.actionType === 'say' ? presentation.labels.speech : message.actionType === 'story' ? presentation.labels.direction : message.actionType === 'continue' ? presentation.labels.continue : presentation.labels.action}</div>
              <p>{message.content}</p>
            </article>
          ))}
          {generating && (
            <article className="story-turn assistant-turn is-generating" aria-live="polite">
              <div className="living-seam" aria-hidden="true"><span /></div>
              <OperationProgressPanel progress={progress} />
            </article>
          )}
        </div>
        <div ref={bottomRef} className="scroll-anchor" />
      </div>
    </main>
  )
}
