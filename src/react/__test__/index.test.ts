import { act, renderHook } from '@testing-library/react'
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHabicron, useRandomCronjob } from '../index'

describe('useRandomCronjob (react)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns plain values that increment as the callback fires', async () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useRandomCronjob(cb, { every: '10s' }))
    expect(result.current.counter).toBe(0)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })
    expect(result.current.counter).toBe(2)
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('omits control members unless controls: true', () => {
    const { result } = renderHook(() => useRandomCronjob(() => {}, { every: '1h' }))
    expect('pause' in result.current).toBe(false)
  })

  it('exposes controls when requested', async () => {
    const cb = vi.fn()
    const { result } = renderHook(() =>
      useRandomCronjob(cb, { controls: true, every: '10s' }),
    )
    expect(result.current.isActive).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(result.current.counter).toBe(1)
    act(() => result.current.pause())
    expect(result.current.isActive).toBe(false)
  })

  it('stops timers on unmount', async () => {
    const cb = vi.fn()
    const { unmount } = renderHook(() => useRandomCronjob(cb, { every: '10s' }))
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(cb).not.toHaveBeenCalled()
  })

  it('exposes useHabicron as an alias', () => {
    expect(useHabicron).toBe(useRandomCronjob)
  })
})
