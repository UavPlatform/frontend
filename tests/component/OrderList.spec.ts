import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import OrderView from '../../src/views/OrderView.vue'

const { getAdminDispatchOrders } = vi.hoisted(() => ({
  getAdminDispatchOrders: vi.fn(),
}))

vi.mock('../../src/api/modules/admin-dispatch', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../src/api/modules/admin-dispatch')
  return { ...actual, getAdminDispatchOrders }
})

const mounted: Array<ReturnType<typeof mount>> = []
afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
  vi.clearAllMocks()
})

const mountView = async (query: Record<string, string> = {}) => {
  getAdminDispatchOrders.mockResolvedValue({
    content: [{
      orderId: 'ord-9',
      stage: 'IN_TRANSIT',
      fundsStatus: 'PAID',
      shipper: { userName: '货主' },
      pilot: { userName: '飞手' },
      depositAmount: 100,
      executedModelName: 'M30',
      executedSerialNumber: 'SN',
      createdAt: '2026-10-25T08:00:00Z',
    }],
    totalElements: 1,
    totalPages: 1,
    page: 0,
    size: 20,
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/orders', name: 'orders', component: OrderView },
      { path: '/orders/:orderNum', name: 'order-detail', component: { template: '<div />' } },
    ],
  })
  await router.push({ name: 'orders', query })
  await router.isReady()
  const wrapper = mount(OrderView, { global: { plugins: [router, ElementPlus] } })
  mounted.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}

describe('Order list dispatch', () => {
  it('renders dispatch rows and opens detail on row click', async () => {
    const { wrapper, router } = await mountView()
    expect(wrapper.text()).toContain('ord-9')
    await wrapper.find('tbody tr').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('order-detail')
    expect(router.currentRoute.value.params.orderNum).toBe('ord-9')
  })

  it('maps in_progress query to IN_TRANSIT stage filter', async () => {
    await mountView({ status: 'in_progress' })
    expect(getAdminDispatchOrders).toHaveBeenCalledWith(expect.objectContaining({ stage: 'IN_TRANSIT' }))
  })
})
