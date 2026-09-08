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
      path: '/tasks/:id',
      name: 'task-detail',
      component: () => import('@/views/tasks/TaskDetailView.vue'),
    },
    {
      path: '/tasks/:id/edit',
      name: 'task-edit',
      component: () => import('@/views/tasks/TaskFormView.vue'),
    },
    {
      path: '/categories',
      name: 'category-list',
      component: () => import('@/views/categories/CategoryListView.vue'),
    },
    {
      path: '/categories/new',
      name: 'category-create',
      component: () => import('@/views/categories/CategoryFormView.vue'),
    },
    {
      path: '/categories/:id/edit',
      name: 'category-edit',
      component: () => import('@/views/categories/CategoryFormView.vue'),
    },
  ],
})

export default router
