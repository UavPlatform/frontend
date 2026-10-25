import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import HomeView from '../../src/views/HomeView.vue'
import router from '../../src/router'
import { clearStoredSession, setStoredSession } from '../../src/api/session'
import type { AuthSession } from '../../src/types/auth'

const { getAdminDispatchOrders, getAdminComplaints, getAdminPilots, getOrderTrajectory, getUavPosition } =
  vi.hoisted(() => ({
    getAdminDispatchOrders: vi.fn(),
    getAdminComplaints: vi.fn(),
    getAdminPilots: vi.fn(),
    getOrderTrajectory: vi.fn(),
    getUavPosition: vi.fn(),
  }))

vi.mock('../../src/api/modules/admin-dispatch', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../src/api/modules/admin-dispatch')
  return { ...actual, getAdminDispatchOrders }
})
vi.mock('../../src/api/modules/admin-query', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../src/api/modules/admin-query')
  return { ...actual, getAdminComplaints, getAdminPilots }
})
vi.mock('../../src/api/modules/uav', () => ({ getOrderTrajectory, getUavPosition }))

const pageOf = <T,>(content: T[], totalElements = content.length) => ({
  content,
  page: 0,
  size: 100,
  totalElements,
  totalPages: 1,
})

const flyingOrder = {
  orderId: 'ord-f01',
  stage: 'IN_TRANSIT',
  fundsStatus: 'PAID',
  shipper: { userId: 1, userName: '货主' },
  pilot: { userId: 2, userName: '飞手' },
  depositAmount: 100,
  executedModelName: 'M350',
  executedSerialNumber: 'DJI-F01',
  createdAt: new Date().toISOString(),
}

const adminSession: AuthSession = {
  accessToken: 'a',
  refreshToken: 'r',
  userId: 1,
  userName: 'admin',
  role: 2,
}

const mounted: Array<ReturnType<typeof mount>> = []

beforeEach(async () => {
  setStoredSession(adminSession)
  await router.push('/')
  await router.isReady()
  getAdminDispatchOrders.mockImplementation(async (params: { stage?: string }) => {
    if (params.stage === 'IN_TRANSIT') return pageOf([flyingOrder])
    return pageOf([])
  })
  getAdminComplaints.mockResolvedValue({ complaints: [], totalElements: 0 })
  getAdminPilots.mockResolvedValue(pageOf([], 2))
  getOrderTrajectory.mockResolvedValue([
    { altitude: 10, speed: 1, battery: 90, timestamp: Date.now() - 60_000 },
    { altitude: 12, speed: 2, battery: 88, timestamp: Date.now() },
  ])
  getUavPosition.mockResolvedValue({ altitude: 12, speed: 2, battery: 88, timestamp: Date.now() })
})

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
  clearStoredSession()
  vi.clearAllMocks()
  vi.useRealTimers()
})

const mountHome = async () => {
  const wrapper = mount(HomeView, { global: { plugins: [router, ElementPlus] } })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

describe('HomeView dispatch flying board', () => {
  it('renders in-transit dispatch orders as flying cards', async () => {
    const wrapper = await mountHome()
    expect(wrapper.text()).toContain('ord-f01')
    expect(wrapper.text()).toContain('飞手')
    expect(getAdminDispatchOrders).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'IN_TRANSIT' }),
    )
  })

  it('keeps last telemetry on transient empty position', async () => {
    vi.useFakeTimers()
    const wrapper = await mountHome()
    await flushPromises()
    expect(wrapper.text()).toMatch(/高度|电量|遥测|m\/s|%/)
    getUavPosition.mockResolvedValueOnce(null)
    await vi.advanceTimersByTimeAsync(10_000)
    await flushPromises()
    expect(wrapper.text()).toMatch(/高度|电量|m\/s|%/)
  })
})
