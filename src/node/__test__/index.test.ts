import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as node from '../index'

describe('node entry', () => {
  it('re-exports the core surface', () => {
    expect(typeof node.createHabicron).toBe('function')
    expect(typeof node.habicron).toBe('function')
    expect(typeof node.dur).toBe('function')
    expect(typeof node.normalize).toBe('function')
    expect(typeof node.resolveJitter).toBe('function')
    expect(typeof node.longTimeout).toBe('function')
  })

  describe('createHabicron (headless)', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('schedules without any framework present', async () => {
      const cb = vi.fn()
      const job = node.createHabicron(cb, { every: '5s' })
      expect(job.isActive).toBe(true)
      await vi.advanceTimersByTimeAsync(15_000)
      expect(cb).toHaveBeenCalledTimes(3)
      job.stop()
      expect(job.isActive).toBe(false)
    })

    it('exposes nextRun as a Date while active', async () => {
      const job = node.createHabicron(() => {}, { every: '5s' })
      expect(job.nextRun).toBeInstanceOf(Date)
      job.stop()
      expect(job.nextRun).toBeNull()
    })
  })
})
