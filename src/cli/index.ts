#!/usr/bin/env node
import type { HabitOptions, Period, Schedule } from '../core'
/**
 * habit — the habicron CLI.
 *
 * Run a shell command on a randomized recurring schedule.
 *
 * @example
 *   habit --every "10s ~ 2s" -- echo "stretch"
 *   habit --times 3 --per hour --jitter 5m -- npm run sync
 *   habit --every 1h --immediate --max 5 -- ./backup.sh
 */
import { spawn } from 'node:child_process'
import process from 'node:process'
import { createHabit } from '../core'

export const VERSION = '0.2.0'

const PERIODS: Period[] = ['minute', 'hour', 'day', 'week', 'month', 'year']

export interface CliArgs {
  every?: string
  times?: number
  per?: Period
  jitter?: string
  immediate: boolean
  max?: number
  help: boolean
  version: boolean
  command: string[]
}

export interface ParseResult {
  args?: CliArgs
  error?: string
}

/** Parse `argv` (without `node` / script path) into structured CLI args. */
export function parseArgs(argv: string[]): ParseResult {
  const args: CliArgs = { immediate: false, help: false, version: false, command: [] }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--') {
      args.command = argv.slice(i + 1)
      break
    }
    switch (arg) {
      case '-h':
      case '--help':
        args.help = true
        break
      case '-v':
      case '--version':
        args.version = true
        break
      case '-i':
      case '--immediate':
        args.immediate = true
        break
      case '--every':
        args.every = argv[++i]
        break
      case '--times': {
        const n = Number(argv[++i])
        if (!Number.isFinite(n) || n <= 0)
          return { error: `--times expects a positive number, got "${argv[i]}"` }
        args.times = n
        break
      }
      case '--per':
        args.per = argv[++i] as Period
        if (!PERIODS.includes(args.per))
          return { error: `--per expects one of ${PERIODS.join(', ')}` }
        break
      case '--jitter':
        args.jitter = argv[++i]
        break
      case '--max': {
        const n = Number(argv[++i])
        if (!Number.isFinite(n) || n <= 0)
          return { error: `--max expects a positive number, got "${argv[i]}"` }
        args.max = n
        break
      }
      case '--exec':
        // everything after --exec is the command
        args.command = argv.slice(i + 1)
        i = argv.length
        break
      default:
        if (arg.startsWith('-'))
          return { error: `unknown option "${arg}"` }
        // bare token: treat the rest as the command
        args.command = argv.slice(i)
        i = argv.length
    }
  }

  return { args }
}

/** Build {@link HabitOptions} from parsed CLI args, or return an error. */
export function toOptions(args: CliArgs): { options?: HabitOptions, error?: string } {
  let schedule: Schedule | null = null
  if (args.every != null) {
    schedule = { every: args.every, ...(args.jitter != null ? { jitter: args.jitter } : {}) }
  }
  else if (args.times != null && args.per != null) {
    schedule = { times: args.times, per: args.per, ...(args.jitter != null ? { jitter: args.jitter } : {}) }
  }
  if (!schedule)
    return { error: 'a schedule is required: use --every <dur> or --times <n> --per <period>' }
  return { options: { ...schedule, immediate: args.immediate, autoStart: false } }
}

export const HELP = `habit v${VERSION} — run a command on a randomized recurring schedule

Usage:
  habit [options] -- <command...>

Schedule (one required):
  --every <dur>        interval between fires, e.g. "2h", "10s ~ 2s", "1h30m"
  --times <n>          N times ...
  --per <period>       ... per minute|hour|day|week|month|year

Options:
  --jitter <dur>       max random nudge applied to each fire, e.g. "5m"
  -i, --immediate      fire once immediately on start
  --max <n>            stop after N fires
  -h, --help           show this help
  -v, --version        print version

Examples:
  habit --every "10s ~ 2s" -- echo "stretch"
  habit --times 3 --per hour --jitter 5m -- npm run sync
`

/** Run a shell command, inheriting stdio. Resolves when it exits. */
async function runCommand(command: string[]): Promise<void> {
  return new Promise((resolve) => {
    const [cmd, ...rest] = command
    const child = spawn(cmd, rest, { stdio: 'inherit', shell: false })
    child.on('error', (err) => {
      process.stderr.write(`[habit] command failed: ${err.message}\n`)
      resolve()
    })
    child.on('close', () => resolve())
  })
}

/** CLI entry. Returns the intended process exit code. */
export async function main(argv: string[]): Promise<number> {
  const { args, error } = parseArgs(argv)
  if (error != null) {
    process.stderr.write(`[habit] ${error}\n\n${HELP}`)
    return 1
  }
  if (!args || args.help) {
    process.stdout.write(HELP)
    return 0
  }
  if (args.version) {
    process.stdout.write(`${VERSION}\n`)
    return 0
  }
  if (args.command.length === 0) {
    process.stderr.write(`[habit] no command given. Pass one after "--".\n\n${HELP}`)
    return 1
  }

  const { options, error: optError } = toOptions(args)
  if (optError != null || options == null) {
    process.stderr.write(`[habit] ${optError}\n\n${HELP}`)
    return 1
  }

  await new Promise<void>((resolve) => {
    const job = createHabit(async () => {
      const at = new Date().toLocaleTimeString()
      process.stdout.write(`[habit] ${at} → ${args.command.join(' ')}\n`)
      await runCommand(args.command)
      if (args.max != null && job.counter >= args.max) {
        job.stop()
        resolve()
      }
      else if (job.nextRun) {
        process.stdout.write(`[habit] next at ${job.nextRun.toLocaleTimeString()}\n`)
      }
    }, options)

    job.start(args.immediate)
    if (job.nextRun)
      process.stdout.write(`[habit] first run at ${job.nextRun.toLocaleTimeString()}\n`)

    const shutdown = () => {
      job.stop()
      process.stdout.write('\n[habit] stopped\n')
      resolve()
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  })

  return 0
}

// Run only when invoked directly (not when imported by tests).
const invokedDirectly
  = typeof process !== 'undefined' && process.argv[1] != null && /habit|cli[\\/]index/.test(process.argv[1])

if (invokedDirectly) {
  void main(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
