import type { Campaign, Resource, StateChange } from '../../shared/types'
import { localizeTechnicalText, resourceUiLabel } from './ui-labels'

function allCampaignResources(campaign?: Campaign): Resource[] {
  if (!campaign) return []
  return [...campaign.player.resources, ...campaign.npcs.flatMap((npc) => npc.resources ?? [])]
}

function resourcesForChange(change: StateChange, campaign?: Campaign): Resource[] | undefined {
  if (!campaign) return undefined
  if (change.entityId === campaign.player.id) return campaign.player.resources
  const npcResources = campaign.npcs.find((npc) => npc.id === change.entityId)?.resources
  return npcResources?.length ? npcResources : allCampaignResources(campaign)
}

function resourceCandidates(resources: Resource[], includeLabels = false) {
  return resources.flatMap((resource) => [resource.key, ...(includeLabels ? [resource.label] : []), ...(resource.aliases ?? [])]
    .map((candidate) => ({ candidate, label: resource.label })))
    .sort((left, right) => right.candidate.length - left.candidate.length)
}

export function legacyChangeLabel(value: string, campaign?: Campaign) {
  const candidates = resourceCandidates(allCampaignResources(campaign))
  const normalized = value.toLocaleLowerCase('ru-RU')
  const match = candidates.find(({ candidate }) => {
    const start = normalized.indexOf(candidate.toLocaleLowerCase('ru-RU'))
    if (start < 0) return false
    const before = value.slice(Math.max(0, start - 1), start)
    const after = value.slice(start + candidate.length, start + candidate.length + 1)
    return (!before || /[\s:]/u.test(before)) && (!after || /[\s:+−-]/u.test(after))
  })
  if (!match) return localizeTechnicalText(value)
  const start = normalized.indexOf(match.candidate.toLocaleLowerCase('ru-RU'))
  return localizeTechnicalText(`${value.slice(0, start)}${match.label}${value.slice(start + match.candidate.length)}`)
}

export function stateChangeLabel(change: StateChange, campaign?: Campaign) {
  if (change.kind !== 'resource' && change.kind !== 'health') return localizeTechnicalText(change.label)
  const resources = resourcesForChange(change, campaign)
  const separator = change.label.lastIndexOf(': ')
  const owner = separator < 0 ? '' : change.label.slice(0, separator + 2)
  const rawLabel = separator < 0 ? change.label : change.label.slice(separator + 2)
  const normalized = rawLabel.toLocaleLowerCase('ru-RU')
  const match = resourceCandidates(resources ?? [], true).find(({ candidate }) => {
    const key = candidate.toLocaleLowerCase('ru-RU')
    const boundary = rawLabel.slice(candidate.length, candidate.length + 1)
    return normalized.startsWith(key) && (!boundary || /[\s:+−-]/u.test(boundary))
  })
  const localizedResource = match
    ? `${match.label}${rawLabel.slice(match.candidate.length)}`
    : resourceUiLabel(rawLabel, resources)
  return `${localizeTechnicalText(owner)}${localizedResource}`
}
