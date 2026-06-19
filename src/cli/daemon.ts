import type { Buffer } from 'node:buffer'
/**
 * habicron CLI — the background daemon.
 *
 * A detached `habit __daemon` process owns the live timers. It reads habit
 * definitions from the store, schedules the `running` ones with the core
 * engine, runs their commands on each fire (logging output), and writes runtime
 * state back. It polls the store so the CLI can add/stop/update/delete habits
 * while it runs — a record's `rev` bumping makes the daemon re-create that
 * habit's controller in place.
 */
import type { ChildProcess } from 'node:child_process'
import type { HabitController } from '../core'
import type { HabitRecord } from './store'
import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import process from 'node:process'
import { createHabit } from '../core'
import {
  clearDaemon,

  loadHabits,
  loadState,
  logFile,
  patchState,
  recordToOptions,
  writeDaemon,
} from './store'

function appendLog(id: string, chunk: string | Uint8Array): void {
  const file = logFile(id)
  mkdirSync(dirname(file), { recursive: true })
  appendFileSync(file, chunk)
}

/** Run a record's command once; resolve when it exits. */
async function runOnce(record: HabitRecord): Promise<void> {
  return new Promise((resolve) => {
    const ts = new Date()
    appendLog(record.id, `\n[${ts.toISOString()}] $ ${record.command.join(' ')}\n`)
    let child: ChildProcess
    try {
      const [cmd, ...args] = record.command
      child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      appendLog(record.id, `[habit] spawn failed: ${message}\n`)
      patchState(record.id, { lastRun: ts.toISOString(), lastExit: null })
      resolve()
      return
    }
    child.stdout?.on('data', (d: Buffer) => appendLog(record.id, d))
    child.stderr?.on('data', (d: Buffer) => appendLog(record.id, d))
    child.on('error', (err) => {
      appendLog(record.id, `[habit] ${err.message}\n`)
      patchState(record.id, { lastRun: ts.toISOString(), lastExit: null })
      resolve()
    })
    child.on('close', (code) => {
      patchState(record.id, { lastRun: ts.toISOString(), lastExit: code })
      resolve()
    })
  })
}

interface Live {
  ctrl: HabitController
  rev: number
}

export function runDaemon(): void {
  writeDaemon({ pid: process.pid, startedAt: new Date().toISOString() })
  const live = new Map<string, Live>()

  const startRecord = (record: HabitRecord): Live => {
    const ctrl = createHabit(async () => runOnce(record), recordToOptions(record))
    ctrl.subscribe(() => {
      patchState(record.id, {
        counter: ctrl.counter,
        nextRun: ctrl.nextRun?.toISOString() ?? null,
      })
    })
    patchState(record.id, { startedAt: new Date().toISOString() })
    ctrl.start(record.immediate ?? false)
    return { ctrl, rev: record.rev }
  }

  const drop = (id: string) => {
    const entry = live.get(id)
    if (!entry)
      return
    entry.ctrl.destroy()
    live.delete(id)
    patchState(id, { nextRun: null, startedAt: null })
  }

  const reconcile = () => {
    const records = loadHabits()
    const seen = new Set(records.map(r => r.id))

    // Remove controllers for habits that were deleted.
    for (const id of [...live.keys()]) {
      if (!seen.has(id))
        drop(id)
    }

    for (const record of records) {
      const entry = live.get(record.id)
      if (record.status !== 'running') {
        if (entry)
          drop(record.id)
        continue
      }
      // running: (re)create if new or its definition changed (rev bumped)
      if (!entry) {
        live.set(record.id, startRecord(record))
      }
      else if (entry.rev !== record.rev) {
        drop(record.id)
        live.set(record.id, startRecord(record))
      }
    }
  }

  reconcile()
  const poll = setInterval(reconcile, 1000)

  const shutdown = () => {
    clearInterval(poll)
    for (const id of [...live.keys()]) drop(id)
    clearDaemon()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  // Mark any habits the daemon isn't running as cleanly idle.
  const state = loadState()
  for (const id of Object.keys(state)) {
    if (!live.has(id))
      patchState(id, { nextRun: null, startedAt: null })
  }
}
