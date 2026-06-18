# CLAUDE.md

Operating guide for AI coding agents (Claude Code) working in this repository.
Read this fully before editing. It is the source of intent that the code alone
does not convey.

---

## 1. What this is

**habicron** is a single Vue composable, `useRandomCronjob`, that schedules a
callback on **randomized recurring intervals** — "habits" rather than fixed
cron. It is accurate (evenly spaced) by default and optionally jittered (each
fire nudged earlier or later within bounds).

- Package name: `habicron`
- Repo: `imrim12/habicron`
- Public export: `useRandomCronjob` (the package was rebranded to `habicron`;
  the composable name was intentionally kept)

The product thesis is the jitter-with-no-drift behavior. Anything that quietly
turns this back into a plain `setInterval`/cron is a regression, even if tests
pass.

**Mental model:** a habit = `{ intervalMs, jitter }`. The library fires the
callback on the union of all habits, each habit reschedules itself, and the next
fire is always computed against a fixed grid so the long-run rate stays exact.

---

## 2. Repository layout

```
src/index.js     # the composable — authored ESM, shipped as-is (no build)
src/index.d.ts   # hand-written public types — THE API CONTRACT
docs/index.html  # self-contained landing page (no framework, no bundler)
package.json     # ESM, "files": ["src"], vue as the only peer dep
tsconfig.json    # typecheck only (noEmit), no build output
```

There is intentionally **no build step**. The package publishes `src/`
directly. `index.js` is hand-authored ESM; `index.d.ts` is hand-authored types.
Do not introduce a bundler, transpiler, or `dist/` unless explicitly asked — a
core value is "zero native deps, readable in one sitting."

---

## 3. Architecture: how `src/index.js` works

Read these pieces in order; each is a small named function.

1. **Time constants** — `S M H D W MO Y` (ms per unit). `MO`/`Y` are *averages*
   (30.436875 d / 365.25 d), not calendar-exact. `PERIOD` maps the `per` keys to
   ms; `UNIT` maps duration-string tokens to ms.
2. **`dur(v)`** — duration parser. Accepts a number (ms) or a string of
   `<num><unit>` tokens (`'1h30m'`, `'500ms'`). Uses the `TOKEN` regex. **Token
   alternation is longest-first on purpose** (`ms|sec|min|mo|hr|s|m|h|d|w|y`) so
   `'5mo'`, `'5min'`, `'500ms'` don't mis-match against `m`/`s`. Touch this
   ordering and you will silently corrupt parsing.
3. **`resolveJitter(j)`** — normalizes `Duration | [min,max] | {min,max}` into a
   `{ min, max }` magnitude range in ms, or `null`. A bare duration means
   `{ min: 0, max }`. Sign is applied later, not here.
4. **`normalize(s)`** — reduces one schedule spec to `{ intervalMs, jitter }` or
   `null`. Resolves `every` (including the packed `'2h ± 5m'` form, split on
   `±`/`~`) or `times`/`per`. Returns `null` for non-positive/`NaN` intervals,
   which are then filtered out.
5. **`longTimeout(fn, delay)`** — `setTimeout` that chunks delays past
   `MAX_DELAY` (2^31-1 ms ≈ 24.8 days). Returns a cancel function. Exists because
   a raw `setTimeout` with a larger delay **fires immediately** — the `month`,
   `year`, and long-interval habits depend on this.
6. **`useRandomCronjob(callback, options)`** — the composable:
   - Builds `specs` from `options.habits ?? [options]` → `normalize` → filter.
   - Each `task` carries `{ intervalMs, jitter, anchor, count, nextTs, cancel }`.
   - **`schedule(t)`**: `target = t.anchor + t.count * t.intervalMs + offset(t)`.
     This is the no-drift core — fires anchor to a fixed grid; jitter perturbs
     *around* the grid point and never accumulates.
   - **`offset(t)`**: random magnitude in `[jitter.min, jitter.max]`, random
     sign, **capped at `0.49 * intervalMs`** so adjacent fires can't reorder.
   - **`fire()`**: increments `counter`, calls the callback, swallows sync
     throws and async rejections so a bad run never kills the schedule.
   - **`start(runImmediate)`** resets anchors/counts to now; `stop()` cancels all
     timers; `pause/resume/reset` are built on those. `reset()` zeroes `counter`
     and restarts from now.
   - **SSR guard**: timers start only when `typeof window !== 'undefined'`.
   - Returns `{ counter, nextRun }` always; adds
     `{ isActive, pause, resume, reset }` only when `controls` is truthy.

---

## 4. Public API contract (`src/index.d.ts`)

`index.d.ts` is the contract. When the public API changes, **edit the `.d.ts`
first**, then make `index.js` conform.

- One named export: `useRandomCronjob`. Keep the surface this small.
- `Schedule` is a discriminated union with `never` guards so `every` and
  `times`/`per` are mutually exclusive at compile time. Preserve that.
- The conditional return type — control members present only when
  `controls: true` — depends on the **`const O` type parameter**. Without
  `const`, TS widens `controls: true` to `boolean` and the members leak into
  every call. Do not remove `const`.
