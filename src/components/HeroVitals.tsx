import { Activity, HeartPulse, ShieldAlert } from 'lucide-react'
import type { Campaign, Resource } from '../../shared/types'

interface HeroVitalsProps {
  campaign: Campaign
  onOpen: () => void
}

const lifeStateLabels: Record<Campaign['player']['lifeState'], string> = {
  active: 'В строю',
  unconscious: 'Без сознания',
  incapacitated: 'Обездвижен',
  dead: 'Мёртв',
  missing: 'Пропал',
}

const healthPattern = /(health|hp|hit.?points|здоров|жизн)/i

const isHealth = (resource: Resource) => resource.kind === 'health' || healthPattern.test(`${resource.key} ${resource.label}`)

function resourcePercent(resource: Resource) {
  if (!resource.max) return Math.max(0, Math.min(100, resource.value))
  return Math.max(0, Math.min(100, resource.value / resource.max * 100))
}

export function HeroVitals({ campaign, onOpen }: HeroVitalsProps) {
  const resources = [...campaign.player.resources]
    .sort((left, right) => Number(isHealth(right)) - Number(isHealth(left)))
    .slice(0, 5)
  const effects = (campaign.player.statusEffects ?? []).filter((effect) => !effect.hidden)
  const legacyConditions = campaign.player.conditions ?? []
  const conditionNames = [...new Set([...effects.map((effect) => effect.name), ...legacyConditions])]
  const lifeState = campaign.player.lifeState ?? 'active'

  return <button className="hero-vitals" onClick={onOpen} aria-label="Открыть полное состояние героя">
    <span className="hero-vitals-identity">
      <i className={`life-pulse life-${lifeState}`}><HeartPulse size={16} /></i>
      <span><strong>{campaign.player.name}</strong><small>{lifeStateLabels[lifeState]}</small></span>
    </span>
    <span className="hero-vitals-resources">
      {resources.map((resource) => {
        const percent = resourcePercent(resource)
        const critical = resource.criticalBelow !== undefined ? resource.value <= resource.criticalBelow : isHealth(resource) && percent <= 25
        return <span className={`vital-resource ${critical ? 'is-critical' : ''}`} key={resource.key}>
          <span><b>{resource.label}</b><em>{resource.value}{resource.max !== undefined ? ` / ${resource.max}` : ''}</em></span>
          <i><b style={{ width: `${percent}%`, background: resource.color }} /></i>
        </span>
      })}
    </span>
    <span className={`hero-vitals-conditions ${conditionNames.length ? 'has-effects' : ''}`}>
      {conditionNames.length ? <><ShieldAlert size={15} /><span>{conditionNames.slice(0, 2).join(' · ')}</span>{conditionNames.length > 2 && <b>+{conditionNames.length - 2}</b>}</> : <><Activity size={15} /><span>Состояние стабильно</span></>}
    </span>
  </button>
}
