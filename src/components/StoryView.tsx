import { ArrowDown, BookmarkPlus, Check, Clock3, CloudSun, Copy, Dices, Flame, GitBranch, History, MapPin, RefreshCcw, RotateCcw } from 'lucide-react'
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Campaign, OperationProgress, StoryMessage } from '../../shared/types'
import { formatStoryText } from '../lib/story-format'
import { DEFAULT_STORY_WINDOW_TURNS, selectStoryWindow } from '../lib/story-window'
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

const INITIAL_VISIBLE_TURNS = DEFAULT_STORY_WINDOW_TURNS
const HISTORY_REVEAL_STEP = 20

function turnWord(count: number) {
  const lastTwo = count % 100
  const last = count % 10
  if (lastTwo >= 11 && lastTwo <= 19) return 'ходов'
  if (last === 1) return 'ход'
  if (last >= 2 && last <= 4) return 'хода'
  return 'ходов'
}

const AssistantMessage = memo(function AssistantMessage({ message, campaign, isLast, onSuggestion, onPin, onUndo, onRetry, onBranch }: {
  message: StoryMessage
  campaign: Campaign
  isLast: boolean
  onSuggestion: (value: string) => void
  onPin: (message: StoryMessage) => void
  onUndo: () => void
  onRetry: () => void
  onBranch: () => void
}) {
  const [copied, setCopied] = useState(false)
  const storyBlocks = useMemo(() => formatStoryText(message.content), [message.content])
  const copy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }
  return (
    <article className={`story-turn assistant-turn ${message.failed ? 'is-failed' : ''}`}>
      <div className="living-seam" aria-hidden="true"><span /></div>
      <div className="turn-content">
        <div className="turn-kicker"><span>Мир отвечает</span><i /> <span>ход {message.turn}</span></div>
        <div className="story-prose">
          {storyBlocks.map((block, index) => (
            <p className={`story-block story-${block.kind}`} key={index}>
              {block.kind === 'thought' && <span className="story-thought-label">Мысль</span>}
              <span>{block.text}</span>
            </p>
          ))}
        </div>
        {message.check?.visibility === 'visible' && <div className={`action-check check-${message.check.outcome}`}><Dices size={14} /><span className="action-check-copy"><span>{message.check.statLabel}: {message.check.roll} {message.check.modifier >= 0 ? '+' : '−'} {Math.abs(message.check.modifier)} = <strong>{message.check.total}</strong> против {message.check.target}{message.check.oppositionLabel ? ` · ${message.check.oppositionLabel}: ${message.check.oppositionModifier && message.check.oppositionModifier > 0 ? '+' : ''}${message.check.oppositionModifier ?? 0}` : ''}</span>{message.check.oppositionTier && <small>{message.check.oppositionTier === 'legendary' ? 'Легендарный противник' : message.check.oppositionTier === 'elite' ? 'Элитный противник' : message.check.oppositionTier === 'dangerous' ? 'Опасный противник' : message.check.oppositionTier === 'capable' ? 'Подготовленный противник' : 'Незначительное сопротивление'}{message.check.oppositionFactors?.length ? ` · ${message.check.oppositionFactors.join(' · ')}` : ''}</small>}</span><b>{message.check.outcome === 'critical' ? 'Критический успех' : message.check.outcome === 'success' ? 'Успех' : message.check.outcome === 'mixed' ? 'Цена успеха' : 'Неудача'}</b></div>}
        <StateReceipt message={message} campaign={campaign} />
        <div className="turn-toolbar" aria-label="Действия с ответом">
          <button onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Скопировано' : 'Копировать'}</button>
          <button onClick={() => onPin(message)}><BookmarkPlus size={14} /> В память</button>
          {isLast && <button onClick={onRetry}><RefreshCcw size={14} /> Повторить</button>}
          {isLast && <button onClick={onUndo}><RotateCcw size={14} /> Откатить</button>}
          <button onClick={onBranch}><GitBranch size={14} /> Ветка</button>
        </div>
        {isLast && !!message.suggestions?.length && (
          <div className="suggestion-row" aria-label="Возможные действия">
            {message.suggestions.map((suggestion, index) => <button key={suggestion} onClick={() => onSuggestion(suggestion)}><i>{index + 1}</i><span>{suggestion}</span></button>)}
          </div>
        )}
      </div>
    </article>
  )
})

const PlayerMessage = memo(function PlayerMessage({ message, actionLabel }: { message: StoryMessage; actionLabel: string }) {
  return <article className="story-turn player-turn">
    <div className="player-action-label"><span>{actionLabel}</span><i>ход {message.turn}</i></div>
    <p>{message.content}</p>
  </article>
})

