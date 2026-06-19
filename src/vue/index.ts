/**
 * habicron — Vue adapter.
 *
 * Wraps the core engine in Vue refs via `useHabit`.
 */
import type { Ref } from 'vue'
import type { HabitSummary, Schedule } from '../core'
import { getCurrentScope, onScopeDispose, readonly, ref } from 'vue'
import { createHabit, listHabits, subscribeHabits } from '../core'

export type { Duration, HabitSummary, Jitter, Period, Schedule } from '../core'

export interface VueControlFlags {
  /** Fire once immediately on start (counts toward `counter`). */
  immediate?: boolean
  /** Expose `pause`, `resume`, `reset`, `isActive` on the return value. */
  controls?: boolean
  /** Random source in `[0, 1)`. Defaults to `Math.random`. */
  random?: () => number
}

/** A single inline schedule, or an explicit list of overlapping habits. */
export type UseHabitOptions = VueControlFlags & (Schedule | { habits: Schedule[] })

export interface HabitBase {
  /** Total number of times the callback has fired. */
  readonly counter: Readonly<Ref<number>>
  /** Earliest upcoming fire across all habits, or `null` when stopped. */
  readonly nextRun: Readonly<Ref<Date | null>>
}

export interface HabitControls {
  readonly isActive: Readonly<Ref<boolean>>
  pause: () => void
  resume: () => void
  /** Reset `counter` to 0 and, if active, restart all habits from now. */
  reset: () => void
}

/**
 * Schedule a callback on randomized recurring intervals — a "habit" engine.
 *
 * Accurate by default (evenly spaced, anchored to start time, no drift).
 * Add `jitter` to perturb each fire by a bounded random amount. Control members
 * (`pause`/`resume`/`reset`/`isActive`) are returned only with `controls: true`
 * — expressed via overloads, so the return type is exact with no casting.
 *
 * @example
 * useHabit(act, { every: '2h ~ 5m' })
 *
 * @example
 * const { counter, nextRun, pause } = useHabit(act, {
 *   controls: true,
 *   habits: [
 *     { every: '20s', jitter: ['3s', '5s'] },
 *     { times: 2, per: 'day', jitter: '2h' },
 *   ],
 * })
 */
export function useHabit(
  callback: () => void | Promise<void>,
  options: UseHabitOptions & { controls: true },
): HabitBase & HabitControls
export function useHabit(
  callback: () => void | Promise<void>,
  options: UseHabitOptions,
): HabitBase
export function useHabit(
  callback: () => void | Promise<void>,
  options: UseHabitOptions,
): HabitBase | (HabitBase & HabitControls) {
  const { controls = false } = options

  const counter = ref(0)
  const isActive = ref(false)
  const nextRun = ref<Date | null>(null)

  const ctrl = createHabit(callback, {
    ...options,
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
      ctrl.destroy()
    })
  }

  const base: HabitBase = { counter: readonly(counter), nextRun: readonly(nextRun) }
  if (!controls)
    return base

  return {
    ...base,
    isActive: readonly(isActive),
    pause: ctrl.pause,
    resume: ctrl.resume,
    reset: ctrl.reset,
  }
}

/**
 * Reactively list every registered habit (from `createHabit` / `useHabit`).
 * The returned ref updates as habits are added, removed, or change state —
 * a ready-made management view.
 *
 * @example
 * const habits = useHabits()
 * // habits.value -> [{ id, name, isActive, counter, nextRun }, …]
 */
export function useHabits() {
  const habits = ref<HabitSummary[]>([])
  let perHabit: Array<() => void> = []

  const refresh = () => {
    habits.value = listHabits().map(h => ({
      id: h.id,
      name: h.name,
      isActive: h.isActive,
      counter: h.counter,
      nextRun: h.nextRun,
    }))
  }
  const resubscribe = () => {
    for (const u of perHabit) u()
    perHabit = listHabits().map(h => h.subscribe(refresh))
    refresh()
  }
  resubscribe()
  const unsubscribeRegistry = subscribeHabits(resubscribe)

  if (getCurrentScope()) {
    onScopeDispose(() => {
      unsubscribeRegistry()
      for (const u of perHabit) u()
    })
  }

  return readonly(habits)
}
