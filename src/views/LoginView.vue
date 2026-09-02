<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth-store'

const authStore = useAuthStore()
const router = useRouter()
const error = ref<string | null>(null)
const signingIn = ref(false)

async function handleSignIn() {
  error.value = null
  signingIn.value = true
  try {
    await authStore.signIn()
    router.push('/')
  } catch (err) {
    error.value = 'Falha ao entrar com Google. Tente novamente.'
    console.error('Sign-in error:', err)
  } finally {
    signingIn.value = false
  }
}
</script>

<template>
  <div class="flex items-center justify-center min-h-[70vh]">
    <div class="card">
      <p class="eyebrow">Almanaque de rotinas</p>
      <h1 class="title">Tarefas<span class="text-flare">.</span></h1>
      <p class="blurb">Diarias, semanais, mensais e anuais. Um toque para marcar.</p>

      <!-- Four ink rules standing in for the four frequencies. -->
      <ul class="rules" aria-hidden="true">
        <li v-for="n in 4" :key="n" :style="{ animationDelay: `${n * 90}ms` }"></li>
      </ul>

      <button class="google" :disabled="signingIn" @click="handleSignIn">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        {{ signingIn ? 'Entrando...' : 'Entrar com Google' }}
      </button>

      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
@reference "../assets/main.css";

.card {
  @apply w-full max-w-[380px] px-6 py-9 bg-paper-raised border-2 border-ink rounded-sm text-center;
  box-shadow: var(--shadow-stamp);
}

.eyebrow {
  @apply font-mono text-[0.625rem] font-medium uppercase tracking-[0.18em] text-flare-deep;
}

.title {
  @apply font-display text-[2.6rem] leading-none font-black tracking-[-0.04em] text-ink mt-2 mb-3;
  font-variation-settings:
    'SOFT' 0,
    'WONK' 1;
}

.blurb {
  @apply text-[0.875rem] leading-snug text-ink-soft mb-6;
}

.rules {
  @apply flex flex-col gap-1.5 mb-7;
}
.rules li {
  @apply h-[3px] bg-ink origin-left;
  animation: draw 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.rules li:nth-child(1) {
  @apply w-full;
}
.rules li:nth-child(2) {
  @apply w-3/4;
}
.rules li:nth-child(3) {
  @apply w-1/2 bg-flare;
}
.rules li:nth-child(4) {
  @apply w-1/4;
}

@keyframes draw {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}

.google {
  @apply inline-flex items-center justify-center gap-2.5 w-full min-h-12 px-5
         font-sans text-[0.9375rem] font-semibold text-paper bg-ink
         border-2 border-ink rounded-sm cursor-pointer
         transition-[transform,box-shadow,background] duration-[100ms];
  box-shadow: var(--shadow-stamp-sm);
}
.google:hover:not(:disabled) {
  @apply bg-flare-deep border-flare-deep;
}
.google:active:not(:disabled) {
  @apply translate-x-[2px] translate-y-[2px];
  box-shadow: none;
}
.google:disabled {
  @apply opacity-50 cursor-not-allowed;
}
</style>
