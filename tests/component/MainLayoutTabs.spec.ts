import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import ElementPlus from 'element-plus'
import MainLayout from '../../src/layouts/MainLayout.vue'
import { setStoredSession, clearStoredSession } from '../../src/api/session'
import type { AuthSession } from '../../src/types/auth'

const routes = [
  { path: '/', name: 'home', component: { template: '<div />' } },
  { path: '/showcase', name: 'showcase', component: { template: '<div />' } },
  { path: '/orders/:orderNum', name: 'order-detail', component: { template: '<div />' } },
  { path: '/orders', name: 'orders', component: { template: '<div />' } },
  { path: '/users', name: 'users', component: { template: '<div />' } },
  { path: '/pilots', name: 'pilots', component: { template: '<div />' } },
  { path: '/system', name: 'system', component: { template: '<div />' } },
]

const TABS_KEY = 'uav-console-tabs'

const adminSession: AuthSession = {
  token: 't',
  user: { username: 'admin', displayName: '张监管', role: 'ADMIN', teamName: '平台' },
}

const mountLayout = async (): Promise<{ wrapper: VueWrapper; router: Router }> => {
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

const tabTitles = (wrapper: VueWrapper) =>
  wrapper.findAll('.tab__title').map((title) => title.text())

const findTab = (wrapper: VueWrapper, title: string) =>
  wrapper.findAll('.tab').find((tab) => tab.find('.tab__title').text() === title)

describe('MainLayout 已访问书签页签', () => {
  beforeEach(() => {
    clearStoredSession()
    setStoredSession(adminSession)
    window.localStorage.removeItem(TABS_KEY)
  })

  it('记录访问过的界面并按路由名去重', async () => {
    const { wrapper, router } = await mountLayout()

    await router.push('/orders')
    await flushPromises()
    await router.push('/orders')
    await flushPromises()
    await router.push('/users')
    await flushPromises()

    expect(tabTitles(wrapper)).toEqual(['首页', '订单', '用户'])
  })

  it('关闭当前页签后切到相邻页签', async () => {
    const { wrapper, router } = await mountLayout()

    await router.push('/orders')
    await flushPromises()
    await router.push('/users')
    await flushPromises()

    await findTab(wrapper, '用户')!.find('.tab__close').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('orders')
    expect(tabTitles(wrapper)).toEqual(['首页', '订单'])
  })

  it('关闭最后一个页签后跳转首页', async () => {
    const { wrapper, router } = await mountLayout()

    await router.push('/orders')
    await flushPromises()

    // 先关掉非活动的「首页」，再关掉当前「订单」（最后剩余）
    await findTab(wrapper, '首页')!.find('.tab__close').trigger('click')
    await flushPromises()
    await findTab(wrapper, '订单')!.find('.tab__close').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('home')
  })

  it('书签持久化到 localStorage，损坏数据安全回退为空', async () => {
    // 损坏数据：非法 JSON → 从空列表恢复，不崩溃
    window.localStorage.setItem(TABS_KEY, '{bad json')
    const { wrapper } = await mountLayout()
    expect(wrapper.findAll('.tab')).toHaveLength(1) // 恢复后立即记录当前路由「首页」

    // 正常持久化
    const second = await mountLayout()
    await second.router.push('/orders')
    await flushPromises()
    const stored = JSON.parse(window.localStorage.getItem(TABS_KEY)!) as Array<{ title: string }>
    expect(stored.map((tab) => tab.title)).toEqual(['首页', '订单'])
  })
  it('不同订单详情保留独立页签，重载后仍可识别订单', async () => {
    const { wrapper, router } = await mountLayout()
    await router.push('/orders/ORD-A')
    await flushPromises()
    await router.push('/orders/ORD-B')
    await flushPromises()
    expect(tabTitles(wrapper)).toEqual(['首页', '订单详情 · ORD-A', '订单详情 · ORD-B'])
    await findTab(wrapper, '订单详情 · ORD-A')!.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(router.currentRoute.value.params.orderNum).toBe('ORD-A')
    wrapper.unmount()
    const restored = await mountLayout()
    expect(tabTitles(restored.wrapper)).toContain('订单详情 · ORD-B')
    restored.wrapper.unmount()
  })

  it('合法 JSON 中的错误结构不会导致页面崩溃', async () => {
    window.localStorage.setItem(TABS_KEY, JSON.stringify({ name: 'orders' }))
    const { wrapper } = await mountLayout()
    expect(tabTitles(wrapper)).toEqual(['首页'])
    wrapper.unmount()
  })

})
