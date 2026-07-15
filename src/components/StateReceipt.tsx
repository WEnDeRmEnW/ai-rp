import {
  Activity, Backpack, Brain, ChevronDown, ChevronUp, CircleGauge, Coins, Gem,
  Heart, MapPin, ShieldAlert, Sparkles, Swords, UsersRound,
} from 'lucide-react'
import { useState } from 'react'
import type { Campaign, StateChange, StateChangeKind, StoryMessage } from '../../shared/types'
import { legacyChangeLabel, stateChangeLabel } from '../lib/state-change-labels'
import { formatStateChangeTransition } from '../lib/state-change-transition'
import { localizeTechnicalText } from '../lib/ui-labels'

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

export function StateChangeLine({ change, campaign }: { change: StateChange; campaign?: Campaign }) {
  const Icon = iconForKind(change.kind)
  const transition = formatStateChangeTransition(change)
  return <div className={`state-change-line tone-${change.tone}`}>
    <span className="state-change-icon" aria-hidden="true"><Icon size={14} /></span>
    <span className="state-change-copy"><strong>{stateChangeLabel(change, campaign)}</strong><small>{localizeTechnicalText(change.detail)}</small></span>
    {transition && <b className="state-change-value">{transition}</b>}
  </div>
}

export function StateReceipt({ message, campaign }: { message: StoryMessage; campaign?: Campaign }) {
  const [expanded, setExpanded] = useState(false)
  const structured = message.stateChanges ?? []
  const legacy = structured.length ? [] : (message.changeSummary ?? [])
  const total = structured.length || legacy.length
  if (!total) return null

  const limit = 4
  const visibleStructured = expanded ? structured : structured.slice(0, limit)
  const visibleLegacy = expanded ? legacy : legacy.slice(0, limit)
  const hiddenCount = Math.max(0, total - limit)

  return <section className="state-receipt" aria-label="Изменения состояния">
    <header className="state-receipt-heading">
      <span><Sparkles size={14} /></span>
      <div><strong>Мир учёл последствия</strong><small>{total} {total === 1 ? 'изменение' : total < 5 ? 'изменения' : 'изменений'}</small></div>
    </header>
    <div className="state-receipt-list">
      {visibleStructured.map((change, index) => <StateChangeLine key={`${change.kind}-${change.entityId ?? change.label}-${index}`} change={change} campaign={campaign} />)}
      {visibleLegacy.map((change, index) => <div className="state-change-line tone-neutral is-legacy" key={`${change}-${index}`}>
        <span className="state-change-icon" aria-hidden="true"><Sparkles size={14} /></span>
        <span className="state-change-copy"><strong>{legacyChangeLabel(change, campaign)}</strong></span>
      </div>)}
    </div>
    {(hiddenCount > 0 || expanded) && <button className="state-receipt-toggle" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
      {expanded ? <><ChevronUp size={14} /> Свернуть</> : <><ChevronDown size={14} /> Ещё {hiddenCount}</>}
    </button>}
  </section>
}
