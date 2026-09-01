<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { initializeGoogleIdentity, renderGoogleButton } from '@/adapters/google/google-identity'

const hostRef = ref<HTMLDivElement>()
const error = ref<string | null>(null)

const emit = defineEmits<{ credential: [string] }>()

onMounted(async () => {
  try {
    await initializeGoogleIdentity((credential) => emit('credential', credential))
    // The component can unmount while the script loads, and renderButton needs
    // a live node.
    if (!hostRef.value) return
    renderGoogleButton(hostRef.value)
  } catch (err) {
    error.value = import.meta.env.VITE_GOOGLE_CLIENT_ID
      ? 'Nao e possivel carregar o login do Google. Verifique sua conexao.'
      : 'Login do Google nao configurado. Defina VITE_GOOGLE_CLIENT_ID no arquivo .env.'
    console.error('Google Identity Services setup failed:', err)
  }
})
</script>

<template>
  <div>
    <div ref="hostRef" class="flex justify-center min-h-[44px]"></div>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>
