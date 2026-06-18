import type { Ref } from 'vue'

/** Milliseconds, or a duration string: '2h', '20s', '1h30m', '500ms', '3d'. */
export type Duration = number | string

/**
 * Jitter magnitude (sign is always random — fires land earlier OR later).
 * - `Duration`        -> max magnitude, min 0          e.g. '5m'
 * - `[min, max]`      -> bounded magnitude             e.g. ['3s', '5s']
 * - `{ min?, max }`   -> bounded magnitude, object form
 */
export type Jitter =
  | Duration
  | [min: Duration, max: Duration]
  | { min?: Duration; max: Duration }

export type Period = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'

/**
 * One recurring habit. Use `every` (interval between fires) or `times`/`per`
 * ("N times per period") — never both. Jitter lives inline.
 *
 * `every` also accepts a packed form: '2h ± 5m' (cadence ± max jitter).
 */
export type Schedule =
  | { every: Duration; jitter?: Jitter; times?: never; per?: never }
  | { times: number; per: Period; jitter?: Jitter; every?: never }

export interface ControlFlags {
  /** Fire once immediately on start (counts toward `counter`). */
  immediate?: boolean
  /** Expose `pause`, `resume`, `reset`, `isActive` on the return value. */
  controls?: boolean
}

/** A single inline schedule, or an explicit list of overlapping habits. */
export type UseRandomCronjobOptions =
  ControlFlags & (Schedule | { habits: Schedule[] })

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
  RandomCronjobBase &
    (O extends { controls: true } ? RandomCronjobControls : {})

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
export declare function useRandomCronjob<const O extends UseRandomCronjobOptions>(
  callback: () => void | Promise<void>,
  options: O
): UseRandomCronjobReturn<O>
