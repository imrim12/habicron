---
name: node
description: >-
  Create and set up a recurring "habit" in Node — schedule a function/callback to
  run on a repeating, human-rhythm cadence (gently jittered, no drift). Use
  whenever someone wants to create a habit, set up a recurring task, reminder,
  poller, or background job in a Node server, script, or worker (e.g. "do X
  every 2 hours", "create a habit that runs twice a day").
---

# Create a habit in Node

Use this to **create a habit** in Node: `createHabit` runs a callback on a
repeating, human-rhythm cadence. Accurate by
default (anchored to a fixed grid, **no drift**); add `jitter` to nudge each
fire earlier/later within bounds. Headless — you drive the controller.

```sh
npm i habicron
```

```ts
import { createHabit } from 'habicron'

const job = createHabit(() => syncFeed(), { every: '15m ~ 2m' })

job.counter   // times fired
job.nextRun   // Date of the next fire, or null
job.pause(); job.resume(); job.stop()

process.on('SIGINT', () => { job.stop(); process.exit(0) })
```

`createHabit(callback, options)` → `HabitController`
`{ id, name, counter, isActive, nextRun, start, stop, pause, resume, reset, update, destroy, subscribe }`.

## Schedule shapes

```ts
{ every: '2h' }                        // every 2 hours
{ every: '2h ~ 5m' }                   // packed cadence ~ max jitter (also +/-)
{ every: '20s', jitter: ['3s', '5s'] } // bounded jitter [min, max]
{ times: 2, per: 'day', jitter: '2h' } // N times per minute|hour|day|week|month|year
{ habits: [ /* … */ ] }                // union of several habits
```

Durations: numbers (ms) or `<num><unit>` strings — `ms s m h d w mo y`.
Option flags: `immediate` (fire once on start), `autoStart` (default `true`),
`random` (seeded RNG for determinism).

## Managing habits

```ts
import { getHabit, listHabits } from 'habicron'

listHabits()                 // every registered habit
getHabit('feed')?.update({ every: '5m' })   // reschedule in place
getHabit('feed')?.destroy()                 // stop + unregister
```

## Notes

- Runtime scheduler: in-process only, no persistence across restarts. For a
  durable background runner use the `habit` CLI (`habicron-cli` skill).
- `month`/`year` are average approximations (30.436875 d / 365.25 d).
