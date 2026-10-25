import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import OrderDetailView from '../../src/views/OrderDetailView.vue'

const { getAdminDispatchOrderDetail } = vi.hoisted(() => ({
  getAdminDispatchOrderDetail: vi.fn(),
}))

vi.mock('../../src/api/modules/admin-dispatch', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../src/api/modules/admin-dispatch')
  return { ...actual, getAdminDispatchOrderDetail }
})

vi.mock('../../src/components/flight/FlightHistoryPanel.vue', () => ({
  default: { template: '<div data-testid="flight-history" />', props: ['orderId'] },
}))
vi.mock('../../src/components/order/LiveStage.vue', () => ({
  default: { template: '<div data-testid="live-stage" />', props: ['deviceId', 'liveDetail'] },
}))
vi.mock('../../src/components/order/TelemetryPanel.vue', () => ({
  default: { template: '<div data-testid="telemetry" />', props: ['orderNum', 'deviceId'] },
}))

const detail = {
  order: {
    orderId: 'ord-1',
    stage: 'PILOT_ARRIVED',
    fundsStatus: 'PAID',
    depositAmount: 100,
    fields: { weightMax: '2.5', category: '普通' },
  },
  shipper: { userId: 1, userName: '货主' },
  pilot: { userId: 2, userName: '飞手' },
  timeline: [],
  assignments: [],
  connections: [],
}

const mounted: Array<ReturnType<typeof mount>> = []
afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
  vi.clearAllMocks()
})

const mountView = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/orders', name: 'orders', component: { template: '<div />' } },
      { path: '/orders/:orderNum', name: 'order-detail', component: OrderDetailView },
      { path: '/orders/:orderNum/supervise', name: 'order-supervise', component: { template: '<div />' } },
    ],
  })
  await router.push({ name: 'order-detail', params: { orderNum: 'ord-1' } })
  await router.isReady()
  const wrapper = mount(OrderDetailView, { global: { plugins: [router, ElementPlus] } })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

describe('OrderDetailView dispatch', () => {
  it('renders dispatch order summary', async () => {
    getAdminDispatchOrderDetail.mockResolvedValue(detail)
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('ord-1')
    expect(wrapper.text()).toContain('飞手到场')
  })

  it('shows empty state when missing', async () => {
    getAdminDispatchOrderDetail.mockRejectedValue(new Error('not found'))
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('未查询到该派单订单')
  })
})
