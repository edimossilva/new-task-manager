# new-task-manager

A personal recurring-task tracker. Sign in with Google, add tasks, give each one a frequency
(daily, weekly, monthly or yearly), and check it off for the current period. The checkbox clears
itself when the next period begins.

Tasks are stored in your browser's `localStorage`, scoped to the account you signed in with. There
is no backend and no server-side storage — Firebase is used for authentication only.

- Vue 3 + TypeScript, Vite 7, Vue Router 5, Pinia 3, Tailwind CSS 4, Firebase Auth
- UI in Brazilian Portuguese

## Setup

```sh
yarn
```

### Google sign-in

Sign-in uses Firebase Authentication with the Google provider, the same setup as
[controle-mensal](https://github.com/edimossilva/controle-mensal):

1. Create a project in the [Firebase console](https://console.firebase.google.com/).
2. Under **Authentication → Sign-in method**, enable the **Google** provider.
3. Under **Project settings → Your apps**, register a Web app and copy its config values.
4. Copy `.env.example` to `.env` and fill them in:

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

`localhost` is an authorized domain by default, so the dev server works on any port. Deploying to a
real domain means adding it under **Authentication → Settings → Authorized domains**.

Only Firebase Auth is used — no Firestore, no security rules. The signed-in account's `uid`
namespaces the local storage key, so two accounts on the same browser keep separate task lists.

## Commands

```sh
yarn dev          # dev server
yarn build        # type-check + production build
yarn preview      # serve the production build
yarn type-check   # vue-tsc --build
yarn lint         # oxlint, then eslint (both with --fix)
yarn format       # prettier over src/
```
