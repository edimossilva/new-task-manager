# new-task-manager

A personal recurring-task tracker. Sign in with Google, add tasks, give each one a frequency
(daily, weekly, monthly or yearly), and check it off for the current period. The checkbox clears
itself when the next period begins.

Everything lives in your browser: tasks are stored in `localStorage`, scoped to the Google account
you signed in with. There is no backend and no server-side storage.

- Vue 3 + TypeScript, Vite 7, Vue Router 5, Pinia 3, Tailwind CSS 4
- UI in Brazilian Portuguese

## Setup

```sh
yarn
```

### Google sign-in

Sign-in uses Google Identity Services directly, so you need your own OAuth client:

1. Open the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) and create an
   **OAuth 2.0 Client ID** of type **Web application**.
2. Under **Authorized JavaScript origins**, add `http://localhost:5173` — exactly that, with the
   port and no trailing slash. No redirect URI is needed; the app uses the popup flow.
3. Copy `.env.example` to `.env` and fill in the client ID:

   ```sh
   cp .env.example .env
   ```

   ```
   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   ```

Without a client ID the login screen shows a configuration message instead of the Google button.

The app decodes the returned ID token to read your name, email and avatar. It does **not** verify
the token — there is no server to present it to, and it grants no authority. The sign-in identifies
which set of local tasks to open; it is not an access control.

## Commands

```sh
yarn dev          # dev server on http://localhost:5173
yarn build        # type-check + production build
yarn preview      # serve the production build
yarn type-check   # vue-tsc --build
yarn lint         # oxlint, then eslint (both with --fix)
yarn format       # prettier over src/
```
