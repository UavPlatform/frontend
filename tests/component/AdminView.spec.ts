import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import AdminView from '../../src/views/AdminView.vue'
import type { AdminStatistics, LiveUav, UavDetail } from '../../src/types/admin'

const {
  getAdminStatistics,
  getAllUavs,
  getLiveUavs,
  updateUavAvailable,
  getApplicationLogs,
  getErrorLogs,
} = vi.hoisted(() => ({
  getAdminStatistics: vi.fn(),
  getAllUavs: vi.fn(),
  getLiveUavs: vi.fn(),
  updateUavAvailable: vi.fn(),
  getApplicationLogs: vi.fn(),
  getErrorLogs: vi.fn(),
}))

vi.mock('../../src/api/modules/admin', () => ({
  getAdminStatistics,
  getAllUavs,
  getLiveUavs,
  updateUavAvailable,
  getApplicationLogs,
  getErrorLogs,
}))

const statisticsFixture: AdminStatistics = {
  totalUavs: 3,
  onlineUavs: 2,
  availableUavs: 3,
  liveUavs: 1,
  offlineUavs: 1,
  unavailableUavs: 0,
  totalUsers: 7,
}

const uavFixture: UavDetail = {
  id: 1,
  uavName: '巡检一号',
  djiId: 'DJI-001',
  isAvailable: '1',
  lastActiveTime: '',
  onlineStatus: '1',
}

const liveUavFixture: LiveUav = {
  deviceId: 'DJI-001',
  uavName: '巡检一号',
  roomId: 'drone_DJI-001',
  requestId: 'req-1',
  updatedAt: Date.parse('2026-09-12 10:00:00'),
  onlineStatus: '1',
  isAvailable: '1',
}

const mountView = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'dashboard', component: { template: '<div />' } }],
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(AdminView, {
    global: { plugins: [router, ElementPlus] },
  })
  await flushPromises()
  return wrapper
}

describe('AdminView 与运营台主框架融合（1B-5b U5）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAdminStatistics.mockResolvedValue(statisticsFixture)
    getAllUavs.mockResolvedValue([uavFixture])
    getLiveUavs.mockResolvedValue([liveUavFixture])
    getApplicationLogs.mockResolvedValue(['2026-09-12 INFO app started'])
    getErrorLogs.mockResolvedValue([])
  })

  it('走 MainLayout 统一导航渲染（管理员中心标题 + 统一登出），统计卡片有值', async () => {
    const wrapper = await mountView()

    const text = wrapper.text()
    expect(text).toContain('管理员中心')
    expect(text).toContain('无人机总览') // MainLayout 侧边菜单
    expect(text).toContain('退出登录') // 统一登出入口（原独立深色页头已移除）
    expect(text).toContain('3') // totalUavs
    expect(text).toContain('drone_DJI-001') // 直播中无人机表
  })

  it('无人机管理 tab 渲染机队列表与可用状态操作', async () => {
    const wrapper = await mountView()

    const tabItems = wrapper.findAll('.el-tabs__item')
    await tabItems.find((item) => item.text().includes('无人机管理'))!.trigger('click')
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('DJI-001')
    expect(text).toContain('巡检一号')
    expect(text).toContain('可用')
  })
})
