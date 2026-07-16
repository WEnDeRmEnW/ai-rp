import {
  ArrowDown, BookmarkPlus, Check, ChevronDown, Clock3, CloudSun, Copy, Dices,
  Flame, GitBranch, History, ListTree, MapPin, RefreshCcw, RotateCcw,
} from 'lucide-react'
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Campaign, OperationProgress, StoryMessage } from '../../shared/types'
import { buildStoryWaypoints, formatStoryText, type StoryBlock } from '../lib/story-format'
import { DEFAULT_STORY_WINDOW_TURNS, selectStoryWindow } from '../lib/story-window'
import { getWorldPresentation } from '../lib/world-customization'
import { OperationProgressPanel } from './OperationProgressPanel'
import { StateReceipt } from './StateReceipt'
import './story-reading.css'

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

function capitalize(value: string) {
  return value ? `${value[0].toLocaleUpperCase('ru-RU')}${value.slice(1)}` : value
}

function checkOutcomeLabel(message: StoryMessage) {
  if (message.check?.outcome === 'critical') return 'Критический успех'
  if (message.check?.outcome === 'success') return 'Успех'
  if (message.check?.outcome === 'mixed') return 'Успех с ценой'
  if (message.check?.outcome === 'failure') return 'Неудача'
  return 'Последствия мира'
}

function oppositionTierLabel(tier: NonNullable<StoryMessage['check']>['oppositionTier']) {
  if (tier === 'legendary') return 'Легендарный противник'
  if (tier === 'elite') return 'Элитный противник'
  if (tier === 'dangerous') return 'Опасный противник'
  if (tier === 'capable') return 'Подготовленный противник'
  return 'Незначительное сопротивление'
}

function StoryBlockView({ block }: { block: StoryBlock }) {
  if (block.kind === 'transition') {
    return <div className={`story-transition ${block.text ? 'has-label' : ''}`} role="separator" aria-label={block.text || 'Смена сцены'}>
      <i aria-hidden="true" />
      <span className={block.text ? '' : 'visually-hidden'}>{block.text || 'Смена сцены'}</span>
      <i aria-hidden="true" />
    </div>
  }

  if (block.kind === 'dialogue') {
    return <blockquote className="story-block story-dialogue" aria-label={block.speaker ? `Реплика: ${block.speaker}` : 'Реплика персонажа'}>
      {block.speaker && <cite>{block.speaker}</cite>}
      <span>{block.text}</span>
    </blockquote>
  }

  if (block.kind === 'thought') {
    return <p className="story-block story-thought" aria-label="Мысль персонажа">
      <span className="story-thought-label" aria-hidden="true">Мысль</span>
      <em>{block.text}</em>
    </p>
  }

  return <p className="story-block story-narration">{block.text}</p>
}

function ActionCheck({ message }: { message: StoryMessage }) {
  const check = message.check
  if (check?.visibility !== 'visible') return null
  return <div className={`action-check check-${check.outcome}`}>
    <Dices size={14} aria-hidden="true" />
    <span className="action-check-copy">
      <span>{check.statLabel}: {check.roll} {check.modifier >= 0 ? '+' : '−'} {Math.abs(check.modifier)} = <strong>{check.total}</strong> против {check.target}{check.oppositionLabel ? ` · ${check.oppositionLabel}: ${check.oppositionModifier && check.oppositionModifier > 0 ? '+' : ''}${check.oppositionModifier ?? 0}` : ''}</span>
      {check.oppositionTier && <small>{oppositionTierLabel(check.oppositionTier)}{check.oppositionFactors?.length ? ` · ${check.oppositionFactors.join(' · ')}` : ''}</small>}
    </span>
    <b>{checkOutcomeLabel(message)}</b>
  </div>
}

