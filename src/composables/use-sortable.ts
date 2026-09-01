import { computed, ref, type Ref } from 'vue'

type ValueGetter<T> = (item: T) => string | number | Date

export function useSortable<T>(
  items: Ref<T[]>,
  columns: Record<string, ValueGetter<T>>,
  initialSort?: { key: string; asc?: boolean },
) {
  const sortKey = ref<string | null>(initialSort?.key ?? null)
  const sortAsc = ref(initialSort?.asc ?? true)

  function sortBy(key: string) {
    if (sortKey.value === key) {
      sortAsc.value = !sortAsc.value
    } else {
      sortKey.value = key
      sortAsc.value = true
    }
  }

  const sortedItems = computed(() => {
    const key = sortKey.value
    if (!key || !columns[key]) return items.value
    const getter = columns[key]!
    const dir = sortAsc.value ? 1 : -1
    return [...items.value].sort((a, b) => {
      const va = getter(a)
      const vb = getter(b)
      if (typeof va === 'string' && typeof vb === 'string') {
        return va.localeCompare(vb) * dir
      }
      if (va < vb) return -1 * dir
      if (va > vb) return 1 * dir
      return 0
    })
  })

  function sortClass(key: string) {
    if (sortKey.value !== key) return 'sortable'
    return sortAsc.value ? 'sortable sort-asc' : 'sortable sort-desc'
  }

  return { sortedItems, sortKey, sortAsc, sortBy, sortClass }
}
