import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { getStoredSession, hasSessionToken } from '../api/session'

// REQ-FRONTEND-001：吊运监管平台壳层——四实体导航（首页/订单/用户/飞手）+ 次级系统页。
// 旧一级路由（/records、/ 首页机队看板、裸 /operate/:deviceId、/admin/center）已随 ADR-0004 移除。
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/HomeView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/orders',
    name: 'orders',
    component: () => import('../views/OrderView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    // 订单详情：顶栏摘要 + 双 Tab（订单管理 / 任务监管，TASK-FRONTEND-003）
    path: '/orders/:orderNum',
    name: 'order-detail',
    component: () => import('../views/OrderDetailView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    // 任务监管全屏（ADR-0004）：只读监看——视频最大化 + 可收起信息面板，无启停直播控制
    path: '/orders/:orderNum/supervise',
    name: 'order-supervise',
    component: () => import('../views/SuperviseView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/users',
    name: 'users',
    component: () => import('../views/UsersView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    // 用户详情（TASK-FRONTEND-004）：基本信息 + 关联订单摘要
    path: '/users/:id',
    name: 'user-detail',
    component: () => import('../views/UserDetailView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/pilots',
    name: 'pilots',
    component: () => import('../views/PilotsView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    // 飞手详情（TASK-FRONTEND-004）：绑定无人机 + 启停开关 + 关联订单（ADR-0004：无人机不设一级菜单）
    path: '/pilots/:id',
    name: 'pilot-detail',
    component: () => import('../views/PilotDetailView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/system',
    name: 'system',
    component: () => import('../views/SystemView.vue'),
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
    // 旧书签（/records、/operate/:deviceId、/admin/center 等）回落首页
    path: '/:pathMatch(.*)*',
    redirect: { name: 'home' },
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
    return { name: 'home' }
  }

  return true
})

export default router
