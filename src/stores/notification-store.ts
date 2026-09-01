import { ref } from 'vue'
import { defineStore } from 'pinia'

export type NotificationType = 'success' | 'error'

export interface Notification {
  id: number
  message: string
  type: NotificationType
}

const AUTO_DISMISS_MS = 3000

export const useNotificationStore = defineStore('notification', () => {
  const notifications = ref<Notification[]>([])
  let nextId = 0

  function add(message: string, type: NotificationType = 'success') {
    const id = nextId++
    notifications.value.push({ id, message, type })
    setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
  }

  function success(message: string) {
    add(message, 'success')
  }

  function error(message: string) {
    add(message, 'error')
  }

  function dismiss(id: number) {
    notifications.value = notifications.value.filter((n) => n.id !== id)
  }

  return { notifications, add, success, error, dismiss }
})
