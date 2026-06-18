/**
 * habicron — Node entry point.
 *
 * The default, framework-free surface. In Node (servers, workers, scripts)
 * there are no reactive primitives to bind to, so you drive the
 * {@link HabitController} directly.
 *
 * @example
 * import { createHabit } from 'habicron'
 *
 * const job = createHabit(() => fetchFeed(), { every: '15m ~ 2m' })
 * process.on('SIGINT', () => { job.stop(); process.exit(0) })
 */
export {
  clearHabits,
  createHabit,
  dur,
  getHabit,
  listHabits,
  longTimeout,
  normalize,
  resolveJitter,
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
