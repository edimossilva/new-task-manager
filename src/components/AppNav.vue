<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth-store'
import { usePeriodStore } from '@/stores/period-store'

const authStore = useAuthStore()
const periodStore = usePeriodStore()
const router = useRouter()

async function handleSignOut() {
  // Navigate first: tearing down the repositories while a data view is still
  // mounted lets its reactivity re-enter getTaskRepository() after they are gone.
  await router.push({ name: 'login' })
  authStore.signOut()
  // The store outlives the session; the next user must not inherit a browsed date.
  periodStore.clear()
}
</script>

<template>
  <!-- Masthead: identity and account. On a phone it carries no navigation. -->
  <header class="masthead">
    <div class="masthead-inner">
      <RouterLink to="/" class="wordmark"> Tarefas<span class="wordmark-dot">.</span> </RouterLink>

      <nav class="hidden sm:flex items-center gap-1 ml-4">
        <RouterLink to="/" class="nav-link nav-link-exact">Resumo</RouterLink>
        <RouterLink to="/tasks" class="nav-link">Tarefas</RouterLink>
      </nav>

      <div v-if="authStore.user" class="flex items-center gap-2 ml-auto shrink-0">
        <img
          v-if="authStore.user.photoURL"
          :src="authStore.user.photoURL"
          :alt="authStore.user.displayName ?? 'Avatar'"
          class="w-7 h-7 rounded-full border border-ink"
          referrerpolicy="no-referrer"
        />
        <button type="button" class="signout" @click="handleSignOut">Sair</button>
      </div>
    </div>
  </header>

  <!-- Thumb-reachable navigation, phones only. -->
  <nav v-if="authStore.user" class="dock sm:hidden" aria-label="Navegacao">
    <RouterLink to="/" class="dock-link dock-link-exact">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5h7v6H4zM13 5h7v3h-7zM13 10h7v9h-7zM4 13h7v6H4z" />
      </svg>
      Resumo
    </RouterLink>
    <RouterLink to="/tasks" class="dock-link">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6h3v3H4zM9 6.5h11v2H9zM4 11h3v3H4zM9 11.5h11v2H9zM4 16h3v3H4zM9 16.5h11v2H9z" />
      </svg>
      Tarefas
    </RouterLink>
  </nav>
</template>

<style scoped>
@reference "../assets/main.css";

.masthead {
  @apply sticky top-0 z-40 bg-paper border-b-2 border-ink;
  padding-top: env(safe-area-inset-top);
}

.masthead-inner {
  @apply max-w-4xl mx-auto px-4 flex items-center h-14;
}

/* Fraunces at a display size with the wonk axis on: the one typographic flourish. */
.wordmark {
  @apply font-display text-[1.35rem] leading-none font-black tracking-[-0.03em]
         text-ink no-underline shrink-0;
  font-variation-settings:
    'SOFT' 0,
    'WONK' 1;
}

.wordmark:hover {
  @apply text-ink;
}

.wordmark-dot {
  @apply text-flare;
}

.nav-link {
  @apply px-2.5 py-1.5 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.12em]
         text-ink-soft no-underline rounded-sm whitespace-nowrap
         transition-colors duration-[120ms];
}
.nav-link:hover {
  @apply text-ink bg-paper-sunk;
}
.nav-link.router-link-active:not(.nav-link-exact),
.nav-link-exact.router-link-exact-active {
  @apply text-ink bg-flare-dim;
  box-shadow: inset 0 -2px 0 var(--color-flare);
}

.signout {
  @apply min-h-9 px-2.5 font-mono text-[0.625rem] font-medium uppercase tracking-[0.12em]
         text-ink-faint bg-transparent border border-rule-strong rounded-sm
         cursor-pointer whitespace-nowrap transition-colors duration-[120ms];
}
.signout:hover {
  @apply text-alarm border-alarm;
}

.dock {
  @apply fixed bottom-0 left-0 right-0 z-40 flex items-stretch
         bg-paper border-t-2 border-ink;
  padding-bottom: env(safe-area-inset-bottom);
}

.dock-link {
  @apply flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-14
         font-mono text-[0.625rem] font-medium uppercase tracking-[0.1em]
         text-ink-faint no-underline transition-colors duration-[120ms];
}

.dock-link svg {
  @apply w-5 h-5;
  fill: currentColor;
}

.dock-link.router-link-active:not(.dock-link-exact),
.dock-link-exact.router-link-exact-active {
  @apply text-ink bg-flare-dim;
  box-shadow: inset 0 2px 0 var(--color-flare);
}
</style>
