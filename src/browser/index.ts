/**
 * habicron — browser adapter.
 *
 * Framework-agnostic reactivity for plain browser apps. Vanilla JS has no refs
 * or component state, so habicron delivers state changes through callbacks
 * instead: `onActive` (running state flipped), `onFire` (fired), and `onChange`
 * (any change, with a snapshot). The scheduler is the same core engine.
 *
 * @example
 * import { useHabit } from 'habicron/browser'
 *
 * useHabit(() => refreshWidget(), {
 *   every: '20s ~ 4s',
 *   onFire: count => badge.textContent = String(count),
 *   onActive: active => dot.classList.toggle('live', active),
 * })
 */
import type { HabitController, HabitOptions, HabitSummary } from '../core'
import { createHabit as createCore } from '../core'

export {
  clearHabits,
  createHabit,
  getHabit,
  listHabits,
  subscribeHabits,
} from '../core'

export type {
  ControlFlags,
  Duration,
  HabitController,
  HabitOptions,
  HabitSummary,
  Jitter,
  Period,
  Schedule,
} from '../core'

export interface HabitCallbacks {
  /** Called when the running state flips, and once on creation. */
  onActive?: (isActive: boolean) => void
  /** Called after each fire, with the new total count. */
  onFire?: (counter: number) => void
  /** Called on any state change, with a plain snapshot. */
  onChange?: (summary: HabitSummary) => void
}

/** Schedule + control flags, plus the browser reactivity callbacks. */
export type UseHabitOptions = HabitOptions & HabitCallbacks

function summarize(ctrl: HabitController): HabitSummary {
  return {
    id: ctrl.id,
    name: ctrl.name,
    isActive: ctrl.isActive,
    counter: ctrl.counter,
    nextRun: ctrl.nextRun,
  }
}

/**
 * Create a habit and wire its state changes to callbacks. Returns the
 * {@link HabitController} so you can `pause`/`resume`/`update`/`destroy` it.
 *
 * SSR-safe: timers don't start unless a `window` is present (override with
 * `autoStart`).
 */
export function useHabit(
  callback: () => void | Promise<void>,
  options: UseHabitOptions,
): HabitController {
  const { onActive, onFire, onChange } = options
  const ctrl = createCore(callback, {
    ...options,
    autoStart: options.autoStart ?? typeof window !== 'undefined',
  })

  let prevActive = ctrl.isActive
  let prevCounter = ctrl.counter
  ctrl.subscribe(() => {
    if (ctrl.isActive !== prevActive) {
      prevActive = ctrl.isActive
      onActive?.(ctrl.isActive)
    }
    if (ctrl.counter !== prevCounter) {
      prevCounter = ctrl.counter
      onFire?.(ctrl.counter)
    }
    onChange?.(summarize(ctrl))
  })

  // Deliver the initial state once so callers can render immediately.
  onActive?.(ctrl.isActive)
  onChange?.(summarize(ctrl))

  return ctrl
}
