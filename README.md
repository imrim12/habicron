# habicron

> Habits, not cronjobs.

Schedule callbacks on **randomized recurring intervals**. `habicron` is accurate
by default (evenly spaced, anchored to the start time, **no drift**) and
optionally **jittered** — each fire nudged earlier or later within bounds, so
your jobs run on a human rhythm instead of robotically on the dot.

One tiny engine, four entry points:

| Import | For | Returns |
| --- | --- | --- |
| `habicron` / `habicron/node` | Node, workers, scripts | a plain controller |
| `habicron/vue` | Vue 3 | reactive `ref`s |
| `habicron/react` | React 17+ | reactive state |
| `habicron` (CLI) | the terminal | runs a shell command |

- **No drift** — fires are anchored to a fixed grid; jitter perturbs *around* the
  grid point and never accumulates.
- **Jitter, bounded** — capped at `0.49 × interval` so adjacent fires can't reorder.
- **Long delays** — months/years are supported (chunked past `setTimeout`'s 24.8-day ceiling).
- **Resilient** — a throwing or rejecting callback never kills the schedule.
- **SSR-safe** — no timers during server render.
- **Typed** — ships hand-checked `.d.ts`; mutually-exclusive `every` vs `times`/`per`.

## Install

```sh
npm i habicron      # or: pnpm add habicron / bun add habicron
```

`vue` and `react` are optional peer dependencies — install only the one you use.

## Schedule shapes

A **habit** is either an interval or a rate:

```ts
{ every: '2h' }                       // every 2 hours
{ every: '1h30m' }                    // compound durations
{ every: '2h ± 5m' }                  // packed cadence ± max jitter
{ every: '20s', jitter: ['3s','5s'] } // bounded jitter, [min, max]
{ times: 2, per: 'day', jitter: '2h' }// N times per minute|hour|day|week|month|year
```

Durations are numbers (ms) or strings of `<num><unit>` tokens —
units: `ms s m h d w mo y`. Jitter sign is always random.

## Node

```ts
import { createHabicron } from 'habicron'

const job = createHabicron(() => syncFeed(), { every: '15m ± 2m' })

job.counter // times fired
job.nextRun // Date of the next fire, or null
job.pause()
job.resume()
job.stop()

process.on('SIGINT', () => { job.stop(); process.exit(0) })
```

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

`counter`, `nextRun` and `isActive` are readonly refs. Control members
(`pause`, `resume`, `reset`, `isActive`) appear only when `controls: true`.
`useHabicron` is the hook; `useRandomCronjob` remains as a deprecated alias.

## React

```tsx
import { useHabicron } from 'habicron/react'

function Reminder() {
  const { counter, nextRun, pause } = useHabicron(
    () => notify('Drink water'),
    { controls: true, every: '1h ± 8m' },
  )
  return (
    <p>
      fired {counter}× · next at {nextRun?.toLocaleTimeString()}
      <button onClick={pause}>Pause</button>
    </p>
  )
}
```

React returns plain values (not refs). The controller is created inside an
effect, so it is SSR-safe; the callback is always read fresh.

## Multiple habits

```ts
useHabicron(runAgent, {
  controls: true,
  habits: [
    { every: '2h ± 20m' }, // check the cat
    { times: 2, per: 'day', jitter: '90m' }, // twice a day
    { every: '3d', jitter: ['3h', '5h'] }, // every few days
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

| Flag | Meaning |
| --- | --- |
| `--every <dur>` | interval between fires |
| `--times <n> --per <period>` | N times per minute…year |
| `--jitter <dur>` | max random nudge per fire |
| `-i, --immediate` | fire once immediately |
| `--max <n>` | stop after N fires |
| `-h, --help` / `-v, --version` | help / version |

## API

`createHabicron(callback, options)` → `HabicronController`

```ts
interface HabicronController {
  readonly counter: number
  readonly isActive: boolean
  readonly nextRun: Date | null
  start: (immediate?: boolean) => void
  stop: () => void
  pause: () => void
  resume: () => void
  reset: () => void // zero counter, restart if active
  subscribe: (listener: () => void) => () => void
}

interface ControlFlags {
  immediate?: boolean // fire once on start
  autoStart?: boolean // default true (adapters gate this for SSR)
  random?: () => number // inject a seeded RNG for determinism
}
```

The framework adapters wrap this: Vue maps it onto refs, React onto state.

## Scope

`habicron` is a **client/runtime scheduler**, not a durable job queue. It does
not provide persistence across reloads, at-least-once delivery, or distributed
coordination, and browser timers may be throttled in background tabs. For those,
reach for a server-side scheduler (e.g. a queue or Durable Object alarms).

## Develop

```sh
pnpm install
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run
pnpm build         # unbuild → dist/ (ESM + CJS + .d.ts)
```

## License

[MIT](./LICENSE) © thecodeorigin
