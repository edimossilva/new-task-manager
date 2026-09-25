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
once / daily / weekly / monthly / yearly, an optional weekday, an optional turn and an optional
category -- and **categories**, which group them. A task is checked off for the *current period*
and re-arms itself when the next one starts.

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
  - **A finished one-off belongs to the DAY it was finished on**, and Hoje shows it on that day
    only (`settledElsewhere`, the third gate in `isDueOn`). Every other cadence re-arms, so a
    done period stays on the page it belongs to and the next one opens by itself; a one-off has
    a single period that never ends, so without this it sat in the Unica band forever, struck
    through, on a page whose whole job is what is still open. Browse back to the day and the row
    is there, struck through, exactly as it was.
    - It was deliberately NOT hidden before the registry existed, when hiding it would have made
      it unreachable. `/tasks` now shows every task whether or not it is due, so the row stays
      editable and deletable and the objection is gone.
    - The rule reads the check-off's `at`, since that is what answers "which day". A completion
      written before `at` existed cannot be placed, so those keep showing -- the reading the app
      has always given them, rather than a task quietly vanishing on deploy. A one-off wanting
      several check-offs only settles once it is full, which is the same `>=` the rest of the
      model uses.
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
    - Empty cells carry the same 45-degree hatch every meter in the app draws (there is no
      shared class for it -- the gradient is restated in each scoped block), filled ones a
      `--color-done` ground with a small bloom, and the next one up is edged in
      `--color-accent-text` so the strip points at itself. A cell whose turn has passed with the
      chamber still empty is edged in `--color-alarm`. Everything is drawn from role tokens, so it
      re-skins with the five themes.
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
      (anything that pins to a day, `at` first and the daily key as the fallback -- the OPPOSITE
      order to `completionDay`, which asks which period a check-off belongs to, because the dial
      beside these bars can read nothing but `at` and the two must tell one story)
      beside a 24-hour polar dial (only entries carrying an `at` can
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
    has room for one. The form carries an `Ativa` checkbox, last among its fields, so a task
    can be created out of the routine or switched while being edited; `CreateTaskInput.active`
    defaults to `true`, so every other caller of `createTask` is unchanged.
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
  - **A check-off lands in the week its own PERIOD belongs to** (`placeCompletion`), read off the
    key's own SHAPE (`daily` -> its week, `weekly` -> itself) and never off `task.frequency`: a
    frequency change leaves old keys behind, and a daily key is still a day whatever the task
    became. So the page answers **"which period did it satisfy"**, the same question the bands,
    the gauges and the run chart answer -- browsing back to yesterday and ticking the box fills
    YESTERDAY. Placing by the moment instead was a bug the page could not survive: the day the
    work was FOR read short while the day it was ticked on read over target, and a Sunday caught
    up on Monday left the week it belonged to entirely.
    - A legacy `monthly`/`yearly`/`once` key names no week, so those fall back to the **moment**,
      the only thing they carry a week can be read from. With neither, the entry lands nowhere --
      counted in `unplaced` and shown as a footnote, because silently losing work the user did is
      the one thing the page must not do.
    - `completionDay` is the same order one resolution finer, and the two must agree or a check-off
      would be counted in one week and drawn on another week's column. A moment pins a dayless key
      to a day only while it falls INSIDE the placed week; a weekly task caught up the following
      Tuesday is `undated` in its own week rather than drawn on a day it was neither done nor due.
    - The page stays READ-ONLY regardless: ticking something off from here would move a bar while
      browsing a past week, and the unit on screen is a week where a check-off is a day's.
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
  - **The day strip carries its own totals** (`WeekStrip.vue`, this page's alone: home reads the
    same seven numbers as a CURVE, since the ledger wants each day square and countable where
    home wants the shape of the run).
    `dailyDemand(task, day, now)` is what one DAY asks of one task -- dailies and nothing else,
    because a single day is the only period a daily owns; a weekly, monthly or yearly target
    belongs to a span of days and cannot be charged to one of them. It is written once and summed
    two ways, across tasks for `expectedByWeekday` and across days by `weekExpectation`, so the
    strip and the Diaria band cannot disagree (the invariant:
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
  `--font-sans` AND `--font-display` to the mono face, so the whole panel becomes one readout --
  which is why JetBrains Mono is requested at **400;500;600;700** in `index.html`: in that theme
  the headings are mono too, and the missing weights were being synthesised into a faux bold.
  Every weight a rule asks for must be in that URL or the browser smears the nearest one.
- **Fault states never wear an ink.** `--color-alarm` is the one colour the app reserves for
  "this is wrong", and `Atrasada` used to be drawn in `--color-accent-text` -- whatever the user
  picked for delight, so a green accent had the overdue tag reading as a commendation. Anything
  saying a deadline has passed (the chip, the row rail, the stamp's track, the gauge's overdue
  cells, a late `TurnBadge`, the annunciator) speaks in `--color-alarm` / `--color-alarm-dim`.
- **The accent is the PRESENT, not a fault.** It was already used that way -- `.cell.next` edges
  the chamber a tap would fill -- and the running turn extends it from "up next" to "on now".
  So the row states read as one scale: `--color-alarm` for the deadline you missed,
  `--color-accent-text` for the one running, nothing for the one still ahead. A fault outranks a
  prompt wherever both could apply.
- **Only the fault gets a word.** `Atrasada` is a chip; the running turn has none. The accent is
  USER-CHOSEN and can land anywhere on the wheel, the alarm included, so a red accent makes the
  two states the same hue -- and the word is what still tells them apart. That asymmetry is the
  reason the fault keeps its tag and the prompt does not need one: a missed deadline is a claim
  worth spelling out, being on time is ambient.
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
  - Every row is resolved ONCE into a view model (count, completion, `dueByNow`, `turnState`,
    turn groups). Each of those walks the task's check-offs, and the template used to ask five
    of them per row, the count twice over for the stamp and the gauge.
  - **A unit whose every ACTIVE task is kept rules its own name through**, in the done ink, the
    same green the task titles and the kept turn chips take. Counted off the shared `checkTally`
    rather than the rows, so the strike cannot disagree with the ratio in the head beside it,
    and gated on `total > 0` so a unit holding nothing but inactive tasks -- which has no ratio
    to give -- does not read as finished.
    - The rule is a **background gradient sized from 0**, not `text-decoration`, for two
      reasons: a decoration cannot be transitioned, so the last check-off would snap the line
      on; and this sizes to the TEXT, where a pseudo-element on `.unit-name` would span the
      whole flexed head. It rides an inline `.unit-label` present in both branches, so the
      unfiled bucket settles exactly as a category does.
    - There is no transition to run on a card already settled at first paint, so it simply
      renders struck. The sweep belongs to the check-off that earned it, not to every page load.
  - **A late row is the panel's other annunciator.** It takes an alarm rail INSIDE the category's
    own (never flush with it, or the two read as one thick edge), a wash running off to the right
    so the left margin the eye scans is lit without tinting the title, an `Atrasada` chip and a
    `TaskStamp` whose unswept track goes alarm -- the control you reach for IS the lamp, so the
    row needs nothing further. The rail fills the list's own left padding, so rail, gutter and
    wash are one continuous field rather than a line floating off the text.
  - A task pointing at a category that no longer exists falls into the unfiled bucket rather than
    out of the page. The delete guard makes it unlikely, but a task nothing renders is a task
    nobody can edit or delete.
  - The card carries only what checking off needs: stamp, title, gauge, weekday, turn and state
    chips, and **one action -- `TaskInfoLink`**, the way into the task's own page. Reading a task is
    safe from a page whose job is ticking things off; editing, switching off and deleting belong
    to the registry. No description and no frequency badge (the band above already names it). It
    had a second, denser mode while the tasks page shared it; the table took that job, and a
    component with one caller has no reason to keep the branch.
  - **A row with a check-off says WHEN the latest one was**, on its own line under the title,
    from the first check-off on rather than only once the period is finished -- a task at one of
    two has still been worked on. It is the latest recorded moment among the browsed PERIOD's own
    check-offs (`lastCompletionAt`), never the task's overall last one, so browsing back to
    Tuesday names Tuesday's. A daily's period is the browsed day, already named at the top of the
    page, so it reads the hour alone (`14:30`); every other cadence spans days and reads
    `dd/mm/yyyy HH:MM`. Check-offs written before `at` was recorded have nothing to say and the
    line is dropped rather than filled with a placeholder.
  - The chip row is dropped entirely when a task has nothing to say there, rather than spending
    its top margin on an empty line, and the info link is pulled up out of the row's padding so a
    44px target cannot make a row taller than its 30px stamp.
  - **The annunciators** sit above the gauges: a wrapping row of self-sizing segments, laid out
    the way the gauge cluster under them is, so the page keeps one rhythm and two stacked
    full-width bars do not read as a pile of notices. Each segment appears only when it has
    something to say -- an annunciator that is always lit annunciates nothing -- and a lone one
    stretches to the full width.
    - **Atrasadas** is hazard-hatched: the app's own 45-degree meter hatch coarsened from a 3px
      scale pitch to a 6px hazard pitch, so a warning and a scale cannot be confused. Its lamp
      pings rather than blinks; the global `prefers-reduced-motion` blanket settles it to a
      plain dot. Each band head repeats the figure for its own horizon.
    - **Para agora** is deliberately NOT hatched -- a turn that is simply running is not a
      hazard -- and its lamp is the **same caret the rows wear in their gutter**, so the figure
      here and the marks down the page are visibly one instrument: every row carrying that
      caret is one of the N counted. It names its turn on the right, above 380px.
    - The two counts **overlap on purpose**. A task whose morning was missed and whose afternoon
      is running is in both, because "what did I miss" and "what is due now" are different
      questions and it is the honest answer to each.
    - The counts are set at the LABEL's own size, so each segment is one line of panel type
      rather than a display figure with a caption under it. The lamp, the ground and the border
      carry the readout; the number only has to be legible, and a big one competed with the
      gauge figures directly below for no gain.
    - **Both segments are BUTTONS, and tapping one spotlights what it counts**: its rows take a
      ring and a lit field and strike once, every other row stands down to 30%, and a card
      holding nothing the readout counts dims as a whole so the eye can skip it rather than read
      every row in it. `--spot-ink` is set on the ROW by the state it is lit for, so one set of
      rules serves both readouts and the fault cannot borrow the accent or the reverse. Stood-down
      rows stay legible and still tappable -- this is emphasis, not a filter.
    - **The page OPENS on both**, the `both` state: what was missed and what is running are the
      two things a day asks of you, and the panel should already be pointing at them. Tapping a
      readout from there NARROWS the page to that one question (`both` is not `which`, so the
      existing toggle does it), and tapping it again releases the page. There is no way back to
      `both` inside a day, which is the trade for a default that needs no second control.
      Under `both` a unit can hold rows of each kind, which is why the ink moved to the row: a
      fault outranks a prompt wherever both could apply, so a row that is late and running reads
      alarm.
    - A spotlight lighting NOTHING would stand every row on the page down, so `litSpotlight` --
      what the cards are actually given -- falls back to none when the sets it holds are empty.
      That is the morning with nothing late and nothing running, and it is also the moment the
      last counted row is checked off.
    - The spotlight is a plain `ref` in `HomeView` handed down as a prop rather than a store: it
      is ephemeral view state. It returns to the default when the browsed DAY changes, since the
      sets are computed against a date and one left on from Monday would light a different
      answer. The watcher keys on the day KEY, never on `referenceDate` itself: while nothing is
      pinned that Date is the clock, and a watcher on it fired every sixty seconds -- which
      silently put the spotlight out a minute after any tap.
    - `Spotlight` lives in `src/components/spotlight.ts` because the view and the card both need
      the type and a `<script setup>` block cannot export one. A band's frequency was briefly
      one of its values -- a gauge tap LIT its stratum rather than narrowing to it, and scrolled
      the page there -- and that is gone: a gauge now filters, the two controls are alternatives,
      and one mechanism wearing two hats was what made a lit band under a spotlight unreadable.
    - Making them buttons gave up the `role="status"` announcement, which is the right trade
      once they are interactive: each carries an `aria-label` naming the action and
      `aria-pressed` for the state.
    - **`background-color: var(--color-...)` does not paint on these two segments.** It computes
      to transparent while the SAME variable resolves normally for `color`, for `border-color`,
      and inside `color-mix()` or a gradient. The mechanism is not understood -- it is not the
      `--color-accent-text` reference chain, since `--color-alarm` is a plain hex and fails
      identically. Both pressed grounds are therefore painted as a flat one-stop
      `linear-gradient`, with the annunciator's hazard hatch layered over it. The failure is
      SILENT and reads exactly like a specificity problem, so check the rendered pixels rather
      than the rule: this shipped broken once, with both readouts looking unpressed.
  - The overdue set is resolved **once per render** into a `Set` of ids. `isLateOn` walks a
    task's check-offs and the status sort calls its comparator O(n log n) times, so asking the
    question inside the comparator re-walked the same completions on every comparison.
  - **The curves** (`TrendCurve.vue`) sit at the TOP of the page, above the fault lamps: the
    rest of Hoje is one day, and a day means little without the week it is part of. TWO of them,
    side by side once the column is wide enough -- **Diarias** and **Semanais** -- both laid out
    over the SAME seven days.
    - Why one axis for two cadences: a daily task and a weekly one are asked for on different
      horizons, and a single line counting both against one demand is two readings in one
      stroke. But WHICH DAY the work belongs to is a question both can answer, and answering it
      on one axis is what lets the two curves be read against each other -- a week where the
      dailies held and the weeklies slipped is visible at a glance, which no single mixed line
      shows. A column is the day the check-off was FOR, never the day it was ticked on
      (`completionDay`): the shelf it is drawn against is that day's own demand, and measuring a
      catch-up against the wrong day's target fails the column twice over.
    - **Two modes, one component.** `period` gives each column its own figure against its own
      shelf, which is what a daily task wants: its period IS the day. `cumulative` turns the
      columns into a RUN -- `done` and `expected` are totals through that day -- which is the
      only honest way to draw a cadence whose period is the WEEK: a weekly task owes nothing to
      Tuesday, but the week is half gone by Wednesday night. In that mode the per-column shelves
      join into one dashed PACE line climbing to the week's demand; the two never appear
      together, since a cumulative shelf is that line with gaps in it.
    - **`TaskUseCases.weekdayLoad(tasks, referenceDate, frequency)`** is the whole feed: one
      cadence's week, day by day. Its per-day demand is built from the SAME figures the
      week-level one is, so a curve and its own head cannot disagree -- a `daily` task through
      `dailyDemand`, the only period a daily owns; a `weekly` task pinned to a weekday charged
      to THAT day, which is exactly what the weekday means and the day `lateByWeekday` already
      measures it against, in the amount `weekExpectation` says the week asked (so it appears
      the moment its day comes up and not before); a `weekly` task with no weekday charged to no
      day at all and reported as `unpinned`, since a seventh of it on each day is a number
      nobody chose. `unpinned` is DERIVED (`total - sum(expected)`), so it cannot drift from the
      two figures it sits between, and the block prints it rather than hiding it.
    - **`pace` is a different claim from `expected`, and the distinction is the whole design.**
      `expected[i]` is what day `i` OWES -- a deadline, and no unpinned weekly target may ever
      be charged to one. `pace[i]` is where the week should BE by the end of day `i`: pinned
      work steps onto its own day, and unpinned work spreads evenly across the seven. Not "this
      Tuesday owes a seventh", but "a week's work needs a week's rhythm, and by Wednesday a
      quarter of it untouched is behind". Nothing is ever judged against `pace` except the
      block's own on-time reading, and `pace[6]` is the week's whole demand -- exposed as
      `demand`, printed in the head (`2 de 5 na semana`) and named at the plot's ceiling
      (`meta 5`), so how much the week is asking for never has to be inferred.
    - **The spread share is MULTIPLIED in, never added a seventh at a time.** A seventh is not
      representable, and seven of them come to `22.999999999999996` -- which reaches the plot as
      `meta 22.99999999999999`, a wrong number rather than a formatting slip. `pace[i]` adds
      `spread * (i + 1) / 7`, whose factor is exactly 1 on the last day, and `demand` is summed
      from the whole amounts instead of being read off the end of the pace, so both are integers
      by construction. The per-column figure is a `ceil` of the pace for the same reason a
      check-off is a counted thing: it says the count that puts you on the line, where rounding
      would print `0/0` on a day that genuinely wanted something.
    - `pace` spans the whole week, the days still ahead included, which is why it reads
      `dayTarget` rather than `dailyDemand` for them: a line that flattened at today would say
      the week wants nothing more of you, the opposite of what it is drawn to say. Every
      judgment still measures against `dailyDemand`, so nothing is charged before its day.
    - **Each block says whether it is on time**, above the plot, measured against the `pace` at
      the last CLOSED day -- never the one being lived: a day asks for its whole target the
      moment it starts, so charging today would have the page read `13 em atraso` at breakfast
      every morning. Work done today still counts, since it is the backlog it pays down, so
      `done` runs through today and `asked` stops at yesterday. It is a `ceil`, because a pace
      can be fractional where a check-off cannot and the figure worth printing is how many
      check-offs would put you back ON the line; it also keeps the words agreeing with the
      picture, since a curve sitting under the dashed pace is a block that says so. Late is a
      claim that something is WRONG, so it speaks in `--color-alarm`, the ink the `Atrasada`
      chip speaks in, and nothing else on the block does.
    - **The amounts are printed under every column**, `done/expected`, because a curve says
      "more than Tuesday" and never "five". Four readings, not one: a period still ahead shows a
      dash rather than a `0` (nothing was asked of it, and a zero is a figure of failure), a
      period with work but no target shows the count alone, a period with neither shows a quiet
      `&middot;` -- a weekly curve is mostly days like that, and five copies of a word read as
      noise where five dots read as quiet -- and only a period with both is a figure over a
      figure. A met target takes the done ink, the one piece of praise the page hands out.
    - **The line stops at the last ELAPSED point**, and the leg into the period the clock is
      still inside is DASHED rather than judged: a day half over is not a day that failed, and a
      solid line diving to the floor on the last point says exactly that (the reading
      `TaskRunChart` gives a running period). For the same reason the running period is never
      washed out as `short`. The ground says it too -- columns still ahead are DOTTED, the
      softer cousin of the meter hatch, which means a warning or an empty gauge elsewhere and is
      the wrong claim for a day that has not arrived. The column the clock is in takes a wash of
      the accent, the same claim on the present the running turn makes downpage.
    - The plot is a 100x100 box stretched to the card's width (`preserveAspectRatio="none"`) and
      every stroke carries `vector-effect="non-scaling-stroke"`, so the distortion never reaches
      the ink: hairlines stay hairlines and round caps stay round at any width. Dots are
      zero-length round-capped LINES for the same reason -- a `<circle>` in a stretched box is
      an ellipse -- drawn as a ring plus a core, so a met target is a filled bubble and a short
      one a hollow bead. Labels, figures and the hit targets are HTML over the SVG, never text
      inside it, which keeps them at their own size and keeps them real buttons.
    - The curve is cubic with HORIZONTAL tangents: control points share their end's `y`, so the
      line can never carry above or below the two figures it runs between and a quiet Tuesday
      between two busy days cannot bulge into a day that never happened.
    - Tapping a column browses that day, the same day the selector above picks, reached by
      pointing instead of by stepping. Columns the period store would refuse are disabled.
    - The two blocks split on a **container query**, never a viewport one: the shell is
      `max-w-4xl`, so an `lg:` split fires on a wide window inside a narrow column and squeezes
      seven figures into 195px. `.curve-frame` exists only to be that container, since an
      element cannot query itself.
    - Home holds the week by a `mondayKey` STRING for the reason the summary does: the clock
      ticks every 60s, and a computed reading `referenceDate` itself would walk every task's
      check-offs once a minute. The foot's delta is the SAME load one week back, so the figure
      compared is the figure plotted -- a rise takes the done ink, a fall is stated in the
      page's own foreground, since doing less than last week is not a fault and
      `--color-alarm` is for deadlines.
    - The Semanais block is **dropped entirely when nothing repeats weekly**: an empty curve
      reads as failure where nothing was ever asked -- the rule that drops an empty band.
  - Above the bands sits a **gauge per band**, not one meter for the day: four dailies left and
    one yearly left are not the same debt, and a single bar averaging them says neither. Each
    gauge is tinted with its band's frequency ink, so a glance maps it to the stratum below
    without reading the label, and the cluster wraps rather than gridding, so one horizon or five
    both read.
    - **Each gauge is also the way INTO its horizon**: tapping one narrows the page to that
      cadence, tapping it again gives the page back. The reading and the control are the same
      object, which is what keeps the page from growing a row of filter chips saying what the
      gauges already say. The CLUSTER never filters itself -- the others stand down to 45% but
      stay on screen and stay tappable, the spotlight's own rule one altitude up, because a
      control that hides itself cannot be switched back.
    - A held gauge is ringed in its OWN band ink, never the accent: the cluster's whole job is
      mapping a colour to a stratum, and an Anual card turning amber when picked would break the
      one mapping it exists for.
    - It is a plain `ref` in `HomeView` beside the spotlight, cleared when the browsed day
      changes: a band with work on Monday can be empty today, and a page filtered to nothing
      explains itself to nobody.
    - **The horizon and the spotlight are ALTERNATIVES, and taking one hands the page over to
      it.** Picking a horizon releases the spotlight, because a horizon under one is the worst
      of both -- you asked to see the dailies and most of them are standing down at 30% for
      being neither late nor in the running turn. Tapping a readout releases the horizon for the
      mirror reason: a readout counting rows a filter is hiding is a readout lying about its own
      figure. Neither is RESTORED on the way back out; by then the choices are the user's, and a
      default springing back is the page arguing with them.
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
  frequency (+ weekday or turns), category, `timesPerPeriod` as `Nx`, `Ativa` / `Inativa`, and
  the row actions. It is the only place that shows the whole set, which is what makes it the
  place to find a task you have not seen in a month.
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
    (the weekday gate alone) is private so the two cannot diverge. `isLateOn` is now the **OR of
    two rules** with the shared gates hoisted -- a finished period is never late, and a reference
    day in the future is never late -- over the private `lateByWeekday` and the turn rule below.
    No task is ever both: a weekday implies weekly, a turn implies daily. `lateByWeekday` keeps
    its own guard for a task created *after* its due day in the same week (`existsIn` is
    week-granular, so a Friday-created Terca task would otherwise be born overdue); the turn rule
    needs the same guard one cadence finer, and the two are deliberately NOT merged.
  - The future gate is a **day-key comparison, not a timestamp one**. A pinned day is built at
    noon, so `referenceDate > new Date()` -- what it used to be -- read today-pinned-at-09:00 as a
    future date and silently switched `Atrasada` off every morning. The lateness predicates
    therefore also take an explicit `now`, which the views pass as `today`: a pinned
    `referenceDate` deliberately does not subscribe to the clock, so without it a chip would
    freeze at the turn it first rendered in.
  - The invariant "weekday set implies weekly" is enforced in `create`/`update`, not the form --
    `TaskFormView` spreads `{ ...existing, ...input }`, where an omitted key preserves the old value
    rather than clearing it. `deserialize` also coerces out-of-range values to `undefined`, since a
    `weekday: 8` would be permanently invisible and so undeletable.
  - `Qualquer dia` is `undefined`, never `1`: Monday and unconstrained match identically for
    visibility but differ for overdue.
- **Turn-pinned daily tasks**: a `daily` task may carry `turns: Turn[]` (`Turn = 1..3`, Manha /
  Tarde / Noite, cut at **12:00** and **18:00**). Completion is still the **day** key -- a turn is
  a deadline INSIDE the period, never part of it, the exact parallel to never encoding the weekday
  into the week key. Ticking a Noite slot at 09:00 is allowed and correct; the day is the period.
  - `Turn` is numeric and ordered for the same reason `Weekday` is -- lateness is a `<=` on
    position within the period -- but honestly for a weaker one: `getHours()` is already
    chronological, so the type is naming and encoding, not a fix for a broken convention.
    `turnOf()` in `period.ts` is the only `getHours()`-for-a-turn call, the role `isoWeekday`
    plays for `getDay()`.
  - **The value repeats once per slot**, ascending: two morning check-offs are `[1, 1]`, the same
    shape a period key takes once per check-off. Fewer entries than `timesPerPeriod` leaves an
    untimed remainder, and it sorts LAST, so an untimed check-off is never the reason a turn is
    late. `turnSlots` writes that mapping once, for the gauge, the badges and `dueByNow` together.
  - **Crediting is POSITIONAL**: the Nth check-off of the day satisfies the Nth slot. Nothing on a
    `Completion` records which slot it filled, and that is deliberate -- a check-off carries only
    a key and a moment. The consequence, stated rather than hidden: catching up a Manha slot at
    14:00 clears it (right, and free), but ticking the Noite slot at 19:00 with the morning never
    done does NOT read as late. Deriving the slot from `at` instead fails three ways --
    `setCompletionCount` stamps every surplus entry with `now`, so tapping cell five at 19:00
    would leave a finished task reading two empty morning slots; catch-up would invert, leaving a
    task overdue forever after it was done; and legacy entries carry no moment at all.
  - **Turns never hide a task.** Two states, not the weekday's three: `Pendente`, then `Atrasada`
    once the turn is fully over. So `isDueOn` and `appearsOn` are untouched, Hoje shows every due
    task all day, and nothing appears or vanishes inside one day.
  - `TaskUseCases.dueByNow` is how many slots the day has already asked for, and it is public
    because both `isLateOn` and the gauge's overdue cells read it -- a figure computed twice can
    drift. A turn is asked of only once it is **fully over**, so a Noite slot is never late on its
    own day: the same shape as a Sunday task never being late inside its own week. It reads no
    completions, which keeps it cheap on Hoje's hot path, and clamps to `timesPerPeriod` so a plan
    that outlived a lowered target cannot ask for more than the period holds.
  - `turnOf` is applied to `now` and to `createdAt`, **never to `referenceDate`**, which is noon by
    construction and would report Tarde for every browsed day. Which day we are on is a key
    comparison; what time it is inside that day only the real clock may answer.
  - The invariant "turns set implies daily" is enforced in `create`/`update`, where the weekday's
    is. `update` also **re-normalizes** rather than merely coercing: lowering `timesPerPeriod`
    must truncate the plan, or the surplus slots would read `Atrasada` forever. Truncation keeps
    the EARLIEST slots, a deadline already missed being the one that still matters. A round trip
    through another frequency loses the plan, exactly as it loses the weekday, and for the same
    reason -- a stale one would start firing the moment the cadence came back.
  - `deserialize` normalizes a missing field to `[]`, which is what every document written before
    the feature means, so there is no migration. Out-of-range values are dropped the way
    `toWeekday` drops them.
  - **Three row states, from `turnState`**: a slot whose turn is over and unticked reads
    `Atrasada`, one pinned to the turn the clock is in is lit in the accent, one still ahead
    today reads plain. `turnState` returns both lists from one pass because the row needs both and
    they share a `completionCountFor` and a `dueByNow`; they are disjoint by construction, every
    late turn being strictly before the running one and every current turn equal to it.
    - A turn whose slots are all checked off is **struck through and stood down**: it recedes to
      `--color-fg-faint` on a hairline, quieter than a turn still AHEAD, which at least still
      wants doing. The rule through it is drawn in `--color-done`, and that green line is what
      says settled rather than disabled -- the one thing this state must not be mistaken for.
      A strike is also a SHAPE, which matters because the accent is the user's to choose and can
      itself be a green; colour alone could not carry the distinction.
      `turnPlan` carries a `doneAt` per group (the check-off count at which it is fully covered),
      which keeps the positional crediting rule in `period.ts` instead of re-derived per view.
      A group only half covered is not struck; it keeps whatever the clock says about it, and
      the gauge below carries the granular progress.
      The chip is `inline-block`, not `inline-flex`: a strike does not propagate into the
      anonymous flex item an inline-flex container wraps its text in.
    - **A task with NO turn is late once Noite BEGINS.** It has no deadline inside the day, so
      it is given one at the start of the last turn: past that the day is running out, and a
      daily task still open at nightfall is behind whatever it was going to be. This is
      deliberately NOT the rule a Noite slot gets -- that slot has an explicit deadline, the end
      of the day, and is being kept to it, where an untimed task has none and would otherwise
      never get a warning at all. The `floor`'s counterpart applies: a task created after
      nightfall never had the day, so it is not born overdue tonight.
      - It is daily-only. A `once`, `weekly`, `monthly` or `yearly` task does not run out of
        day, and nothing about those cadences changed.
      - A task that carries SOME turns plus an untimed remainder is unchanged: only its pinned
        slots have deadlines. Mixing the two would put an untimed slot's deadline (nightfall)
        before a Noite slot's (end of day) while the untimed slot sorts after it, and the
        positional crediting order would stop matching the deadline order.
    - **The running turn is a claim about the PRESENT**, so it holds only while the browsed day
      IS today.
      It therefore cannot lean on `dueByNow`, whose past-day rule is the opposite: a day already
      over asked for everything. Browsing back drops every accent and leaves `Atrasada` behind.
    - It is drawn **with no chip at all**, and differs from the fault in SHAPE rather than only
      in hue, since hue is the user's to choose and can land next to the alarm. Both rows are
      lit, but the fault's wash runs to **62%** of the row and the running turn's to **34%** --
      the one that reaches further across the title is the one that went wrong -- and only the
      running turn carries a **caret** in the gutter, at the dial's own height, aimed at the
      control you would tap.
    - `TaskStamp` lights its dial for both, the fault winning when a row is somehow both. Only
      the TRACK is coloured, never the ring's ground -- that is what hover and focus use, and a
      permanently tinted ring would read as a stuck hover state.
    - It rises in the sort, directly under `Atrasada`: missed on top, running under it, the rest
      of what is pending below. The eyebrow names the running turn (`Hoje · Tarde`) so the
      accented rows beneath it are legible; only while browsing today, since a turn is running
      now or it is not running at all.
    - An **inactive** task gets neither rail. The clock has no claim on a task that is out of
      the routine, and its chip already reads `Inativa` -- the view gates on `active`, not the
      use case, which stays a statement about time the way `isDueOn` and `isLateOn` do.
  - The weekly summary is untouched: turns do not change what a day ASKS for, only whether the
    asking is already overdue. That page stays a reading of volume, not of punctuality.
- **Period selection** (`src/stores/period-store.ts`): the store owns both the live clock (`now`,
  ticked every 60s and on `visibilitychange`) and `selection` — `{ year, month, day } | null`, where
  **null means follow the clock**. `usePeriodSelection()` derives `referenceDate`, `today` and
  `isToday` from it, and `PeriodSelector.vue` renders the Dia/Mes/Ano selects. Details that matter:
  - **The week strip is folded away on Hoje** (`<PeriodSelector collapsed />`): the curves at the
    top of that page are already seven tappable days, and two rows of them is one row too many.
    The head keeps the arrows, the month and `Hoje`, so the day can still be stepped without
    opening anything, and the month button is ONE disclosure for both halves -- the strip and the
    Mes/Ano selects are the same question at two resolutions, and a panel with two independent
    toggles is a panel nobody reads twice. Every other caller gets the strip as it always was.
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

## Preview harness

`yarn harness` (port 5199) runs the real views, stores and use cases against fabricated data,
with `@/adapters/repositories` aliased to in-memory stand-ins. It exists because the states this
app cares about -- an overdue turn, a running one, a category with nothing left, a row under a
spotlight -- take a sign-in, several tasks and the right hour to reach in the real app.
`preview-harness/README.md` has the query parameters (`theme`, `accent`, `at`, `click`) and the
headless-screenshot recipe; `?at=20:30` freezes the clock, which is how a rule that only fires
at a particular hour gets looked at at all. Two things it has already caught that nothing else
would:

- A `background-color` that silently did not paint (above). Reading the rule is not enough;
  read the pixels.
- Its own page once omitted the app's font links, so every screenshot rendered in fallback
  faces while looking plausible. The Vite config now lifts those links out of `index.html`, and
  `preview-harness/` sits inside `tsconfig.app.json` with its stubs typed against the real
  ports, so a changed port fails `yarn type-check` instead of rotting.

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
