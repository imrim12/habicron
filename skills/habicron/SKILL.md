---
name: habicron
description: >-
  Schedule callbacks on randomized recurring intervals ("habits") instead of
  fixed cron — accurate by default, optionally jittered, with no drift. Use when
  the user wants a recurring task that fires on a human rhythm rather than
  robotically on the dot (reminders, polling, background sync, agent routines)
  in Node, Vue, React, or from the CLI.
---

# habicron

`habicron` runs a callback on **randomized recurring intervals**. It is accurate
by default (evenly spaced, anchored to a fixed grid, **no drift**) and optionally
**jittered** — each fire nudged earlier or later within bounds.

A **habit** is `{ intervalMs, jitter }`. The engine fires on the union of all
habits; each habit reschedules itself against `anchor + count * interval`, so the
long-run rate stays exact even with jitter.

## When to use this

- A task should repeat on an interval but **not** land on the exact same instant
  every time (avoid the thundering-herd / robotic feel): polling, reminders,
  background refresh, autonomous agent routines.
- You need "N times per period" scheduling (`2 times per day`) with optional
  spread.
- You want the same scheduling engine across Node, Vue, React, or a shell command.

**Not** for: durable/at-least-once delivery, persistence across reloads, or
distributed coordination — habicron is a client/runtime scheduler. Reach for a
queue or Cloudflare Durable Object alarms instead.

## Install

```sh
npm i habicron      # pnpm add habicron / bun add habicron
```

`vue` and `react` are optional peer dependencies — install only the one you use.

## Schedule shapes

```ts
{ every: '2h' }                        // every 2 hours
{ every: '1h30m' }                     // compound durations
{ every: '2h ± 5m' }                   // packed cadence ± max jitter
{ every: '20s', jitter: ['3s', '5s'] } // bounded jitter, [min, max]
{ times: 2, per: 'day', jitter: '2h' } // N times per minute|hour|day|week|month|year
```

Durations are numbers (ms) or strings of `<num><unit>` tokens — units:
`ms s m h d w mo y`. Jitter sign is always random (fires land earlier OR later).

## Node (default entry)

Headless: you drive the controller.

```ts
import { createHabicron } from 'habicron'

const job = createHabicron(() => syncFeed(), { every: '15m ± 2m' })

job.counter   // times fired
job.nextRun   // Date of the next fire, or null
job.pause()
job.resume()
job.stop()

process.on('SIGINT', () => { job.stop(); process.exit(0) })
```

`createHabicron(callback, options)` returns a `HabicronController`:
`{ counter, isActive, nextRun, start, stop, pause, resume, reset, subscribe }`.

Useful option flags: `immediate` (fire once on start), `autoStart` (default
`true`; set `false` to stay inert), `random` (inject a seeded RNG for
deterministic behavior/tests).

## Vue

```vue
<script setup lang="ts">
import { useHabicron } from 'habicron/vue'

const { counter, nextRun, pause, resume } = useHabicron(post, {
  controls: true,
  every: '20s ± 4s',
})
</script>

<template>
  <p>fired {{ counter }}× · next at {{ nextRun?.toLocaleTimeString() }}</p>
  <button @click="pause">Pause</button>
</template>
```

`counter`, `nextRun`, `isActive` are readonly refs. Control members
(`pause`/`resume`/`reset`/`isActive`) appear only with `controls: true`.

## React

```tsx
import { useHabicron } from 'habicron/react'

function Reminder() {
  const { counter, nextRun, pause } = useHabicron(
    () => notify('Drink water'),
    { controls: true, every: '1h ± 8m' },
  )
  return <p>fired {counter}× · next at {nextRun?.toLocaleTimeString()}</p>
}
```

React returns plain values (not refs) and is SSR-safe (the controller is created
inside an effect).

> The hook is `useHabicron`. The old name `useRandomCronjob` still works as a
> deprecated alias — prefer `useHabicron` in new code.

## Multiple habits

```ts
useHabicron(runAgent, {
  controls: true,
  habits: [
    { every: '2h ± 20m' },                   // check the cat
    { times: 2, per: 'day', jitter: '90m' }, // twice a day
    { every: '3d', jitter: ['3h', '5h'] },   // every few days
  ],
})
```

The callback fires on the **union** of all habits.

## CLI

Run any shell command on a randomized schedule:

```sh
habicron --every "10s ± 2s" -- echo "stretch"
habicron --times 3 --per hour --jitter 5m -- npm run sync
habicron --every 1h --immediate --max 5 -- ./backup.sh
```

Flags: `--every <dur>`, `--times <n> --per <period>`, `--jitter <dur>`,
`-i/--immediate`, `--max <n>`, `-h/--help`, `-v/--version`.

## Gotchas

- **No drift:** never reduce a habit to `setTimeout(base ± jitter, …)` recursion —
  jitter must perturb *around* the grid, not accumulate.
- Jitter magnitude is capped at `0.49 × interval` so adjacent fires can't reorder.
- `month`/`year` are *average* approximations (30.436875 d / 365.25 d), not
  calendar-exact.
- Browser timers may be throttled in backgrounded tabs.
