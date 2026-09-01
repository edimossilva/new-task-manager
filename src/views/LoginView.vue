<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import GoogleSignInButton from '@/components/GoogleSignInButton.vue'
import { useAuthStore } from '@/stores/auth-store'

const authStore = useAuthStore()
const router = useRouter()
const error = ref<string | null>(null)

function handleCredential(credential: string) {
  error.value = null
  try {
    authStore.completeSignIn(credential)
    router.push({ name: 'home' })
  } catch (err) {
    error.value = 'Falha ao entrar com Google. Tente novamente.'
    console.error('Sign-in error:', err)
  }
}
</script>

<template>
  <div class="flex items-center justify-center min-h-[80vh]">
    <div
      class="text-center px-8 py-12 bg-bg-subtle border border-border rounded-lg max-w-[400px] w-full"
    >
      <h1 class="text-2xl font-bold text-text !mb-2">Tarefas</h1>
      <p class="text-sm text-text-muted !mb-8">
        Acompanhe suas rotinas diarias, semanais e mensais
      </p>
      <GoogleSignInButton @credential="handleCredential" />
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>
