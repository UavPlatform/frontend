import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import DronesView from '../../src/views/DronesView.vue'
import router from '../../src/router'
import { clearStoredSession, setStoredSession } from '../../src/api/session'
import type { AuthSession } from '../../src/types/auth'
import type { AdminDroneVo } from '../../src/types/admin'

const api = vi.hoisted(() => ({
  getAdminDrones: vi.fn(),
  createAdminDrone: vi.fn(),
  updateAdminDrone: vi.fn(),
  setAdminDroneEnabled: vi.fn(),
  getAdminDroneBorrows: vi.fn(),
  getAdminAircraftModels: vi.fn(),
}))

vi.mock('../../src/api/modules/admin-drone', () => ({
  getAdminDrones: api.getAdminDrones,
  createAdminDrone: api.createAdminDrone,
  updateAdminDrone: api.updateAdminDrone,
  setAdminDroneEnabled: api.setAdminDroneEnabled,
  getAdminDroneBorrows: api.getAdminDroneBorrows,
}))

vi.mock('../../src/api/modules/admin-aircraft-model', () => ({
  getAdminAircraftModels: api.getAdminAircraftModels,
}))

const pageOf = <T,>(content: T[], totalElements = content.length) => ({
  content,
  page: 0,
  size: 20,
  totalElements,
  totalPages: 1,
})

const droneA: AdminDroneVo = {
  droneId: 'd-1',
  serialNumber: 'SN-001',
  airportName: '浦东机场',
  latitude: 31.14,
  longitude: 121.8,
  enabled: true,
  borrowStatus: 'BORROWED',
  executing: true,
  model: { aircraftModelId: 1, modelCode: 'FC30', displayName: 'DJI FlyCart 30' },
  currentBorrow: {
    borrowId: 'b-1',
    pilotId: 11,
    pilotName: '李飞手',
    borrowedAt: '2026-10-25T10:00:00Z',
  },
  latestOrder: {
    orderId: 'ord-99',
    stage: 'IN_TRANSIT',
    createdAt: '2026-10-25T11:00:00Z',
  },
}

const droneB: AdminDroneVo = {
  droneId: 'd-2',
  serialNumber: 'SN-002',
  airportName: '虹桥机场',
  latitude: 31.2,
  longitude: 121.3,
  enabled: true,
  borrowStatus: 'IN_STOCK',
  executing: false,
  model: { aircraftModelId: 1, modelCode: 'FC30', displayName: 'DJI FlyCart 30' },
  currentBorrow: null,
  latestOrder: null,
}

const adminSession: AuthSession = {
  token: 't',
  user: { username: 'admin', displayName: '张监管', role: 'ADMIN', teamName: '平台' },
}

const cleanups: Array<() => void> = []

const mountList = async (query = '') => {
  await router.push(`/drones${query}`)
  const wrapper = mount(DronesView, { global: { plugins: [router, ElementPlus] } })
  cleanups.push(() => wrapper.unmount())
  await flushPromises()
  return wrapper
}

describe('机场 / 无人机列表（REQ-SUP-GOV-005）', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    clearStoredSession()
    setStoredSession(adminSession)
    await router.push('/orders')
    api.getAdminDrones.mockResolvedValue(pageOf([droneA, droneB]))
    api.getAdminAircraftModels.mockResolvedValue(pageOf([{
      id: 1, modelCode: 'FC30', displayName: 'DJI FlyCart 30', maxPayloadKg: 30,
      transportEnabled: true, enabled: true, coefficient: 1,
    }]))
    api.getAdminDroneBorrows.mockResolvedValue(pageOf([]))
  })

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup()
    clearStoredSession()
  })

  it('渲染在库/已借出/执飞中与最近订单链接', async () => {
    const wrapper = await mountList()
    expect(api.getAdminDrones).toHaveBeenCalledWith({ page: 0, size: 20, airportName: undefined })
    const text = wrapper.find('[data-testid="drone-table"]').text()
    expect(text).toContain('SN-001')
    expect(text).toContain('已借出')
    expect(text).toContain('执飞中')
    expect(text).toContain('李飞手')
    expect(text).toContain('ord-99')
    expect(text).toContain('在库')
    expect(text).toContain('暂无订单')
  })

  it('按机场名称筛选写入 URL 并请求', async () => {
    const wrapper = await mountList()
    await wrapper.find('[data-testid="drone-airport-filter"]').setValue('浦东')
    await wrapper.find('button.el-button--primary').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.airport).toBe('浦东')
    expect(api.getAdminDrones).toHaveBeenLastCalledWith({
      page: 0,
      size: 20,
      airportName: '浦东',
    })
  })

  it('点击最近订单跳转派单详情', async () => {
    const wrapper = await mountList()
    const link = wrapper.find('[data-testid="drone-latest-order-d-1"]')
    expect(link.exists()).toBe(true)
    const pushSpy = vi.spyOn(router, 'push').mockResolvedValue(undefined as never)
    await link.trigger('click')
    await flushPromises()
    expect(pushSpy).toHaveBeenCalledWith({ name: 'order-detail', params: { orderNum: 'ord-99' } })
    pushSpy.mockRestore()
  })

  it('切换无人机后忽略旧借还记录响应', async () => {
    let resolveOld!: (value: ReturnType<typeof pageOf>) => void
    api.getAdminDroneBorrows.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve }))
      .mockResolvedValueOnce(pageOf([{ pilotName: '新设备飞手', borrowedAt: '2026-10-25T00:00:00Z' }]))
    const wrapper = await mountList()
    const buttons = wrapper.findAll('button').filter((button) => button.text() === '借还记录')
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    await flushPromises()
    resolveOld(pageOf([{ pilotName: '旧设备飞手' }]))
    await flushPromises()
    const drawer = wrapper.findComponent({ name: 'ElDrawer' })
    expect(drawer.text()).toContain('新设备飞手')
    expect(drawer.text()).not.toContain('旧设备飞手')
  })

  it('清空经纬度后不可保存，避免被转换为零坐标', async () => {
    const wrapper = await mountList()
    await wrapper.findAll('button').find((button) => button.text() === '编辑')!.trigger('click')
    await flushPromises()
    const latitude = wrapper.findComponent({ name: 'ElInputNumber' })
    latitude.vm.$emit('update:modelValue', null)
    await wrapper.find('[data-testid="drone-save"]').trigger('click')
    await flushPromises()
    expect(api.updateAdminDrone).not.toHaveBeenCalled()
    expect(api.createAdminDrone).not.toHaveBeenCalled()
  })
})
