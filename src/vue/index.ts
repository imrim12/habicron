/**
 * habicron — Vue adapter.
 *
 * Wraps the core engine in Vue refs. The composable name `useRandomCronjob`
 * is kept for backward compatibility; `useHabicron` is the preferred alias.
 */
import { ref, readonly, getCurrentScope, onScopeDispose, type Ref } from 'vue'
import {
  createHabicron,
  type ControlFlags,
  type Schedule,
} from '../core'

export type { Duration, Jitter, Period, Schedule } from '../core'

export interface VueControlFlags {
  /** Fire once immediately on start (counts toward `counter`). */
  immediate?: boolean
  /** Expose `pause`, `resume`, `reset`, `isActive` on the return value. */
  controls?: boolean
  /** Random source in `[0, 1)`. Defaults to `Math.random`. */
  random?: () => number
}

/** A single inline schedule, or an explicit list of overlapping habits. */
export type UseRandomCronjobOptions = VueControlFlags & (Schedule | { habits: Schedule[] })

export interface RandomCronjobBase {
  /** Total number of times the callback has fired. */
  readonly counter: Readonly<Ref<number>>
  /** Earliest upcoming fire across all habits, or `null` when stopped. */
  readonly nextRun: Readonly<Ref<Date | null>>
}

export interface RandomCronjobControls {
  readonly isActive: Readonly<Ref<boolean>>
  pause: () => void
  resume: () => void
  /** Reset `counter` to 0 and, if active, restart all habits from now. */
  reset: () => void
}

/** Control members exist only when `controls: true` is passed. */
export type UseRandomCronjobReturn<O extends UseRandomCronjobOptions> =
  RandomCronjobBase & (O extends { controls: true } ? RandomCronjobControls : {})

/**
 * Schedule a callback on randomized recurring intervals — a "habit" engine.
 *
 * Accurate by default (evenly spaced, anchored to start time, no drift).
 * Add `jitter` to perturb each fire by a bounded random amount.
 *
 * @example
 * useRandomCronjob(act, { every: '2h ± 5m' })
 *
 * @example
 * const { counter, nextRun, pause } = useRandomCronjob(act, {
 *   controls: true,
 *   habits: [
 *     { every: '20s', jitter: ['3s', '5s'] },
 *     { times: 2, per: 'day', jitter: '2h' },
 *   ],
 * })
 */
export function useRandomCronjob<const O extends UseRandomCronjobOptions>(
  callback: () => void | Promise<void>,
  options: O,
): UseRandomCronjobReturn<O> {
  const { controls = false } = options ?? ({} as O)

  const counter = ref(0)
  const isActive = ref(false)
  const nextRun = ref<Date | null>(null)

  const ctrl = createHabicron(callback, {
    ...(options as ControlFlags & Schedule),
    // SSR guard: don't spin timers during server render.
    autoStart: typeof window !== 'undefined',
  })

  const sync = () => {
    counter.value = ctrl.counter
    isActive.value = ctrl.isActive
    nextRun.value = ctrl.nextRun
  }
  sync()
  const unsubscribe = ctrl.subscribe(sync)

  if (getCurrentScope()) {
    onScopeDispose(() => {
      unsubscribe()
      ctrl.stop()
    })
  }

  const base = { counter: readonly(counter), nextRun: readonly(nextRun) }
  if (!controls) return base as UseRandomCronjobReturn<O>

  return {
    ...base,
    isActive: readonly(isActive),
    pause: ctrl.pause,
    resume: ctrl.resume,
    reset: ctrl.reset,
  } as UseRandomCronjobReturn<O>
}

/** Preferred alias of {@link useRandomCronjob}, matching the package name. */
export const useHabicron = useRandomCronjob
