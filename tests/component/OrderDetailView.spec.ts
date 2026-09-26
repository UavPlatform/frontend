import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import OrderDetailView from '../../src/views/OrderDetailView.vue'
import router from '../../src/router'
import { clearStoredSession, setStoredSession } from '../../src/api/session'
import type { AuthSession } from '../../src/types/auth'
import type { AdminOrderVo, AdminTaskVo } from '../../src/types/admin'

const { getAdminOrderDetail, getAdminTaskDetail } = vi.hoisted(() => ({
  getAdminOrderDetail: vi.fn(),
  getAdminTaskDetail: vi.fn(),
}))

vi.mock('../../src/api/modules/admin-query', async () => {
  const actual = (await vi.importActual('../../src/api/modules/admin-query')) as Record<
    string,
    unknown
  >
  return { ...actual, getAdminOrderDetail, getAdminTaskDetail }
})

// 本 spec 只验摘要落点：双模式侧载数据（应征/证据/投诉/图传上下文）一律降级为空，
// 避免真实 HTTP；双模式行为见 tests/component/OrderDualMode.spec.ts
vi.mock('../../src/api/modules/order-supervision', async () => {
  const actual = (await vi.importActual(
    '../../src/api/modules/order-supervision',
  )) as Record<string, unknown>
  return {
    ...actual,
    fetchTaskLiveDetail: vi.fn().mockResolvedValue(null),
    fetchTaskApplications: vi.fn().mockResolvedValue([]),
    fetchTaskEvidence: vi.fn().mockResolvedValue([]),
    fetchOrderComplaints: vi.fn().mockResolvedValue([]),
  }
})

const orderFixture: AdminOrderVo = {
  orderNum: 'ORD-A',
  userId: 1,
  ownerName: '王五',
  taskNum: 'T1',
  taskName: '工地吊运',
  totalAmount: 980,
  totalDistance: 1250,
  orderStatusCode: 1,
  orderStatus: 'PAID',
  orderStatusDesc: '已支付',
  createTime: '2026-09-26 09:00:00',
  updateTime: '2026-09-26 09:30:00',
}

const taskFixture: AdminTaskVo = {
  taskNum: 'T1',
  taskName: '工地吊运',
  taskStatus: 'COMPLETED',
  taskStatusDesc: '执行完毕',
  riderName: '李四',
  actionHint: '等待用户验收',
}

const adminSession: AuthSession = {
  token: 't',
  user: { username: 'admin', displayName: '张监管', role: 'ADMIN', teamName: '平台' },
}

const cleanups: Array<() => void> = []

const mountDetail = async () => {
  await router.push('/orders/ORD-A')
  const wrapper = mount(OrderDetailView, { global: { plugins: [router, ElementPlus] } })
  cleanups.push(() => wrapper.unmount())
  await flushPromises()
  return wrapper
}

describe('订单详情落点（TASK-FRONTEND-002）', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    clearStoredSession()
    setStoredSession(adminSession)
    getAdminOrderDetail.mockResolvedValue(orderFixture)
    getAdminTaskDetail.mockResolvedValue(taskFixture)
  })

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup()
    }
    clearStoredSession()
  })

  it('渲染订单摘要与关联任务（飞手/操作提示）', async () => {
    const wrapper = await mountDetail()

    expect(getAdminOrderDetail).toHaveBeenCalledWith('ORD-A')
    expect(getAdminTaskDetail).toHaveBeenCalledWith('T1')

    const text = wrapper.text()
    expect(text).toContain('#ORD-A')
    expect(text).toContain('已支付')
    expect(text).toContain('¥980.00')
    expect(text).toContain('李四')
    expect(text).toContain('等待用户验收')
    expect(text).toContain('工地吊运')
  })

  it('返回订单列表', async () => {
    const wrapper = await mountDetail()

    const backButton = wrapper.findAll('button').find((button) => button.text().includes('返回订单列表'))!
    await backButton.trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('orders'))
  })

  it('订单号不存在时展示空态并可返回', async () => {
    getAdminOrderDetail.mockRejectedValue(new Error('订单不存在'))

    const wrapper = await mountDetail()

    expect(wrapper.text()).toContain('未查询到该订单')
    expect(wrapper.text()).not.toContain('#ORD-A')
  })
})
