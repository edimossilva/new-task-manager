# Preview harness

The real views, stores and use cases, running against fabricated data instead of
a signed-in Firestore session.

```
yarn harness            # http://localhost:5199/preview-harness/
```

It exists because the states this app cares about are hard to reach by hand: a
turn that is overdue, one that is running, a category with nothing left, a row
under a spotlight. Reproducing those in the real app means signing in, creating
tasks and waiting for the clock.

## Query parameters

| Parameter | Example                | What it does                                                                                                                                                                                                                                                                                                                                                                                              |
| --------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `at`      | `?at=2026-09-25T20:30` | Freezes the wall clock. `HH:MM` moves the hour, which is how a state that belongs to a particular one -- a turn running, a deadline passed -- gets looked at at all; the full form moves the DAY too, for the states that belong to a weekday: a Sunday task with no catch-up window, a Monday-pinned weekly one, the week curve read on a Friday instead of on whatever morning the screenshot is taken. |
| `theme`   | `?theme=terminal`      | One of the five themes. Defaults to `alloy`.                                                                                                                                                                                                                                                                                                                                                              |
| `accent`  | `?accent=cherry`       | Any of the twenty inks. **Sweep this** -- the accent is user-chosen, so a state that reads well on the default can collapse on someone else's, and `cherry` is the case where the accent collides with `--color-alarm`.                                                                                                                                                                                   |
| `shell`   | `?shell=wide`          | Swaps the 420px phone column for the app's own `max-w-4xl`. The layout answers the COLUMN rather than the window -- home's curves split in two once the column is wide enough -- so the narrow default can only ever show half of it.                                                                                                                                                                     |
| `route`   | `?route=/tasks`        | Opens one of the app's routes. Only `/preview-harness/` serves the harness; a direct load of `/tasks` gets the real app's `index.html`, so a screenshot has to enter here and be sent on.                                                                                                                                                                                                                 |
| `click`   | `?click=.turnbar`      | Presses one selector after the page settles (and after `route`), for states that only exist after an interaction -- including a form reached from a row: `?route=/tasks&click=a[aria-label="Editar Corrida"]`.                                                                                                                                                                                            |

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
  changed can photograph at its OLD value -- a stood-down card still at full
  opacity, a chip still wearing the ground it had. Add
  `--force-prefers-reduced-motion`: the app's global reduced-motion blanket
  settles every transition to 0.01ms, and the end state paints. To prove motion
  is wired at all, read `transitionProperty` / `Duration` off the element
  instead of trying to photograph it.

## Keeping it honest

`repositories.ts` implements the real port interfaces and `preview-harness/` is
inside `tsconfig.app.json`, so a change to a port or an entity fails
`yarn type-check` here rather than rotting unnoticed. Fixtures are tuned so the
afternoon shows every row state at once -- add cases rather than editing one
away.
