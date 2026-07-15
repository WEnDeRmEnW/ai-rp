import {
  Activity, Backpack, Brain, ChevronDown, ChevronUp, CircleGauge, Coins, Gem,
  Heart, MapPin, ShieldAlert, Sparkles, Swords, UsersRound,
} from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import type { Campaign, StateChange, StateChangeKind, StoryMessage } from '../../shared/types'
import { legacyChangeLabel, stateChangeLabel } from '../lib/state-change-labels'
import { formatStateChangeTransition } from '../lib/state-change-transition'
import { isTechnicalReceiptText, sanitizeReceiptText } from '../lib/ui-labels'

const iconForKind = (kind: StateChangeKind) => {
  if (kind === 'health') return Heart
  if (kind === 'resource') return Activity
  if (kind === 'stat') return CircleGauge
  if (kind === 'currency') return Coins
  if (kind === 'inventory') return Backpack
  if (kind === 'artifact') return Gem
  if (kind === 'condition') return ShieldAlert
  if (kind === 'relationship' || kind === 'reputation') return UsersRound
  if (kind === 'knowledge') return Brain
  if (kind === 'conflict') return Swords
  if (kind === 'scene' || kind === 'world') return MapPin
  return Sparkles
}

export const StateChangeLine = memo(function StateChangeLine({ change, campaign }: { change: StateChange; campaign?: Campaign }) {
  const Icon = iconForKind(change.kind)
  const transition = formatStateChangeTransition(change)
  return <div className={`state-change-line tone-${change.tone}`}>
    <span className="state-change-icon" aria-hidden="true"><Icon size={14} /></span>
    <span className="state-change-copy"><strong>{sanitizeReceiptText(stateChangeLabel(change, campaign), 'Изменение мира')}</strong><small>{sanitizeReceiptText(change.detail)}</small></span>
    {transition && <b className="state-change-value">{transition}</b>}
  </div>
})

type ReceiptEntry =
  | { type: 'structured'; change: StateChange }
  | { type: 'legacy'; text: string }
  | { type: 'diagnostics'; count: number }

function technicalChange(change: StateChange) {
  return change.kind === 'system' || isTechnicalReceiptText(`${change.label} ${change.detail}`)
}

function diagnosticsText(count: number) {
  const lastTwo = count % 100
  const last = count % 10
  const noun = lastTwo >= 11 && lastTwo <= 19 ? 'изменений' : last === 1 ? 'изменение' : last >= 2 && last <= 4 ? 'изменения' : 'изменений'
  const verb = !(lastTwo >= 11 && lastTwo <= 19) && last >= 2 && last <= 4 ? 'пропущены' : 'пропущено'
  return `${count} внутренних ${noun} безопасно ${verb}: они не соответствовали текущему состоянию мира.`
}

export const StateReceipt = memo(function StateReceipt({ message, campaign }: { message: StoryMessage; campaign?: Campaign }) {
  const [expanded, setExpanded] = useState(false)
  const entries = useMemo<ReceiptEntry[]>(() => {
    const structured = message.stateChanges ?? []
    const legacy = structured.length ? [] : (message.changeSummary ?? [])
    const publicStructured = structured.filter((change) => !technicalChange(change))
    const publicLegacy = legacy.filter((change) => !isTechnicalReceiptText(change))
    const diagnosticsCount = structured.filter(technicalChange).length + legacy.filter(isTechnicalReceiptText).length
    return [
      ...publicStructured.map((change): ReceiptEntry => ({ type: 'structured', change })),
      ...publicLegacy.map((text): ReceiptEntry => ({ type: 'legacy', text })),
      ...(diagnosticsCount ? [{ type: 'diagnostics' as const, count: diagnosticsCount }] : []),
    ]
  }, [message.changeSummary, message.stateChanges])
  const total = entries.length
  if (!total) return null

  const limit = 4
  const visibleEntries = expanded ? entries : entries.slice(0, limit)
  const hiddenCount = Math.max(0, total - limit)

  return <section className="state-receipt" aria-label="Изменения состояния">
    <header className="state-receipt-heading">
      <span><Sparkles size={14} /></span>
      <div><strong>Мир учёл последствия</strong><small>{total} {total === 1 ? 'изменение' : total < 5 ? 'изменения' : 'изменений'}</small></div>
    </header>
    <div className="state-receipt-list">
      {visibleEntries.map((entry, index) => entry.type === 'structured'
        ? <StateChangeLine key={`${entry.change.kind}-${entry.change.entityId ?? entry.change.label}-${index}`} change={entry.change} campaign={campaign} />
        : entry.type === 'legacy'
          ? <div className="state-change-line tone-neutral is-legacy" key={`${entry.text}-${index}`}>
              <span className="state-change-icon" aria-hidden="true"><Sparkles size={14} /></span>
              <span className="state-change-copy"><strong>{sanitizeReceiptText(legacyChangeLabel(entry.text, campaign), 'Изменение мира')}</strong></span>
            </div>
          : <div className="state-change-line tone-neutral is-legacy is-diagnostic-summary" key="diagnostics">
              <span className="state-change-icon" aria-hidden="true"><ShieldAlert size={14} /></span>
              <span className="state-change-copy"><strong>Служебная сверка завершена</strong><small>{diagnosticsText(entry.count)}</small></span>
            </div>)}
    </div>
    {(hiddenCount > 0 || expanded) && <button className="state-receipt-toggle" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
      {expanded ? <><ChevronUp size={14} /> Свернуть</> : <><ChevronDown size={14} /> Ещё {hiddenCount}</>}
    </button>}
  </section>
})
