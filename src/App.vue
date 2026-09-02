<script setup lang="ts">
import AppNav from '@/components/AppNav.vue'
import NotificationToast from '@/components/NotificationToast.vue'
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <AppNav />
    <!-- Bottom padding clears the mobile dock plus the home-bar inset. -->
    <main
      class="relative z-10 max-w-4xl mx-auto px-4 pt-6 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pt-8 sm:pb-12 w-full flex-1"
    >
      <RouterView />
    </main>
    <NotificationToast />
  </div>
</template>
