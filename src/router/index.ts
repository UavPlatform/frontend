import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { getStoredSession, hasSessionToken } from '../api/session'

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
    path: '/records',
    name: 'records',
    component: () => import('../views/RecordsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/route',
    name: 'route',
    component: () => import('../views/RouteView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
  },
  {
    path: '/admin/login',
    name: 'admin-login',
    component: () => import('../views/AdminLoginView.vue'),
  },
  {
    path: '/admin/center',
    name: 'admin-center',
    component: () => import('../views/AdminView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const authed = hasSessionToken()
  const session = getStoredSession()
  const isAdmin = session?.user?.role === 'ADMIN'

  if (to.meta.requiresAuth && !authed) {
    if (to.meta.requiresAdmin) {
      return { name: 'admin-login' }
    }
    return { name: 'login' }
  }

  if (to.meta.requiresAdmin && !isAdmin) {
    return { name: 'dashboard' }
  }

  if (to.name === 'login' && authed && !isAdmin) {
    return { name: 'dashboard' }
  }

  if (to.name === 'admin-login' && authed && isAdmin) {
    return { name: 'admin-center' }
  }

  return true
})

export default router
