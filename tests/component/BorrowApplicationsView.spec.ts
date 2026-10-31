import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'
import BorrowApplicationsView from '../../src/views/BorrowApplicationsView.vue'
import router from '../../src/router'
import { clearStoredSession, setStoredSession } from '../../src/api/session'
import type { AuthSession } from '../../src/types/auth'
import type { AdminBorrowApplicationVo, AdminDroneVo } from '../../src/types/admin'

const api = vi.hoisted(() => ({
  getAdminBorrowApplications: vi.fn(),
  approveAdminBorrowApplication: vi.fn(),
  rejectAdminBorrowApplication: vi.fn(),
  getAdminDrones: vi.fn(),
  getEquipmentNotifications: vi.fn().mockResolvedValue({ items: [], unreadCount: 0 }),
  readEquipmentNotification: vi.fn(),
  restoreAdminBorrowApplication: vi.fn(),
}))

vi.mock('../../src/api/modules/admin-borrow', () => ({
  getAdminBorrowApplications: api.getAdminBorrowApplications,
  approveAdminBorrowApplication: api.approveAdminBorrowApplication,
  rejectAdminBorrowApplication: api.rejectAdminBorrowApplication,
  restoreAdminBorrowApplication: api.restoreAdminBorrowApplication,
  getEquipmentNotifications: api.getEquipmentNotifications,
  readEquipmentNotification: api.readEquipmentNotification,
  BORROW_STATUS_META: {
    PENDING: { label: '待审批', tagType: 'warning' },
    APPROVED: { label: '已借出', tagType: 'success' },
    REJECTED: { label: '已驳回', tagType: 'danger' },
    RETURNED: { label: '已归还', tagType: 'info' },
  },
}))

vi.mock('../../src/api/modules/admin-drone', () => ({
  getAdminDrones: api.getAdminDrones,
  createAdminDrone: vi.fn(),
  updateAdminDrone: vi.fn(),
  setAdminDroneEnabled: vi.fn(),
  getAdminDroneBorrows: vi.fn(),
}))

const pageOf = <T,>(content: T[], totalElements = content.length) => ({
  content,
  page: 0,
  size: 20,
  totalElements,
  totalPages: 1,
})

const pending: AdminBorrowApplicationVo = {
  borrowId: 'b-1',
  status: 'PENDING',
  pilotId: 11,
  pilotName: '李飞手',
  aircraftModelId: 1,
  modelName: 'DJI FlyCart 30',
  orderId: 'ord-1',
  appliedAt: '2026-10-31T08:00:00Z',
  inStockCount: 2,
  pilotHasActiveLoan: false,
}

const pendingSecond: AdminBorrowApplicationVo = {
  ...pending,
  borrowId: 'b-2',
  pilotHasActiveLoan: true,
  orderId: null,
}

const stock: AdminDroneVo = {
  droneId: 'd-1',
  serialNumber: 'SN-001',
  airport: { airportId: 1, name: '默认机场' },
  enabled: true,
  borrowStatus: 'IN_STOCK',
  executing: false,
  model: { aircraftModelId: 1, modelCode: 'FC30', displayName: 'DJI FlyCart 30' },
  currentBorrow: null,
  latestOrder: null,
}

const adminSession: AuthSession = {
  token: 't',
  user: { username: 'admin', displayName: '张监管', role: 'ADMIN', teamName: '平台' },
}

const cleanups: Array<() => void> = []

const mountView = async (query = '?status=PENDING') => {
  await router.push(`/borrow-applications${query}`)
  const wrapper = mount(BorrowApplicationsView, { global: { plugins: [router, ElementPlus] } })
  cleanups.push(() => wrapper.unmount())
  await flushPromises()
  return wrapper
}

describe('借机审批页（REQ-SUP-GOV-007）', () => {
  beforeEach(() => {
    clearStoredSession()
    setStoredSession(adminSession)
    vi.clearAllMocks()
    api.getAdminBorrowApplications.mockResolvedValue(pageOf([pending, pendingSecond]))
    api.getAdminDrones.mockResolvedValue(pageOf([stock]))
    api.approveAdminBorrowApplication.mockResolvedValue({ borrowId: 'b-1', status: 'APPROVED' })
    api.rejectAdminBorrowApplication.mockResolvedValue({ borrowId: 'b-1', status: 'REJECTED' })
  })

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.()
  })

  it('默认加载待审批列表并展示飞手、机型、订单与特批提示', async () => {
    const wrapper = await mountView()
    expect(api.getAdminBorrowApplications).toHaveBeenCalledWith({
      page: 0,
      size: 20,
      status: 'PENDING',
    })
    const table = wrapper.get('[data-testid="borrow-applications-table"]')
    expect(table.text()).toContain('李飞手')
    expect(table.text()).toContain('DJI FlyCart 30')
    expect(table.text()).toContain('ord-1')
    expect(wrapper.find('[data-testid="borrow-active-loan-hint"]').exists()).toBe(true)
  })

  it('通过对话框默认手选且未选机身号时确认按钮禁用；随机模式可提交', async () => {
    const wrapper = await mountView()
    await wrapper.get('[data-testid="borrow-approve-b-1"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="borrow-approve-dialog"]').exists()).toBe(true)
    expect(api.getAdminDrones).toHaveBeenCalled()

    const confirm = wrapper.get('[data-testid="borrow-approve-confirm"]')
    expect(confirm.attributes('disabled')).toBeDefined()

    const exposed = wrapper.vm as unknown as {
      approveMode: 'pick' | 'random'
      selectedDroneId?: string
      confirmApprove: () => Promise<void>
    }
    expect(exposed.approveMode).toBe('pick')
    exposed.approveMode = 'random'
    await flushPromises()
    await exposed.confirmApprove()
    await flushPromises()
    expect(api.approveAdminBorrowApplication).toHaveBeenCalledWith('b-1', { random: true })
  })

  it('驳回必须填写原因', async () => {
    const wrapper = await mountView()
    await wrapper.get('[data-testid="borrow-reject-b-1"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="borrow-reject-confirm"]').trigger('click')
    await flushPromises()
    expect(api.rejectAdminBorrowApplication).not.toHaveBeenCalled()

    const reason = wrapper.get('[data-testid="borrow-reject-reason"]')
    await reason.setValue('机库检修')
    await wrapper.get('[data-testid="borrow-reject-confirm"]').trigger('click')
    await flushPromises()
    expect(api.rejectAdminBorrowApplication).toHaveBeenCalledWith('b-1', { reason: '机库检修' })
  })

  it('特批第二台时弹出确认', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const wrapper = await mountView()
    await wrapper.get('[data-testid="borrow-approve-b-2"]').trigger('click')
    await flushPromises()
    const exposed = wrapper.vm as unknown as {
      approveMode: 'pick' | 'random'
      confirmApprove: () => Promise<void>
    }
    exposed.approveMode = 'random'
    await exposed.confirmApprove()
    await flushPromises()
    expect(confirm).toHaveBeenCalled()
    expect(api.approveAdminBorrowApplication).toHaveBeenCalledWith('b-2', { random: true })
    confirm.mockRestore()
  })
})
