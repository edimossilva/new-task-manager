# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server:** `yarn dev`
- **Build (with type-check):** `yarn build`
- **Build (no type-check):** `yarn build-only`
- **Type-check only:** `yarn type-check` (runs `vue-tsc --build`)
- **Lint (oxlint + eslint, with autofix):** `yarn lint`
- **Lint oxlint only:** `yarn lint:oxlint`
- **Lint eslint only:** `yarn lint:eslint`
- **Format:** `yarn format`
- **Preview production build:** `yarn preview`

No test framework is configured.

Deployed via Firebase Hosting (`firebase.json` serves `dist/` as an SPA). Firestore security
rules live in `firestore.rules` and must be deployed (`firebase deploy --only firestore:rules`) —
they are what restricts each user to `users/{uid}/**`. Firebase config comes from `VITE_FIREBASE_*`
env vars (`.env`, not committed). `.firebaserc` and the hosting cache are gitignored.

## What This App Is

A personal recurring-task tracker (UI text is in **Brazilian Portuguese**, written without
diacritics). Two entities: **tasks** -- a title, optional description, a frequency of
once / daily / weekly / monthly / yearly, an optional weekday and an optional category -- and
**categories**, which group them. A task is checked off for the *current period* and re-arms itself
when the next one starts.

Data is stored per-user in Firestore under `users/{uid}/tasks/{taskId}` and
`users/{uid}/categories/{categoryId}`, with Google sign-in via Firebase Auth. The security rules
match any collection under `users/{uid}`, so adding an entity needs no rules change.

## Architecture

Vue 3 + TypeScript SPA using **Vite 7**, **Vue Router 5** (history mode), **Pinia 3** and
**Tailwind CSS 4** (via `@tailwindcss/vite`), and **Firebase** (Auth + Firestore). The `@` path
alias resolves to `./src`.

Follow **Clean Architecture**. The dependency rule is strict: inner layers never import from outer
layers.

### Layers (inside → outside)

1. **Entities** (`src/entities/`) — pure TypeScript. `task.ts` holds the `Task` interface and the
   `createTask()` factory (ids from `crypto.randomUUID()`); `period.ts` holds the period-key
   functions. No framework imports. Re-exported through `src/entities/index.ts`.
2. **Use Cases** (`src/usecases/`) — classes taking repository ports via constructor injection and
   enforcing business rules, returning `UseCaseResult { success, error }` with a Portuguese error
   message. Port interfaces live in `src/usecases/ports/`. No Vue, no Pinia, no storage APIs.
3. **Adapters** (`src/adapters/`):
   - `src/adapters/firebase/` — lazy singletons for the Firebase app, Auth (Google popup sign-in)
     and the Firestore instance. Copied from `controle-mensal`.
   - `src/adapters/repositories/` — Firestore implementations of the port interfaces. Never import
     Vue or Pinia.
4. **UI** (outermost) — `src/views/` (one folder per entity with `*ListView` / `*FormView`),
   `src/components/`, `src/composables/`, `src/stores/`, `src/router/`.

### Data flow & key mechanics

- **`FirestoreRepository<T>`** (`src/adapters/repositories/firestore-repository.ts`) is
  `controle-mensal`'s file verbatim: a generic base that loads the whole collection into an in-memory
  `Map` on `initialize()`, then serves all reads synchronously from that cache. Writes update the
  cache immediately and persist to Firestore **fire-and-forget** (errors only logged). Consequence:
  use-case and store APIs are synchronous and there are no loading states past login.
- **Repository provider** (`repository-provider.ts`) holds module-level singletons.
  `initializeRepositories(db, userId)` constructs and initializes them after login;
  `getTaskRepository()` throws if called before that. Adding an entity means: entity + port +
  firestore repository (with serialize/deserialize) + registration in the provider + use cases +
  store + views + routes.
- **Bootstrap order** (`src/main.ts`): the auth store resolves the initial Firebase auth state
  (and initializes the repositories) **before** the router is installed and the app mounts, so there
  is no auth flicker and no route-level loading state. A global `beforeEach` redirects
  unauthenticated users to `/login`, the only route with `meta: { public: true }`.
- **Sign-out order**: `AppNav` navigates to `/login` *first*, then calls `authStore.signOut()`.
  Clearing the repositories while a data view is still mounted lets its reactivity re-enter
  `getTaskRepository()` after the singletons are gone. (`controle-mensal` does this in the opposite
  order and has the latent bug.)
- **Completion model**: a task stores `completions: Completion[]`, each `{ key, at? }` -- the
  period key (`once` / `2026-09-01` / `2026-W36` / `2026-09` / `2026`) from
  `periodKey(frequency, date)`, plus the moment the box was actually ticked. The two answer
  different questions: a yearly task ticked four times in 2026 gives the same key four times over.
  "Done now" counts entries whose key matches. **Rollover is derived, never written** —
  nothing in the app mutates state because time passed, which is what makes a client-only app with
  no scheduler correct after being closed for months. Period keys are computed from **local** time;
  `toISOString()` would roll the day over hours early west of UTC. Weekly keys use ISO-8601 week
  numbering, whose week-year can differ from the calendar year (2025-12-29 is `2026-W01`).
  `MAX_COMPLETIONS` (3650, ten years of dailies) caps the history against Firestore's 1 MiB
  document limit. Changing a task's
  frequency leaves the old keys in place: they can never match the new format, so the task correctly
  shows as pending, and keeping them preserves the history for free.
