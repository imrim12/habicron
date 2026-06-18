import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addHabit,
  defaultName,
  findHabit,
  formatList,
  loadHabits,
  patchHabit,
  recordToOptions,
  removeHabit,
  scheduleLabel,
} from '../store'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'habit-test-'))
  process.env.HABIT_HOME = dir
})

afterEach(() => {
  delete process.env.HABIT_HOME
  rmSync(dir, { recursive: true, force: true })
})

describe('store', () => {
  it('adds habits with incrementing ids, defaulting to running', () => {
    const a = addHabit({ command: ['echo', 'hi'], every: '10s' })
    const b = addHabit({ command: ['node', 'x.js'], times: 2, per: 'day', jitter: '1h' })
    expect(a.id).toBe('1')
    expect(b.id).toBe('2')
    expect(a.status).toBe('running')
    expect(loadHabits()).toHaveLength(2)
  })

  it('finds by id or name', () => {
    addHabit({ name: 'sync', command: ['npm', 'run', 'sync'], every: '1h' })
    expect(findHabit(loadHabits(), 'sync')?.command).toEqual(['npm', 'run', 'sync'])
    expect(findHabit(loadHabits(), '1')?.name).toBe('sync')
    expect(findHabit(loadHabits(), 'nope')).toBeUndefined()
  })

  it('patches and removes', () => {
    const r = addHabit({ command: ['echo'], every: '10s' })
    patchHabit(r.id, { status: 'stopped' })
    expect(findHabit(loadHabits(), r.id)?.status).toBe('stopped')
    expect(removeHabit(r.id)?.id).toBe(r.id)
    expect(loadHabits()).toHaveLength(0)
  })

  it('defaultName picks the script filename', () => {
    expect(defaultName(['node', 'scripts/sync.js'])).toBe('sync')
    expect(defaultName(['bun', 'run', 'worker.ts'])).toBe('worker')
    expect(defaultName(['echo', 'hi'])).toBe('echo')
  })

  it('recordToOptions builds a Schedule with id/name and autoStart off', () => {
    const r = addHabit({ command: ['x'], every: '2h ~ 5m', name: 'n' })
    expect(recordToOptions(r)).toMatchObject({
      every: '2h ~ 5m',
      id: r.id,
      name: 'n',
      autoStart: false,
    })
  })

  it('scheduleLabel and formatList show the schedule and what it runs', () => {
    const r = addHabit({ command: ['node', 'server.js'], every: '10m ~ 2m' })
    expect(scheduleLabel(r)).toBe('every 10m ~ 2m')
    const table = formatList(loadHabits(), {})
    expect(table).toContain('node server.js') // the "what is it running" column
    expect(table).toContain('every 10m ~ 2m')
    expect(table).toContain(r.name)
  })

  it('formatList has a friendly empty state', () => {
    expect(formatList([], {})).toMatch(/No habits yet/)
  })
})
