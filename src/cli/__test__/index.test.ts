import { describe, expect, it } from 'vitest'
import { parseArgs, toOptions } from '../index'

describe('parseArgs', () => {
  it('parses --every and a command after --', () => {
    const { args } = parseArgs(['--every', '10s ~ 2s', '--', 'echo', 'hi'])
    expect(args?.every).toBe('10s ~ 2s')
    expect(args?.command).toEqual(['echo', 'hi'])
  })

  it('parses --times/--per/--jitter', () => {
    const { args } = parseArgs(['--times', '3', '--per', 'hour', '--jitter', '5m', '--', 'npm', 'run', 'sync'])
    expect(args?.times).toBe(3)
    expect(args?.per).toBe('hour')
    expect(args?.jitter).toBe('5m')
    expect(args?.command).toEqual(['npm', 'run', 'sync'])
  })

  it('parses flags', () => {
    const { args } = parseArgs(['--immediate', '--max', '5', '--every', '1h', '--', 'x'])
    expect(args?.immediate).toBe(true)
    expect(args?.max).toBe(5)
  })

  it('treats a bare token as the start of the command', () => {
    const { args } = parseArgs(['--every', '1h', 'echo', 'hi'])
    expect(args?.command).toEqual(['echo', 'hi'])
  })

  it('errors on an unknown option', () => {
    expect(parseArgs(['--nope']).error).toMatch(/unknown option/)
  })

  it('errors on an invalid --per', () => {
    expect(parseArgs(['--per', 'fortnight']).error).toMatch(/--per expects/)
  })

  it('errors on a non-numeric --times', () => {
    expect(parseArgs(['--times', 'abc']).error).toMatch(/--times expects/)
  })

  it('captures help and version', () => {
    expect(parseArgs(['--help']).args?.help).toBe(true)
    expect(parseArgs(['-v']).args?.version).toBe(true)
  })
})

describe('toOptions', () => {
  it('builds an every schedule', () => {
    const { options } = toOptions({
      every: '10s',
      jitter: '2s',
      immediate: true,
      help: false,
      version: false,
      command: ['echo'],
    })
    expect(options).toMatchObject({ every: '10s', jitter: '2s', immediate: true, autoStart: false })
  })

  it('builds a times/per schedule', () => {
    const { options } = toOptions({
      times: 3,
      per: 'hour',
      immediate: false,
      help: false,
      version: false,
      command: ['echo'],
    })
    expect(options).toMatchObject({ times: 3, per: 'hour', autoStart: false })
  })

  it('errors when no schedule is given', () => {
    const { error } = toOptions({ immediate: false, help: false, version: false, command: ['echo'] })
    expect(error).toMatch(/schedule is required/)
  })
})
