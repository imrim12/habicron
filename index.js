import { ref, readonly } from 'vue'

const S = 1000
const M = 60 * S
const H = 60 * M
const D = 24 * H
const W = 7 * D
const MO = 30.436875 * D // average month
const Y = 365.25 * D // average year

const PERIOD = { minute: M, hour: H, day: D, week: W, month: MO, year: Y }
const MAX_DELAY = 2_147_483_647 // setTimeout 32-bit ceiling (~24.8 days)

// duration units, longest tokens first so the regex never mis-matches
const UNIT = { ms: 1, sec: S, min: M, mo: MO, hr: H, w: W, s: S, m: M, h: H, d: D, y: Y }
const TOKEN = /(\d+(?:\.\d+)?)\s*(ms|sec|min|mo|hr|s|m|h|d|w|y)/g

/** Parse a duration: number (ms) or string like '2h', '1h30m', '500ms'. */
function dur(v) {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return 0
  let total = 0
  let match
  TOKEN.lastIndex = 0
  while ((match = TOKEN.exec(v))) total += parseFloat(match[1]) * UNIT[match[2]]
  return total
}

/** Normalise a jitter spec into a { min, max } magnitude range in ms, or null. */
function resolveJitter(j) {
  if (j == null) return null
  if (typeof j === 'number' || typeof j === 'string') {
    const max = dur(j)
    return max > 0 ? { min: 0, max } : null
  }
  if (Array.isArray(j)) return { min: dur(j[0]), max: dur(j[1]) }
  return { min: dur(j.min ?? 0), max: dur(j.max) }
}

/** Reduce one schedule spec to { intervalMs, jitter }. */
function normalize(s) {
  let intervalMs = 0
  let jitter = resolveJitter(s.jitter)
  if (s.every != null) {
    if (typeof s.every === 'string' && /[±~]/.test(s.every)) {
      const [cadence, j] = s.every.split(/[±~]/)
      intervalMs = dur(cadence.trim())
      if (!jitter) jitter = resolveJitter(j.trim())
    } else {
      intervalMs = dur(s.every)
    }
  } else if (s.times && s.per && PERIOD[s.per]) {
    intervalMs = PERIOD[s.per] / s.times
  }
  return intervalMs > 0 && Number.isFinite(intervalMs) ? { intervalMs, jitter } : null
}

/** setTimeout that survives delays beyond the 32-bit ceiling. */
function longTimeout(fn, delay) {
  let handle
  let remaining = Math.max(0, delay)
  let cancelled = false
  const step = () => {
    if (cancelled) return
    if (remaining <= MAX_DELAY) handle = setTimeout(fn, remaining)
    else { remaining -= MAX_DELAY; handle = setTimeout(step, MAX_DELAY) }
  }
  step()
  return () => { cancelled = true; clearTimeout(handle) }
}

const randBetween = (min, max) => min + Math.random() * (max - min)

/**
 * @param {() => void | Promise<void>} callback
 * @param {import('./use-random-cronjob').UseRandomCronjobOptions} options
 */
export function useRandomCronjob(callback, options) {
  const { immediate = false, controls = false } = options ?? {}

  const counter = ref(0)
  const isActive = ref(false)
  const nextRun = ref(null)

  const specs = (options?.habits ?? [options]).map(normalize).filter(Boolean)
  const tasks = specs.map((spec) => ({ ...spec, anchor: 0, count: 0, nextTs: null, cancel: null }))

  const recomputeNext = () => {
    let min = null
    for (const t of tasks) if (t.nextTs != null && (min == null || t.nextTs < min)) min = t.nextTs
    nextRun.value = min == null ? null : new Date(min)
  }

  const fire = () => {
    counter.value++
    try {
      const r = callback()
      if (r && typeof r.then === 'function') r.catch(() => {})
    } catch {
      // swallow so a throwing callback never kills the schedule
    }
  }

  const offset = (t) => {
    if (!t.jitter) return 0
    let mag = randBetween(t.jitter.min, t.jitter.max)
    const cap = t.intervalMs * 0.49 // never let jitter reorder adjacent fires
    if (mag > cap) mag = cap
    return (Math.random() < 0.5 ? -1 : 1) * mag
  }

  const schedule = (t) => {
    t.count++
    const target = t.anchor + t.count * t.intervalMs + offset(t)
    t.nextTs = target
    recomputeNext()
    t.cancel = longTimeout(() => {
      fire()
      if (isActive.value) schedule(t)
    }, target - Date.now())
  }

  const start = (runImmediate) => {
    const now = Date.now()
    for (const t of tasks) { t.anchor = now; t.count = 0 }
    isActive.value = true
    if (runImmediate) fire()
    for (const t of tasks) schedule(t)
  }

  const stop = () => {
    for (const t of tasks) { t.cancel?.(); t.cancel = null; t.nextTs = null }
    isActive.value = false
    recomputeNext()
  }

  const pause = () => { if (isActive.value) stop() }
  const resume = () => { if (!isActive.value) start(false) }
  const reset = () => { counter.value = 0; if (isActive.value) { stop(); start(false) } }

  // SSR guard: don't spin timers during server render.
  if (typeof window !== 'undefined') start(immediate)

  const base = { counter: readonly(counter), nextRun: readonly(nextRun) }
  if (!controls) return base
  return { ...base, isActive: readonly(isActive), pause, resume, reset }
}
