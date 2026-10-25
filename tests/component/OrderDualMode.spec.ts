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

const mounted: Array<ReturnType<typeof mount>> = []
afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
  vi.clearAllMocks()
})

const mountView = async (stage: string, query: Record<string, string> = {}) => {
  getAdminDispatchOrderDetail.mockResolvedValue({
    order: { orderId: 'ord-1', stage, fundsStatus: 'PAID', depositAmount: 100, fields: { weightMax: '1' } },
    shipper: { userName: '货主' },
    pilot: { userName: '飞手' },
    timeline: [{ event: 'CREATED', at: '2026-10-25T01:00:00Z' }],
    assignments: [],
    connections: stage === 'IN_TRANSIT' ? [{ connectionId: 'c1', serialNumber: 'SN', openedAt: '2026-10-25T02:00:00Z' }] : [],
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/orders', name: 'orders', component: { template: '<div />' } },
      { path: '/orders/:orderNum', name: 'order-detail', component: OrderDetailView },
      { path: '/orders/:orderNum/supervise', name: 'order-supervise', component: { template: '<div />' } },
    ],
  })
  await router.push({ name: 'order-detail', params: { orderNum: 'ord-1' }, query })
  await router.isReady()
  const wrapper = mount(OrderDetailView, { global: { plugins: [router, ElementPlus] } })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

describe('OrderDetailView dual mode (dispatch)', () => {
  it('non-flying order defaults to manage tab without supervise', async () => {
    const wrapper = await mountView('WAITING_ACCEPTANCE')
    expect(wrapper.text()).toContain('订单管理')
    expect(wrapper.text()).not.toContain('任务监管')
    expect(wrapper.text()).toContain('下单申报载重')
  })

  it('in-transit order defaults to supervise and mounts flight history', async () => {
    const wrapper = await mountView('IN_TRANSIT')
    expect(wrapper.text()).toContain('任务监管')
    expect(wrapper.find('[data-testid="flight-history"]').exists()).toBe(true)
  })

  it('tab=manage forces manage tab even when flying', async () => {
    const wrapper = await mountView('IN_TRANSIT', { tab: 'manage' })
    expect(wrapper.text()).toContain('状态时间线')
  })
})
