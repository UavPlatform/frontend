import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import OrderView from '../../src/views/OrderView.vue'
import type { AdminDispatchOrderRow } from '../../src/types/admin'

const { getAdminDispatchOrders } = vi.hoisted(() => ({
  getAdminDispatchOrders: vi.fn(),
}))

vi.mock('../../src/api/modules/admin-dispatch', async () => {
  const actual = (await vi.importActual('../../src/api/modules/admin-dispatch')) as Record<string, unknown>
  return { ...actual, getAdminDispatchOrders }
})

const row = (overrides: Partial<AdminDispatchOrderRow> = {}): AdminDispatchOrderRow => ({
  orderId: 'ord-001',
  stage: 'IN_TRANSIT',
  fundsStatus: 'PAID',
  shipper: { userId: 1, userName: '货主甲' },
  pilot: { userId: 2, userName: '飞手乙' },
  depositAmount: 100,
  pilotServiceFee: 100,
  executedModelName: 'M350',
  executedSerialNumber: 'SN-1',
  createdAt: '2026-10-25T08:00:00Z',
  updatedAt: '2026-10-25T09:00:00Z',
  ...overrides,
})

const pageOf = (content: AdminDispatchOrderRow[]) => ({
  content,
  page: 0,
  size: 20,
  totalElements: content.length,
  totalPages: 1,
})

const mounted: Array<ReturnType<typeof mount>> = []
const mountView = async (query: Record<string, string> = {}) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/orders', name: 'orders', component: OrderView },
      { path: '/orders/:orderNum', name: 'order-detail', component: { template: '<div />' } },
    ],
  })
  await router.push({ name: 'orders', query })
  await router.isReady()
  const wrapper = mount(OrderView, {
    global: { plugins: [router, ElementPlus] },
  })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
  vi.clearAllMocks()
})

describe('OrderView dispatch list', () => {
  it('loads admin dispatch orders on mount', async () => {
    getAdminDispatchOrders.mockResolvedValue(pageOf([row()]))
    const wrapper = await mountView()
    expect(getAdminDispatchOrders).toHaveBeenCalled()
    expect(wrapper.text()).toContain('ord-001')
    expect(wrapper.text()).toContain('运输中')
    expect(wrapper.text()).toContain('货主甲')
  })

  it('maps legacy status=in_progress to stage=IN_TRANSIT', async () => {
    getAdminDispatchOrders.mockResolvedValue(pageOf([]))
    await mountView({ status: 'in_progress' })
    expect(getAdminDispatchOrders).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'IN_TRANSIT' }),
    )
  })
})