- **One-off tasks**: `once` is a frequency with no cadence, and its period key is the constant
  `'once'` -- so a task checked off stays checked off instead of re-arming, and the whole rest of
  the model (counts, `MAX_COMPLETIONS`, `matchesFrequency`) works on it unchanged. It leads
  `FREQUENCIES` and `FREQUENCY_ORDER`: a task that will not come back is the one thing today that
  cannot be put off to tomorrow.
  - `existsIn` special-cases it. A key with no date in it cannot answer "did this exist yet", so a
    one-off is compared by CALENDAR DAY instead; without that, a task created today would appear
    while browsing last month.
  - Its badge has no hue -- `--color-freq-once` is written as `var(--color-fg-soft)`, so every
    theme carries it with nothing to keep in step. The absence of a cadence reads as the absence
    of a colour.
  - A finished one-off is NOT hidden. It stays in the Unica band, struck through and sorted under
    the pending ones, until deleted: hiding it would make it unreachable, and this app has no
    archive to reach it through.
- **Repeat count per period**: a task carries `timesPerPeriod` (1..`MAX_TIMES_PER_PERIOD`, 50).
  The period key is stored **once per check-off**, so `completions` holds duplicates and "how many"
  is a `filter().length` -- a count, never a tally that something would have to reset when the
  period turns over. `isCompletedFor` becomes `count >= timesPerPeriod`; `>=` so lowering the target
  on a task with more checks already recorded leaves the period done rather than permanently
  overdone. Documents written before the feature have no field, and `deserialize` normalizes a
  missing or out-of-range value to 1 -- exactly what those tasks always meant -- so there is no
  migration.
  - Three write paths, all of them going through the private `withCount`, which rewrites one
    period to hold exactly N copies of its key and prunes the oldest OTHER keys to stay under
    `MAX_COMPLETIONS`. `toggleCompletion` is now `advanceCompletion` (one check per click, and a
    click on a full period clears it -- at `timesPerPeriod: 1` that is the old 0 -> 1 -> 0 toggle,
    unchanged); `undoCompletion` takes one back; `setCompletionCount` writes an exact count, which
    is what tapping a cell on the gauge means. The last two are **clamped, not refused**, and
    undoing nothing is a success rather than an error -- reaching them out of range means a stale
    render, and a toast about it would be noise.
  - **`CompletionGauge`** is the visible half, and it is deliberately loud: a strip of cells, one
    per required check, on its own line under the task title. A task wanting eight check-offs is a
    different kind of thing from one wanting a tick, and the row should say so before it is read.
    - Cells are the control, not a readout: tapping cell five writes five, tapping the last lit
      cell puts it out. That is why there is no `-` button in cell mode -- two ways to decrement is
      clutter.
    - The button is 15x30 and the visible cell inside it 13x18. The strip keeps its instrument
      proportions while the hit areas sit edge to edge, which is the only way a row of them is
      usable with a thumb.
    - Above `MAX_CELLS` (12) the strip degrades to one continuous hatched bar -- the home gauges'
      own track -- and the `-` button comes back as the fine control, because past a dozen the
      cells are neither countable at a glance nor big enough to hit.
    - Empty cells carry the 45-degree hatch that `.meter-track` uses, filled ones a `--color-done`
      ground with a small bloom, and the next one up is edged in `--color-accent-text` so the strip
      points at itself. Everything is drawn from role tokens, so it re-skins with the five themes.
  - `TaskStamp`'s dial draws the ratio: `stroke-dashoffset` is **bound** rather than driven by a
    keyframe, since the arc now has intermediate positions, and the button reports
    `aria-checked="mixed"` when partly done. It derives "completed" from the count instead of
    taking it as a prop, so the ring cannot disagree with the row it sits in.
  - **Every meter reads CHECK-OFFS, not whole tasks**: `TaskUseCases.checkTally(tasks, date)` sums
    each task's count for the period, clamped at its own `timesPerPeriod` so an over-full task
    cannot lend credit to the ones beside it, against a total of the targets. A task at 3/8 moves
    its band's gauge and its card's meter by three eighths instead of leaving them at zero until
    the whole task lands -- and where nothing repeats every task is worth one check, so the figure
    is the task count it always was and nothing about those pages changed. It lives in the use
    case because home and the summary both ask it and a tally computed twice is a tally that can
    drift.
  - The task-level figure is still there, in the gauge's FOOT (`N/M tarefas`, only when the band
    holds a repeat): half the checks done can still be every task open. Two numbers that mean
    different things, never one that means both. A band's own head count is the check figure, the
    same scale as the gauge above it.
  - `percent` never rounds UP to 100 while a check is open -- a band of 200 checks with one left
    would otherwise read `100%` next to `Tudo concluido`, which is now driven by the count itself.
  - `MAX_COMPLETIONS` is unchanged. A task checked eight times a day spends the budget eight times
    faster and still keeps well over a year of history.