function TurnConsequences({ message, campaign, isLast }: { message: StoryMessage; campaign: Campaign; isLast: boolean }) {
  const hasCheck = message.check?.visibility === 'visible'
  const hasReceipt = Boolean(message.stateChanges?.length || message.changeSummary?.length)
  if (!hasCheck && !hasReceipt) return null

  return <details className="turn-consequences" open={isLast || undefined}>
    <summary>
      <span><Dices size={13} aria-hidden="true" /> Итог хода</span>
      <small>{checkOutcomeLabel(message)}</small>
      <ChevronDown size={14} aria-hidden="true" />
    </summary>
    <div className="turn-consequences-body">
      <ActionCheck message={message} />
      {hasReceipt && <StateReceipt message={message} campaign={campaign} />}
    </div>
  </details>
}

function StoryJumpControl({ waypoints, latestTurn, turnLabel, chapterLabel, onJump, compact = false }: {
  waypoints: number[]
  latestTurn: number
  turnLabel: string
  chapterLabel: string
  onJump: (turn: number) => void
  compact?: boolean
}) {
  return <label className={`story-jump-control ${compact ? 'is-compact' : ''}`}>
    <ListTree size={13} aria-hidden="true" />
    <span className="visually-hidden">Перейти к ходу</span>
    <select value="" aria-label="Перейти к ходу" onChange={(event) => {
      const turn = Number(event.target.value)
      if (Number.isFinite(turn)) onJump(turn)
    }}>
      <option value="">К ходу…</option>
      {waypoints.map((turn, index) => <option value={turn} key={turn}>
        {capitalize(turnLabel)} {turn}{index === 0 ? ' · начало' : turn === latestTurn ? ' · последний' : ` · ${chapterLabel.toLocaleLowerCase('ru-RU')} ${Math.max(1, Math.floor(turn / 12) + 1)}`}
      </option>)}
    </select>
  </label>
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
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }
  const headingId = `story-turn-${message.turn}-assistant-heading`
  return (
    <article
      className={`story-turn assistant-turn ${message.failed ? 'is-failed' : ''}`}
      id={`story-turn-${message.turn}-assistant`}
      data-story-turn={message.turn}
      data-story-role="assistant"
      aria-labelledby={headingId}
    >
      <div className="living-seam" aria-hidden="true"><span /></div>
      <div className="turn-content">
        <div className="turn-kicker" id={headingId}><span>Мир отвечает</span><i aria-hidden="true" /> <span>ход {message.turn}</span></div>
        <div className="story-prose">
          {storyBlocks.map((block, index) => <StoryBlockView block={block} key={`${block.kind}-${index}-${block.text.slice(0, 18)}`} />)}
        </div>
        <TurnConsequences message={message} campaign={campaign} isLast={isLast} />
        <div className="turn-toolbar" role="toolbar" aria-label={`Действия с ответом на ходу ${message.turn}`}>
          <button type="button" onClick={copy} aria-label={copied ? 'Ответ скопирован' : 'Копировать ответ'} title="Копировать ответ">{copied ? <Check size={14} /> : <Copy size={14} />} <span aria-live="polite">{copied ? 'Скопировано' : 'Копировать'}</span></button>
          <button type="button" onClick={() => onPin(message)} aria-label="Сохранить ответ в памяти" title="Сохранить в памяти"><BookmarkPlus size={14} /> <span>В память</span></button>
          {isLast && <button type="button" onClick={onRetry} aria-label="Создать другой ответ" title="Создать другой ответ"><RefreshCcw size={14} /> <span>Повторить</span></button>}
          {isLast && <button type="button" onClick={onUndo} aria-label="Откатить последний ход" title="Откатить последний ход"><RotateCcw size={14} /> <span>Откатить</span></button>}
          <button type="button" onClick={onBranch} aria-label="Создать ветку от этого хода" title="Создать ветку"><GitBranch size={14} /> <span>Ветка</span></button>
        </div>
        {isLast && !!message.suggestions?.length && (
          <nav className="suggestion-row" aria-label="Возможные действия">
            {message.suggestions.map((suggestion, index) => <button type="button" key={`${suggestion}-${index}`} onClick={() => onSuggestion(suggestion)}><i aria-hidden="true">{index + 1}</i><span>{suggestion}</span></button>)}
          </nav>
        )}
      </div>
    </article>
  )
})

