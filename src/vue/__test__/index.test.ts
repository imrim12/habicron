// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isReadonly } from 'vue'
import { useHabicron, useRandomCronjob } from '../index'

describe('useRandomCronjob (vue)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns readonly refs that increment as the callback fires', async () => {
    const cb = vi.fn()
    const { counter, nextRun } = useRandomCronjob(cb, { every: '10s' })
    expect(isReadonly(counter)).toBe(true)
    expect(counter.value).toBe(0)
    expect(nextRun.value).toBeInstanceOf(Date)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(counter.value).toBe(2)
  })

  it('omits control members unless controls: true', () => {
    const result = useRandomCronjob(() => {}, { every: '1h' })
    expect('pause' in result).toBe(false)
    expect('isActive' in result).toBe(false)
  })

  it('exposes controls when requested', async () => {
    const cb = vi.fn()
    const job = useRandomCronjob(cb, { controls: true, every: '10s' })
    expect(job.isActive.value).toBe(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(job.counter.value).toBe(1)
    job.pause()
    expect(job.isActive.value).toBe(false)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(job.counter.value).toBe(1)
    job.reset()
    expect(job.counter.value).toBe(0)
  })

  it('exposes useHabicron as an alias', () => {
    expect(useHabicron).toBe(useRandomCronjob)
  })

  it('does not start timers during SSR (no window)', async () => {
    const original = globalThis.window
    // @ts-expect-error simulate a server environment
    delete globalThis.window
    try {
      const cb = vi.fn()
      const { counter } = useRandomCronjob(cb, { every: '10s' })
      await vi.advanceTimersByTimeAsync(30_000)
      expect(cb).not.toHaveBeenCalled()
      expect(counter.value).toBe(0)
    }
    finally {
      globalThis.window = original
    }
  })
})
