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
      <!--
        Keyed on the path, so a route change to the SAME component remounts it.
        Every view here loads on mount -- `useEntityForm` reads its entity in
        `onMounted`, `TaskDetailView` calls `load()` there -- and the router
        reuses the instance across two routes rendered by one component, so
        `/tasks/a` -> `/tasks/b` and `/tasks/:id/edit` -> `/tasks/new` kept the
        first page's data and the first form's fields. Keying makes the
        mount-once contract true again rather than teaching every view to watch
        the route. The query is part of the key because the only query params in
        the app are the form's `?category=` and `?parent=` presets, which are
        read on mount too; a view that ever puts its OWN state in the query
        would need this narrowed to the path.
      -->
      <RouterView :key="$route.fullPath" />
    </main>
    <NotificationToast />
  </div>
</template>
