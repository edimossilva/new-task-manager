<script setup lang="ts">
/*
 * The app shell, minus `AppNav` -- which reads the auth store and signs people
 * out. Everything inside is the real view for the current route.
 */
</script>

<template>
  <main class="shell">
    <RouterView />
  </main>
</template>

<style scoped>
@reference "../src/assets/main.css";

.shell {
  @apply mx-auto w-full max-w-[420px] px-3 py-4;
}
</style>
