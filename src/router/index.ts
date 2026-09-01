import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/tasks',
      name: 'task-list',
      component: () => import('@/views/tasks/TaskListView.vue'),
    },
    {
      path: '/tasks/new',
      name: 'task-create',
      component: () => import('@/views/tasks/TaskFormView.vue'),
    },
    {
      path: '/tasks/:id/edit',
      name: 'task-edit',
      component: () => import('@/views/tasks/TaskFormView.vue'),
    },
  ],
})

export default router
