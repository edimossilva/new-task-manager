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

A static SPA with no backend of its own and no deploy config. Firebase is used for
**authentication only** — there is no Firestore and no `firestore.rules`. Firebase config comes from
`VITE_FIREBASE_*` env vars (`.env`, not committed).

## What This App Is

A personal recurring-task tracker (UI text is in **Brazilian Portuguese**, written without
diacritics). One entity: tasks, each with a title, an optional description, and a frequency of
daily / weekly / monthly / yearly. A task is checked off for the *current period* and re-arms itself
when the next one starts.

Data is stored in the browser under `new-task-manager:tasks:<uid>`, where `<uid>` is the signed-in
Firebase user's id. Google sign-in goes through Firebase Auth (popup), mirroring `controle-mensal`;
unlike that app, nothing is persisted server-side.

## Architecture

Vue 3 + TypeScript SPA using **Vite 7**, **Vue Router 5** (history mode), **Pinia 3** and
**Tailwind CSS 4** (via `@tailwindcss/vite`), plus **Firebase** for authentication only. The `@`
path alias resolves to `./src`.

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
   - `src/adapters/firebase/` — lazy singletons for the Firebase app and Auth (Google popup
     sign-in). Copied from `controle-mensal`.
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
  `initializeRepositories(uid)` builds them after sign-in; `getTaskRepository()` throws if
  called before that. Adding an entity means: entity + port + repository (with serialize/
  deserialize) + registration in the provider + use cases + store + views + routes.
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
  `MAX_COMPLETIONS` (400) caps the history against the ~5 MB localStorage quota. Changing a task's
  frequency leaves the old keys in place: they can never match the new format, so the task correctly
  shows as pending, and keeping them preserves the history for free.
  `use-current-period.ts` keeps a `now` ref fresh so a tab left open overnight notices the boundary.
- **Auth** (`src/adapters/firebase/firebase-auth.ts`) is `controle-mensal`'s file verbatim:
  `signInWithPopup` + `GoogleAuthProvider`, `onAuthStateChanged`, and `signOut`. The Firebase SDK
  owns session persistence and token refresh. The store's `setupSession` is synchronous here,
  because there is no Firestore to await and no shared-data owner to resolve.
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
