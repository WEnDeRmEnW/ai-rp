import { randomUUID } from 'node:crypto'
import type { OperationProgress } from '../shared/types.js'

export type OperationJobSnapshot<T> =
  | { id: string; status: 'pending'; createdAt: number; progress: OperationProgress }
  | { id: string; status: 'complete'; createdAt: number; result: T; progress: OperationProgress }
  | { id: string; status: 'failed'; createdAt: number; error: string; progress: OperationProgress }

interface OperationJob<T> {
  id: string
  requestId: string
  status: 'pending' | 'complete' | 'failed'
  createdAt: number
  result?: T
  error?: string
  progress: OperationProgress
}

const DEFAULT_TTL = 30 * 60 * 1000

export class OperationJobs<T> {
  private readonly jobs = new Map<string, OperationJob<T>>()
  private readonly requestIds = new Map<string, string>()

  constructor(private readonly ttlMs = DEFAULT_TTL) {}

  start(requestId: string, work: (report: (progress: OperationProgress) => void) => Promise<T>): OperationJobSnapshot<T> {
    this.prune()
    const previousId = this.requestIds.get(requestId)
    const previous = previousId ? this.jobs.get(previousId) : undefined
    if (previous) return this.snapshot(previous)

    const job: OperationJob<T> = {
      id: randomUUID(),
      requestId,
      status: 'pending',
      createdAt: Date.now(),
      progress: { percent: 1, stage: 'queued', detail: 'Задача поставлена в очередь' },
    }
    this.jobs.set(job.id, job)
    this.requestIds.set(requestId, job.id)

    const report = (progress: OperationProgress) => {
      if (job.status !== 'pending') return
      if (Math.round(progress.percent) < job.progress.percent) return
      job.progress = { ...progress, percent: Math.max(job.progress.percent, Math.min(99, Math.round(progress.percent))) }
    }
    void Promise.resolve().then(() => work(report)).then((result) => {
      job.status = 'complete'
      job.result = result
      job.progress = { percent: 100, stage: 'complete', detail: 'Готово', completedSteps: job.progress.totalSteps, totalSteps: job.progress.totalSteps }
    }).catch((cause) => {
      job.status = 'failed'
      job.error = cause instanceof Error ? cause.message : String(cause)
    })

    return this.snapshot(job)
  }

  get(id: string): OperationJobSnapshot<T> | undefined {
    this.prune()
    const job = this.jobs.get(id)
    return job ? this.snapshot(job) : undefined
  }

  forget(id: string): boolean {
    const job = this.jobs.get(id)
    if (!job) return false
    this.jobs.delete(id)
    if (this.requestIds.get(job.requestId) === id) this.requestIds.delete(job.requestId)
    return true
  }

  private prune() {
    const cutoff = Date.now() - this.ttlMs
    for (const [id, job] of this.jobs) {
      if (job.status === 'pending' || job.createdAt >= cutoff) continue
      this.forget(id)
    }
  }

  private snapshot(job: OperationJob<T>): OperationJobSnapshot<T> {
    if (job.status === 'complete') return { id: job.id, status: 'complete', createdAt: job.createdAt, result: job.result as T, progress: job.progress }
    if (job.status === 'failed') return { id: job.id, status: 'failed', createdAt: job.createdAt, error: job.error ?? 'Операция завершилась с ошибкой.', progress: job.progress }
    return { id: job.id, status: 'pending', createdAt: job.createdAt, progress: job.progress }
  }
}
