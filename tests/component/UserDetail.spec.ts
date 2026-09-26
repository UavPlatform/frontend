import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import UserDetailView from '../../src/views/UserDetailView.vue'
import router from '../../src/router'
import { clearStoredSession, setStoredSession } from '../../src/api/session'
import type { AuthSession } from '../../src/types/auth'
import type { AdminUserDetailVo } from '../../src/types/admin'

const { getAdminUserDetail } = vi.hoisted(() => ({ getAdminUserDetail: vi.fn() }))

vi.mock('../../src/api/modules/admin-query', async () => {
  const actual = (await vi.importActual('../../src/api/modules/admin-query')) as Record<
    string,
    unknown
  >
  return { ...actual, getAdminUserDetail }
})

const detailFixture: AdminUserDetailVo = {
  userId: 7,
  userName: '王五',
  role: 0,
  status: 1,
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
    {
      orderNum: 'ORD-B',
      taskNum: 'T2',
      taskName: '测绘任务',
      ownerName: '王五',
      totalAmount: 120,
      orderStatusCode: 5,
      orderStatus: 'WAITING_CONFIRM',
      orderStatusDesc: '待验收',
      createTime: '2026-09-25 10:00:00',
    },
  ],
}

const adminSession: AuthSession = {
  token: 't',
  user: { username: 'admin', displayName: '张监管', role: 'ADMIN', teamName: '平台' },
}

const cleanups: Array<() => void> = []

const mountDetail = async (id = '7') => {
  await router.push(`/users/${id}`)
  const wrapper = mount(UserDetailView, { global: { plugins: [router, ElementPlus] } })
  cleanups.push(() => wrapper.unmount())
  await flushPromises()
  return wrapper
}

describe('用户详情（TASK-FRONTEND-004）', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    clearStoredSession()
    setStoredSession(adminSession)
    await router.push('/orders')
    getAdminUserDetail.mockResolvedValue(detailFixture)
  })

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup()
    }
    clearStoredSession()
  })

  it('渲染基本信息与关联订单摘要', async () => {
    const wrapper = await mountDetail()

    expect(getAdminUserDetail).toHaveBeenCalledWith('7')

    const text = wrapper.text()
    expect(text).toContain('王五')
    expect(text).toContain('ID 7')
    expect(text).toContain('普通用户')
    expect(text).toContain('正常')
    expect(text).toContain('ORD-A')
    expect(text).toContain('工地吊运')
    expect(text).toContain('¥980.00')
    expect(text).toContain('待验收')
    expect(text).toContain('名下订单 2 单')
  })

  it('订单行点击进入订单详情页', async () => {
    const wrapper = await mountDetail()

    const row = wrapper.findAll('.el-table__row').find((item) => item.text().includes('ORD-B'))!
    await row.trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('order-detail'))
    expect(router.currentRoute.value.params.orderNum).toBe('ORD-B')
  })

  it('返回按钮回到用户列表', async () => {
    const wrapper = await mountDetail()

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('返回用户列表'))!
      .trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('users'))
  })

  it('查不到用户（如传入飞手 ID）展示空态而非报错页', async () => {
    getAdminUserDetail.mockRejectedValue(new Error('用户不存在'))
    const wrapper = await mountDetail('404')

    expect(wrapper.text()).toContain('未查询到该用户')
    expect(getAdminUserDetail).toHaveBeenCalledWith('404')
  })
})