- **Check-off history**: `at` is what makes "when was this done" answerable, and it is written by
  `withCount` -- the single write path -- so it cannot drift from the count.
  - Kept entries keep their ORIGINAL moment; only the surplus is new. `withCount` slices its own
    key's entries from the FRONT, so undo takes back the most recent check rather than the first,
    which would rewrite history the user can see.
  - `deserialize` reads both shapes. Before this, a completion WAS its period key: those documents
    are still correct, they just cannot say when, and they render as `Horario nao registrado`
    rather than being dropped or migrated.
  - `completionHistory()` groups a task's check-offs into their periods, newest first, ordered by
    the latest recorded moment with the key as the tie-break -- a frequency change leaves keys of
    several formats behind, and those do not sort chronologically against each other. Grouping
    lives in the use case because "which period is this check-off part of" is the model's own
    question.
  - `TaskDetailView` at **`/tasks/:id`** renders it, at the bottom of the page and capped at
    eight periods until asked to open: a log of four hundred periods is a page nobody scrolls.
    Two ways in from the registry: the **info icon** in the row's actions, and the task title
    itself; one from the rack, the same icon.

- **The task's own reading** (`/tasks/:id`): the only page that reads ONE task across MANY
  periods. Home reads many tasks in one period, the summary reads one week across tasks, and this
  reads one task across its whole life. Everything on it comes from
  `TaskUseCases.taskInsight(task, now)` -- one method, one pass over `completions`, because a task
  can hold `MAX_COMPLETIONS` entries and six aggregations would otherwise walk them six times.
  - **`periodIndex(frequency, key)`** in `period.ts` is what makes a streak arithmetic. Period
    keys are strings whose successor cannot be computed by hand -- `2026-W52` is followed by
    `2026-W53` in some years and `2027-W01` in others -- so each key is mapped to a monotonic
    INDEX where consecutive periods differ by exactly 1. Daily and weekly indices come from a UTC
    day number (UTC has no DST to absorb; the weekly one subtracts 4 because the epoch is a
    Thursday and Mondays sit at 4 mod 7), monthly is `year * 12 + month`, yearly is the year.
    `year * 53 + week` would NOT be linear, which is the trap this exists to avoid.
  - `parseWeekKey` inverts a weekly key the way `parseDailyKey` inverts a daily one, anchored on
    4 January -- in ISO week 1 by definition, every year -- and re-derives the key as its own
    range check, since `2025-W53` names no week. `addPeriods` steps a date by whole periods and
    always lands on a day that EXISTS: stepping back a month from the 31st would otherwise roll
    forward into the following month and a twelve-month chart would skip February.
  - **The streak does not break while the current period is still open.** A daily task kept for
    forty days must not read zero every morning until the box is ticked, so the walk starts at
    the previous period when the current one is not done yet, and includes it once it is.
    `bestStreak` is the longest run of consecutive indices ever recorded.
  - Everything counting PERIODS counts only keys written under the task's CURRENT frequency, the
    rule `completionHistory`'s callers already live by. The difference is shown rather than
    hidden: the Marcacoes tile says `N fora da cadencia` when the two totals disagree.
  - **Three charts, each answering a question the others cannot**, all drawn from role tokens and
    the same hatched track every meter in the app uses:
    - `TaskRunChart` -- the last N periods of the task's own cadence (14 daily, 12 weekly, 12
      monthly, 8 yearly), on ONE shared scale so the bars are comparable and the target notch
      sits at the height it means. Short of target is washed out, the running period is dashed
      rather than judged, periods before the task existed are dimmed rather than counted as
      misses. Above twelve bars the labels are thinned to every other one, counted BACK from the
      newest, which must always be named. The notch is drawn per bar because only the bars know
      the plot's own height -- a rule spanning the chart would be positioned against the label
      strip too.
    - `TaskHeatmap` -- eighteen weeks of days, daily tasks only: for any other cadence every cell
      in a column but one would be blank, which reads as a task nobody keeps rather than as a
      cadence that does not visit every day. Cells are built COLUMN BY COLUMN in the use case,
      which is the order a CSS grid flowing down its rows lays them out. Four steps and an
      overflow, measured against the task's own `timesPerPeriod` so a repeat task is not
      permanently pale, and an empty cell keeps a `well` ground under the hatch so the season
      reads as a grid of days rather than as marks scattered on nothing.
    - `TaskRhythm` -- WHEN the work happens, which the periods cannot say: seven weekday bars
      (anything that pins to a day, `at` first and the daily key as the fallback, the same order
      `placeCompletion` uses) beside a 24-hour polar dial (only entries carrying an `at` can
      answer). All twenty-four spokes are drawn, the empty ones as stubs: a dial missing half its
      spokes reads as a broken instrument. The peak hour takes the user's accent and sits in the
      hub as a figure.
  - The four tiles above them are the readings a habit tracker owes you: **Sequencia** (with the
    best beneath it), **Aproveitamento** (`periodsDone / periodsElapsed`, through the shared
    `percentOf`, and the only tile with a meter because it is the only figure that is a ratio),
    **Marcacoes** and **Ultima** (`Hoje` / `Ontem` / N days, with the moment beneath).
  - A **one-off** has one period and it is the current one, so it has no cadence to read: the
    streak, adherence and run-chart blocks are dropped rather than shown at zero.
  - The page's own header is a **plate** wearing the category's ink the way a rack unit does --
    rail, wash, hairline trace -- so a task looks like its category before it is read. Its
    actions stack under the title below `sm`: two buttons are 215px of a 388px line, and a title
    squeezed into what is left breaks one word per row.