const PlayerMessage = memo(function PlayerMessage({ message, actionLabel }: { message: StoryMessage; actionLabel: string }) {
  const headingId = `story-turn-${message.turn}-user-heading`
  return <article
    className="story-turn player-turn"
    id={`story-turn-${message.turn}-user`}
    data-story-turn={message.turn}
    data-story-role="user"
    aria-labelledby={headingId}
  >
    <div className="player-action-label" id={headingId}><span>{actionLabel}</span><i>ход {message.turn}</i></div>
    <p>{message.content}</p>
  </article>
})

function StoryViewComponent({ campaign, generating, progress, onSuggestion, onPin, onUndo, onRetry, onBranch }: StoryViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLElement>(null)
  const previousCampaignIdRef = useRef<string | undefined>(undefined)
  const previousMessageCountRef = useRef(0)
  const previousScrollHeightRef = useRef<number | undefined>(undefined)
  const [awayFromLatest, setAwayFromLatest] = useState(false)
  const [pendingJumpTurn, setPendingJumpTurn] = useState<number | undefined>(undefined)
  const [historyWindow, setHistoryWindow] = useState({ campaignId: campaign.id, turnCount: INITIAL_VISIBLE_TURNS })
  const requestedTurnCount = historyWindow.campaignId === campaign.id ? historyWindow.turnCount : INITIAL_VISIBLE_TURNS
  const storyWindow = useMemo(() => selectStoryWindow(campaign.messages, requestedTurnCount), [campaign.messages, requestedTurnCount])
  const allTurns = useMemo(() => [...new Set(campaign.messages.map((message) => message.turn).filter(Number.isFinite))].sort((left, right) => left - right), [campaign.messages])
  const waypoints = useMemo(() => buildStoryWaypoints(allTurns), [allTurns])

  useLayoutEffect(() => {
    const scroller = scrollRef.current
    const previousHeight = previousScrollHeightRef.current
    previousScrollHeightRef.current = undefined
    if (scroller && previousHeight !== undefined) scroller.scrollTop += scroller.scrollHeight - previousHeight
  }, [campaign.id, storyWindow.visibleTurnCount])

  useLayoutEffect(() => {
    if (pendingJumpTurn === undefined) return
    const scroller = scrollRef.current
    const assistantTurn = scroller?.querySelector<HTMLElement>(`[data-story-turn="${pendingJumpTurn}"][data-story-role="assistant"]`)
    const target = assistantTurn ?? scroller?.querySelector<HTMLElement>(`[data-story-turn="${pendingJumpTurn}"]`)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setPendingJumpTurn(undefined)
  }, [campaign.id, pendingJumpTurn, storyWindow.visibleTurnCount])

  useLayoutEffect(() => {
    const campaignChanged = previousCampaignIdRef.current !== campaign.id
    const messageCountChanged = previousMessageCountRef.current !== campaign.messages.length
    previousCampaignIdRef.current = campaign.id
    previousMessageCountRef.current = campaign.messages.length

    if (campaignChanged) {
      previousScrollHeightRef.current = undefined
      setAwayFromLatest(false)
      setPendingJumpTurn(undefined)
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

  const jumpToTurn = (turn: number) => {
    const turnIndex = allTurns.indexOf(turn)
    if (turnIndex < 0) return
    previousScrollHeightRef.current = undefined
    setPendingJumpTurn(turn)
    const requiredTurnCount = allTurns.length - turnIndex
    if (requiredTurnCount > storyWindow.visibleTurnCount) {
      setHistoryWindow({ campaignId: campaign.id, turnCount: requiredTurnCount })
    }
  }

  const lastAssistantId = useMemo(() => {
    for (let index = campaign.messages.length - 1; index >= 0; index -= 1) {
      if (campaign.messages[index].role === 'assistant') return campaign.messages[index].id
    }
    return undefined
  }, [campaign.messages])
  const nextRevealCount = Math.min(HISTORY_REVEAL_STEP, storyWindow.hiddenTurnCount)
  const presentation = getWorldPresentation(campaign.world)
  const firstVisibleTurn = storyWindow.messages[0]?.turn ?? campaign.turn
  const latestTurn = allTurns.at(-1) ?? campaign.turn
  const showNavigation = storyWindow.totalTurnCount >= 12

  return (
    <main className="story-scroll is-reader-v2" id="main-story" ref={scrollRef} onScroll={(event) => {
      const target = event.currentTarget
      const remaining = target.scrollHeight - target.scrollTop - target.clientHeight
      const maximum = Math.max(1, target.scrollHeight - target.clientHeight)
      const readingProgress = Math.max(0, Math.min(100, Math.round(target.scrollTop / maximum * 100)))
      if (progressRef.current) {
        progressRef.current.style.setProperty('--reading-progress', `${readingProgress}%`)
        progressRef.current.setAttribute('aria-valuenow', String(readingProgress))
      }
      const nextAwayFromLatest = remaining > 260
      setAwayFromLatest((current) => current === nextAwayFromLatest ? current : nextAwayFromLatest)
    }}>
      <div className="story-reading-progress" ref={progressRef} role="progressbar" aria-label="Позиция в истории" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}><span /></div>
      <div className="story-column">
        <section className="scene-intro" aria-labelledby="current-scene-title">
          <div className="scene-intro-top"><div className="eyebrow">{presentation.labels.chapter} {Math.max(1, Math.floor(campaign.turn / 12) + 1)} · {presentation.labels.turn} {campaign.turn}</div><span className={`scene-tension-badge ${campaign.scene.tension >= 70 ? 'is-high' : campaign.scene.tension >= 40 ? 'is-medium' : ''}`}><Flame size={12} /> Напряжение {campaign.scene.tension}%</span></div>
          <h1 id="current-scene-title">{campaign.scene.title}</h1>
          <div className="scene-context"><span><MapPin size={13} />{campaign.scene.location}</span><span><Clock3 size={13} />{campaign.world.calendar.label}</span><span><CloudSun size={13} />{campaign.scene.weather}</span><span>{presentation.motif}</span></div>
          <div className="tension-track" role="progressbar" aria-label="Напряжение сцены" aria-valuemin={0} aria-valuemax={100} aria-valuenow={campaign.scene.tension}><span style={{ width: `${campaign.scene.tension}%` }} /></div>
        </section>

        <div className="story-messages">
          {(storyWindow.hiddenTurnCount > 0 || showNavigation) && <nav className="story-history-window" aria-label="Навигация по истории">
            <div className="story-history-summary"><span><History size={15} /></span><div><strong>{storyWindow.hiddenTurnCount > 0 ? 'Ранее в истории' : 'История открыта'}</strong><small>Ходы {firstVisibleTurn}–{latestTurn} · {storyWindow.visibleTurnCount} из {storyWindow.totalTurnCount}</small></div></div>
            <div className="story-history-actions">
              {showNavigation && <StoryJumpControl waypoints={waypoints} latestTurn={latestTurn} turnLabel={presentation.labels.turn} chapterLabel={presentation.labels.chapter} onJump={jumpToTurn} />}
              {storyWindow.hiddenTurnCount > 0 && <button type="button" onClick={() => revealEarlier()} aria-label={`Показать ещё ${nextRevealCount} ${turnWord(nextRevealCount)} из предыдущей части истории`}>Ещё {nextRevealCount}</button>}
              {storyWindow.hiddenTurnCount > 0 && <button type="button" onClick={() => revealEarlier(true)}>Показать всё</button>}
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
      {awayFromLatest && <nav className="story-floating-nav" aria-label="Быстрая навигация по истории">
        {showNavigation && <StoryJumpControl compact waypoints={waypoints} latestTurn={latestTurn} turnLabel={presentation.labels.turn} chapterLabel={presentation.labels.chapter} onJump={jumpToTurn} />}
        <button type="button" className="jump-latest" onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })}><ArrowDown size={15} /><span>К последнему ходу</span></button>
      </nav>}
    </main>
  )
}

export const StoryView = memo(StoryViewComponent, (previous, next) => (
  previous.campaign === next.campaign
  && previous.generating === next.generating
  && previous.progress === next.progress
))
