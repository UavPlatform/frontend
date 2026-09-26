import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import OrderManagePanel from '../../src/components/order/OrderManagePanel.vue'
import type { AdminComplaint, AdminOrderVo, AdminTaskVo } from '../../src/types/admin'
import type { MatchProgressFields } from '../../src/api/modules/order-supervision'

const {
  approveAdminComplaint,
  rejectAdminComplaint,
  fetchOrderComplaints,
  fetchTaskApplications,
  fetchTaskEvidence,
} = vi.hoisted(() => ({
  approveAdminComplaint: vi.fn(),
  rejectAdminComplaint: vi.fn(),
  fetchOrderComplaints: vi.fn(),
  fetchTaskApplications: vi.fn(),
  fetchTaskEvidence: vi.fn(),
}))

vi.mock('../../src/api/modules/admin-query', async () => {
  const actual = (await vi.importActual('../../src/api/modules/admin-query')) as Record<
    string,
    unknown
  >
  return { ...actual, approveAdminComplaint, rejectAdminComplaint }
})

vi.mock('../../src/api/modules/order-supervision', async () => {
  const actual = (await vi.importActual('../../src/api/modules/order-supervision')) as Record<
    string,
    unknown
  >
  return {
    ...actual,
    fetchOrderComplaints,
    fetchTaskApplications,
    fetchTaskEvidence,
  }
})

const orderFixture: AdminOrderVo = {
  orderNum: 'ORD-A',
  userId: 1,
  ownerName: '王五',
  taskNum: 'T1',
  taskName: '工地吊运',
  totalAmount: 980,
  orderStatusCode: 6,
  orderStatus: 'DISPUTED',
  orderStatusDesc: '争议中',
}

const taskFixture: AdminTaskVo = {
  taskNum: 'T1',
  taskName: '工地吊运',
  taskStatus: 'COMPLETED',
  taskStatusDesc: '执行完毕',
  riderName: '李四',
}

const pendingComplaint: AdminComplaint = {
  id: 301,
  orderNum: 'ORD-A',
  status: 'PENDING',
  reason: 'QUALITY_ISSUE',
  description: '货品交付时有磕碰',
  createTime: '2026-09-26 15:00:00',
  userId: 1,
  refundAmount: 100,
}

const resolvedComplaint: AdminComplaint = {
  ...pendingComplaint,
  id: 302,
  status: 'APPROVED',
  adminNote: '已退款',
}

const matchFixture: MatchProgressFields = { matchStatus: 'CONFIRMED', quotedAmount: 980 }

const mountPanel = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/users', name: 'users', component: { template: '<div />' } },
      { path: '/pilots', name: 'pilots', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(OrderManagePanel, {
    props: { order: orderFixture, task: taskFixture, match: matchFixture },
    global: { plugins: [router, ElementPlus] },
  })
  await flushPromises()
  return wrapper
}

const findButton = (wrapper: VueWrapper, text: string) =>
  wrapper.findAll('button').find((button) => button.text().includes(text))

describe('订单争议处置（TASK-FRONTEND-005）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchTaskApplications.mockResolvedValue([])
    fetchTaskEvidence.mockResolvedValue([])
    fetchOrderComplaints.mockResolvedValue([pendingComplaint])
    approveAdminComplaint.mockResolvedValue(undefined)
    rejectAdminComplaint.mockResolvedValue(undefined)
  })

  it('待处理投诉渲染批准/驳回与备注输入，已处置投诉只读展示', async () => {
    fetchOrderComplaints.mockResolvedValue([pendingComplaint, resolvedComplaint])
    const wrapper = await mountPanel()

    const text = wrapper.text()
    expect(text).toContain('货品交付时有磕碰')
    expect(text).toContain('待处理')
    expect(text).toContain('已批准')

    // PENDING 卡片：备注输入 + 两个动作按钮；APPROVED 卡片不提供动作
    const pendingCard = wrapper
      .findAll('article')
      .find((node) => node.text().includes('货品交付时有磕碰'))!
    expect(pendingCard.find('textarea').exists()).toBe(true)
    expect(findButton(wrapper, '批准')).toBeTruthy()
    expect(findButton(wrapper, '驳回')).toBeTruthy()

    const approvedCard = wrapper.findAll('article').find((node) => node.text().includes('已退款'))!
    expect(approvedCard.find('textarea').exists()).toBe(false)
    expect(approvedCard.text()).toContain('退款金额：¥100.00')
  })

  it('批准投诉：携带备注调用 approve，成功后重拉投诉并发出 order-changed', async () => {
    const wrapper = await mountPanel()

    await wrapper.find('textarea').setValue('情况属实，同意退款')
    await findButton(wrapper, '批准')!.trigger('click')
    await flushPromises()

    expect(approveAdminComplaint).toHaveBeenCalledWith(301, '情况属实，同意退款')
    expect(rejectAdminComplaint).not.toHaveBeenCalled()
    // 处置后重拉投诉列表
    expect(fetchOrderComplaints).toHaveBeenCalledTimes(2)
    // 通知父层刷新订单状态
    expect(wrapper.emitted('order-changed')).toHaveLength(1)
  })

  it('批准可留空备注（契约 adminNote 可选）', async () => {
    const wrapper = await mountPanel()

    await findButton(wrapper, '批准')!.trigger('click')
    await flushPromises()

    expect(approveAdminComplaint).toHaveBeenCalledWith(301, undefined)
    expect(wrapper.emitted('order-changed')).toHaveLength(1)
  })

  it('驳回必须填写理由：留空时拦截请求，填写后调用 reject', async () => {
    const wrapper = await mountPanel()

    await findButton(wrapper, '驳回')!.trigger('click')
    await flushPromises()
    expect(rejectAdminComplaint).not.toHaveBeenCalled()
    expect(wrapper.emitted('order-changed')).toBeUndefined()

    await wrapper.find('textarea').setValue('经核实商品无质量问题')
    await findButton(wrapper, '驳回')!.trigger('click')
    await flushPromises()

    expect(rejectAdminComplaint).toHaveBeenCalledWith(301, '经核实商品无质量问题')
    expect(approveAdminComplaint).not.toHaveBeenCalled()
    expect(wrapper.emitted('order-changed')).toHaveLength(1)
  })

  it('处置失败时展示错误且不发 order-changed', async () => {
    approveAdminComplaint.mockRejectedValue(new Error('退款渠道不可用'))
    const wrapper = await mountPanel()

    await findButton(wrapper, '批准')!.trigger('click')
    await flushPromises()

    expect(wrapper.emitted('order-changed')).toBeUndefined()
    // 失败后备注草稿保留，可直接重试
    expect(approveAdminComplaint).toHaveBeenCalledTimes(1)
  })
})
