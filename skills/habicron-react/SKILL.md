---
name: habicron-react
description: >-
  Create and set up a recurring "habit" in a React app — a hook that schedules a
  function on a repeating, human-rhythm cadence with reactive state. Use whenever
  someone wants to create a habit, set up a recurring task, reminder, poller, or
  auto-refresh in a React component.
---

# Create a habit in React

Use this to **create a habit** in React. `useHabit` is a React hook: it returns
plain values (not refs) that re-render on
change, creates its controller inside an effect (SSR-safe), and stops on unmount.

```sh
npm i habicron   # react is an optional peer dep
```

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

- Returns plain values; control members (`pause`/`resume`/`reset`/`isActive`)
  appear only with `controls: true`.
- The schedule is captured on mount; the callback is always read fresh, so
  closing over changing props is safe.
- `useHabits()` returns `HabitSummary[]` reactively — a ready-made list of every
  habit, updating as they fire or come and go.

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