- **Active flag**: `task.active` is "part of the routine right now". The home page filters on it;
  the tasks page does NOT, and that asymmetry is the whole design -- an inactive task keeps its
  history, keeps its row, and keeps the control that brings it back. It is deliberately absent
  from `isDueOn`, since a predicate that hid the task everywhere would leave no way out of the
  state. `deserialize` treats only an explicit `false` as inactive, so every document written
  before the flag reads as active and nothing disappears on deploy.
  - Each page says it in its own register: the rack fades the title, swaps an `Inativa` chip in
    where `Atrasada` would sit and stops the dial turning (`TaskStamp` takes `disabled`); the
    registry gives it a column, a tab and a power key that lights in the accent to say it can be
    switched back on. `TaskDetailView` says it with a word, `Ativar` / `Desativar`, because a page
    has room for one.
  - A card's head ratio counts ACTIVE tasks only -- it is a reading of the work, and a task nobody
    intends to do is not a debt. (It counts their CHECK-OFFS, via the shared `checkTally`.) A card
    holding nothing but inactive tasks has no ratio to give and falls back to a plain count of the
    rows, with no meter under it.

- **Weekly summary** (`/resumo`, `src/views/SummaryView.vue`): the one page that aggregates
  check-offs across tasks BY TIME. Everything else in the app reads either one task over many
  periods (`completionHistory`) or many tasks inside one period (`checkTally`); this reads one ISO
  week. `TaskUseCases.weekSummary(tasks, referenceDate)` and `weekTrend(...)` take their tasks as an
  argument for the same reason `checkTally` does -- the view holds that reactive array, and a method
  reading the repository would not re-run when a check-off is written.
  - **A check-off lands in a week by its `at` MOMENT**, falling back to the key's own SHAPE when
    there is none (`daily` -> its week, `weekly` -> itself). The shape, never `task.frequency`: a
    frequency change leaves old keys behind, and a daily key is still a day whatever the task
    became. A legacy `monthly`/`yearly`/`once` key has neither a moment nor a day, so it lands
    nowhere -- counted in `unplaced` and shown as a footnote, because silently losing work the user
    did is the one thing the page must not do.
    - The consequence is deliberate and is stated on the page: it answers "when did I do the work",
      not "which period did it satisfy". Catching up today on last week's task counts in THIS week,
      and the week that was short stays short. It is also why the page is READ-ONLY -- ticking
      something off from here while browsing a past week would move a different bar than the one on
      screen. `placeCompletion` is the single place to invert this.
  - **Only `daily` and `weekly` tasks are expected of a week.** A monthly or yearly target belongs
    to a month or a year; a seventh of it is a number nobody chose, and it would differ between a
    four- and a five-week month. Those check-offs are reported as `extras`, never folded into the
    ratio. The expectation runs through `isDueOn`, so the summary cannot claim work home never
    showed as due, and only ELAPSED days count -- compared noon to noon, since the day cells
    are built at noon and the clock is not.
  - Crediting is per PERIOD (`creditCounts`): eleven Monday check-offs on a task wanting three
    cannot cover Tuesday. `done` is the honest volume, `credited` the part the ratio uses, and
    `extras` is everything between -- surplus, stale-format keys, inactive tasks, the cadences with
    no weekly demand. The invariant is `routine.done + extras === every check-off the week owns`.
  - **The day strip carries its own totals.** `dailyDemand(task, day, now)` is what one DAY asks of
    one task -- dailies and nothing else, because a single day is the only period a daily owns; a
    weekly, monthly or yearly target belongs to a span of days and cannot be charged to one of
    them. It is written once and summed two ways, across tasks for `expectedByWeekday` and across
    days by `weekExpectation`, so the strip and the Diaria band cannot disagree (the invariant:
    `sum(expectedByWeekday) === bands.daily.expected`). The strip therefore does NOT add up to
    `routine.total`, and the block says so (`Metas diarias apenas`) rather than implying it does.
    Elapsed is compared by day KEY, not by timestamp -- the cells are built at noon and the clock
    is not, so `day <= now` would drop today every morning.
    - All seven bars share ONE scale, the tallest figure in the week (done or asked), so they are
      comparable and the target NOTCH sits at the height it means. A hairline rather than a second
      bar: it is the reference the fill is read against, not a quantity of its own. A fill short of
      its notch is washed out, so the day says it fell short before the figures are read.
  - Two limits the page prints rather than papers over: targets are counted from TODAY's settings
    (nothing versions `timesPerPeriod` or `active`), and a deleted task took its check-offs with it.
  - The week comes from the shared `referenceDate`, so there is one clock and one browsed date:
    prev/next are `periodStore.step(±7)`, bounded by `canStep`, and a trend bar taps through
    `setDate` -- or `clear()` when it is the current week, so a round trip resumes following the
    clock. `PeriodSelector` is deliberately not mounted here: it picks a day, and this page's unit
    is a week. `periodStore.contains()` is public so the strip can DISABLE the weeks `setDate`
    would refuse; a control that silently does nothing is worse than one that says it cannot.
  - The view's `mondayKey` is a STRING computed on purpose: the clock ticks every 60s, and a
    computed whose value is unchanged does not dirty its dependents, so the aggregation re-runs
    when the day turns over rather than every minute.
  - `weekTrend` walks every task's completions ONCE, bucketing into the eight weeks in scope --
    eight passes over `MAX_COMPLETIONS` entries per task is what the `Map` avoids.
  - Week math lives in `period.ts` (`weekStart`, `weekDates`, `addWeeks`, `parseDailyKey`,
    `formatWeekShort`, `formatWeekRange`); `PeriodSelector` was refitted onto `weekDates` so
    Monday-first has one definition. `parseDailyKey` never calls `new Date(key)` -- the date-only
    ISO form parses as UTC, so west of it `2026-09-01` comes back as 31 August, a whole week wrong
    at a boundary -- and it re-derives the key as its own range check, which rejects `2026-02-31`
    without a table of month lengths.
  - `percentOf(tally)` is shared with the home gauges: no two meters in the app may round
    differently, and neither rounds UP to 100 while a check is still open.
  - The nav's `Resumo` label moved to this page, and `/` became **`Hoje`** -- which is what the
    home page is. Four dock links share the width, so the label gives up letterspacing before it
    gives up a character.

