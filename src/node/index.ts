/**
 * habicron — Node entry point.
 *
 * The default, framework-free surface. In Node (servers, workers, scripts)
 * there are no reactive primitives to bind to, so you drive the
 * {@link HabicronController} directly.
 *
 * @example
 * import { createHabicron } from 'habicron'
 *
 * const job = createHabicron(() => fetchFeed(), { every: '15m ± 2m' })
 * process.on('SIGINT', () => { job.stop(); process.exit(0) })
 */
export {
  createHabicron,
  dur,
  longTimeout,
  normalize,
  resolveJitter,
} from '../core'

export type {
  ControlFlags,
  Duration,
  HabicronController,
  HabicronOptions,
  Jitter,
  Period,
  Schedule,
} from '../core'

export { createHabicron as habicron } from '../core'
