import type { Campaign, CampaignEditRequest, CampaignEditResponse, OperationProgress, TurnRequest, TurnResponse, WorldGenerationRequest, WorldIdea, WorldIdeaRequest } from '../../shared/types'

class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
  }
}

const transientStatuses = new Set([408, 425, 429, 500, 502, 503, 504])

function abortableDelay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Операция отменена', 'AbortError'))
    const timer = window.setTimeout(resolve, milliseconds)
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer)
      reject(new DOMException('Операция отменена', 'AbortError'))
    }, { once: true })
  })
}

async function fetchJson<T>(url: string, init: RequestInit, signal?: AbortSignal, attempts = 4): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal })
      const text = await response.text()
      let data: any
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        throw new ApiError('Сервер вернул некорректный ответ. Запрос можно безопасно повторить.', response.status)
      }
      if (!response.ok) {
        const error = new ApiError(data?.error || `Ошибка сервера ${response.status}`, response.status)
        if (!transientStatuses.has(response.status) || attempt === attempts - 1) throw error
        lastError = error
      } else {
        if (data === null || typeof data !== 'object') throw new ApiError('Сервер вернул пустой ответ. Ход не был применён.')
        return data as T
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      lastError = error
      if (error instanceof ApiError && error.status && !transientStatuses.has(error.status)) throw error
      if (attempt === attempts - 1) break
    }
    await abortableDelay(600 * (attempt + 1), signal)
  }
  const detail = lastError instanceof ApiError ? lastError.message : 'Связь с сервером временно потеряна.'
  throw new ApiError(`${detail} Выполнены автоматические повторы; ваша история не повреждена.`)
}

interface JobState<T> {
  id: string
  status: 'pending' | 'complete' | 'failed'
  result?: T
  error?: string
  progress?: OperationProgress
}

async function runJob<T>(kind: 'turn' | 'world' | 'idea' | 'edit', payload: unknown, signal?: AbortSignal, onProgress?: (progress: OperationProgress) => void): Promise<T> {
  const requestId = crypto.randomUUID()
  const create = () => fetchJson<JobState<T>>(`/api/jobs/${kind}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId, payload }),
  }, signal)
  let job = await create()
  if (job.progress) onProgress?.(job.progress)
  let recreated = false
  try {
    while (job.status === 'pending') {
      await abortableDelay(1_250, signal)
      try {
        job = await fetchJson<JobState<T>>(`/api/jobs/${kind}/${job.id}`, { method: 'GET' }, signal)
        if (job.progress) onProgress?.(job.progress)
      } catch (error) {
        if (error instanceof ApiError && error.status === 404 && !recreated) {
          recreated = true
          job = await create()
          if (job.progress) onProgress?.(job.progress)
          continue
        }
        throw error
      }
    }
    if (job.status === 'failed') throw new ApiError(job.error || 'Операция на сервере завершилась с ошибкой.')
    if (job.result === null || job.result === undefined) throw new ApiError('Сервер завершил операцию без результата.')
    return job.result
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') void fetch(`/api/jobs/${kind}/${job.id}`, { method: 'DELETE' }).catch(() => undefined)
    throw error
  }
}

export async function takeTurn(request: TurnRequest, signal?: AbortSignal, onProgress?: (progress: OperationProgress) => void): Promise<TurnResponse> {
  const campaign = { ...request.campaign, snapshots: [] }
  const result = await runJob<TurnResponse>('turn', { ...request, campaign }, signal, onProgress)
  if (!result || typeof result.narrative !== 'string' || !Array.isArray(result.suggestions) || !result.statePatch || typeof result.statePatch !== 'object' || Array.isArray(result.statePatch)) {
    throw new ApiError('Сервер вернул неполный ход. Он не был применён к истории.')
  }
  return result
}

export async function generateCampaign(request: WorldGenerationRequest, signal?: AbortSignal, onProgress?: (progress: OperationProgress) => void): Promise<Campaign> {
  return runJob<Campaign>('world', request, signal, onProgress)
}

export async function inventWorldIdea(request: WorldIdeaRequest, signal?: AbortSignal, onProgress?: (progress: OperationProgress) => void): Promise<WorldIdea> {
  return runJob<WorldIdea>('idea', request, signal, onProgress)
}

export async function editCampaign(request: CampaignEditRequest, signal?: AbortSignal, onProgress?: (progress: OperationProgress) => void): Promise<CampaignEditResponse> {
  const campaign = { ...request.campaign, snapshots: [] }
  return runJob<CampaignEditResponse>('edit', { ...request, campaign }, signal, onProgress)
}

export async function checkApi(): Promise<boolean> {
  try {
    const response = await fetch('/api/health')
    return response.ok
  } catch {
    return false
  }
}
