import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ShowcaseView from '../../src/views/ShowcaseView.vue'
import router from '../../src/router'
import { setStoredSession, clearStoredSession } from '../../src/api/session'
import type { AuthSession } from '../../src/types/auth'

const { getAdminStatistics, getAdminTasks, getAdminOrders, getAdminPilots } = vi.hoisted(() => ({
  getAdminStatistics: vi.fn(), getAdminTasks: vi.fn(), getAdminOrders: vi.fn(), getAdminPilots: vi.fn(),
}))
vi.mock('../../src/api/modules/admin', () => ({ getAdminStatistics }))
vi.mock('../../src/api/modules/admin-query', () => ({ getAdminTasks, getAdminOrders, getAdminPilots }))

const adminSession: AuthSession = {
  token: 't',
  user: { username: 'admin', displayName: '张监管', role: 'ADMIN', teamName: '平台' },
}

const cleanups: Array<() => void> = []

const mountShowcase = async () => {
  const wrapper = mount(ShowcaseView, { global: { plugins: [router, ElementPlus] } })
  cleanups.push(() => wrapper.unmount())
  await flushPromises()
  return wrapper
}

const activeDotIndex = (wrapper: VueWrapper) =>
  wrapper.findAll('.dot').findIndex((dot) => dot.classes().includes('dot--active'))

describe('大屏展示轮播', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    getAdminStatistics.mockResolvedValue({ totalUavs: 12, onlineUavs: 5, availableUavs: 8, liveUavs: 3 })
    getAdminTasks.mockResolvedValue({ content: [{ taskNum: 'TASK-A', taskName: '吊运任务' }] })
    getAdminOrders.mockResolvedValue({ content: [{ orderNum: 'ORD-A', taskName: '测试订单' }] })
    getAdminPilots.mockResolvedValue({ content: [{ userId: 11, userName: '测试飞手', completedCount: 7 }] })
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    clearStoredSession()
    setStoredSession(adminSession)
    await router.push('/showcase')
  })

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup()
    }
    vi.useRealTimers()
    clearStoredSession()
  })

  it('渲染 4 屏，5 秒自动切换，首尾循环', async () => {
    const w = await mountShowcase()

    expect(w.findAll('.slide')).toHaveLength(4)
    expect(activeDotIndex(w)).toBe(0)

    vi.advanceTimersByTime(5000)
    await flushPromises()
    expect(activeDotIndex(w)).toBe(1)

    // 从第 2 屏再走 3 步 → 回到第 1 屏（循环）
    vi.advanceTimersByTime(15_000)
    await flushPromises()
    expect(activeDotIndex(w)).toBe(0)
  })

  it('上一张 / 下一张切换', async () => {
    const w = await mountShowcase()

    await w.find('[aria-label="下一屏"]').trigger('click')
    await flushPromises()
    expect(activeDotIndex(w)).toBe(1)

    await w.find('[aria-label="上一屏"]').trigger('click')
    await flushPromises()
    expect(activeDotIndex(w)).toBe(0)
  })

  it('悬停暂停，移开恢复', async () => {
    const w = await mountShowcase()

    await w.find('.showcase').trigger('mouseenter')
    vi.advanceTimersByTime(20_000)
    await flushPromises()
    expect(activeDotIndex(w)).toBe(0)

    await w.find('.showcase').trigger('mouseleave')
    vi.advanceTimersByTime(5000)
    await flushPromises()
    expect(activeDotIndex(w)).toBe(1)
  })

  it('卸载后清理计时器（不再推进）', async () => {
    const w = await mountShowcase()
    const before = activeDotIndex(w)

    w.unmount()
    cleanups.pop()
    vi.advanceTimersByTime(20_000)
    await flushPromises()
    expect(activeDotIndex(w)).toBe(before)
  })
  it('展示真实统计与任务订单飞手列表', async () => {
    const wrapper = await mountShowcase()
    expect(wrapper.text()).not.toContain('内容待填充')
    expect(wrapper.text()).toContain('无人机总数')
    expect(wrapper.text()).toContain('TASK-A')
    expect(wrapper.text()).toContain('ORD-A')
    expect(wrapper.text()).toContain('测试飞手')
    expect(getAdminStatistics).toHaveBeenCalledTimes(1)
  })

  it('接口失败时提示刷新，不显示虚假统计零值', async () => {
    getAdminStatistics.mockRejectedValueOnce(new Error('统计接口失败'))
    const wrapper = await mountShowcase()
    expect(wrapper.text()).toContain('统计接口失败')
    expect(wrapper.findAll('.overview-metric strong').map((node) => node.text())).toEqual(['—', '—', '—', '—'])
  })

})
