import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { hasSessionToken } from '../api/session'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'dashboard',
    component: () => import('../views/DashboardView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/operate/:deviceId',
    name: 'operate',
    component: () => import('../views/OperateView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const authed = hasSessionToken()

  if (to.meta.requiresAuth && !authed) {
    return { name: 'login' }
  }

  if (to.name === 'login' && authed) {
    return { name: 'dashboard' }
  }

  return true
})

export default router
