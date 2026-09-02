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
diacritics). One entity: tasks, each with a title, an optional description, and a frequency of
daily / weekly / monthly / yearly. A task is checked off for the *current period* and re-arms itself
when the next one starts.

Data is stored per-user in Firestore under `users/{uid}/tasks/{taskId}`, with Google sign-in via
Firebase Auth.

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
