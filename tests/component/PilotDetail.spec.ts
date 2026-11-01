import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PilotDetailView from '../../src/views/PilotDetailView.vue'
import router from '../../src/router'
import { clearStoredSession, setStoredSession } from '../../src/api/session'
import type { AuthSession } from '../../src/types/auth'
import type { AdminBorrowApplicationVo, AdminPilotDetailVo } from '../../src/types/admin'

const { getAdminPilotDetail, getAdminBorrowApplications } = vi.hoisted(() => ({
  getAdminPilotDetail: vi.fn(),
  getAdminBorrowApplications: vi.fn(),
}))

vi.mock('../../src/api/modules/admin-query', async () => {
  const actual = (await vi.importActual('../../src/api/modules/admin-query')) as Record<
    string,
    unknown
  >
  return { ...actual, getAdminPilotDetail }
})

vi.mock('../../src/api/modules/admin-borrow', async () => {
  const actual = (await vi.importActual('../../src/api/modules/admin-borrow')) as Record<
    string,
    unknown
  >
  return { ...actual, getAdminBorrowApplications }
})

const pageOf = <T,>(content: T[], totalElements = content.length) => ({
  content,
  page: 0,
  size: 100,
  totalElements,
  totalPages: 1,
})

const detailFixture: AdminPilotDetailVo = {
  userId: 11,
  userName: '李四',
  role: 1,
  status: 1,
  completedCount: 12,
  idNumberMasked: '330***********1234',
  idExpiryDate: '2025-05-01',
  idExpired: true,
  qualifications: [
    {
      id: 2,
      aircraftModelId: 1,
      modelCode: 'FC30',
      modelName: 'DJI FlyCart 30',
      licenseGrade: 'BVLOS',
      licenseGradeLabel: '超视距',
    },
  ],
  // 后端详情仍可能返回 drones；页面不再展示绑定自有机
  drones: [
    { djiId: 'SMOKE-01', aircraftModelId: 1, modelName: 'M350 RTK', online: true, available: true },
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

const borrowForPilot: AdminBorrowApplicationVo = {
  borrowId: 'b-11',
  status: 'APPROVED',
  pilotId: 11,
  pilotName: '李四',
  aircraftModelId: 1,
  modelName: 'DJI FlyCart 30',
  droneId: 'd-11',
  serialNumber: 'SN-11',
  orderId: 'ord-borrow-1',
  appliedAt: '2026-10-20T08:00:00Z',
  borrowedAt: '2026-10-20T10:00:00Z',
  returnedAt: null,
  rejectReason: null,
}

const borrowOtherPilot: AdminBorrowApplicationVo = {
  borrowId: 'b-99',
  status: 'PENDING',
  pilotId: 99,
  pilotName: '别人',
  aircraftModelId: 2,
  modelName: 'M30',
  appliedAt: '2026-10-21T08:00:00Z',
}

const rejectedBorrow: AdminBorrowApplicationVo = {
  borrowId: 'b-12',
  status: 'REJECTED',
  pilotId: 11,
  pilotName: '李四',
  aircraftModelId: 1,
  modelName: 'DJI FlyCart 30',
  appliedAt: '2026-10-18T08:00:00Z',
  rejectReason: '机型库存不足',
  orderId: null,
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

describe('飞手详情：借用记录（REQ-SUP-GOV-004）', () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    clearStoredSession()
    setStoredSession(adminSession)
    await router.push('/orders')
    getAdminPilotDetail.mockResolvedValue(detailFixture)
    getAdminBorrowApplications.mockResolvedValue(
      pageOf([borrowForPilot, borrowOtherPilot, rejectedBorrow]),
    )
  })

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup()
    }
    clearStoredSession()
  })

  it('渲染基本信息、资质与累计完成单，不展示绑定无人机', async () => {
    const wrapper = await mountDetail()

    expect(getAdminPilotDetail).toHaveBeenCalledWith('11')
    expect(getAdminBorrowApplications).toHaveBeenCalled()

    const text = wrapper.text()
    expect(text).toContain('李四')
    expect(text).toContain('ID 11')
    expect(text).toContain('飞手')
    expect(text).toContain('累计完成单')
    expect(text).toContain('累计完成 12 单')
    expect(text).toContain('借用记录')
    expect(text).not.toContain('绑定无人机')
    expect(wrapper.findAll('.el-switch')).toHaveLength(0)
    // drones 虽仍可能出现在 VO，但绑定表已移除
    expect(text).not.toContain('SMOKE-01')
  })

  it('展示脱敏身份证号、证件过期标记与驾驶资质', async () => {
    const wrapper = await mountDetail()
    expect(wrapper.get('[data-testid="pilot-id-number"]').text()).toBe('330***********1234')
    expect(wrapper.find('[data-testid="pilot-id-expired"]').exists()).toBe(true)
    const quals = wrapper.get('[data-testid="pilot-qualifications"]').text()
    expect(quals).toContain('DJI FlyCart 30')
    expect(quals).toContain('FC30')
    expect(quals).toContain('超视距')
  })

  it('未登记实名与资质时给出空状态，不显示过期', async () => {
    getAdminPilotDetail.mockResolvedValue({
      ...detailFixture,
      idNumberMasked: null,
      idExpiryDate: null,
      idExpired: false,
      qualifications: [],
    })
    const wrapper = await mountDetail()
    expect(wrapper.get('[data-testid="pilot-id-number"]').text()).toBe('未登记')
    expect(wrapper.find('[data-testid="pilot-id-expired"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="pilot-qualifications"]').text()).toContain(
      '该飞手尚未登记驾驶资质',
    )
  })

  it('按 pilotId 过滤并渲染借用记录表', async () => {
    const wrapper = await mountDetail()
    const section = wrapper.get('[data-testid="pilot-borrow-records"]')
    expect(section.text()).toContain('共 2 条')
    expect(section.text()).toContain('已借出')
    expect(section.text()).toContain('已驳回')
    expect(section.text()).toContain('SN-11')
    expect(section.text()).toContain('DJI FlyCart 30')
    expect(section.text()).toContain('机型库存不足')
    expect(section.text()).toContain('ord-borrow-1')
    expect(section.text()).not.toContain('别人')
    expect(section.text()).not.toContain('b-99')
  })

  it('无借用记录时展示空状态', async () => {
    getAdminBorrowApplications.mockResolvedValue(pageOf([borrowOtherPilot]))
    const wrapper = await mountDetail()
    const section = wrapper.get('[data-testid="pilot-borrow-records"]')
    expect(section.text()).toContain('该飞手暂无借用记录')
    expect(section.text()).toContain('共 0 条')
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
