import { describe, expect, it } from 'vitest'
import { OperationJobs } from './operation-jobs'

describe('long-running operation jobs', () => {
  it('deduplicates a retried request and exposes the completed result', async () => {
    const jobs = new OperationJobs<{ value: number }>()
    let calls = 0
    const first = jobs.start('request-1', async () => {
      calls += 1
      return { value: 42 }
    })
    const duplicate = jobs.start('request-1', async () => {
      calls += 1
      return { value: 0 }
    })

    expect(duplicate.id).toBe(first.id)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(jobs.get(first.id)).toMatchObject({ status: 'complete', result: { value: 42 } })
    expect(calls).toBe(1)
  })

  it('returns a useful failed state instead of an unhandled rejection', async () => {
    const jobs = new OperationJobs<never>()
    const job = jobs.start('request-2', async () => { throw new Error('обрыв провайдера') })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(jobs.get(job.id)).toMatchObject({ status: 'failed', error: 'обрыв провайдера' })
  })

  it('exposes real monotonic stage progress while work is still running', async () => {
    const jobs = new OperationJobs<number>()
    let finish!: () => void
    const gate = new Promise<void>((resolve) => { finish = resolve })
    const job = jobs.start('request-progress', async (report) => {
      report({ percent: 37, stage: 'drafting', detail: 'Пишем сцену', completedSteps: 4, totalSteps: 9 })
      report({ percent: 22, stage: 'stale', detail: 'Устаревшее событие' })
      await gate
      return 7
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(jobs.get(job.id)).toMatchObject({ status: 'pending', progress: { percent: 37, stage: 'drafting' } })
    finish()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(jobs.get(job.id)).toMatchObject({ status: 'complete', result: 7, progress: { percent: 100, stage: 'complete' } })
  })

  it('retains a result for the full TTL after a very long job finishes', async () => {
    let now = 0
    let finish!: () => void
    const gate = new Promise<void>((resolve) => { finish = resolve })
    const jobs = new OperationJobs<number>(1_000, () => now)
    const job = jobs.start('longer-than-ttl', async () => {
      await gate
      return 42
    })

    await new Promise((resolve) => setTimeout(resolve, 0))
    now = 60_000
    expect(jobs.get(job.id)).toMatchObject({ status: 'pending' })

    finish()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(jobs.get(job.id)).toMatchObject({ status: 'complete', result: 42 })

    now = 61_001
    expect(jobs.get(job.id)).toBeUndefined()
  })
})
