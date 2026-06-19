#!/usr/bin/env node
import type { Period, Schedule } from '../core'
import type { HabitRecord, NewHabit } from './store'
/**
 * habit — the habicron CLI.
 *
 * Two ways to run a command on a randomized recurring schedule:
 *   - `habit run …`   attached: fires in this process until you Ctrl-C.
 *   - `habit start …` managed: a background daemon keeps it firing, and you
 *     list / stop / restart / update / delete / inspect it like pm2.
 *
 * @example
 *   habit start --every "10s ~ 2s" -- echo "stretch"
 *   habit list
 *   habit logs 1
 *   habit stop 1 && habit delete 1
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { createHabit } from '../core'
import { runDaemon } from './daemon'
import {
  addHabit,
  daemonAlive,
  findHabit,
  formatList,

  loadHabits,
  loadState,
  logFile,

  patchHabit,
  readDaemon,
  removeHabit,
} from './store'

export const VERSION = '0.2.0'

const PERIODS: Period[] = ['minute', 'hour', 'day', 'week', 'month', 'year']
const PERIOD_NAMES: string[] = PERIODS

function isPeriod(value: string | undefined): value is Period {
  return value != null && PERIOD_NAMES.includes(value)
}

export interface CliArgs {
  name?: string
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

/** Parse schedule flags + command (the bit shared by `run`/`start`/`update`). */
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
      case '--name':
        args.name = argv[++i]
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
      case '--per': {
        const value = argv[++i]
        if (!isPeriod(value))
          return { error: `--per expects one of ${PERIODS.join(', ')}` }
        args.per = value
        break
      }
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
        args.command = argv.slice(i + 1)
        i = argv.length
        break
      default:
        if (arg.startsWith('-'))
          return { error: `unknown option "${arg}"` }
        args.command = argv.slice(i)
        i = argv.length
    }
  }

  return { args }
}