- **Design tokens are ROLES, never colour names** -- `void` (ground), `panel`, `well`, `fg`,
  `fg-soft`, `fg-faint`, `line`, `line-strong`. The same token is deep navy in one theme and cool
  aluminium in another, so `bg-paper` would have been a lie. Tailwind 4 **errors on an unknown
  utility class at build time**, which makes a token rename safe: a missed call site fails the
  build rather than silently losing its style.
- **Five themes** (`src/entities/theme.ts`), each a complete instrument panel -- ground,
  foreground, line weight, geometry (`--radius-*`), shadow language (`--panel-shadow`) and
  atmosphere (`--tex`, painted by `body::before`). `@theme` holds the default, **Aluminio**, and
  its `[data-theme='alloy']` block carries only what `@theme` cannot (the surfaces, which are not
  Tailwind tokens); every other theme restates the full set of role tokens in its own
  `[data-theme='...']` block in `main.css`. The base block stays **first** in the file: `:root` and
  `[data-theme]` have equal specificity, so a later base block would repaint the chosen theme.
  Changing which theme is the default therefore means moving values between `@theme` and a block,
  flipping `--color-accent-text` and `.ink-text`, and updating `DEFAULT_THEME` plus the
  `theme-color` meta in `index.html` -- the light/dark decision is baked into all four. `terminal` also swaps
  `--font-sans` to the mono face, so the whole panel becomes one readout.
- **The ink palette** (`src/entities/palette.ts`) is the single source of truth for colour:
  twenty named inks, each with **four** values. One hex cannot do four jobs -- `base` for fills,
  `deep` for the ink as TEXT on a LIGHT ground, `bright` for TEXT on a DARK ground, `dim` for
  washes. `bright` exists because darkening for contrast only works one way: `deep` on near-black
  is *less* visible than `base`, not more. Themes choose between them through
  **`--color-accent-text`** (`deep` by default, since the default theme is the light one; the four
  dark themes each point it at `bright`), so no component ever needs to know whether the ground is
  light or dark. Category inks make the same choice through the shared **`.ink-text`** class: bind
  `--cat-bright` and `--cat-deep` inline and add the class. That one has to be a SELECTOR rather than the same variable indirection -- a
  custom property holding `var(--cat-bright)` is substituted where it is DECLARED, so declaring it
  at `:root`, where no ink is bound, is invalid at computed-value time and every label silently
  falls back to the inherited colour. Every value is verified at
  >= 4.5:1 against all five grounds. **Anywhere ground-coloured text sits on the accent, use
  `accent-text`, not `accent`** -- amber at base strength is 2.05:1. Only ink **names** are
  persisted, never hex. The table lives in TS rather than CSS: duplicating twenty quadruples into
  `@theme` would guarantee drift.
