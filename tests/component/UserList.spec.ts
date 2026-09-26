import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import UsersView from '../../src/views/UsersView.vue'
import router from '../../src/router'
import { clearStoredSession, setStoredSession } from '../../src/api/session'
import type { AuthSession } from '../../src/types/auth'
import type { AdminUserDetailVo, AdminUserVo } from '../../src/types/admin'

const { getAdminUsers, getAdminUserDetail } = vi.hoisted(() => ({
  getAdminUsers: vi.fn(),
  getAdminUserDetail: vi.fn(),
}))

// 只 mock 主体查询；URL 同步、定位行推导走真实实现
vi.mock('../../src/api/modules/admin-query', async () => {
  const actual = (await vi.importActual('../../src/api/modules/admin-query')) as Record<
    string,
    unknown
  >
  return { ...actual, getAdminUsers, getAdminUserDetail }
})

const pageOf = <T,>(content: T[], totalElements = content.length) => ({
  content,
  page: 0,
  size: 10,
  totalElements,
  totalPages: 1,
})

const userA: AdminUserVo = { userId: 7, userName: '王五', status: 1, orderCount: 3 }
const userB: AdminUserVo = { userId: 8, userName: '陈七', status: 0, orderCount: 1 }

/** 不在当前页的目标用户（?id= 定位） */
const locateUser: AdminUserDetailVo = {
  userId: 9,
  userName: '李四',
  status: 1,
  role: 0,
  orders: [{ orderNum: 'ORD-L', ownerName: '李四', orderStatusCode: 4, orderStatusDesc: '已完成' }],
}

const adminSession: AuthSession = {
  token: 't',
  user: { username: 'admin', displayName: '张监管', role: 'ADMIN', teamName: '平台' },
}

const cleanups: Array<() => void> = []

const mountList = async (query = '') => {
  await router.push(`/users${query}`)
  const wrapper = mount(UsersView, { global: { plugins: [router, ElementPlus] } })
  cleanups.push(() => wrapper.unmount())
  await flushPromises()
  return wrapper
}

describe('用户列表筛选、分页与定位行（TASK-FRONTEND-004）', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    clearStoredSession()
    setStoredSession(adminSession)
    await router.push('/orders')
    getAdminUsers.mockResolvedValue(pageOf([userA, userB], 12))
    getAdminUserDetail.mockResolvedValue(locateUser)
  })

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup()
    }
    clearStoredSession()
  })

  it('默认按 page=0/size=10 请求并渲染昵称、状态与订单数', async () => {
    const wrapper = await mountList()

    expect(getAdminUsers).toHaveBeenCalledWith({
      page: 0,
      size: 10,
      keyword: undefined,
      status: undefined,
    })

    const text = wrapper.findAll('.el-table__row').map((row) => row.text()).join('\n')
    expect(text).toContain('王五')
    expect(text).toContain('陈七')
    expect(text).toContain('正常')
    expect(text).toContain('停用')
    expect(text).toContain('3')
  })

  it('URL 筛选参数（q/status/page/size）直达后端', async () => {
    await mountList('?q=王&status=0&page=2&size=20')

    expect(getAdminUsers).toHaveBeenCalledWith({
      page: 1,
      size: 20,
      keyword: '王',
      status: 0,
    })
  })

  it('分页控件切换页码与每页条数并回写 URL', async () => {
    const wrapper = await mountList()

    const pager = wrapper.findAll('.el-pager li').find((item) => item.text().trim() === '2')
    await pager!.trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.query.page).toBe('2'))
    await flushPromises()
    expect(getAdminUsers).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, size: 10 }),
    )

    await wrapper
      .findAll('.el-pagination button')
      .find((item) => item.classes().includes('btn-prev'))!
      .trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.query.page).toBeUndefined())
  })

  it('关键字查询回写 URL 并重新请求，重置清空参数', async () => {
    const wrapper = await mountList()

    await wrapper.find('input[placeholder="搜索用户昵称"]').setValue('李')
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('查询'))!
      .trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.query.q).toBe('李'))
    await flushPromises()
    expect(getAdminUsers).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyword: '李', page: 0 }),
    )

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('重置'))!
      .trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.query.q).toBeUndefined())
  })

  it('?id= 承接订单详情定位参数：取详情、置顶高亮并可直达详情', async () => {
    // 目标用户不在当前页（列表只有 7、8）
    const wrapper = await mountList('?id=9')

    expect(getAdminUserDetail).toHaveBeenCalledWith('9')
    expect(wrapper.text()).toContain('已按链接定位到用户「李四」（ID 9）')

    const rows = wrapper.findAll('.el-table__row')
    expect(rows[0].text()).toContain('李四')
    expect(rows[0].classes()).toContain('locate-row')

    await rows[0].trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('user-detail'))
    expect(router.currentRoute.value.params.id).toBe('9')
  })

  it('行点击与「详情」按钮进入用户详情页', async () => {
    const wrapper = await mountList()

    const row = wrapper.findAll('.el-table__row').find((item) => item.text().includes('王五'))!
    await row.trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('user-detail'))
    expect(router.currentRoute.value.params.id).toBe('7')
  })
})
