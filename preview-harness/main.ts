/**
 * Preview harness: the real views, the real stores, fabricated data.
 *
 * See README.md for the query parameters.
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import '@/assets/main.css'
import App from './PreviewApp.vue'
import { INKS, isInkName, isThemeName } from '@/entities'

const params = new URLSearchParams(location.search)

/*
 * `?at=20:30` freezes the wall clock, which is the only way to look at a state
 * that belongs to a particular hour -- a turn running, a deadline passed, the
 * day closing -- without waiting for it.
 *
 * `?at=2026-09-25T20:30` moves the DAY as well, for the states that belong to a
 * weekday rather than to an hour: a Sunday task with no catch-up window, a
 * Monday-pinned weekly one, a week graph read on a Friday instead of always on
 * the morning the screenshot happens to be taken.
 */
const frozen = params.get('at')
if (frozen) {
  const fixed = new Date()
  const [datePart, timePart = ''] = frozen.includes('T') ? frozen.split('T') : ['', frozen]
  if (datePart) {
    const [year = 0, month = 1, day = 1] = datePart.split('-').map(Number)
    fixed.setFullYear(year, month - 1, day)
  }
  const [hours = 0, minutes = 0] = timePart.split(':').map(Number)
  fixed.setHours(hours, minutes, 0, 0)
  // A proxy rather than a subclass: `instanceof`, the statics and the prototype
  // all survive untouched, and only the no-argument form answers the frozen
  // hour, so period keys and fixture timestamps still parse normally.
  globalThis.Date = new Proxy(Date, {
    construct: (target, args) =>
      args.length ? new target(...(args as [])) : new target(fixed.getTime()),
    get: (target, prop, receiver) =>
      prop === 'now' ? () => fixed.getTime() : Reflect.get(target, prop, receiver),
  })
}

/*
 * The app's own routes, minus the auth guard and the login route. Registering
 * them for real is what makes `RouterLink` render an anchor -- mounting a view
 * bare leaves `<routerlink>` as an unknown element, which looks close enough to
 * fool a screenshot while styling nothing.
 */
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/preview-harness/', redirect: '/' },
    { path: '/', component: () => import('@/views/HomeView.vue') },
    { path: '/resumo', component: () => import('@/views/SummaryView.vue') },
    { path: '/tasks', component: () => import('@/views/tasks/TaskListView.vue') },
    { path: '/tasks/new', component: () => import('@/views/tasks/TaskFormView.vue') },
    { path: '/tasks/:id', component: () => import('@/views/tasks/TaskDetailView.vue') },
    { path: '/tasks/:id/edit', component: () => import('@/views/tasks/TaskFormView.vue') },
    { path: '/categories', component: () => import('@/views/categories/CategoryListView.vue') },
    {
      path: '/categories/:id',
      component: () => import('@/views/categories/CategoryDetailView.vue'),
    },
  ],
})

/*
 * Theme and accent are normally written by the appearance store after sign-in.
 * Here they come off the query string, so a screenshot can sweep all five themes
 * and any of the twenty inks -- which is the only way to catch a state that
 * reads fine on the default accent and collapses on someone else's.
 */
const theme = params.get('theme')
document.documentElement.setAttribute('data-theme', isThemeName(theme) ? theme : 'alloy')

const accent = params.get('accent')
if (isInkName(accent)) {
  const ink = INKS[accent]
  const root = document.documentElement.style
  root.setProperty('--color-accent', ink.base)
  root.setProperty('--color-accent-bright', ink.bright)
  root.setProperty('--color-accent-deep', ink.deep)
  root.setProperty('--color-accent-dim', ink.dim)
  root.setProperty('--color-accent-text', theme === 'alloy' || !theme ? ink.deep : ink.bright)
}

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

/*
 * `?route=/tasks/new` opens one of the app's routes. Only `/preview-harness/`
 * serves this page -- a direct load of `/tasks/new` gets the REAL app's
 * index.html from Vite's fallback -- so a headless screenshot has to enter here
 * and be sent on.
 *
 * `?click=<selector>` then presses something once the page has settled.
 * Headless screenshots cannot click, and the states worth looking at most -- a
 * pressed readout, a spotlight, a form reached from a row -- only exist after one.
 */
const route = params.get('route')
const settled = router.isReady().then(() => (route ? router.push(route) : undefined))

const click = params.get('click')
if (click) {
  settled.then(() => {
    setTimeout(() => {
      document.querySelector<HTMLElement>(click)?.click()
    }, 400)
  })
}
