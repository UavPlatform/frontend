import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PilotsView from '../../src/views/PilotsView.vue'
import router from '../../src/router'
import { clearStoredSession, setStoredSession } from '../../src/api/session'
import type { AuthSession } from '../../src/types/auth'
import type { AdminPilotVo } from '../../src/types/admin'

const { getAdminPilots } = vi.hoisted(() => ({ getAdminPilots: vi.fn() }))

vi.mock('../../src/api/modules/admin-query', async () => {
  const actual = (await vi.importActual('../../src/api/modules/admin-query')) as Record<
    string,
    unknown
  >
  return { ...actual, getAdminPilots }
})

const pageOf = <T,>(content: T[], totalElements = content.length) => ({
  content,
  page: 0,
  size: 10,
  totalElements,
  totalPages: 1,
})

const pilotA: AdminPilotVo = {
  userId: 11,
  userName: '李四',
  status: 1,
  uavCount: 3,
  onlineUavCount: 2,
  completedCount: 12,
}
const pilotB: AdminPilotVo = {
  userId: 12,
  userName: '赵六',
  status: 0,
  uavCount: 1,
  onlineUavCount: 0,
  completedCount: 0,
}

const adminSession: AuthSession = {
  token: 't',
  user: { username: 'admin', displayName: '张监管', role: 'ADMIN', teamName: '平台' },
}

const cleanups: Array<() => void> = []

const mountList = async (query = '') => {
  await router.push(`/pilots${query}`)
  const wrapper = mount(PilotsView, { global: { plugins: [router, ElementPlus] } })
  cleanups.push(() => wrapper.unmount())
  await flushPromises()
  return wrapper
}

const rowsText = (wrapper: { findAll: (selector: string) => Array<{ text(): string }> }) =>
  wrapper.findAll('.el-table__row').map((row) => row.text())

describe('飞手列表（TASK-FRONTEND-004）', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    clearStoredSession()
    setStoredSession(adminSession)
    await router.push('/orders')
    getAdminPilots.mockResolvedValue(pageOf([pilotA, pilotB], 30))
  })

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup()
    }
    clearStoredSession()
  })

  it('默认按 page=0/size=10 请求并渲染完成单、无人机数与在线数', async () => {
    const wrapper = await mountList()

    expect(getAdminPilots).toHaveBeenCalledWith({
      page: 0,
      size: 10,
      keyword: undefined,
    })

    const text = rowsText(wrapper).join('\n')
    expect(text).toContain('李四')
    expect(text).toContain('12')
    expect(text).toContain('2 / 3')
    expect(text).toContain('赵六')
  })

  it('?q= 承接订单详情定位参数：按关键字过滤并高亮完全同名行', async () => {
    const wrapper = await mountList('?q=李四')

    expect(getAdminPilots).toHaveBeenCalledWith({
      page: 0,
      size: 10,
      keyword: '李四',
    })
    expect(wrapper.text()).toContain('已按关键字「李四」筛选飞手列表')

    const rows = wrapper.findAll('.el-table__row')
    expect(rows[0].classes()).toContain('locate-row')
    expect(rows[1].classes()).not.toContain('locate-row')
  })

  it('关键字查询回写 URL 并重新请求', async () => {
    const wrapper = await mountList()

    await wrapper.find('input[placeholder="搜索飞手昵称"]').setValue('赵')
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('查询'))!
      .trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.query.q).toBe('赵'))
    await flushPromises()
    expect(getAdminPilots).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyword: '赵', page: 0 }),
    )
  })

  it('分页控件切换页码并回写 URL', async () => {
    const wrapper = await mountList()

    const pager = wrapper.findAll('.el-pager li').find((item) => item.text().trim() === '2')
    await pager!.trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.query.page).toBe('2'))
    await flushPromises()
    expect(getAdminPilots).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, size: 10 }),
    )
  })

  it('行点击进入飞手详情页', async () => {
    const wrapper = await mountList()

    const row = wrapper.findAll('.el-table__row').find((item) => item.text().includes('李四'))!
    await row.trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('pilot-detail'))
    expect(router.currentRoute.value.params.id).toBe('11')
  })
})
