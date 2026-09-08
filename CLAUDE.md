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
daily / weekly / monthly / yearly, an optional weekday and an optional category -- and
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
- **Completion model**: a task stores `completions: string[]`, a list of period keys
  (`2026-09-01` / `2026-W36` / `2026-09` / `2026`) produced by `periodKey(frequency, date)`.
  "Done now" is `completions.includes(periodKey(...))`. **Rollover is derived, never written** —
  nothing in the app mutates state because time passed, which is what makes a client-only app with
  no scheduler correct after being closed for months. Period keys are computed from **local** time;
  `toISOString()` would roll the day over hours early west of UTC. Weekly keys use ISO-8601 week
  numbering, whose week-year can differ from the calendar year (2025-12-29 is `2026-W01`).
  `MAX_COMPLETIONS` (3650, ten years of dailies) caps the history against Firestore's 1 MiB
  document limit. Changing a task's
  frequency leaves the old keys in place: they can never match the new format, so the task correctly
  shows as pending, and keeping them preserves the history for free.
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
    - Above `MAX_CELLS` (12) the strip degrades to one continuous hatched bar -- the home meter's
      own track -- and the `-` button comes back as the fine control, because past a dozen the
      cells are neither countable at a glance nor big enough to hit.
    - Empty cells carry the 45-degree hatch that `.meter-track` uses, filled ones a `--color-done`
      ground with a small bloom, and the next one up is edged in `--color-accent-text` so the strip
      points at itself. Everything is drawn from role tokens, so it re-skins with the five themes.
  - `TaskStamp`'s dial draws the ratio: `stroke-dashoffset` is **bound** rather than driven by a
    keyframe, since the arc now has intermediate positions, and the button reports
    `aria-checked="mixed"` when partly done. It derives "completed" from the count instead of
    taking it as a prop, so the ring cannot disagree with the row it sits in.
  - The home meter keeps counting whole tasks -- a task at 3/8 is one task left -- and gains a
    second, check-level figure beside its label, shown only when something visible needs more than
    one. Two numbers that mean different things, never one that means both.
  - `MAX_COMPLETIONS` is unchanged. A task checked eight times a day spends the budget eight times
    faster and still keeps well over a year of history.
- **Design tokens are ROLES, never colour names** -- `void` (ground), `panel`, `well`, `fg`,
  `fg-soft`, `fg-faint`, `line`, `line-strong`. The same token is deep navy in one theme and cool
  aluminium in another, so `bg-paper` would have been a lie. Tailwind 4 **errors on an unknown
  utility class at build time**, which makes a token rename safe: a missed call site fails the
  build rather than silently losing its style.
- **Five themes** (`src/entities/theme.ts`), each a complete instrument panel -- ground,
  foreground, line weight, geometry (`--radius-*`), shadow language (`--panel-shadow`) and
  atmosphere (`--tex`, painted by `body::before`). `@theme` holds the default (Holograma); each
  `[data-theme='...']` block in `main.css` overrides the same role tokens. `terminal` also swaps
  `--font-sans` to the mono face, so the whole panel becomes one readout.
- **The ink palette** (`src/entities/palette.ts`) is the single source of truth for colour:
  twenty named inks, each with **four** values. One hex cannot do four jobs -- `base` for fills,
  `deep` for the ink as TEXT on a LIGHT ground, `bright` for TEXT on a DARK ground, `dim` for
  washes. `bright` exists because darkening for contrast only works one way: `deep` on near-black
  is *less* visible than `base`, not more. Themes choose between them through
  **`--color-accent-text`** (`bright` by default, `deep` under `[data-theme='alloy']`), so no
  component ever needs to know whether the ground is light or dark. Category inks make the same
  choice through the shared **`.ink-text`** class: bind `--cat-bright` and `--cat-deep` inline and
  add the class. That one has to be a SELECTOR rather than the same variable indirection -- a
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
  - Colour is an ink name from the shared palette (all twenty offered). `deserialize` falls back
    to `DEFAULT_CATEGORY_INK` for an unknown value rather than rendering an unstyled chip.
  - `InkSwatches.vue` is shared by the category form and the accent picker, and binds colours
    inline from `INKS` -- twenty per-ink CSS classes in each consumer was the alternative.
  - `CategoryBadge` is deliberately quieter than `FrequencyBadge` -- a dot plus text, no filled
    ground. Two saturated chips per row was too noisy on a phone.
- **Both list pages are racks of category modules** (`CategoryTaskCard.vue`), one card per
  category with the unfiled bucket last, laid out by the shared `.rack` class in CSS **columns**
  (1 / 2 / 3 by breakpoint) so a unit with two tasks stays short instead of padding itself out to
  match a unit with nine. `useCategoryRack()` does the grouping for both, preserving whatever
  order the caller sorted into.
  - Each unit wears its category's ink four ways: a rail down the left edge, a wash across the
    head, a trace mixed into the hairline, and the fill of its own progress meter -- that
    category's completions for the browsed period, on the same hatched track the home meter uses.
    The unfiled unit has no ink, so its rail is drawn as a dashed gap and its meter goes grey.
  - A task pointing at a category that no longer exists falls into the unfiled bucket rather than
    out of the page. The delete guard makes it unlikely, but a task nothing renders is a task
    nobody can edit or delete.
  - This replaced the md+ sortable table, so sorting moved into an `Ordenar` select plus a
    direction toggle, both driving the same `useSortable`: it orders the rows INSIDE every card
    and has no `category` key, because the cards are the categories. `Situacao` leads by default,
    which puts Atrasada at the top of each unit. The category filter went with the table for the
    same reason -- scrolling to a card is the filter now.
  - Row anatomy: tags and actions share one baseline instead of the actions standing in a column
    of their own, which made every row twice as tall as its content and cost the card 110px of
    width it does not have three-across.
  - The **home page** is one rack of the same units under `compact`, which changes only the rows:
    no description, no last-completion meta, no actions. The head and its meter are the unit's
    identity and read the same on both pages.
  - Home has **no Pendentes / Concluidas split**: one card per category, holding all of it. The
    sort carries what the split used to say -- Atrasada, then pending, then done, so what needs
    attention rises and what is finished sinks under it -- and the head's ratio plus meter turn
    each card into that category's reading for the day. It replaced `DashTaskGroups`, which
    grouped by frequency; frequency survives as the sort's tie-break (dailies first, then title)
    and on every row's badge.
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
