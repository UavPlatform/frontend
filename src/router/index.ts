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
    path: '/admin',
    name: 'admin',
    component: () => import('../views/AdminView.vue'),
    meta: { requiresAuth: true, roles: ['admin'] },
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

  if (to.meta.requiresAuth && to.meta.roles) {
    const session = getStoredSession()
    const userRole = session?.user?.role
    
    if (!userRole || !to.meta.roles.includes(userRole)) {
      return { name: 'dashboard' }
    }
  }

  if (to.name === 'login' && authed) {
    return { name: 'dashboard' }
  }

  return true
})

export default router
