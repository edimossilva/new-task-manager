import { createApp } from 'vue'
import { createPinia } from 'pinia'

import './assets/main.css'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth-store'

const app = createApp(App)
app.use(createPinia())

const authStore = useAuthStore()

router.beforeEach((to) => {
  if (to.meta.public) return true
  if (!authStore.user) return { name: 'login' }
  return true
})

// Synchronous: reads localStorage and initializes the repositories if a session
// exists. Nothing is awaited before mounting, and the Google Identity script is
// deliberately not touched here -- it is loaded lazily by LoginView. Gating the
// mount on that script would leave an ad-blocked or offline user staring at a
// blank page, even though all their data is local and needs no network.
authStore.restoreSession()

app.use(router)
app.mount('#app')