- **Theme and accent are both user-chosen** (`src/stores/appearance-store.ts`), and orthogonal:
  any of the nineteen accents composes with any of the five themes. The store writes the picked
  ink's values onto `:root` as `--color-accent{,-bright,-deep,-dim}` and sets `data-theme` on the
  root element (also syncing the `theme-color` meta so mobile browser chrome follows). It persists to
  `users/{uid}/settings/appearance`, modelled as a one-document collection so it rides the generic
  collection-shaped repository with no new machinery. `load()` runs inside `setupSession` **after**
  the repositories initialize and therefore before the app mounts, so there is no flash of the
  default; `reset()` runs on sign-out so the next user does not inherit it. `ACCENT_CHOICES`
  excludes `ink`: a black accent is degenerate, and it would vanish against a dark ground.
- **Categories** (`src/entities/category.ts`) are a full entity with their own collection, CRUD
  views and routes, mirroring `controle-mensal`'s `payment-categories`. A task's `categoryId` is
  **optional** -- tasks predate categories and must keep working without one.
  - `CategoryUseCases.delete` is **blocked while any task references the category**, the same guard
    the reference app puts on owners. `countTasks` drives the list column and that guard.
  - **The category's own page** at **`/categories/:id`** (`CategoryDetailView.vue`) is the task
    page's shape one altitude up. A task's page answers "am I keeping this"; only a page holding
    all of them can answer **"which of these am I keeping"**, and that roll -- every task with its
    adherence meter, streak and last check-off, WORST FIRST -- is the reading nothing else in the
    app gives. Ways in: the badge and the info key on the categories page, and both the name and
    an info key in the head of every rack unit on home -- the same glyph the task rows wear
    (`CategoryInfoLink`, on the shared `.task-action` shape), because it is the same job one
    altitude up. The unfiled unit is not a category and has none.
    - It owns no aggregation of its own. The rows are `taskInsight` per task, the trend is
      `weekTrend(categoryTasks, ...)` and the horizons are `weekSummary(...).bands` -- every
      figure narrowed to this category by filtering the task array the methods already take.
    - **A week is the only period every cadence shares**, so this page counts in weeks where a
      task's page counts in its own periods. The trend is fed to `TaskRunChart` by mapping a week
      onto a period (done -> count, expected -> target), so both pages speak one bar language and
      there is no second chart component. That mapping is why the chart's target notch is
      computed **per bar**: a category's weeks ask for different amounts as its tasks come and go.
    - Adherence is **pooled, not averaged**: periods done over periods asked, summed across
      tasks. An average of percentages would let a yearly task with one period on the books weigh
      as much as a daily one with three hundred, which is not what the figure means.
    - A horizon a week cannot ask of -- monthly, yearly, one-off -- gets a **dashed gap instead of
      an empty meter**: a hatched track reading zero is a claim of failure, and nothing was asked
      of a monthly task this Tuesday. The same grammar as the unfiled rack unit's rail.
    - `taskInsight` special-cases the one-off's `periodsDone`, since it has a period but no index
      to land in `doneIndices`: without it a FINISHED one-off would read 0% kept on this roll,
      which is the opposite of the truth.
  - Colour is an ink name from the shared palette (all twenty offered). `deserialize` falls back
    to `DEFAULT_CATEGORY_INK` for an unknown value rather than rendering an unstyled chip.
  - `InkSwatches.vue` is shared by the category form and the accent picker, and binds colours
    inline from `INKS` -- twenty per-ink CSS classes in each consumer was the alternative.
  - `CategoryBadge` is deliberately quieter than `FrequencyBadge` -- a dot plus text, no filled
    ground. Two saturated chips per row was too noisy on a phone.
- **Two pages, two shapes.** `/` (Hoje) is the RACK: cards of category modules, for checking
  today's work off. `/tasks` is the REGISTRY: one table row per task, for editing the templates.
  The split is the point -- a template has no "done", so the tasks page mounts no
  `PeriodSelector`, filters nothing by `isDueOn`, and shows no completion state at all. Nothing on
  it changes when the clock does.
