# Preview harness

The real views, stores and use cases, running against fabricated data instead of
a signed-in Firestore session.

```
yarn harness            # http://localhost:5199/preview-harness/
```

It exists because the states this app cares about are hard to reach by hand: a
turn that is overdue, one that is running, a category with nothing left, a page
narrowed to a lit readout. Reproducing those in the real app means signing in,
creating tasks and waiting for the clock.

## Query parameters

| Parameter | Example                       | What it does                                                                                                                                                                                                                                                                                                                                                                                               |
| --------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `at`      | `?at=2026-09-25T20:30`        | Freezes the wall clock. `HH:MM` moves the hour, which is how a state that belongs to a particular one -- a turn running, a deadline passed -- gets looked at at all; the full form moves the DAY too, for the states that belong to a weekday: a Sunday task with no catch-up window, a Monday-pinned weekly one, the week curve read on a Friday instead of on whatever morning the screenshot is taken.  |
| `theme`   | `?theme=terminal`             | One of the five themes. Defaults to `alloy`.                                                                                                                                                                                                                                                                                                                                                               |
| `accent`  | `?accent=cherry`              | Any of the twenty inks. **Sweep this** -- the accent is user-chosen, so a state that reads well on the default can collapse on someone else's, and `cherry` is the case where the accent collides with `--color-alarm`.                                                                                                                                                                                    |
| `shell`   | `?shell=wide`                 | Swaps the 420px phone column for the app's own `max-w-4xl`. The layout answers the COLUMN rather than the window -- home's curves split in two once the column is wide enough -- so the narrow default can only ever show half of it.                                                                                                                                                                      |
| `route`   | `?route=/tasks`               | Opens one of the app's routes. Only `/preview-harness/` serves the harness; a direct load of `/tasks` gets the real app's `index.html`, so a screenshot has to enter here and be sent on.                                                                                                                                                                                                                  |
| `click`   | `?click=.key.late`            | Presses one selector after the page settles (and after `route`), for states that only exist after an interaction -- including a form reached from a row: `?route=/tasks&click=a[aria-label="Editar Corrida"]`. **Repeat it** to press several in order, 400ms apart, which is the only way to reach a state that takes two taps: `?click=.key.late&click=.key.late` releases a readout and holds it again. |
| `probe`   | `?probe=.key.late&prop=color` | Writes one element's computed values into the page TITLE, which `--dump-dom` prints. Defaults to `color`, `background-image` and `border-top-color`; repeat `prop` for others. It runs after every `click`. **This is how you tell a rule that never applied from a pixel that never repainted** -- see below.                                                                                             |

Routes are the app's own (`/`, `/resumo`, `/tasks`, `/tasks/new`, `/tasks/:id`,
`/tasks/:id/edit`, `/categories`, `/categories/:id`), minus the auth guard.

## Headless screenshots

```sh
google-chrome --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --window-size=440,900 --virtual-time-budget=9000 \
  --screenshot=out.png "http://localhost:5199/preview-harness/?theme=holo"
```

Two things to know about that:

- **The painted screenshot is the ground truth, not `getComputedStyle`.** Under
  virtual time a computed value can be read mid-transition and look like the rule
  never applied.
- **Some transitions do not composite** in this mode, so a property a click just
  changed can photograph at its OLD value -- a chip still wearing the ground it
  had, a released key still wearing its pressed ink. Add
  `--force-prefers-reduced-motion` first: the app's global reduced-motion
  blanket settles every transition to 0.01ms, and the end state usually paints.
  When it does not -- and on an interpolated property such as `color` or
  `border-color` it sometimes does not, virtual time or no -- **`?probe=` is the
  tie-breaker**, because a stale pixel and a rule that never applied look
  identical:

  ```sh
  google-chrome --headless --disable-gpu --no-sandbox --virtual-time-budget=9000 \
    --dump-dom "http://localhost:5199/preview-harness/?click=.key.late&probe=.key.late" \
    | grep -o "<title>[^<]*</title>"
  # probe .key.late color=rgb(71, 83, 94) | ...   <- the rule DID apply
  ```

  The other way to see a state that only exists after a tap is to make it the
  FIRST paint: flip the default in the view for one screenshot. That is the only
  reading of a released control the camera can be trusted on. To prove motion is
  wired at all, read `transitionProperty` / `Duration` off the element instead of
  trying to photograph it.

## Keeping it honest

`repositories.ts` implements the real port interfaces and `preview-harness/` is
inside `tsconfig.app.json`, so a change to a port or an entity fails
`yarn type-check` here rather than rotting unnoticed. Fixtures are tuned so the
afternoon shows every row state at once -- add cases rather than editing one
away.
