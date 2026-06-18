import type { Schedule } from '../core'
/**
 * habicron — React adapter.
 *
 * Wraps the core engine in React state. Unlike the Vue adapter (which exposes
 * refs), this returns plain values that re-render the component on each change.
 * The controller is created inside `useEffect`, so it is naturally SSR-safe.
 * The hook is `useHabit`.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createHabit } from '../core'

export type { Duration, Jitter, Period, Schedule } from '../core'

export interface ReactControlFlags {
  /** Fire once immediately on start (counts toward `counter`). */
  immediate?: boolean
  /** Expose `pause`, `resume`, `reset`, `isActive` on the return value. */
  controls?: boolean
  /** Random source in `[0, 1)`. Defaults to `Math.random`. */
  random?: () => number
}

/** A single inline schedule, or an explicit list of overlapping habits. */
export type UseHabitOptions = ReactControlFlags & (Schedule | { habits: Schedule[] })

export interface HabitBase {
  /** Total number of times the callback has fired. */
  counter: number
  /** Earliest upcoming fire across all habits, or `null` when stopped. */
  nextRun: Date | null
}

export interface HabitControls {
  isActive: boolean
  pause: () => void
  resume: () => void
  /** Reset `counter` to 0 and, if active, restart all habits from now. */
  reset: () => void
}

/** Control members exist only when `controls: true` is passed. */
export type UseHabitReturn<O extends UseHabitOptions>
  = HabitBase & (O extends { controls: true } ? HabitControls : unknown)

interface State {
  counter: number
  isActive: boolean
  nextRun: Date | null
}

/**
 * Schedule a callback on randomized recurring intervals — a "habit" engine.
 *
 * Accurate by default (evenly spaced, anchored to start time, no drift).
 * Add `jitter` to perturb each fire by a bounded random amount.
 *
 * The schedule is captured once when the component mounts; the callback is
 * always read fresh, so closing over changing props is safe.
 *
 * @example
 * const { counter, nextRun, pause } = useHabit(act, {
 *   controls: true,
 *   every: '20s ± 4s',
 * })
 */
export function useHabit<const O extends UseHabitOptions>(
  callback: () => void | Promise<void>,
  options: O,
): UseHabitReturn<O> {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  // Snapshot options once — re-runs only when the serialised schedule changes.
  const optionsKey = JSON.stringify(options, (_k: string, v: unknown) =>
    typeof v === 'function' ? undefined : v)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const [state, setState] = useState<State>({ counter: 0, isActive: false, nextRun: null })
  const controlRef = useRef<ReturnType<typeof createHabit> | null>(null)

  useEffect(() => {
    const ctrl = createHabit(async () => callbackRef.current(), {
      ...(optionsRef.current as Schedule & ReactControlFlags),
      autoStart: true,
    })
    controlRef.current = ctrl
    const sync = () => {
      // Intentional: this is an external-store subscription. The controller is
      // the source of truth; we mirror its state into React on every change and
      // once on mount (it has already started before we subscribed).
      // eslint-disable-next-line react/set-state-in-effect
      setState({ counter: ctrl.counter, isActive: ctrl.isActive, nextRun: ctrl.nextRun })
    }
    const unsubscribe = ctrl.subscribe(sync)
    sync()
    return () => {
      unsubscribe()
      ctrl.stop()
      controlRef.current = null
    }
  }, [optionsKey])

  const pause = useCallback(() => controlRef.current?.pause(), [])
  const resume = useCallback(() => controlRef.current?.resume(), [])
  const reset = useCallback(() => controlRef.current?.reset(), [])

  const base = { counter: state.counter, nextRun: state.nextRun }
  if (!options?.controls)
    return base as UseHabitReturn<O>

  return {
    ...base,
    isActive: state.isActive,
    pause,
    resume,
    reset,
  }
}
