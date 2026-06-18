---
name: habicron-browser
description: >-
  Schedule a callback on randomized recurring intervals ("habits") in a plain
  browser app — no framework. Reactivity is delivered via callbacks (onActive,
  onFire, onChange). Use for vanilla-JS pages that poll/refresh/remind on a
  human rhythm without a fixed setInterval.
---

# habicron — Browser (framework-agnostic)

For vanilla browser apps. Same core engine (accurate, jittered, **no drift**),
but since there are no refs/component state, state changes arrive through
**callbacks**.

```sh
npm i habicron
```

```ts
import { useHabit } from 'habicron/browser'

const job = useHabit(() => refreshWidget(), {
  every: '20s ~ 4s',
  onFire: count => (badge.textContent = String(count)),
  onActive: active => dot.classList.toggle('live', active),
  onChange: ({ nextRun }) => (label.textContent = nextRun?.toLocaleTimeString() ?? ''),
})

button.onclick = () => job.pause() // or resume / update / destroy
```

## Callbacks

- `onActive(isActive)` — running state flipped (and once on creation). This is
  the framework-free stand-in for a reactive `isActive`.
- `onFire(counter)` — after each fire, with the new total.
- `onChange(summary)` — any change; `summary` is `{ id, name, isActive, counter, nextRun }`.

`useHabit(callback, options)` returns the `HabitController`
(`pause`/`resume`/`reset`/`update`/`destroy`/`subscribe`, plus `counter`/`nextRun`/`isActive` getters).

## Schedule shapes

```ts
{ every: '2h ~ 5m' }                   // packed cadence ~ max jitter (also +/-)
{ every: '20s', jitter: ['3s', '5s'] }
{ times: 2, per: 'day', jitter: '2h' }
```

Durations: numbers (ms) or `<num><unit>` strings — `ms s m h d w mo y`.

## Notes

- SSR-safe: timers don't start unless a `window` is present.
- Browser timers may be throttled in backgrounded tabs.
- Need refs/hooks instead? Use the `habicron-vue` or `habicron-react` skills.
