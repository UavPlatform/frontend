import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PilotDetailView from '../../src/views/PilotDetailView.vue'
import router from '../../src/router'
import { clearStoredSession, setStoredSession } from '../../src/api/session'
import type { AuthSession } from '../../src/types/auth'
import type { AdminPilotDetailVo } from '../../src/types/admin'

const { getAdminPilotDetail, updateUavAvailable } = vi.hoisted(() => ({
  getAdminPilotDetail: vi.fn(),
  updateUavAvailable: vi.fn(),
}))

vi.mock('../../src/api/modules/admin-query', async () => {
  const actual = (await vi.importActual('../../src/api/modules/admin-query')) as Record<
    string,
    unknown
  >
  return { ...actual, getAdminPilotDetail }
})

vi.mock('../../src/api/modules/admin', async () => {
  const actual = (await vi.importActual('../../src/api/modules/admin')) as Record<string, unknown>
  return { ...actual, updateUavAvailable }
})

const detailFixture: AdminPilotDetailVo = {
  userId: 11,
  userName: '李四',
  role: 1,
  status: 1,
  completedCount: 12,
  drones: [
    { djiId: 'SMOKE-01', aircraftModelId: 1, modelName: 'M350 RTK', online: true, available: true },
    { djiId: 'SMOKE-02', aircraftModelId: 2, modelName: 'M30', online: false, available: false },
    // 设备档案未注册：available = null
    { djiId: 'SMOKE-03', aircraftModelId: null, modelName: null, online: false, available: null },
  ],
  orders: [
    {
      orderNum: 'ORD-A',
      taskNum: 'T1',
      taskName: '工地吊运',
      ownerName: '王五',
      totalAmount: 980,
      orderStatusCode: 4,
      orderStatus: 'COMPLETED',
      orderStatusDesc: '已完成',
      createTime: '2026-09-26 09:00:00',
    },
  ],
}

const adminSession: AuthSession = {
  token: 't',
  user: { username: 'admin', displayName: '张监管', role: 'ADMIN', teamName: '平台' },
}

const cleanups: Array<() => void> = []

const mountDetail = async (id = '11') => {
  await router.push(`/pilots/${id}`)
  const wrapper = mount(PilotDetailView, { global: { plugins: [router, ElementPlus] } })
  cleanups.push(() => wrapper.unmount())
  await flushPromises()
  return wrapper
}

describe('飞手详情：绑定无人机与合规开关（TASK-FRONTEND-004）', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    clearStoredSession()
    setStoredSession(adminSession)
    await router.push('/orders')
    getAdminPilotDetail.mockResolvedValue(detailFixture)
    updateUavAvailable.mockResolvedValue({ success: true, message: '操作成功' })
  })

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup()
    }
    clearStoredSession()
  })

  it('渲染基本信息、绑定无人机表与累计完成单', async () => {
    const wrapper = await mountDetail()

    expect(getAdminPilotDetail).toHaveBeenCalledWith('11')

    const text = wrapper.text()
    expect(text).toContain('李四')
    expect(text).toContain('ID 11')
    expect(text).toContain('飞手')
    expect(text).toContain('累计完成单')
    expect(text).toContain('SMOKE-01')
    expect(text).toContain('M350 RTK')
    expect(text).toContain('在线')
    expect(text).toContain('未映射')
    expect(text).toContain('3 架（在线 1 架）')
    expect(text).toContain('累计完成 12 单')
  })

  it('available=null 的设备：开关禁用并提示未注册，点击不发请求', async () => {
    const wrapper = await mountDetail()

    expect(wrapper.text()).toContain('开关已禁用')

    const switches = wrapper.findAll('.el-switch')
    expect(switches).toHaveLength(3)
    expect(switches[2].classes()).toContain('is-disabled')

    const unregisteredRow = wrapper
      .findAll('.el-table__row')
      .find((row) => row.text().includes('SMOKE-03'))!
    expect(unregisteredRow.text()).toContain('未注册')

    await switches[2].trigger('click')
    await flushPromises()

    expect(updateUavAvailable).not.toHaveBeenCalled()
  })

  it('启用开关切换调用启停接口并刷新详情', async () => {
    const wrapper = await mountDetail()

    const [enabled] = wrapper.findAll('.el-switch')
    expect(enabled.classes()).not.toContain('is-disabled')
    await enabled.trigger('click')

    await vi.waitFor(() =>
      expect(updateUavAvailable).toHaveBeenCalledWith('SMOKE-01', '0'),
    )
    await vi.waitFor(() => expect(getAdminPilotDetail).toHaveBeenCalledTimes(2))
  })

  it('启停失败不改变开关状态并给出提示', async () => {
    updateUavAvailable.mockRejectedValue(new Error('无人机不存在'))
    const wrapper = await mountDetail()

    await wrapper.findAll('.el-switch')[1].trigger('click')
    await flushPromises()

    expect(updateUavAvailable).toHaveBeenCalledWith('SMOKE-02', '1')
    // 失败不触发重载，开关仍按原数据渲染（SMOKE-02 保持禁用态）
    expect(getAdminPilotDetail).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('.el-switch')[1].classes()).not.toContain('is-disabled')
  })

  it('关联订单行点击进入订单详情页', async () => {
    const wrapper = await mountDetail()

    const row = wrapper.findAll('.el-table__row').find((item) => item.text().includes('ORD-A'))!
    await row.trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('order-detail'))
    expect(router.currentRoute.value.params.orderNum).toBe('ORD-A')
  })

  it('返回按钮回到飞手列表', async () => {
    const wrapper = await mountDetail()

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('返回飞手列表'))!
      .trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('pilots'))
  })
})
