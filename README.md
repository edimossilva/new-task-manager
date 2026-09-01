# new-task-manager

A personal recurring-task tracker. Sign in with Google, add tasks, give each one a frequency
(daily, weekly, monthly or yearly), and check it off for the current period. The checkbox clears
itself when the next period begins.

Built on the same stack and conventions as
[controle-mensal](https://github.com/edimossilva/controle-mensal).

- Vue 3 + TypeScript, Vite 7, Vue Router 5, Pinia 3, Tailwind CSS 4
- Firebase Auth (Google sign-in) + Cloud Firestore
- UI in Brazilian Portuguese

## Setup

```sh
yarn
```

### Firebase

1. Create a project in the [Firebase console](https://console.firebase.google.com/).
2. Under **Authentication → Sign-in method**, enable the **Google** provider.
3. Under **Firestore Database**, create a database.
4. Under **Project settings → Your apps**, register a Web app and copy its config values.
5. Copy `.env.example` to `.env` and fill them in:

   ```sh
   cp .env.example .env
   ```

   ```
   VITE_FIREBASE_API_KEY=
   VITE_FIREBASE_AUTH_DOMAIN=
   VITE_FIREBASE_PROJECT_ID=
   VITE_FIREBASE_STORAGE_BUCKET=
   VITE_FIREBASE_MESSAGING_SENDER_ID=
   VITE_FIREBASE_APP_ID=
   ```

6. Point the Firebase CLI at the project and deploy the security rules:

   ```sh
   firebase use --add
   firebase deploy --only firestore:rules
   ```

   **Do this before using the app.** `firestore.rules` is what restricts each user to
   `users/{uid}/**`; without it Firestore falls back to its default rules, which either lock
   everything out or leave the database open, depending on the mode you picked.

`localhost` is an authorized auth domain by default, so the dev server works on any port. Deploying
to a real domain means adding it under **Authentication → Settings → Authorized domains**.

## Data model

Tasks live at `users/{uid}/tasks/{taskId}`. A task records its completed periods as an array of
period keys (`2026-09-01`, `2026-W36`, `2026-09`, `2026`), so "is this done now?" is a lookup
against the current key and rollover into the next period needs no scheduled job.

## Commands

```sh
yarn dev          # dev server
yarn build        # type-check + production build
yarn preview      # serve the production build
yarn type-check   # vue-tsc --build
yarn lint         # oxlint, then eslint (both with --fix)
yarn format       # prettier over src/

firebase deploy --only hosting          # deploy the built app
firebase deploy --only firestore:rules  # deploy security rules
```
