import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import HomeView from '../../src/views/HomeView.vue'
import router from '../../src/router'
import { clearStoredSession, setStoredSession } from '../../src/api/session'
import type { AuthSession } from '../../src/types/auth'
import type {
  AdminComplaint,
  AdminOrderVo,
  AdminTaskVo,
  OrderGpsPoint,
  RiderStats,
} from '../../src/types/admin'
import { formatDateTime } from '../../src/utils/date'

const { getAdminTasks, getAdminOrders, getAdminComplaints, getRegisteredRiders, getOrderTrajectory } =
  vi.hoisted(() => ({
    getAdminTasks: vi.fn(),
    getAdminOrders: vi.fn(),
    getAdminComplaints: vi.fn(),
    getRegisteredRiders: vi.fn(),
    getOrderTrajectory: vi.fn(),
  }))

// 只 mock 查询函数；admin-scan 编排（分页扫描/cutoff）走真实实现
vi.mock('../../src/api/modules/admin-query', async () => {
  const actual = (await vi.importActual('../../src/api/modules/admin-query')) as Record<
    string,
    unknown
  >
  return { ...actual, getAdminTasks, getAdminOrders, getAdminComplaints }
})
vi.mock('../../src/api/modules/rider', () => ({ getRegisteredRiders }))
vi.mock('../../src/api/modules/uav', () => ({ getOrderTrajectory }))

const pageOf = <T,>(content: T[], totalElements = content.length) => ({
  content,
  page: 0,
  size: 100,
  totalElements,
  totalPages: 1,
})

const inProgressTask: AdminTaskVo = {
  id: 1,
  taskNum: 'TASK-F01',
  taskName: '工地吊运',
  userId: 1,
  ownerName: '王五',
  taskStatus: 'IN_PROGRESS',
  taskStatusDesc: '执行中',
  description: '工地A → 山顶B',
  orderNum: 'ORD-F01',
  orderStatusCode: 1,
  orderStatus: 'PAID',
  orderStatusDesc: '已支付',
  totalAmount: 980,
  totalDistance: 1250,
  riderName: '李四',
  createTime: formatDateTime(new Date()),
  updateTime: formatDateTime(new Date()),
}

const todayOrder = (orderNum: string): AdminOrderVo => ({
  orderNum,
  userId: 1,
  ownerName: '王五',
  taskNum: 'TASK-F01',
  taskName: '工地吊运',
  totalAmount: 100,
  totalDistance: 800,
  orderStatusCode: 0,
  orderStatus: 'PENDING',
  orderStatusDesc: '待支付',
  createTime: formatDateTime(new Date()),
  updateTime: formatDateTime(new Date()),
})

const twoDaysAgo = formatDateTime(new Date(Date.now() - 2 * 86_400_000))

const complaintFixture: AdminComplaint = {
  id: 7,
  orderNum: 'ORD-D01',
  status: 'PENDING',
  reason: 'QUALITY_ISSUE',
  description: '货物损坏',
  userId: 2,
  createTime: formatDateTime(new Date()),
}

const riderFixture = (riderId: number, riderName: string): RiderStats => ({
  riderId,
  riderName,
  todayOrders: 1,
  totalCompleted: 3,
  totalEarnings: 66,
})

const trajectoryFixture = (): OrderGpsPoint[] => {
  const now = Date.now()
  return [
    { altitude: 42, speed: 8.1, battery: 78, timestamp: now - 10 * 60_000 },
    { altitude: 45.5, speed: 7.2, battery: 75, timestamp: now },
  ]
}

const adminSession: AuthSession = {
  token: 't',
  user: { username: 'admin', displayName: '张监管', role: 'ADMIN', teamName: '平台' },
}

const cleanups: Array<() => void> = []

const mountHome = async () => {
  const wrapper = mount(HomeView, { global: { plugins: [router, ElementPlus] } })
  cleanups.push(() => wrapper.unmount())
  await flushPromises()
  return wrapper
}