/** Build core {@link Schedule}-based options for `run` (foreground). */
export function toOptions(args: CliArgs): { options?: Schedule & { immediate?: boolean, autoStart?: boolean }, error?: string } {
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

/** Build a {@link NewHabit} (for `start`) from parsed args. */
function toNewHabit(args: CliArgs): { habit?: NewHabit, error?: string } {
  if (args.command.length === 0)
    return { error: 'no command given. Pass one after "--".' }
  if (args.every == null && (args.times == null || args.per == null))
    return { error: 'a schedule is required: --every <dur> or --times <n> --per <period>' }
  return {
    habit: {
      name: args.name,
      command: args.command,
      every: args.every,
      times: args.times,
      per: args.per,
      jitter: args.jitter,
      immediate: args.immediate,
    },
  }
}

export const HELP = `habit v${VERSION} — randomized recurring schedules ("habits", not cronjobs)

Usage:
  habit start [--name <n>] <schedule> -- <command...>   create + run in the background
  habit run <schedule> -- <command...>                  run attached (Ctrl-C to stop)
  habit list                                            list habits and what they run
  habit stop    <id|name|all>                           pause
  habit start   <id|name>                               resume a paused habit
  habit restart <id|name>                               restart
  habit update  <id|name> [--every … | --name … | -- <command...>]
  habit delete  <id|name|all>                           remove (alias: rm)
  habit logs    <id|name> [-n <lines>]                  show recent output
  habit kill                                            stop the background daemon

Schedule:
  --every <dur>                interval, e.g. "2h", "10s ~ 2s", "1h30m"
  --times <n> --per <period>   N times per minute|hour|day|week|month|year
  --jitter <dur>               max random nudge per fire, e.g. "5m"
  -i, --immediate              fire once immediately on start

Examples:
  habit start --every "10s ~ 2s" -- echo "stretch"
  habit start --name sync --times 3 --per hour --jitter 5m -- npm run sync
  habit list
`

function out(s: string) {
  process.stdout.write(`${s}\n`)
}
function err(s: string) {
  process.stderr.write(`[habit] ${s}\n`)
}

/** Launch the detached daemon if one isn't already running. */
function ensureDaemon(): void {
  if (daemonAlive())
    return
  const entry = process.argv[1]
  const child = spawn(process.execPath, [entry, '__daemon'], { detached: true, stdio: 'ignore' })
  child.unref()
}

function describe(r: HabitRecord): string {
  return `${r.id} (${r.name}) → ${r.command.join(' ')}`
}

// --- commands --------------------------------------------------------------

function cmdStart(rest: string[]): number {
  // `habit start <id|name>` with no schedule/command = resume a paused habit.
  if (rest.length === 1 && !rest[0].startsWith('-')) {
    const existing = findHabit(loadHabits(), rest[0])
    if (existing) {
      patchHabit(existing.id, { status: 'running', rev: existing.rev + 1 })
      ensureDaemon()
      out(`resumed ${describe(existing)}`)
      return 0
    }
  }

  const { args, error } = parseArgs(rest)
  if (error != null || !args) {
    err(error ?? 'parse error')
    return 1
  }
  const { habit, error: hErr } = toNewHabit(args)
  if (hErr != null || !habit) {
    err(hErr ?? 'invalid habit')
    return 1
  }
  const record = addHabit(habit)
  ensureDaemon()
  out(`started ${describe(record)}`)
  out(`  ${args.every != null ? `every ${args.every}` : `${args.times}×/${args.per}`}${args.jitter != null ? ` ~ ${args.jitter}` : ''}`)
  return 0
}

function eachTarget(ref: string, fn: (r: HabitRecord) => void): number {
  const list = loadHabits()
  let targets: HabitRecord[]
  if (ref === 'all') {
    targets = list
  }
  else {
    const found = findHabit(list, ref)
    targets = found ? [found] : []
  }
  if (targets.length === 0) {
    err(`no habit matching "${ref}"`)
    return 1
  }
  for (const r of targets) fn(r)
  return 0
}

function cmdStop(rest: string[]): number {
  if (!rest[0]) {
    err('usage: habit stop <id|name|all>')
    return 1
  }
  return eachTarget(rest[0], (r) => {
    patchHabit(r.id, { status: 'stopped' })
    out(`stopped ${r.id} (${r.name})`)
  })
}

function cmdRestart(rest: string[]): number {
  if (!rest[0]) {
    err('usage: habit restart <id|name|all>')
    return 1
  }
  const code = eachTarget(rest[0], (r) => {
    patchHabit(r.id, { status: 'running', rev: r.rev + 1 })
    out(`restarted ${r.id} (${r.name})`)
  })
  if (code === 0)
    ensureDaemon()
  return code
}

function cmdDelete(rest: string[]): number {
  if (!rest[0]) {
    err('usage: habit delete <id|name|all>')
    return 1
  }
  if (rest[0] === 'all') {
    const list = loadHabits()
    if (list.length === 0) {
      err('no habits to delete')
      return 1
    }
    for (const r of list) removeHabit(r.id)
    out(`deleted ${list.length} habit(s)`)
    return 0
  }
  const removed = removeHabit(rest[0])
  if (!removed) {
    err(`no habit matching "${rest[0]}"`)
    return 1
  }
  out(`deleted ${removed.id} (${removed.name})`)
  return 0
}

function cmdUpdate(rest: string[]): number {
  const ref = rest[0]
  if (!ref || ref.startsWith('-')) {
    err('usage: habit update <id|name> [--every … | --name … | -- <command...>]')
    return 1
  }
  const existing = findHabit(loadHabits(), ref)
  if (!existing) {
    err(`no habit matching "${ref}"`)
    return 1
  }
  const { args, error } = parseArgs(rest.slice(1))
  if (error != null || !args) {
    err(error ?? 'parse error')
    return 1
  }
  const patch: Partial<HabitRecord> = { rev: existing.rev + 1 }
  if (args.name != null)
    patch.name = args.name
  if (args.every != null) {
    patch.every = args.every
    patch.times = undefined
    patch.per = undefined
  }
  if (args.times != null)
    patch.times = args.times
  if (args.per != null)
    patch.per = args.per
  if (args.jitter != null)
    patch.jitter = args.jitter
  if (args.immediate)
    patch.immediate = true
  if (args.command.length > 0)
    patch.command = args.command
  const updated = patchHabit(existing.id, patch)
  if (!updated) {
    err(`no habit matching "${ref}"`)
    return 1
  }
  ensureDaemon()
  out(`updated ${describe(updated)}`)
  return 0
}

function cmdList(): number {
  out(formatList(loadHabits(), loadState()))
  const d = readDaemon()
  out('')
  out(daemonAlive() && d ? `daemon: running (pid ${d.pid})` : 'daemon: not running')
  return 0
}

function cmdLogs(rest: string[]): number {
  let ref: string | undefined
  let lines = 50
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '-n')
      lines = Math.max(1, Number(rest[++i]) || 50)
    else if (!rest[i].startsWith('-') && ref == null)
      ref = rest[i]
  }
  if (ref == null) {
    err('usage: habit logs <id|name> [-n <lines>]')
    return 1
  }
  const record = findHabit(loadHabits(), ref)
  if (!record) {
    err(`no habit matching "${ref}"`)
    return 1
  }
  try {
    const content = readFileSync(logFile(record.id), 'utf8').trimEnd()
    const tail = content.split('\n').slice(-lines).join('\n')
    out(tail || '(no output yet)')
  }
  catch {
    out('(no output yet)')
  }
  return 0
}

