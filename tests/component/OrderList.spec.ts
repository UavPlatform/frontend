import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import OrderView from '../../src/views/OrderView.vue'
import router from '../../src/router'
import { clearStoredSession, setStoredSession } from '../../src/api/session'
import type { AuthSession } from '../../src/types/auth'
import type { AdminComplaint, AdminOrderVo, AdminTaskVo } from '../../src/types/admin'
import { formatDateTime } from '../../src/utils/date'

const { getAdminOrders, getAdminTasks, getAdminComplaints, getAdminOrderDetail, getAdminTaskDetail } =
  vi.hoisted(() => ({
    getAdminOrders: vi.fn(),
    getAdminTasks: vi.fn(),
    getAdminComplaints: vi.fn(),
    getAdminOrderDetail: vi.fn(),
    getAdminTaskDetail: vi.fn(),
  }))

// 只 mock 查询函数；admin-scan 编排（分页扫描/cutoff）与状态元数据走真实实现
vi.mock('../../src/api/modules/admin-query', async () => {
  const actual = (await vi.importActual('../../src/api/modules/admin-query')) as Record<
    string,
    unknown
  >
  return {
    ...actual,
    getAdminOrders,
    getAdminTasks,
    getAdminComplaints,
    getAdminOrderDetail,
    getAdminTaskDetail,
  }
})

const pageOf = <T,>(content: T[], totalElements = content.length) => ({
  content,
  page: 0,
  size: 100,
  totalElements,
  totalPages: 1,
})

const orderFixture = (overrides: Partial<AdminOrderVo> = {}): AdminOrderVo => ({
  orderNum: 'ORD-A',
  userId: 1,
  ownerName: '王五',
  taskNum: 'T1',
  taskName: '工地吊运',
  totalAmount: 12.5,
  totalDistance: 250,
  orderStatusCode: 4,
  orderStatus: 'COMPLETED',
  orderStatusDesc: '已完成',
  createTime: '2026-09-12 10:00:00',
  updateTime: '2026-09-12 11:00:00',
  ...overrides,
})

const ordA = orderFixture()
const ordB = orderFixture({
  orderNum: 'ORD-B',
  taskNum: 'T2',
  taskName: '测绘任务',
  ownerName: '陈七',
  orderStatusCode: 0,
  orderStatus: 'PENDING',
  orderStatusDesc: '待支付',
  updateTime: '2026-09-12 12:00:00',
})

const flyTask: AdminTaskVo = {
  id: 9,
  taskNum: 'T0',
  taskName: '应急吊运',
  userId: 1,
  ownerName: '王五',
  taskStatus: 'IN_PROGRESS',
  taskStatusDesc: '执行中',
  orderNum: 'ORD-FLY',
  orderStatusCode: 1,
  orderStatus: 'PAID',
  orderStatusDesc: '已支付',
  totalAmount: 980,
  totalDistance: 1250,
  riderName: '张三',
  createTime: '2026-09-26 08:00:00',
  updateTime: '2026-09-26 09:00:00',
}

const indexTasks: AdminTaskVo[] = [
  { taskNum: 'T1', taskStatus: 'COMPLETED', riderName: '李四' },
  { taskNum: 'T2', taskStatus: 'COMPLETED', riderName: '赵六' },
]

const pendingComplaint: AdminComplaint = {
  id: 3,
  orderNum: 'ORD-B',
  status: 'PENDING',
  reason: 'OTHER',
  createTime: formatDateTime(new Date()),
}

const adminSession: AuthSession = {
  token: 't',
  user: { username: 'admin', displayName: '张监管', role: 'ADMIN', teamName: '平台' },
}

const cleanups: Array<() => void> = []

const mountList = async (query = '') => {
  await router.push(`/orders${query}`)
  const wrapper = mount(OrderView, { global: { plugins: [router, ElementPlus] } })
  cleanups.push(() => wrapper.unmount())
  await flushPromises()
  return wrapper
}

const rowsText = (wrapper: { findAll: (selector: string) => Array<{ text(): string }> }) =>
  wrapper.findAll('.el-table__row').map((row) => row.text())