- **The rack** (`CategoryTaskCard.vue`), one card per category with the unfiled bucket last, laid
  out by the shared `.rack` class in CSS **columns** (1 / 2 / 3 by breakpoint) so a unit with two
  tasks stays short instead of padding itself out to match a unit with nine. `buildCategoryRack()`
  does the grouping, preserving whatever order the caller sorted into. It is a plain function
  rather than a composable because every caller builds SEVERAL racks inside one computed -- one
  per band on home, one per category on the summary -- which a composable cannot do in a loop.
  - Each unit wears its category's ink four ways: a rail down the left edge, a wash across the
    head, a trace mixed into the hairline, and the fill of its own progress meter -- that
    category's check-offs for the browsed period, on the same hatched track the home meter uses.
    The unfiled unit has no ink, so its rail is drawn as a dashed gap and its meter goes grey.
  - A task pointing at a category that no longer exists falls into the unfiled bucket rather than
    out of the page. The delete guard makes it unlikely, but a task nothing renders is a task
    nobody can edit or delete.
  - The card carries only what checking off needs: stamp, title, gauge, weekday and state chips,
    and **one action -- `TaskInfoLink`**, the way into the task's own page. Reading a task is
    safe from a page whose job is ticking things off; editing, switching off and deleting belong
    to the registry. No description and no frequency badge (the band above already names it). It
    had a second, denser mode while the tasks page shared it; the table took that job, and a
    component with one caller has no reason to keep the branch.
  - The chip row is dropped entirely when a task has nothing to say there, rather than spending
    its top margin on an empty line, and the info link is pulled up out of the row's padding so a
    44px target cannot make a row taller than its 30px stamp.
  - Above the bands sits a **gauge per band**, not one meter for the day: four dailies left and
    one yearly left are not the same debt, and a single bar averaging them says neither. Each
    gauge is tinted with its band's frequency ink, so a glance maps it to the stratum below
    without reading the label, and the cluster wraps rather than gridding, so one horizon or five
    both read.
  - The **home page** stacks its units in one **band per frequency**, `FREQUENCIES` order: Unica
    on top, then Diaria, Semanal, Mensal, Anual. Each band holds its own rack, so a category with a daily
    and a monthly task appears once per band -- the band is the outer axis, the category the
    inner. A band's rule starts at that frequency's `--color-freq-*` ink and burns off, and the
    head carries its own done/total; empty bands are dropped rather than shown.
  - Home has **no Pendentes / Concluidas split**: one card per category, holding all of it. The
    sort carries what the split used to say -- Atrasada, then pending, then done, so what needs
    attention rises and what is finished sinks under it -- and the head's ratio plus meter turn
    each card into that category's reading for the day. It replaced `DashTaskGroups`, which
    grouped by frequency inside one list; the frequency is now the band around the cards, so the
    sort inside a card needs no term for it -- status, then title.
