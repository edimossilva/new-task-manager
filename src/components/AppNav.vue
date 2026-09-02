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
  <nav class="bg-bg-subtle border-b border-border sticky top-0 z-100 backdrop-blur-[12px]">
    <div class="max-w-5xl mx-auto px-6 flex items-center gap-8 h-14">
      <RouterLink
        to="/"
        class="text-base font-bold tracking-[0.04em] text-primary no-underline shrink-0"
      >
        TM
      </RouterLink>
      <div class="flex items-center gap-1 overflow-x-auto flex-1">
        <RouterLink to="/" class="nav-link nav-link-exact">Resumo</RouterLink>
        <RouterLink to="/tasks" class="nav-link">Tarefas</RouterLink>
      </div>
      <div v-if="authStore.user" class="flex items-center gap-2 shrink-0 ml-auto">
        <img
          v-if="authStore.user.photoURL"
          :src="authStore.user.photoURL"
          :alt="authStore.user.displayName ?? 'Avatar'"
          class="w-7 h-7 rounded-full"
          referrerpolicy="no-referrer"
        />
        <span
          class="text-[0.8125rem] text-text-secondary whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis"
        >
          {{ authStore.user.displayName }}
        </span>
        <button
          class="px-2 py-1 text-xs font-medium text-text-muted bg-transparent border border-border rounded-sm cursor-pointer whitespace-nowrap transition-colors duration-[120ms] hover:text-danger hover:border-danger"
          @click="handleSignOut"
        >
          Sair
        </button>
      </div>
    </div>
  </nav>
</template>

<style scoped>
@reference "../assets/main.css";

.nav-link {
  @apply px-[0.7rem] py-[0.35rem] text-[0.8125rem] font-medium text-text-muted no-underline
         rounded-sm whitespace-nowrap transition-[color,background] duration-[120ms];
}
.nav-link:hover {
  @apply text-text-secondary bg-surface-hover;
}
.nav-link.router-link-active:not(.nav-link-exact),
.nav-link-exact.router-link-exact-active {
  @apply text-primary bg-primary-dim;
}
</style>
