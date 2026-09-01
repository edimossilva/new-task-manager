<script setup lang="ts">
import { useAuthStore } from '@/stores/auth-store'

const authStore = useAuthStore()
</script>

<template>
  <h1>Hoje</h1>
  <p>Ola, {{ authStore.user?.name }}.</p>
</template>