- **The registry** (`TaskListView.vue`): EVERY task, once, whether or not it is due today, active,
  or finished. Six fields, all of them properties of the template -- title (+ description),
  frequency (+ weekday), category, `timesPerPeriod` as `Nx`, `Ativa` / `Inativa`, and the row
  actions. It is the only place that shows the whole set, which is what makes it the place to
  find a task you have not seen in a month.
  - A table above `md` and a stacked card list below it, the same pair `CategoryListView` uses:
    six columns on a 360px screen is a horizontal scroll nobody wants. Both render the same rows
    from the same sort, so there is one list with two typographies, not two lists.
  - Sorting is `useSortable` again, driven by the **column heads** where they exist and by an
    `Ordenar` select plus direction toggle below `md`, where they do not -- the select is
    `md:hidden` precisely so no width offers two ways to do it. The `category` key sorts unfiled
    last with a `\uffff` sentinel, matching the rack's own order.
  - The default is **category, then frequency, then title**, and it is built out of ONE sort key
    rather than a multi-key comparator: the rows are pre-sorted by frequency and title, and
    `Array.prototype.sort` is stable, so every column the user picks keeps that pair as its
    tie-break and the opening `category` key reads as all three. Reversing Categoria therefore
    flips the grouping while leaving frequency and title ascending inside it, which is what a
    reader of the column expects.
  - **The row is washed in its category's ink** -- `dim`, the same 12% the rack unit's head
    takes, so a category looks the same on both pages and the table groups visually under the
    default sort without a header row per category. Bound inline from `INKS`, as every ink in the
    app is. A `tinted` class, not a fallback value, is what marks a row that HAS a category: an
    unfiled row must keep the ordinary `bg-well` hover rather than a wash of a colour it does not
    have. The table row takes the wash as a `background-color` (the table's panel is under it);
    the mobile card takes it as a `linear-gradient` IMAGE, because there it has to composite over
    `bg-panel` rather than replace it, and its hairline takes a trace of the ink the way the rack
    unit's does.
  - Filters are frequency, category (including `Sem categoria`, keyed by the shared `UNFILED`)
    and a `Todas / Ativas / Inativas` tab strip. The tab counts read the OTHER two filters only,
    so they stay stable as the tab is switched -- the same relationship the status tabs had.
  - `TaskRowActions.vue` is the four things the registry can do to a task: power, details, edit,
    delete. Shared by the table row and the mobile card rather than written twice, since two
    copies of an icon set are two icon sets. The details glyph is its own `TaskInfoLink.vue`,
    because the rack draws that one alone and a glyph drawn twice is a glyph that drifts.
  - `.task-action` -- the control shape those icons wear, a 44px-tall target showing a 17px inline
    SVG (the app has no icon set), faint until hovered, `--color-alarm` for delete and the accent
    for the rest -- lives in `main.css` `@layer components`, not in a scoped block: two components
    draw it now, and a control shape defined twice is a control shape that drifts.
  - Every category head on the rack once carried a `+` key opening `/tasks/new?category=<id>`;
    the registry has one `Nova` button and a category select in the form, so the query parameter
    is now only what `TaskFormView` still honours. It checks the id against the loaded categories
    first, since a select whose value matches no `<option>` renders blank, and only for a NEW
    task, so it can never overwrite what an edited one points at.
- **Weekday-pinned weekly tasks**: a `weekly` task may carry an optional `weekday`
  (`Weekday = 1..7`, **ISO-8601 Monday = 1**). Completion is still the ISO **week** key, so the
  weekday says only *when in the week the task is due* -- adding or changing one needs no migration
  and an already-ticked week stays ticked. Never encode the weekday into the key.
  - Monday-first is load-bearing: the feature is a `>=` comparison, and `getDay()`'s Sunday-first
    0..6 makes Sunday the smallest value while being the last day, which would hide every
    constrained task on Sundays. `isoWeekday()` in `period.ts` is the only `getDay()` call in the
    app, and `isoWeek` is written in terms of it so the two conventions cannot drift.
  - Three states per week: hidden before its day, `Pendente` on it, `Atrasada` (still tickable)
    after it. A Sunday task therefore has no catch-up window; a Monday task is late six days in
    seven.
  - `isDueOn` = `existsIn && appearsOn` is the **single** predicate the views filter by; `appearsOn`
    (the weekday gate alone) is private so the two cannot diverge. `isLateOn` carries two
    non-obvious guards: a task created *after* its due day in the same week is not late (`existsIn`
    is week-granular, so a Friday-created Terca task would otherwise be born overdue), and a
    reference date in the future is never late (browsing forward inside the current week).
  - The invariant "weekday set implies weekly" is enforced in `create`/`update`, not the form --
    `TaskFormView` spreads `{ ...existing, ...input }`, where an omitted key preserves the old value
    rather than clearing it. `deserialize` also coerces out-of-range values to `undefined`, since a
    `weekday: 8` would be permanently invisible and so undeletable.
  - `Qualquer dia` is `undefined`, never `1`: Monday and unconstrained match identically for
    visibility but differ for overdue.
- **Period selection** (`src/stores/period-store.ts`): the store owns both the live clock (`now`,
  ticked every 60s and on `visibilitychange`) and `selection` — `{ year, month, day } | null`, where
  **null means follow the clock**. `usePeriodSelection()` derives `referenceDate`, `today` and
  `isToday` from it, and `PeriodSelector.vue` renders the Dia/Mes/Ano selects. Details that matter:
  - The clock is in the **store, not a composable**, because a composable's `onMounted` gives every
    caller its own interval and its own `now` ref — two refs sampled either side of midnight would
    have the selector and the view disagree about the date.
  - `referenceDate` uses a ternary, not `??`: with a selection pinned it never reads `now`, so it
    never subscribes and the tick cannot drag the view back to today.
  - Month is **1-based** everywhere (store, selector, `daysInMonth`), matching the period-key
    format, and converted to `Date`'s 0-based month at exactly one site — which builds at **noon**,
    since local midnight does not exist on a DST-transition day in some zones.
  - The day is clamped by `daysInMonth` **and** the option list is trimmed. Both are needed: a value
    with no matching `<option>` renders the select blank.
  - Labels that say `Hoje` must compare against `today`, not `referenceDate`, or an August key would
    be labelled `Hoje` while browsing August.
  - The selection is not persisted, and `AppNav` clears it on sign-out.
  - Browsing the past reconstructs it from tasks that still exist; `existsIn` hides tasks created
    after the browsed period, but hard-deleted tasks cannot be recovered.
- **Auth** (`src/adapters/firebase/firebase-auth.ts`) is `controle-mensal`'s file verbatim:
  `signInWithPopup` + `GoogleAuthProvider`, `onAuthStateChanged`, and `signOut`. The Firebase SDK
  owns session persistence and token refresh. Unlike `controle-mensal` there is no sharing feature,
  so `setupSession` initializes the repositories against the signed-in uid directly rather than
  resolving an effective data-owner uid.
- **Stores** are thin Pinia wrappers: they construct use cases on each call via `createUseCases()`
  (pulling repos from the provider), copy results into `ref`s, and push success messages through
  `notification-store` (rendered by `NotificationToast` in `App.vue`).

## Code Style

- **Prettier:** no semicolons, single quotes, 100-char print width, 2-space indent, LF
- **Linting:** OxLint runs first, then ESLint (configured to skip rules OxLint covers)
- Vue components use `<script setup lang="ts">`; Pinia stores use the composition/setup style
- File naming: kebab-case for `.ts` files, PascalCase for `.vue` components
- Tailwind 4 is configured CSS-first: there is no `tailwind.config.js`, all tokens are `@theme`
  variables in `src/assets/main.css`, and any SFC `<style scoped>` block using `@apply` **must**
  open with `@reference "../assets/main.css"` (`../../` from `views/tasks/`)
- User-facing strings are in Portuguese, written without diacritics. Code identifiers, comments,
  documentation and commit messages are in English
