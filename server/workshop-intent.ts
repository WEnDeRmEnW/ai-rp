import type { Campaign, CampaignEditResponse, NPC } from '../shared/types.js'

export interface WorkshopResurrectionIntent {
  mode: 'apply' | 'enable'
  targetNpcId?: string
  targetNpcName?: string
  ambiguousTargetNames: string[]
}

function normalize(value: string) {
  return value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function resurrectionTarget(campaign: Campaign, instruction: string) {
  const dead = campaign.npcs.filter((npc) => npc.status === 'dead')
  const instructionText = normalize(instruction)
  const explicit = dead.filter((npc) => {
    const name = normalize(npc.name)
    return name.length >= 3 && instructionText.includes(name)
  })
  if (explicit.length === 1) return { target: explicit[0], ambiguous: [] as NPC[] }
  if (explicit.length > 1) return { target: undefined, ambiguous: explicit }

  const sources = [
    ...[...campaign.messages].reverse().slice(0, 16).map((message) => message.content),
    ...[...campaign.memories].reverse().slice(0, 24).map((memory) => memory.content),
  ]
  for (const source of sources) {
    const text = normalize(source)
    const mentioned = dead.filter((npc) => {
      const name = normalize(npc.name)
      return name.length >= 3 && text.includes(name)
    })
    if (mentioned.length === 1) return { target: mentioned[0], ambiguous: [] as NPC[] }
    if (mentioned.length > 1) return { target: undefined, ambiguous: mentioned }
  }

  return dead.length === 1
    ? { target: dead[0], ambiguous: [] as NPC[] }
    : { target: undefined, ambiguous: dead }
}

export function detectWorkshopResurrectionIntent(campaign: Campaign, instruction: string): WorkshopResurrectionIntent | undefined {
  const text = normalize(instruction)
  if (!/(?:воскрес|воскреш|ожив|верн\p{L}* к жизни)/u.test(text)) return undefined

  const directResult = /(?:получил\p{L}*|успешн\p{L}*|на самом деле|в итоге|все таки|уже)\s+[^.!?]{0,100}(?:воскрес|воскреш|ожив|верн\p{L}* к жизни)/u.test(text)
    || /(?:воскреси|оживи|воскресить его|воскресить ее|пусть\s+[^.!?]{0,80}(?:воскрес|ожив)|верни\s+[^.!?]{0,80}к жизни)/u.test(text)
  const capabilityOnly = /(?:мог\p{L}*|можно|возможн\p{L}*|способн\p{L}*|механик\p{L}*|способност\p{L}*)\s+[^.!?]{0,100}(?:воскрес|воскреш|ожив|верн\p{L}* к жизни)/u.test(text)
    && !directResult
  const { target, ambiguous } = resurrectionTarget(campaign, instruction)

  return {
    mode: capabilityOnly ? 'enable' : 'apply',
    targetNpcId: target?.id,
    targetNpcName: target?.name,
    ambiguousTargetNames: ambiguous.map((npc) => npc.name),
  }
}

function materialObject(value: unknown) {
  if (value === undefined || value === null) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value as object).length > 0
  return true
}

function includesResurrectionSuccess(value: string) {
  const text = normalize(value)
  return /(?:воскрес|воскрешен|ожил|возвращен к жизни|вернулся к жизни)/u.test(text)
    && !/(?:не удалось|неуспеш|не произошло|остал\p{L}* мертв|провал)/u.test(text)
}

export function workshopStateResponseIssues(campaign: Campaign, instruction: string, response: CampaignEditResponse) {
  const issues: string[] = []
  const hasMaterialChange = materialObject(response.campaignPatch)
    || materialObject(response.settingsPatch)
    || materialObject(response.statePatch)
    || Boolean(response.eventDirective)
  if (!hasMaterialChange) issues.push('Ответ содержит только summary и не меняет ни одной запрошенной сущности.')

  const intent = detectWorkshopResurrectionIntent(campaign, instruction)
  if (!intent || (response.eventDirective && response.eventDirective.delivery !== 'apply-now')) return issues
  if (!intent.targetNpcId || !intent.targetNpcName) {
    issues.push(intent.ambiguousTargetNames.length
      ? `Не удалось однозначно определить воскрешаемого NPC; возможные цели: ${intent.ambiguousTargetNames.join(', ')}.`
      : 'Не удалось определить точный id воскрешаемого NPC из текущей переписки и состояния.')
    return issues
  }

  if (intent.mode === 'enable') {
    const patchText = JSON.stringify({
      abilityChanges: response.statePatch.abilityChanges,
      artifactChanges: response.statePatch.artifactChanges,
      mechanics: response.statePatch.world?.upsertMechanics,
      rules: response.statePatch.world?.addRules,
      lore: response.statePatch.lore,
    })
    if (!includesResurrectionSuccess(patchText) && !/(?:воскрес|воскреш|ожив|верн\p{L}* к жизни)/u.test(normalize(patchText))) {
      issues.push('Запрошенная возможность воскрешения не добавлена ни в способность, ни в артефакт, ни в механику или лор мира.')
    }
    return issues
  }

  const mutation = response.statePatch.npcs?.find((entry) => entry.operation === 'update' && entry.targetId === intent.targetNpcId)
  if (!mutation || mutation.operation !== 'update' || mutation.npc.status !== 'active') {
    issues.push(`Успешное воскрешение требует npcs update для «${intent.targetNpcName}» с targetId=${intent.targetNpcId} и status=active.`)
    return issues
  }

  const current = campaign.npcs.find((npc) => npc.id === intent.targetNpcId)
  const healthKeys = (current?.resources ?? []).filter((resource) => resource.kind === 'health').map((resource) => resource.key)
  if (healthKeys.length) {
    const restoredByUpsert = [...(mutation.npc.resources ?? []), ...(mutation.npc.upsertResources ?? [])]
      .some((resource) => healthKeys.includes(resource.key) && resource.value > 0)
    const restoredByDelta = Object.entries(mutation.npc.resourceDeltas ?? {})
      .some(([key, delta]) => healthKeys.includes(key) && delta > 0)
    if (!restoredByUpsert && !restoredByDelta) {
      issues.push(`«${intent.targetNpcName}» нельзя сделать active с нулевым здоровьем: восстанови его настоящий health-ресурс через npc.resources/upsertResources или resourceDeltas.`)
    }
  }

  const memoryRecorded = (response.statePatch.memories ?? []).some((memory) => (
    normalize(memory.content).includes(normalize(intent.targetNpcName!)) && includesResurrectionSuccess(memory.content)
  ))
  if (!memoryRecorded) issues.push(`Зафиксируй успешное воскрешение «${intent.targetNpcName}» новой фактической memory, не удаляя историю прежних неудачных попыток.`)

  const scenePresent = response.statePatch.scene?.presentNpcIds?.includes(intent.targetNpcId)
  if (campaign.scene.presentNpcIds.length === 0 && !scenePresent) {
    issues.push(`После воскрешения в текущем месте добавь «${intent.targetNpcName}» в scene.presentNpcIds и обнови его lastSeen.`)
  }
  return [...new Set(issues)]
}
