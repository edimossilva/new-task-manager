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

A pure static SPA: no backend, no deploy config. The only env var is `VITE_GOOGLE_CLIENT_ID`
(`.env`, not committed). The dev server pins port 5173 with `strictPort`, because Google Identity
Services only works on an origin registered in Google Cloud — silently falling back to 5174 would
break sign-in with nothing but a console message.

## What This App Is

A personal recurring-task tracker (UI text is in **Brazilian Portuguese**, written without
diacritics). One entity: tasks, each with a title, an optional description, and a frequency of
daily / weekly / monthly / yearly. A task is checked off for the *current period* and re-arms itself
when the next one starts.

Data is stored in the browser under `new-task-manager:tasks:<sub>`, where `<sub>` is the signed-in
Google account's subject claim. Sign-in is Google Identity Services used directly — there is no
Firebase and no network dependency for anything but the sign-in script itself.

## Architecture

Vue 3 + TypeScript SPA using **Vite 7**, **Vue Router 5** (history mode), **Pinia 3** and
**Tailwind CSS 4** (via `@tailwindcss/vite`). The `@` path alias resolves to `./src`.

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
   - `src/adapters/google/` — the Google Identity Services script loader, the ID-token decoder, and
     the session record in localStorage.
   - `src/adapters/repositories/` — localStorage implementations of the port interfaces. Never
     import Vue or Pinia.
4. **UI** (outermost) — `src/views/` (one folder per entity with `*ListView` / `*FormView`),
   `src/components/`, `src/composables/`, `src/stores/`, `src/router/`.

### Data flow & key mechanics

- **`LocalStorageRepository<T>`** (`src/adapters/repositories/local-storage-repository.ts`) is a
  generic base. It reads the whole collection into an in-memory `Map` on `initialize()`, serves all
  reads synchronously from that cache, and rewrites the single storage key on every mutation.
  Reads log and start empty on corrupt JSON but never delete the key; writes swallow
  `QuotaExceededError` into `console.error`, since the cache already reflects the change.
  **`initialize()` is synchronous**, and so is `initializeRepositories()` — localStorage is a
  synchronous API, so unlike a network-backed repository there is nothing to await. Reintroducing a
  remote backend would make both async again.
- **Repository provider** (`repository-provider.ts`) holds module-level singletons.
  `initializeRepositories(userSub)` builds them after sign-in; `getTaskRepository()` throws if
  called before that. Adding an entity means: entity + port + repository (with serialize/
  deserialize) + registration in the provider + use cases + store + views + routes.
- **Bootstrap order** (`src/main.ts`): the guard is registered, then `authStore.restoreSession()`
  runs **synchronously** off localStorage, then the router is installed and the app mounts. Nothing
  is awaited. Google Identity Services has no `onAuthStateChanged` equivalent — it never reports an
  existing session — so our own localStorage record is the only boot-time source of truth. The GIS
  script is loaded lazily by `LoginView`; gating the mount on it would leave an ad-blocked or
  offline user with a blank page even though all their data is local.
- **Sign-out order**: `AppNav` navigates to `/login` *first*, then calls `authStore.signOut()`.
  Clearing the repositories while a data view is still mounted lets its reactivity re-enter
  `getTaskRepository()` after the singletons are gone.
- **Completion model**: a task stores `completions: string[]`, a list of period keys
  (`2026-09-01` / `2026-W36` / `2026-09` / `2026`) produced by `periodKey(frequency, date)`.
  "Done now" is `completions.includes(periodKey(...))`. **Rollover is derived, never written** —
  nothing in the app mutates state because time passed, which is what makes a client-only app with
  no scheduler correct after being closed for months. Period keys are computed from **local** time;
  `toISOString()` would roll the day over hours early west of UTC. Weekly keys use ISO-8601 week
  numbering, whose week-year can differ from the calendar year (2025-12-29 is `2026-W01`).
  `MAX_COMPLETIONS` (400) caps the history against the ~5 MB localStorage quota. Changing a task's
  frequency leaves the old keys in place: they can never match the new format, so the task correctly
  shows as pending, and keeping them preserves the history for free.
  `use-current-period.ts` keeps a `now` ref fresh so a tab left open overnight notices the boundary.
- **Google Identity Services** (`google-identity.ts`): the script loader is a memoized promise;
  `initialize()` is guarded by a module flag because `LoginView` remounts on every
  sign-out → sign-in cycle. We render the **official** Google button — `prompt()` shows One Tap,
  which is silently suppressed by cooldowns and FedCM settings, and `oauth2.initTokenClient` returns
  an access token rather than the ID token we need. `disableAutoSelect()` on sign-out is what stops
  One Tap from signing the user straight back in. `decodeIdToken` **decodes but does not verify**:
  no signature, `iss`, `aud` or `exp` check. That is safe only because the token never reaches a
  server and grants no authority — do not repurpose it as a security boundary. Only the derived
  profile is stored, never the raw JWT.
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
