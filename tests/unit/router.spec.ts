import { beforeEach, describe, expect, it } from 'vitest'
import router from '../../src/router'
import { setStoredSession, clearStoredSession } from '../../src/api/session'
import type { AuthSession } from '../../src/types/auth'

// TASK-FRONTEND-001：壳层路由表——四项导航 + 次级系统页；旧一级路由已删除
const shellRoutes: Array<[path: string, name: string]> = [
  ['/', 'home'],
  ['/orders', 'orders'],
  ['/users', 'users'],
  ['/pilots', 'pilots'],
  ['/system', 'system'],
]

const adminSession: AuthSession = {
  token: 'token',
  user: { username: 'admin', displayName: '张监管', role: 'ADMIN', teamName: '平台' },
}

describe('壳层路由表（TASK-FRONTEND-001）', () => {
  beforeEach(async () => {
    clearStoredSession()
    // 复位到登录页（未登录访问壳层路由的落点），避免同地推送跳过守卫
    await router.push('/orders')
    expect(router.currentRoute.value.name).toBe('admin-login')
  })

  it('四项导航与系统页路由均可解析', () => {
    for (const [path, name] of shellRoutes) {
      expect(router.resolve(path).name).toBe(name)
    }
  })

  it('旧一级路由（records/operate/admin-center）已移除并回落首页', async () => {
    setStoredSession(adminSession)

    for (const path of ['/records', '/operate/DJI-001', '/admin/center']) {
      // 已删除的路由名不得仍注册在路由表中
      expect(router.resolve(path).name).toBeUndefined()
    }

    await router.push('/records')
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('未登录访问壳层路由跳转登录页', async () => {
    await router.push('/users')
    expect(router.currentRoute.value.name).toBe('admin-login')
  })

  it('已登录管理员访问登录页回落首页（登录后默认 /）', async () => {
    setStoredSession(adminSession)

    await router.push('/pilots')
    expect(router.currentRoute.value.name).toBe('pilots')

    await router.push('/admin/login')
    expect(router.currentRoute.value.name).toBe('home')
  })
})
