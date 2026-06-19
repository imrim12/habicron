---
name: vue
description: >-
  Create and set up a recurring "habit" in a Vue 3 app — a composable that
  schedules a function on a repeating, human-rhythm cadence with reactive state.
  Use whenever someone wants to create a habit, set up a recurring task,
  reminder, poller, or auto-refresh in a Vue component.
---

# Create a habit in Vue

Use this to **create a habit** in Vue. `useHabit` is a Vue 3 composable: it
returns reactive, readonly refs and cleans
up on scope teardown. SSR-safe (no timers during server render).

```sh
npm i habicron   # vue is an optional peer dep
```

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

- `counter`, `nextRun`, `isActive` are `readonly` refs.
- Control members (`pause`/`resume`/`reset`/`isActive`) appear only with `controls: true`.
- `useHabits()` returns a reactive `Ref<HabitSummary[]>` — a ready-made list of
  every habit, updating as they fire or come and go.

## Schedule shapes

```ts
{ every: '2h ~ 5m' }                   // packed cadence ~ max jitter (also +/-)
{ every: '20s', jitter: ['3s', '5s'] }
{ times: 2, per: 'day', jitter: '2h' }
{ habits: [ /* union of several */ ] }
```

Durations: numbers (ms) or `<num><unit>` strings — `ms s m h d w mo y`.

## Notes

- Runtime scheduler — no persistence across reloads; browser timers may be
  throttled in backgrounded tabs.
