---
name: cli
description: >-
  Create, set up, and manage recurring "habits" from the terminal — schedule any
  shell command or script to run on a repeating, human-rhythm cadence, then
  list / stop / update / delete them. Use whenever someone wants to create a
  habit, set up a recurring task, reminder, cron-like job, or background task
  from the command line (e.g. "remind me to drink water every hour", "create a
  habit to back up every 6 hours", "run a sync a few times a day").
---

# Create a habit from the terminal (`habit`)

Use this to **create and manage habits** from the command line: schedule any
shell command to run on a repeating, human-rhythm cadence (accurate, gently
jittered, no drift), and list / stop / update / delete them.
It works attached, or managed by a background daemon — a lightweight process
manager for habits.

```sh
npm i -g habicron   # provides the `habit` command
```

## Attached

Fires in the current terminal until Ctrl-C:

```sh
habit run --every "10s ~ 2s" -- echo "stretch"
```

## Managed (background)

A background daemon keeps habits firing; manage them like processes:

```sh
habit start --name sync --every "1h ~ 5m" -- npm run sync   # create + run in background
habit start --times 3 --per day --jitter 2h -- ./backup.sh
habit list           # id, name, status, schedule, the command it runs, runs, next/last
habit logs sync      # recent output
habit stop sync      # pause   ·   habit start sync = resume
habit restart sync
habit update sync --every 30m    # change schedule live (or -- <new command>)
habit delete sync    # remove (alias: rm)
habit kill           # stop the daemon
```

`habit list` shows what each habit runs:

```
id  name  status   schedule    command       runs  next   last
1   sync  running  every 1h~5m  npm run sync  4     in 52m  8m ago
```

## Schedule flags

`--every <dur>` · `--times <n> --per <period>` · `--jitter <dur>` ·
`-i/--immediate` · `--name <n>`.

Durations: `<num><unit>` — `ms s m h d w mo y`. Packed form `"2h ~ 5m"` (or
`+/-`) sets cadence ~ max jitter.

## Notes

- Definitions persist in `~/.habit/` (set `HABIT_HOME` to relocate); logs in
  `~/.habit/logs/<id>.log`.
- Single-host process manager — not a distributed/at-least-once scheduler.