function cmdKill(): number {
  const d = readDaemon()
  if (d?.pid == null || !daemonAlive()) {
    out('daemon: not running')
    return 0
  }
  try {
    process.kill(d.pid, 'SIGTERM')
    out(`stopped daemon (pid ${d.pid})`)
  }
  catch (e) {
    err(`could not stop daemon: ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }
  return 0
}

/** Attached run — fires in this process until interrupted. */
async function runForeground(rest: string[]): Promise<number> {
  const { args, error } = parseArgs(rest)
  if (error != null || !args) {
    err(error ?? 'parse error')
    return 1
  }
  if (args.command.length === 0) {
    err('no command given. Pass one after "--".')
    return 1
  }
  const { options, error: optError } = toOptions(args)
  if (optError != null || !options) {
    err(optError ?? 'invalid schedule')
    return 1
  }

  await new Promise<void>((resolve) => {
    const job = createHabit(async () => {
      const at = new Date().toLocaleTimeString()
      out(`[habit] ${at} → ${args.command.join(' ')}`)
      return runCommand(args.command)
    }, options)

    job.start(args.immediate)
    if (job.nextRun)
      out(`[habit] first run at ${job.nextRun.toLocaleTimeString()}`)

    const shutdown = () => {
      job.stop()
      out('\n[habit] stopped')
      resolve()
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  })
  return 0
}

async function runCommand(command: string[]): Promise<void> {
  return new Promise((resolve) => {
    const [cmd, ...rest] = command
    const child = spawn(cmd, rest, { stdio: 'inherit', shell: false })
    child.on('error', e => err(`command failed: ${e.message}`))
    child.on('close', () => resolve())
  })
}

/** CLI entry. Returns the intended exit code (daemon never returns). */
export async function main(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv

  if (sub == null || sub === '-h' || sub === '--help') {
    process.stdout.write(HELP)
    return 0
  }
  if (sub === '-v' || sub === '--version') {
    out(VERSION)
    return 0
  }

  switch (sub) {
    case '__daemon':
      runDaemon()
      return new Promise<number>(() => {}) // never resolves; daemon runs forever
    case 'run':
      return runForeground(rest)
    case 'start':
      return cmdStart(rest)
    case 'stop':
      return cmdStop(rest)
    case 'restart':
      return cmdRestart(rest)
    case 'update':
      return cmdUpdate(rest)
    case 'delete':
    case 'rm':
      return cmdDelete(rest)
    case 'list':
    case 'ls':
      return cmdList()
    case 'logs':
      return cmdLogs(rest)
    case 'kill':
      return cmdKill()
    default:
      // Back-compat / shorthand: `habit --every … -- cmd` runs attached.
      if (sub.startsWith('-'))
        return runForeground(argv)
      err(`unknown command "${sub}". Try: habit --help`)
      return 1
  }
}

// Run only when invoked directly (not when imported by tests).
const invokedDirectly
  = typeof process !== 'undefined' && process.argv[1] != null && /habit|cli[\\/]index/.test(process.argv[1])

if (invokedDirectly) {
  // Survive `habit list | head` etc.: the reader closing the pipe is not an error.
  process.stdout.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EPIPE')
      process.exit(0)
  })
  void main(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