describe('首页看板（TASK-FRONTEND-002）', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    clearStoredSession()
    setStoredSession(adminSession)
    await router.push('/')

    getAdminTasks.mockResolvedValue(pageOf([inProgressTask]))
    getAdminOrders.mockImplementation(async ({ status }: { status?: string }) =>
      status === '5'
        ? pageOf([todayOrder('ORD-W01'), { ...todayOrder('ORD-W02'), createTime: twoDaysAgo }], 3)
        : pageOf([todayOrder('ORD-T01'), todayOrder('ORD-T02')]),
    )
    getAdminComplaints.mockResolvedValue({
      complaints: [complaintFixture],
      currentPage: 0,
      totalElements: 3,
      totalPages: 1,
    })
    getRegisteredRiders.mockResolvedValue([riderFixture(1, '李四'), riderFixture(2, '赵六')])
    getOrderTrajectory.mockResolvedValue(trajectoryFixture())
  })

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup()
    }
    vi.useRealTimers()
    clearStoredSession()
  })

  it('四指标卡渲染数值与更新时间戳', async () => {
    const w = await mountHome()
    const cards = w.findAll('.metric-card')

    expect(cards.find((card) => card.text().includes('正在飞行'))?.text()).toContain('1')
    expect(cards.find((card) => card.text().includes('今日订单'))?.text()).toContain('2')
    expect(cards.find((card) => card.text().includes('待处理争议'))?.text()).toContain('3')
    expect(cards.find((card) => card.text().includes('在线飞手'))?.text()).toContain('1/2')
    expect(w.text()).toContain('更新于')
  })

  it('指标卡点击带筛选跳转订单列表 / 飞手列表', async () => {
    const w = await mountHome()
    const cards = w.findAll('.metric-card')

    await cards.find((card) => card.text().includes('正在飞行'))!.trigger('click')
    // 目标路由组件按需加载，等待导航真正落地（flushPromises 不足以覆盖模块加载）
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('orders'))
    expect(router.currentRoute.value.query).toEqual({ status: 'in_progress' })

    await router.push('/')
    await cards.find((card) => card.text().includes('待处理争议'))!.trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('orders'))
    expect(router.currentRoute.value.query).toEqual({ dispute: 'pending' })

    await router.push('/')
    await cards.find((card) => card.text().includes('在线飞手'))!.trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('pilots'))
  })

  it('飞行卡渲染路线/主体/遥测摘要与双按钮', async () => {
    const w = await mountHome()

    const card = w.find('.flying-card')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('#ORD-F01')
    expect(card.text()).toContain('工地A → 山顶B')
    expect(card.text()).toContain('用户 王五')
    expect(card.text()).toContain('飞手 李四')
    expect(card.text()).toContain('高度 45.5 m')
    expect(card.text()).toContain('速度 7.2 m/s')
    expect(card.text()).toContain('电量 75%')
    expect(card.text()).toContain('已飞 10 分钟')

    const labels = card.findAll('button').map((button) => button.text())
    expect(labels.some((label) => label.includes('任务监管'))).toBe(true)
    expect(labels.some((label) => label.includes('详情'))).toBe(true)
  })

  it('侧栏快捷入口、待办与今日新发 Top5', async () => {
    const w = await mountHome()

    const quickLabels = w.findAll('.quick-entry').map((entry) => entry.text())
    expect(quickLabels).toEqual(
      expect.arrayContaining(['全部订单', '用户管理', '飞手管理', '系统日志']),
    )

    const todos = w.findAll('.todo-item')
    expect(todos).toHaveLength(2)
    expect(todos[0].text()).toContain('3 条待处理争议')
    expect(todos[0].text()).toContain('最新 ORD-D01 · 质量问题')
    expect(todos[1].text()).toContain('2 单待验收超 24 小时')
    expect(todos[1].text()).toContain('ORD-W02')

    const top5 = w.findAll('.el-table__row').map((row) => row.text())
    expect(top5[0]).toContain('ORD-T01')
    expect(top5[1]).toContain('ORD-T02')
    expect(w.text()).toContain('查看更多')
  })

  it('无飞行作业且无待办时展示空态并折叠待办', async () => {
    getAdminTasks.mockResolvedValue(pageOf([]))
    getAdminOrders.mockImplementation(
      async ({ status }: { status?: string }) => (status === '5' ? pageOf([], 0) : pageOf([])),
    )
    getAdminComplaints.mockResolvedValue({
      complaints: [],
      currentPage: 0,
      totalElements: 0,
      totalPages: 0,
    })
    getRegisteredRiders.mockResolvedValue([])

    const w = await mountHome()
    const cards = w.findAll('.metric-card')

    expect(w.text()).toContain('当前无飞行作业')
    expect(w.find('.flying-card').exists()).toBe(false)
    expect(w.find('.todo-item').exists()).toBe(false)
    expect(w.text()).not.toContain('待办')
    expect(cards.find((card) => card.text().includes('正在飞行'))?.text()).toContain('0')
    expect(cards.find((card) => card.text().includes('在线飞手'))?.text()).toContain('0/0')
    expect(getOrderTrajectory).not.toHaveBeenCalled()
  })

  it('飞行卡遥测每 10 秒轮询刷新，卸载后停止', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    // 本用例自行挂载并在中断言卸载，不走统一 cleanup（避免重复卸载）
    const local = mount(HomeView, { global: { plugins: [router, ElementPlus] } })
    await flushPromises()
    expect(getOrderTrajectory).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(10_000)
    await flushPromises()
    expect(getOrderTrajectory).toHaveBeenCalledTimes(2)

    local.unmount()
    vi.advanceTimersByTime(30_000)
    await flushPromises()
    expect(getOrderTrajectory).toHaveBeenCalledTimes(2)
  })
})
