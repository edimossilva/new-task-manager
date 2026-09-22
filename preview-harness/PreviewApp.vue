<script setup lang="ts">
/*
 * The app shell, minus `AppNav` -- which reads the auth store and signs people
 * out. Everything inside is the real view for the current route.
 *
 * `?shell=wide` swaps the phone column for the app's own `max-w-4xl`. The
 * layout is responsive to the COLUMN rather than to the window -- the home
 * curves split in two once the column is wide enough -- so a harness that could
 * only ever be 420px wide could only ever show half of it.
 */
const wide = new URLSearchParams(location.search).get('shell') === 'wide'
</script>

<template>
  <main class="shell" :class="{ wide }">
    <RouterView />
  </main>
</template>

<style scoped>
@reference "../src/assets/main.css";

.shell {
  @apply mx-auto w-full max-w-[420px] px-3 py-4;
}

.shell.wide {
  @apply max-w-4xl px-4 py-6;
}
</style>
