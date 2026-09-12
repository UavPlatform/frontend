import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { getStoredSession, hasSessionToken } from '../api/session'

// Q7=A：运营台收敛为管理员单入口——业务面全部 requiresAdmin，普通用户登录入口已移除（/login 仅重定向）
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'dashboard',
    component: () => import('../views/DashboardView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/operate/:deviceId',
    name: 'operate',
    component: () => import('../views/OperateView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/records',
    name: 'records',
    component: () => import('../views/RecordsView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/orders',
    name: 'orders',
    component: () => import('../views/OrderView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/login',
    // 旧普通用户登录入口收敛：重定向到管理员登录
    redirect: { name: 'admin-login' },
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
  const isAdmin = getStoredSession()?.user?.role === 'ADMIN'

  if (to.meta.requiresAuth && !authed) {
    return { name: 'admin-login' }
  }

  if (to.meta.requiresAdmin && !isAdmin) {
    return { name: 'admin-login' }
  }

  if (to.name === 'admin-login' && authed && isAdmin) {
    return { name: 'admin-center' }
  }

  return true
})

export default router
