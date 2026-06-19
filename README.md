# habicron

> Habits, not cronjobs.

Schedule callbacks on **randomized recurring intervals**. `habicron` is accurate
by default (evenly spaced, anchored to the start time, **no drift**) and
optionally **jittered** — each fire nudged earlier or later within bounds, so
your jobs run on a human rhythm instead of robotically on the dot.

One tiny engine, five entry points:

| Import | For | Returns |
| --- | --- | --- |
| `habicron` / `habicron/node` | Node, workers, scripts | a plain controller |
| `habicron/browser` | Vanilla browser (no framework) | controller + callbacks |
| `habicron/vue` | Vue 3 | reactive `ref`s |
| `habicron/react` | React 17+ | reactive state |
| `habit` (CLI) | the terminal | runs a shell command |

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

A **habit** is an interval (`every`) or a rate (`times` + `per`), with optional
`jitter`. Every shape:

| Shape | Example | Fires |
| --- | --- | --- |
| `{ every: Duration }` | `{ every: '2h' }` | every 2 hours, exactly |
| `{ every: Duration }` (compound) | `{ every: '1h30m' }` | every 90 minutes |
| `{ every: '<cadence> ~ <jitter>' }` | `{ every: '2h ~ 5m' }` | every 2h, ± up to 5m (packed; `+/-` also works) |
| `{ every, jitter: Duration }` | `{ every: '20s', jitter: '5s' }` | every 20s, ± up to 5s |
| `{ every, jitter: [min, max] }` | `{ every: '20s', jitter: ['3s', '5s'] }` | every 20s, ± 3–5s |
| `{ every, jitter: { min, max } }` | `{ every: '1h', jitter: { min: '5m', max: '15m' } }` | every 1h, ± 5–15m |
| `{ times, per }` | `{ times: 2, per: 'day' }` | twice a day, evenly spaced |
| `{ times, per, jitter }` | `{ times: 2, per: 'day', jitter: '2h' }` | twice a day, ± up to 2h |
| `{ habits: Schedule[] }` | `{ habits: [a, b, c] }` | the **union** of several habits |

Plus the control flags (any shape): `immediate?` (fire once on start),
`autoStart?` (default `true`), `random?` (seeded RNG), `id?` / `name?` (for the
registry), and — adapters only — `controls?`.

**Durations** are a number (ms) or a string of `<num><unit>` tokens:

| Token | Unit | | Token | Unit |
| --- | --- | --- | --- | --- |
| `ms` | milliseconds | | `w` | weeks |
| `s` | seconds | | `mo` | months (avg 30.44 d) |
| `m` | minutes | | `y` | years (avg 365.25 d) |
| `h` | hours | | | |
| `d` | days | | | |

**`per`** is one of `minute` `hour` `day` `week` `month` `year`. Jitter sign is
always random (fires land earlier **or** later), and its magnitude is capped at
`0.49 × interval` so adjacent fires can't reorder.

## Node

```ts
import { createHabit } from 'habicron'

const job = createHabit(() => syncFeed(), { every: '15m ~ 2m' })

job.counter // times fired
job.nextRun // Date of the next fire, or null
job.pause()
job.resume()
job.stop()

process.on('SIGINT', () => { job.stop(); process.exit(0) })
```

## Browser (no framework)

Vanilla JS has no refs or state, so reactivity comes through callbacks —
`onActive`, `onFire`, `onChange`:

```ts
import { useHabit } from 'habicron/browser'

const job = useHabit(() => refreshWidget(), {
  every: '20s ~ 4s',
  onFire: count => (badge.textContent = String(count)),
  onActive: active => dot.classList.toggle('live', active),
})

job.pause() // or resume / update / destroy
```

`onActive` is the framework-free stand-in for a reactive `isActive`. SSR-safe:
timers don't start unless a `window` is present.

## Vue

```vue
<script setup lang="ts">
import { useHabit } from 'habicron/vue'

const { counter, nextRun, pause, resume } = useHabit(post, {
  controls: true,
  every: '20s ~ 4s',
})
</script>

<template>
  <p>fired {{ counter }}× · next at {{ nextRun?.toLocaleTimeString() }}</p>
  <button @click="pause">Pause</button>
</template>
```

`counter`, `nextRun` and `isActive` are readonly refs. Control members
(`pause`, `resume`, `reset`, `isActive`) appear only when `controls: true`.

## React

```tsx
import { useHabit } from 'habicron/react'

function Reminder() {
  const { counter, nextRun, pause } = useHabit(
    () => notify('Drink water'),
    { controls: true, every: '1h ~ 8m' },
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
useHabit(runAgent, {
  controls: true,
  habits: [
    { every: '2h ~ 20m' }, // check the cat
    { times: 2, per: 'day', jitter: '90m' }, // twice a day
    { every: '3d', jitter: ['3h', '5h'] }, // every few days
  ],
})
```

The callback fires on the **union** of all habits.

## CLI

The `habit` command runs any shell command on a randomized schedule. It works
two ways — attached, or managed by a lightweight background daemon.

**Attached** — fires in your terminal until you Ctrl-C:

```sh
habit run --every "10s ~ 2s" -- echo "stretch"
```

**Managed** — a background daemon keeps habits firing, and you list / inspect /
update / delete them like processes:

```sh
habit start --name sync --every "1h ~ 5m" -- npm run sync   # create + run in background
habit start --times 3 --per day --jitter 2h -- ./backup.sh
habit list                                                  # what's running, and what it runs
habit logs sync                                             # recent output
habit stop sync                                             # pause
habit start sync                                            # resume
habit restart sync
habit update sync --every 30m                               # change schedule live
habit delete sync                                           # remove (alias: rm)
habit kill                                                  # stop the daemon
```

`habit list` shows each habit's id, name, status, schedule, **the command it
runs**, fire count, and next/last run:

```
id  name  status   schedule    command       runs  next   last
1   sync  running  every 1h~5m  npm run sync  4     in 52m  8m ago
```

Habit definitions persist in `~/.habit/` (override with `HABIT_HOME`).

| Schedule flag | Meaning |
| --- | --- |
| `--every <dur>` | interval between fires |
| `--times <n> --per <period>` | N times per minute…year |
| `--jitter <dur>` | max random nudge per fire |
| `-i, --immediate` | fire once immediately |
| `--name <n>` | label for `list` / `logs` / etc. |

## API

`createHabit(callback, options)` → `HabitController`

```ts
interface HabitController {
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

### Managing habits

Every habit is registered, so you can list, look up, update, and remove them:

```ts
import { createHabit, getHabit, listHabits } from 'habicron'

createHabit(syncFeed, { id: 'feed', name: 'Feed sync', every: '15m ~ 2m' })

listHabits()            // [{ id, name, counter, nextRun, isActive, … }, …]
const job = getHabit('feed')
job?.update({ every: '5m' })   // reschedule in place (keeps id + counter)
job?.destroy()                 // stop and unregister
```

In Vue and React, `useHabits()` returns that list **reactively** — a ready-made
management view that updates as habits fire or come and go:

```ts
import { useHabits } from 'habicron/vue' // or 'habicron/react'

const habits = useHabits() // Vue: Ref<HabitSummary[]> · React: HabitSummary[]
```

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
