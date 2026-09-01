import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'

export function useEntityForm<T>(loadById: (id: string) => T | undefined) {
  const route = useRoute()
  const entityId = computed(() => route.params.id as string | undefined)
  const isEditMode = computed(() => !!entityId.value)
  const existing = ref<T | undefined>()

  onMounted(() => {
    if (entityId.value) {
      existing.value = loadById(entityId.value)
    }
  })

  return { entityId, isEditMode, existing }
}