- `counter`, `nextRun`, `isActive` are **readonly refs** (`Readonly<Ref<…>>`).
  They must survive destructuring and stay live; do not change them to plain
  values or getters.

---

## 5. Invariants — do not break

These are load-bearing. Each maps to a real failure if removed.

- **Buildless + dependency-free.** Vue is the only peer dep. No runtime deps.
  Keep `dur`, `resolveJitter`, `normalize`, `longTimeout` inline.
- **No drift.** Keep grid anchoring (`anchor + count*interval`). Never collapse
  into `setTimeout(base ± jitter, …)` recursion — that reintroduces drift.
- **Jitter cap at `0.49 * interval`.** Stops fires from reordering.
- **Long delays chunk** via `longTimeout`. Never a bare `setTimeout` for the
  reschedule.
- **SSR-safe.** No timers during server render.
- **Resilient callbacks.** `fire()` swallows throws/rejections by design.
- **Types lead the implementation**, not the reverse.

---

## 6. Conventions

- Style: follow the existing file exactly — 2-space indent, no semicolons,
  single quotes, `const`-first. Do not reformat unrelated code.
- Implementation is JS + JSDoc; types live in the `.d.ts`. Do not migrate
  `index.js` to TypeScript (that would force a build step).
- Duration units: `ms s m h d w mo y`. If you extend the parser, keep the
  longest-token-first regex ordering and add a test for the new unit.
- Keep `month`/`year` as average approximations. If exact calendar boundaries
  are ever needed, isolate the date math in a `nextBoundary` helper inside
  `normalize()` — do not scatter it through the engine.
- Naming mirrors the domain: `habit`, `every`, `jitter`, `nextRun`, `counter`.
  Keep user-facing names in product terms, not implementation terms.
- If the composable is ever renamed to match the package (e.g. a `useHabicron`
  alias), add it as an *additional* export and keep `useRandomCronjob` for
  backward compatibility — do not rename in place.

---

## 7. Commands

```sh
pnpm install        # vue + tooling (dev only)
pnpm typecheck      # tsc --noEmit  — must pass before commit
pnpm test           # vitest run
pnpm test:watch     # vitest
```

`pnpm` is the package manager for this repo. Do not commit a different
lockfile.

---

## 8. Testing strategy

The engine is timer-driven, so tests must control time and randomness.

- **Fake timers:** `vi.useFakeTimers()`, drive with `vi.advanceTimersByTimeAsync`.
  Assert on `counter.value`, `nextRun.value`, and call order.
- **Determinism:** prefer injecting an RNG (see Backlog) over globally stubbing
  `Math.random`. Until that lands, stub `Math.random` to a fixed sequence.
- **Cases worth covering:** accurate spacing (no jitter); bounded jitter never
  exits `[min,max]` and never inside `min`; jitter cap holds at small intervals;
  `immediate` fires once and counts; `pause`/`resume`/`reset` semantics; union
  of multiple habits; `longTimeout` chunking for `> MAX_DELAY` delays; SSR path
  (no `window`) starts nothing; `times`/`per` interval math; the `'2h ± 5m'`
  packed form.

---

## 9. Change recipes

- **Add a duration unit:** add to `UNIT`, insert into the `TOKEN` alternation in
  the correct longest-first position, add a parser test.
- **Add an option:** update `index.d.ts` (extend `Schedule` or `ControlFlags`),
  then read it in `useRandomCronjob`/`normalize`. If it's a per-habit field, it
  belongs on `Schedule`; if it's lifecycle, on `ControlFlags`.
- **Add a returned value:** add to `RandomCronjobBase` (always present) or
  `RandomCronjobControls` (gated by `controls`), back it with a `ref`, return it
  readonly.
- **Touch scheduling math:** re-run the no-drift reasoning in §3.6 and add a
  test asserting the k-th fire stays near `anchor + k*interval`.

---

## 10. Release / publish

- Buildless: `npm publish` ships `src/` per `package.json#files`.
- Bump `version` (semver). Public API change → minor pre-1.0, breaking →
  document in the README and bump accordingly.
- Before publishing: `pnpm typecheck && pnpm test`, confirm `files` includes
  only `src`, and that `docs/` is **not** published (it isn't listed — keep it
  that way).
- `docs/index.html` is the marketing page, deployed separately (static host /
  Pages); it is not part of the package.

---

## 11. Backlog (not yet implemented)

- **Seedable RNG:** accept `random?: () => number`; thread through `randBetween`
  and `offset`. Unblocks deterministic tests and a reproducible docs demo.
- **`nextRuns(n)`:** return the next `n` fire times without executing — powers a
  live timeline in `docs/`.
- **Shiki highlighting** in `docs/index.html` if code samples start changing
  often (replaces the hand-spanned `<span>`s; matches the VitePress/Vitest look).

---

## 12. Out of scope

This is a **client-side composable**, not a durable backend job runner. It does
not provide at-least-once delivery, persistence across reloads, or distributed
coordination, and timers may be throttled by the browser when a tab is
backgrounded. Requests for those belong in a separate service (e.g. Cloudflare
Durable Object alarms / a queue), not in this package. Do not grow this library
toward server scheduling.
