<script setup lang="ts">
import AppNav from '@/components/AppNav.vue'
import NotificationToast from '@/components/NotificationToast.vue'
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <AppNav />
    <main class="max-w-7xl mx-auto px-4 py-8 w-full flex-1">
      <RouterView />
    </main>
    <NotificationToast />
  </div>
</template>
