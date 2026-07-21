import type { Campaign, CampaignEditRequest, CampaignEditResponse, OperationProgress, TurnRequest, TurnResponse, WorldGenerationRequest, WorldQuestionRequest, WorldQuestionResponse } from '../../shared/types'

class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
  }
}

const transientStatuses = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526])
const JOB_RECONNECT_WINDOW_MS = 30 * 60 * 1000

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
        const preview = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)
        if (response.status === 404 && url.includes('/api/jobs/')) {
          throw new ApiError('Локальный сервер приложения использует старую версию. Перезапустите сайт и обновите страницу — история не повреждена.', response.status)
        }
        if (response.status === 429) {
          throw new ApiError('Сервер временно ограничил частоту запросов. Подождите несколько секунд и повторите.', response.status)
        }
        const detail = preview && !/^(404|502|503|504)$/i.test(preview) ? ` Ответ: ${preview}` : ''
        throw new ApiError(`Сервер вернул ответ в неизвестном формате.${detail} Кампания не изменена.`, response.status)
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

function isTransientJobConnectionError(error: unknown) {
  return error instanceof ApiError && (error.status === undefined || transientStatuses.has(error.status))
}

async function runJob<T>(kind: 'turn' | 'world' | 'edit' | 'question', payload: unknown, signal?: AbortSignal, onProgress?: (progress: OperationProgress) => void): Promise<T> {
  const requestId = crypto.randomUUID()
  const create = () => fetchJson<JobState<T>>(`/api/jobs/${kind}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId, payload }),
  }, signal)
  let connectionLostAt: number | undefined
  let connectionFailures = 0
  let lastProgress: OperationProgress = { percent: 1, stage: 'connecting', detail: 'Соединяемся с сервером' }

  const reconnect = async (error: unknown) => {
    if (!isTransientJobConnectionError(error)) throw error
    connectionLostAt ??= Date.now()
    connectionFailures += 1
    if (Date.now() - connectionLostAt > JOB_RECONNECT_WINDOW_MS) throw error
    onProgress?.({
      ...lastProgress,
      stage: 'reconnecting',
      detail: 'Связь прервалась — восстанавливаем её, сервер продолжает работу',
    })
    await abortableDelay(Math.min(10_000, 1_000 * connectionFailures), signal)
  }

  const startOrResume = async (): Promise<JobState<T>> => {
    while (true) {
      try {
        const started = await create()
        connectionLostAt = undefined
        connectionFailures = 0
        return started
      } catch (error) {
        await reconnect(error)
      }
    }
  }
  let job = await startOrResume()
  if (job.progress) onProgress?.(job.progress)
  if (job.progress) lastProgress = job.progress
  let recreated = false
  try {
    while (job.status === 'pending') {
      // Polling does not accelerate generation. A calmer interval keeps the public endpoint
      // healthy during long world builds and still updates progress promptly.
      const elapsed = job.progress?.elapsedMs ?? 0
      await abortableDelay(elapsed > 120_000 ? 3_000 : elapsed > 30_000 ? 1_500 : 750, signal)
      try {
        job = await fetchJson<JobState<T>>(`/api/jobs/${kind}/${job.id}`, { method: 'GET' }, signal)
        connectionLostAt = undefined
        connectionFailures = 0
        if (job.progress) {
          lastProgress = job.progress
          onProgress?.(job.progress)
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 404 && !recreated) {
          recreated = true
          job = await startOrResume()
          if (job.progress) {
            lastProgress = job.progress
            onProgress?.(job.progress)
          }
          continue
        }
        await reconnect(error)
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

export async function editCampaign(request: CampaignEditRequest, signal?: AbortSignal, onProgress?: (progress: OperationProgress) => void): Promise<CampaignEditResponse> {
  const campaign = { ...request.campaign, snapshots: [] }
  return runJob<CampaignEditResponse>('edit', { ...request, campaign }, signal, onProgress)
}

export async function askWorldQuestion(request: WorldQuestionRequest, signal?: AbortSignal, onProgress?: (progress: OperationProgress) => void): Promise<WorldQuestionResponse> {
  const campaign = { ...request.campaign, snapshots: [] }
  const result = await runJob<WorldQuestionResponse>('question', { ...request, campaign }, signal, onProgress)
  if (!result || typeof result.answer !== 'string' || !result.answer.trim() || !['known', 'complete'].includes(result.scope) || typeof result.generatedAt !== 'string') {
    throw new ApiError('Сервер вернул неполную справку. Кампания не изменена.')
  }
  return result
}

export async function checkApi(): Promise<boolean> {
  try {
    const response = await fetch('/api/health')
    return response.ok
  } catch {
    return false
  }
}