describe('订单列表 URL 筛选与行交互（TASK-FRONTEND-002）', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    clearStoredSession()
    setStoredSession(adminSession)
    await router.push('/orders')

    getAdminOrders.mockImplementation(
      async ({ size }: { size?: number }) => (size === 100 ? pageOf([ordA, ordB]) : pageOf([ordA, ordB], 12)),
    )
    getAdminTasks.mockImplementation(async ({ status }: { status?: string }) =>
      status === 'IN_PROGRESS' ? pageOf([flyTask]) : pageOf(indexTasks),
    )
    getAdminComplaints.mockResolvedValue({
      complaints: [pendingComplaint],
      currentPage: 0,
      totalElements: 1,
      totalPages: 1,
    })
    getAdminOrderDetail.mockResolvedValue(ordA)
    getAdminTaskDetail.mockResolvedValue(indexTasks[0])
  })

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup()
    }
    clearStoredSession()
  })

  it('默认页：服务端分页，飞行中置顶高亮，飞手列来自任务索引', async () => {
    const wrapper = await mountList()

    expect(getAdminOrders).toHaveBeenCalledWith({
      page: 0,
      size: 10,
      status: undefined,
      orderNum: undefined,
      taskNum: undefined,
    })

    const rows = wrapper.findAll('.el-table__row')
    expect(rows[0].text()).toContain('ORD-FLY')
    expect(rows[0].classes()).toContain('flying-row')
    expect(rows[0].text()).toContain('张三')
    expect(rowsText(wrapper).join('\n')).toContain('李四')

    const labels = wrapper.findAll('button').map((button) => button.text())
    expect(labels.some((label) => label.includes('监管'))).toBe(true)
  })

  it('行点击进订单详情页', async () => {
    const wrapper = await mountList()

    const row = wrapper.findAll('.el-table__row').find((item) => item.text().includes('ORD-A'))!
    await row.trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('order-detail'))
    expect(router.currentRoute.value.params.orderNum).toBe('ORD-A')
  })

  it('任务监管按钮进入全屏监管路由（TASK-FRONTEND-003）', async () => {
    expect(router.resolve('/orders/ORD-FLY/supervise').name).toBe('order-supervise')

    const wrapper = await mountList()
    const superviseButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('监管'))!
    await superviseButton.trigger('click')

    // 003 落地后 /supervise 不再重定向回详情页，直达全屏监管
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('order-supervise'))
    expect(router.currentRoute.value.params.orderNum).toBe('ORD-FLY')
  })

  it('?status=in_progress：以执行中任务为行源且不查订单分页', async () => {
    const wrapper = await mountList('?status=in_progress')

    expect(getAdminTasks).toHaveBeenCalledWith({
      page: 0,
      size: 100,
      status: 'IN_PROGRESS',
      taskNum: undefined,
    })
    expect(getAdminOrders).not.toHaveBeenCalled()

    const rows = wrapper.findAll('.el-table__row')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('ORD-FLY')
    expect(rows[0].classes()).toContain('flying-row')
    expect(wrapper.findAll('.el-select')[0].text()).toContain('飞行中')
  })

  it('?date=today：按创建时间下界只取今日订单', async () => {
    const todayOrder = orderFixture({
      orderNum: 'ORD-TODAY',
      createTime: formatDateTime(new Date()),
    })
    const oldOrder = orderFixture({ orderNum: 'ORD-OLD', createTime: '2026-01-01 09:00:00' })
    getAdminOrders.mockResolvedValue(pageOf([todayOrder, oldOrder]))

    const wrapper = await mountList('?date=today')

    expect(getAdminOrders).toHaveBeenCalledWith({
      page: 0,
      size: 100,
      status: undefined,
      orderNum: undefined,
      taskNum: undefined,
    })
    const text = rowsText(wrapper).join('\n')
    expect(text).toContain('ORD-TODAY')
    expect(text).not.toContain('ORD-OLD')
    expect(wrapper.findAll('.el-select')[1].text()).toContain('今天')
  })

  it('?dispute=pending：待处理投诉订单号过滤', async () => {
    getAdminOrders.mockResolvedValue(pageOf([ordA, ordB]))

    const wrapper = await mountList('?dispute=pending')

    expect(getAdminComplaints).toHaveBeenCalledWith({ page: 0, size: 100, status: 'PENDING' })
    const text = rowsText(wrapper).join('\n')
    expect(text).toContain('ORD-B')
    expect(text).not.toContain('ORD-A')
  })

  it('关键字查询回写 URL 并本地过滤（订单号/任务/用户/飞手）', async () => {
    const wrapper = await mountList()

    const input = wrapper.find('input[placeholder="订单号 / 任务 / 用户 / 飞手"]')
    await input.setValue('李四')
    const queryButton = wrapper.findAll('button').find((button) => button.text().includes('查询'))!
    await queryButton.trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.query.q).toBe('李四'))
    await flushPromises()

    const text = rowsText(wrapper).join('\n')
    expect(text).toContain('ORD-A')
    expect(text).not.toContain('ORD-B')
  })
})
