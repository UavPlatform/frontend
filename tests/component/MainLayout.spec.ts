import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import MainLayout from '../../src/layouts/MainLayout.vue'
import { setStoredSession, clearStoredSession } from '../../src/api/session'
import type { AuthSession } from '../../src/types/auth'

// TASK-FRONTEND-001：壳层主导航（大屏展示 + 首页/订单/用户/飞手 + 系统日志）
// 菜单项通过 data-testid 定位（不依赖类名/文案），只断言行为：跳转与激活态。
const routes = [
  { path: '/', name: 'home', component: { template: '<div />' } },
  { path: '/showcase', name: 'showcase', component: { template: '<div />' } },
  { path: '/orders', name: 'orders', component: { template: '<div />' } },
  { path: '/users', name: 'users', component: { template: '<div />' } },
  { path: '/pilots', name: 'pilots', component: { template: '<div />' } },
  { path: '/system', name: 'system', component: { template: '<div />' } },
]

const mountLayout = async () => {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(MainLayout, {
    props: { title: '测试页' },
    global: { plugins: [router, ElementPlus] },
  })
  await flushPromises()
  return { wrapper, router }
}

describe('MainLayout 监管壳层导航（TASK-FRONTEND-001）', () => {
  beforeEach(() => {
    clearStoredSession()
    const session: AuthSession = {
      token: 't',
      user: { username: 'admin', displayName: '张监管', role: 'ADMIN', teamName: '平台' },
    }
    setStoredSession(session)
    window.localStorage.removeItem('uav-console-tabs')
  })

  it('侧边菜单包含五项可用主导航', async () => {
    const { wrapper } = await mountLayout()

    const testids = wrapper.findAll('[data-testid^="menu-"]').map((item) => item.attributes('data-testid'))
    expect(testids).toEqual(
      expect.arrayContaining([
        'menu-home',
        'menu-orders',
        'menu-users',
        'menu-pilots',
        'menu-system',
      ]),
    )
  })

  it('点击菜单项切换到对应路由', async () => {
    const { wrapper, router } = await mountLayout()

    const clickMenu = async (testid: string) => {
      const item = wrapper.find(`[data-testid="${testid}"]`)
      expect(item.exists()).toBe(true)
      await item.trigger('click')
      await flushPromises()
    }

    await clickMenu('menu-users')
    expect(router.currentRoute.value.name).toBe('users')

    await clickMenu('menu-pilots')
    expect(router.currentRoute.value.name).toBe('pilots')

    await clickMenu('menu-orders')
    expect(router.currentRoute.value.name).toBe('orders')

    await clickMenu('menu-home')
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('系统日志入口可跳转且当前路由高亮', async () => {
    const { wrapper, router } = await mountLayout()

    const systemItem = wrapper.find('[data-testid="menu-system"]')
    expect(systemItem.exists()).toBe(true)

    await systemItem.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('system')
    expect(systemItem.classes()).toContain('is-active')
  })
})
