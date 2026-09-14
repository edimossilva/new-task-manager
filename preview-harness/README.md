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

| Parameter | Example           | What it does                                                                                                                                                                                                            |
| --------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `theme`   | `?theme=terminal` | One of the five themes. Defaults to `alloy`.                                                                                                                                                                            |
| `accent`  | `?accent=cherry`  | Any of the twenty inks. **Sweep this** -- the accent is user-chosen, so a state that reads well on the default can collapse on someone else's, and `cherry` is the case where the accent collides with `--color-alarm`. |
| `click`   | `?click=.turnbar` | Presses one selector after the page settles, for states that only exist after an interaction.                                                                                                                           |

Routes are the app's own (`/`, `/resumo`, `/tasks`, `/tasks/:id`, `/categories/:id`),
minus the auth guard.

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
- **Some transitions do not composite** in this mode. Both end states render, so
  check those; to prove motion is wired, read `transitionProperty` / `Duration`
  off the element instead of trying to photograph it.

## Keeping it honest

`repositories.ts` implements the real port interfaces and `preview-harness/` is
inside `tsconfig.app.json`, so a change to a port or an entity fails
`yarn type-check` here rather than rotting unnoticed. Fixtures are tuned so the
afternoon shows every row state at once -- add cases rather than editing one
away.
