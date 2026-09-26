import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import MainLayout from '../../src/layouts/MainLayout.vue'
import { setStoredSession, clearStoredSession } from '../../src/api/session'
import type { AuthSession } from '../../src/types/auth'

// TASK-FRONTEND-001：壳层四项主导航（首页/订单/用户/飞手）+ 次级系统日志入口
const routes = [
  { path: '/', name: 'home', component: { template: '<div />' } },
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
  })

  it('品牌为吊运监管平台，侧边菜单为四项主导航', async () => {
    const { wrapper } = await mountLayout()

    const sidebarButtons = wrapper.findAll('aside button')
    const labels = sidebarButtons.map((button) => button.text())
    expect(labels).toContain('首页')
    expect(labels).toContain('订单')
    expect(labels).toContain('用户')
    expect(labels).toContain('飞手')

    // 旧导航项不得回归
    expect(labels).not.toContain('无人机总览')
    expect(labels).not.toContain('历史记录')
    expect(labels).not.toContain('管理员中心')

    expect(wrapper.text()).toContain('吊运监管平台')
    expect(wrapper.text()).not.toContain('空域指挥台')
  })

  it('点击菜单项切换到对应路由', async () => {
    const { wrapper, router } = await mountLayout()

    const clickMenu = async (label: string) => {
      const button = wrapper.findAll('aside button').find((item) => item.text().includes(label))
      await button!.trigger('click')
      await flushPromises()
    }

    await clickMenu('用户')
    expect(router.currentRoute.value.name).toBe('users')

    await clickMenu('飞手')
    expect(router.currentRoute.value.name).toBe('pilots')

    await clickMenu('订单')
    expect(router.currentRoute.value.name).toBe('orders')

    await clickMenu('首页')
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('次级入口系统日志可跳转且当前路由高亮', async () => {
    const { wrapper, router } = await mountLayout()

    const systemButton = wrapper.findAll('aside button').find((item) => item.text().includes('系统日志'))
    expect(systemButton).toBeTruthy()

    await systemButton!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('system')
    expect(systemButton!.classes()).toContain('menu-item-active')
  })
})
