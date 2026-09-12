import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import OrderView from '../../src/views/OrderView.vue'
import type { AdminOrderVo, AdminTaskVo } from '../../src/types/admin'

const { getAdminOrders, getAdminTasks, getAdminOrderDetail, getAdminTaskDetail } = vi.hoisted(() => ({
  getAdminOrders: vi.fn(),
  getAdminTasks: vi.fn(),
  getAdminOrderDetail: vi.fn(),
  getAdminTaskDetail: vi.fn(),
}))

// 只 mock 查询函数，状态映射（C5）走真实实现
vi.mock('../../src/api/modules/admin-query', async () => {
  const actual = (await vi.importActual('../../src/api/modules/admin-query')) as Record<string, unknown>
  return {
    ...actual,
    getAdminOrders,
    getAdminTasks,
    getAdminOrderDetail,
    getAdminTaskDetail,
  }
})

const orderFixture = (overrides: Partial<AdminOrderVo> = {}): AdminOrderVo => ({
  orderNum: 'ORD-001',
  userId: 1,
  ownerName: '运营管理员',
  taskNum: 'TASK-001',
  taskName: '巡检任务',
  totalAmount: 12.5,
  totalDistance: 250,
  orderStatusCode: 4,
  orderStatus: 'COMPLETED',
  orderStatusDesc: '已完成',
  createTime: '2026-09-12 10:00:00',
  updateTime: '2026-09-12 11:00:00',
  ...overrides,
})

const taskFixture = (overrides: Partial<AdminTaskVo> = {}): AdminTaskVo => ({
  id: 1,
  taskNum: 'TASK-001',
  taskName: '巡检任务',
  userId: 1,
  ownerName: '运营管理员',
  taskStatus: 'COMPLETED',
  taskStatusDesc: '执行完毕',
  taskTime: '2026-09-12 10:00:00',
  reward: 12.5,
  description: '园区巡检',
  orderNum: 'ORD-001',
  orderStatusCode: 4,
  orderStatus: 'COMPLETED',
  orderStatusDesc: '已完成',
  totalAmount: 12.5,
  totalDistance: 250,
  riderName: '飞手张三',
  completeNote: '已按航线完成',
  actionHint: '等待用户验收',
  createTime: '2026-09-12 09:00:00',
  updateTime: '2026-09-12 11:00:00',
  ...overrides,
})

const pageOf = <T,>(content: T[]) => ({
  content,
  page: 0,
  size: 10,
  totalElements: content.length,
  totalPages: 1,
})

const mountView = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'dashboard', component: { template: '<div />' } }],
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(OrderView, {
    global: { plugins: [router, ElementPlus] },
  })
  await flushPromises()
  return wrapper
}

describe('OrderView 任务/订单管理视图（1B-5b）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAdminOrders.mockResolvedValue(
      pageOf([
        orderFixture(),
        orderFixture({
          orderNum: 'ORD-002',
          taskNum: 'TASK-002',
          taskName: '测绘任务',
          orderStatusCode: 5,
          orderStatus: 'WAITING_CONFIRM',
          orderStatusDesc: '待验收',
        }),
      ]),
    )
    getAdminTasks.mockResolvedValue(pageOf([taskFixture()]))
  })

  it('默认加载订单分页（page 0 起）并渲染 C5 状态映射 4/5', async () => {
    const wrapper = await mountView()

    expect(getAdminOrders).toHaveBeenCalledWith({
      page: 0,
      size: 10,
      status: undefined,
      orderNum: undefined,
      taskNum: undefined,
    })

    const text = wrapper.text()
    expect(text).toContain('ORD-001')
    expect(text).toContain('巡检任务')
    expect(text).toContain('运营管理员')
    expect(text).toContain('已完成') // orderStatusCode=4（C5 补全）
    expect(text).toContain('待验收') // orderStatusCode=5（C5 补全）
  })

  it('订单详情抽屉：调 /admin/orders/{orderNum} 并渲染金额字段', async () => {
    getAdminOrderDetail.mockResolvedValue(orderFixture({ totalAmount: 33.3 }))
    const wrapper = await mountView()

    const detailButton = wrapper.findAll('button').find((button) => button.text().includes('详情'))
    await detailButton!.trigger('click')
    await flushPromises()

    expect(getAdminOrderDetail).toHaveBeenCalledWith('ORD-001')
    expect(wrapper.text()).toContain('¥33.30')
  })

  it('切换任务管理 tab 懒加载 /admin/tasks 并渲染任务状态与飞手', async () => {
    const wrapper = await mountView()

    const tabItems = wrapper.findAll('.el-tabs__item')
    await tabItems.find((item) => item.text().includes('任务管理'))!.trigger('click')
    await flushPromises()

    expect(getAdminTasks).toHaveBeenCalledWith({
      page: 0,
      size: 10,
      status: undefined,
      taskNum: undefined,
    })

    const text = wrapper.text()
    expect(text).toContain('TASK-001')
    expect(text).toContain('飞手张三')
    expect(text).toContain('执行完毕')
  })

  it('任务详情抽屉：调 /admin/tasks/{taskNum} 并渲染说明与完成信息', async () => {
    getAdminTaskDetail.mockResolvedValue(taskFixture())
    const wrapper = await mountView()

    const tabItems = wrapper.findAll('.el-tabs__item')
    await tabItems.find((item) => item.text().includes('任务管理'))!.trigger('click')
    await flushPromises()

    const detailButtons = wrapper.findAll('button').filter((button) => button.text().includes('详情'))
    await detailButtons[detailButtons.length - 1].trigger('click')
    await flushPromises()

    expect(getAdminTaskDetail).toHaveBeenCalledWith('TASK-001')
    const text = wrapper.text()
    expect(text).toContain('园区巡检')
    expect(text).toContain('已按航线完成')
    expect(text).toContain('等待用户验收')
  })
})