function StoryViewComponent({ campaign, generating, progress, onSuggestion, onPin, onUndo, onRetry, onBranch }: StoryViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLElement>(null)
  const previousCampaignIdRef = useRef<string | undefined>(undefined)
  const previousMessageCountRef = useRef(0)
  const previousScrollHeightRef = useRef<number | undefined>(undefined)
  const [awayFromLatest, setAwayFromLatest] = useState(false)
  const [historyWindow, setHistoryWindow] = useState({ campaignId: campaign.id, turnCount: INITIAL_VISIBLE_TURNS })
  const requestedTurnCount = historyWindow.campaignId === campaign.id ? historyWindow.turnCount : INITIAL_VISIBLE_TURNS
  const storyWindow = useMemo(() => selectStoryWindow(campaign.messages, requestedTurnCount), [campaign.messages, requestedTurnCount])

  useLayoutEffect(() => {
    const scroller = scrollRef.current
    const previousHeight = previousScrollHeightRef.current
    previousScrollHeightRef.current = undefined
    if (scroller && previousHeight !== undefined) scroller.scrollTop += scroller.scrollHeight - previousHeight
  }, [campaign.id, storyWindow.visibleTurnCount])

  useLayoutEffect(() => {
    const campaignChanged = previousCampaignIdRef.current !== campaign.id
    const messageCountChanged = previousMessageCountRef.current !== campaign.messages.length
    previousCampaignIdRef.current = campaign.id
    previousMessageCountRef.current = campaign.messages.length

    if (campaignChanged) {
      previousScrollHeightRef.current = undefined
      setAwayFromLatest(false)
      setHistoryWindow({ campaignId: campaign.id, turnCount: INITIAL_VISIBLE_TURNS })
      bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
      return
    }
    if (messageCountChanged || generating) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [campaign.id, campaign.messages.length, generating])

  const revealEarlier = (all = false) => {
    if (scrollRef.current) previousScrollHeightRef.current = scrollRef.current.scrollHeight
    setHistoryWindow({
      campaignId: campaign.id,
      turnCount: all ? Number.MAX_SAFE_INTEGER : Math.min(storyWindow.totalTurnCount, storyWindow.visibleTurnCount + HISTORY_REVEAL_STEP),
    })
  }

  const lastAssistantId = [...campaign.messages].reverse().find((message) => message.role === 'assistant')?.id
  const nextRevealCount = Math.min(HISTORY_REVEAL_STEP, storyWindow.hiddenTurnCount)
  const presentation = getWorldPresentation(campaign.world)
  return (
    <main className="story-scroll" id="main-story" ref={scrollRef} onScroll={(event) => {
      const target = event.currentTarget
      setAwayFromLatest(target.scrollHeight - target.scrollTop - target.clientHeight > 260)
    }}>
      <div className="story-column">
        <section className="scene-intro">
          <div className="scene-intro-top"><div className="eyebrow">{presentation.labels.chapter} {Math.max(1, Math.floor(campaign.turn / 12) + 1)} · {presentation.labels.turn} {campaign.turn}</div><span className={`scene-tension-badge ${campaign.scene.tension >= 70 ? 'is-high' : campaign.scene.tension >= 40 ? 'is-medium' : ''}`}><Flame size={12} /> Напряжение {campaign.scene.tension}%</span></div>
          <h1>{campaign.scene.title}</h1>
          <div className="scene-context"><span><MapPin size={13} />{campaign.scene.location}</span><span><Clock3 size={13} />{campaign.world.calendar.label}</span><span><CloudSun size={13} />{campaign.scene.weather}</span><span>{presentation.motif}</span></div>
          <div className="tension-track" role="progressbar" aria-label="Напряжение сцены" aria-valuemin={0} aria-valuemax={100} aria-valuenow={campaign.scene.tension}><span style={{ width: `${campaign.scene.tension}%` }} /></div>
        </section>

        <div className="story-messages">
          {storyWindow.hiddenTurnCount > 0 && <nav className="story-history-window" aria-label="Архив предыдущих ходов">
            <div className="story-history-summary"><span><History size={15} /></span><div><strong>Ранее в истории</strong><small>Сейчас показаны последние {storyWindow.visibleTurnCount} из {storyWindow.totalTurnCount} ходов</small></div></div>
            <div className="story-history-actions">
              <button onClick={() => revealEarlier()} aria-label={`Показать ещё ${nextRevealCount} ${turnWord(nextRevealCount)} из предыдущей части истории`}>Ещё {nextRevealCount}</button>
              <button onClick={() => revealEarlier(true)}>Показать всё</button>
            </div>
          </nav>}
          {storyWindow.messages.map((message) => message.role === 'assistant' ? (
            <AssistantMessage key={message.id} message={message} campaign={campaign} isLast={message.id === lastAssistantId} onSuggestion={onSuggestion} onPin={onPin} onUndo={onUndo} onRetry={onRetry} onBranch={onBranch} />
          ) : (
            <PlayerMessage key={message.id} message={message} actionLabel={message.actionType === 'say' ? presentation.labels.speech : message.actionType === 'story' ? presentation.labels.direction : message.actionType === 'continue' ? presentation.labels.continue : presentation.labels.action} />
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
      {awayFromLatest && <button className="jump-latest" onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })}><ArrowDown size={15} /><span>К последнему ходу</span></button>}
    </main>
  )
}

export const StoryView = memo(StoryViewComponent, (previous, next) => (
  previous.campaign === next.campaign
  && previous.generating === next.generating
  && previous.progress === next.progress
))
