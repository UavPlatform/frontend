import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus'
import FleetView from '../../src/views/FleetView.vue'
import router from '../../src/router'
import { clearStoredSession, setStoredSession } from '../../src/api/session'
import type { AuthSession } from '../../src/types/auth'
import type { AdminAircraftModelVo, AdminDroneVo } from '../../src/types/admin'

const api = vi.hoisted(() => ({
  getAdminDrones: vi.fn(),
  createAdminDrone: vi.fn(),
  updateAdminDrone: vi.fn(),
  setAdminDroneEnabled: vi.fn(),
  getAdminDroneBorrows: vi.fn(),
  getAdminAircraftModels: vi.fn(),
  createAdminAircraftModel: vi.fn(),
  updateAdminAircraftModel: vi.fn(),
  setAdminAircraftModelEnabled: vi.fn(),
  deleteAdminAircraftModel: vi.fn(),
}))

vi.mock('../../src/api/modules/admin-drone', () => ({
  getAdminDrones: api.getAdminDrones,
  createAdminDrone: api.createAdminDrone,
  updateAdminDrone: api.updateAdminDrone,
  setAdminDroneEnabled: api.setAdminDroneEnabled,
  getAdminDroneBorrows: api.getAdminDroneBorrows,
}))

vi.mock('../../src/api/modules/admin-aircraft-model', () => ({
  getAdminAircraftModels: api.getAdminAircraftModels,
  createAdminAircraftModel: api.createAdminAircraftModel,
  updateAdminAircraftModel: api.updateAdminAircraftModel,
  setAdminAircraftModelEnabled: api.setAdminAircraftModelEnabled,
  deleteAdminAircraftModel: api.deleteAdminAircraftModel,
}))

const pageOf = <T,>(content: T[], totalElements = content.length) => ({
  content,
  page: 0,
  size: 100,
  totalElements,
  totalPages: 1,
})

const modelA: AdminAircraftModelVo = {
  id: 1, modelCode: 'FC30', displayName: 'DJI FlyCart 30', maxPayloadKg: 30,
  transportEnabled: true, enabled: true,
}
const modelB: AdminAircraftModelVo = {
  id: 2, modelCode: 'M350', displayName: 'Matrice 350', maxPayloadKg: 2.7,
  transportEnabled: false, enabled: true,
}

const droneA: AdminDroneVo = {
  droneId: 'd-1',
  serialNumber: 'SN-001',
  airport: { airportId: 1, name: '默认机场' },
  enabled: true,
  borrowStatus: 'BORROWED',
  executing: true,
  model: { aircraftModelId: 1, modelCode: 'FC30', displayName: 'DJI FlyCart 30' },
  currentBorrow: { borrowId: 'b-1', pilotId: 11, pilotName: '李飞手', borrowedAt: '2026-10-25T10:00:00Z' },
  latestOrder: { orderId: 'ord-99', stage: 'IN_TRANSIT', createdAt: '2026-10-25T11:00:00Z' },
}

const droneB: AdminDroneVo = {
  droneId: 'd-2',
  serialNumber: 'SN-002',
  airport: { airportId: 1, name: '默认机场' },
  enabled: true,
  borrowStatus: 'IN_STOCK',
  executing: false,
  model: { aircraftModelId: 1, modelCode: 'FC30', displayName: 'DJI FlyCart 30' },
  currentBorrow: null,
  latestOrder: null,
}

const droneC: AdminDroneVo = {
  ...droneB,
  droneId: 'd-3',
  serialNumber: 'SN-M350',
  model: { aircraftModelId: 2, modelCode: 'M350', displayName: 'Matrice 350' },
}

const adminSession: AuthSession = {
  token: 't',
  user: { username: 'admin', displayName: '张监管', role: 'ADMIN', teamName: '平台' },
}

const cleanups: Array<() => void> = []

const mountFleet = async (query = '') => {
  await router.push(`/fleet${query}`)
  const wrapper = mount(FleetView, { global: { plugins: [router, ElementPlus] } })
  cleanups.push(() => wrapper.unmount())
  await flushPromises()
  return wrapper
}

const droneTable = (wrapper: Awaited<ReturnType<typeof mountFleet>>) =>
  wrapper.find('[data-testid="drone-table"]').text()

const buttonIn = (wrapper: Awaited<ReturnType<typeof mountFleet>>, scope: string, text: string) =>
  wrapper.find(scope).findAll('button').find((button) => button.text() === text)!

describe('无人机与机型合并页（REQ-SUP-GOV-005 / 006）', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    clearStoredSession()
    setStoredSession(adminSession)
    await router.push('/orders')
    api.getAdminDrones.mockResolvedValue(pageOf([droneA, droneB, droneC]))
    api.getAdminAircraftModels.mockResolvedValue(pageOf([modelA, modelB]))
    api.getAdminDroneBorrows.mockResolvedValue(pageOf([]))
  })

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup()
    clearStoredSession()
    vi.restoreAllMocks()
  })

  describe('机型目录（左栏）', () => {
    it('一次拉取全量机型并展示每个机型下的无人机数量', async () => {
      const wrapper = await mountFleet()
      expect(api.getAdminAircraftModels).toHaveBeenCalledWith({ page: 0, size: 100 })
      const panel = wrapper.find('[data-testid="aircraft-model-table"]')
      expect(panel.text()).toContain('FC30')
      expect(panel.text()).toContain('DJI FlyCart 30')
      expect(wrapper.find('[data-testid="aircraft-model-all"]').text()).toContain('3 架')
      expect(wrapper.find('[data-testid="aircraft-model-item-1"]').text()).toContain('2 架')
      expect(wrapper.find('[data-testid="aircraft-model-item-2"]').text()).toContain('1 架')
    })

    it('机型超过一页时继续翻页拉取', async () => {
      const many = Array.from({ length: 100 }, (_, i) => ({ ...modelA, id: 100 + i, modelCode: `X${i}` }))
      api.getAdminAircraftModels
        .mockResolvedValueOnce({ ...pageOf(many, 101), totalPages: 2 })
        .mockResolvedValueOnce({ ...pageOf([modelB], 101), page: 1, totalPages: 2 })
      const wrapper = await mountFleet()
      expect(api.getAdminAircraftModels).toHaveBeenNthCalledWith(2, { page: 1, size: 100 })
      expect(wrapper.find('[data-testid="aircraft-model-item-2"]').exists()).toBe(true)
    })

    it('点击新增打开对话框并提交 create', async () => {
      api.createAdminAircraftModel.mockResolvedValue(modelA)
      const wrapper = await mountFleet()
      await wrapper.find('[data-testid="aircraft-model-create"]').trigger('click')
      await flushPromises()
      const inputs = wrapper.findAll('.el-dialog input')
      await inputs[0].setValue('M30')
      await inputs[1].setValue('Matrice 30')
      await wrapper.find('[data-testid="aircraft-model-save"]').trigger('click')
      await flushPromises()
      const body = api.createAdminAircraftModel.mock.calls[0][0]
      expect(body.modelCode).toBe('M30')
      expect(body.displayName).toBe('Matrice 30')
      expect(body.transportEnabled).toBe(true)
      // 机型变更后右栏无人机重新拉取，刷新内嵌的机型名称
      expect(api.getAdminDrones).toHaveBeenCalledTimes(2)
    })

    it('保存失败时保留后端错误，并忽略重复提交', async () => {
      let resolveSave!: (value: AdminAircraftModelVo) => void
      api.createAdminAircraftModel.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve }))
      const wrapper = await mountFleet()
      await wrapper.find('[data-testid="aircraft-model-create"]').trigger('click')
      const inputs = wrapper.findAll('.el-dialog input')
      await inputs[0].setValue('M30')
      await inputs[1].setValue('Matrice 30')
      const save = wrapper.find('[data-testid="aircraft-model-save"]')
      await save.trigger('click')
      await save.trigger('click')
      expect(api.createAdminAircraftModel).toHaveBeenCalledTimes(1)
      resolveSave(modelA)
      await flushPromises()
      api.updateAdminAircraftModel.mockRejectedValueOnce(new Error('机型已被引用'))
      await buttonIn(wrapper, '[data-testid="aircraft-model-item-1"]', '编辑').trigger('click')
      await wrapper.find('[data-testid="aircraft-model-save"]').trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-testid="aircraft-model-save-error"]').text()).toContain('机型已被引用')
    })

    it('加载失败后清空旧列表，避免展示过期机型', async () => {
      const wrapper = await mountFleet()
      api.getAdminAircraftModels.mockRejectedValueOnce(new Error('机型服务不可用'))
      await wrapper.find('[data-testid="aircraft-model-refresh"]').trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-testid="aircraft-model-table"]').text()).not.toContain('FC30')
    })

    it('停用需二次确认，取消则不请求', async () => {
      const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValueOnce('cancel')
      const wrapper = await mountFleet()
      await buttonIn(wrapper, '[data-testid="aircraft-model-item-1"]', '停用').trigger('click')
      await flushPromises()
      expect(confirm).toHaveBeenCalled()
      expect(api.setAdminAircraftModelEnabled).not.toHaveBeenCalled()
    })

    it('删除被引用机型时只展示后端原因', async () => {
      vi.spyOn(ElMessageBox, 'confirm').mockResolvedValueOnce('confirm' as never)
      const error = vi.spyOn(ElMessage, 'error')
      api.deleteAdminAircraftModel.mockRejectedValueOnce(new Error('机型已被无人机引用，请改为停用'))
      const wrapper = await mountFleet()
      await buttonIn(wrapper, '[data-testid="aircraft-model-item-1"]', '删除').trigger('click')
      await flushPromises()
      expect(api.deleteAdminAircraftModel).toHaveBeenCalledWith(1)
      expect(error).toHaveBeenCalledWith('机型已被无人机引用，请改为停用')
    })

    it('删除当前选中的机型后回到全部机型', async () => {
      vi.spyOn(ElMessageBox, 'confirm').mockResolvedValueOnce('confirm' as never)
      api.deleteAdminAircraftModel.mockResolvedValueOnce(undefined)
      const wrapper = await mountFleet('?model=2')
      await buttonIn(wrapper, '[data-testid="aircraft-model-item-2"]', '删除').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.query.model).toBeUndefined()
    })
  })

  describe('无人机（右栏）', () => {
    it('渲染在库/已借出/执飞中与最近订单链接', async () => {
      const wrapper = await mountFleet()
      expect(api.getAdminDrones).toHaveBeenCalledWith({ page: 0, size: 100, airportName: undefined })
      const text = droneTable(wrapper)
      expect(text).toContain('SN-001')
      expect(text).toContain('已借出')
      expect(text).toContain('执飞中')
      expect(text).toContain('李飞手')
      expect(text).toContain('ord-99')
      expect(text).toContain('在库')
      expect(text).toContain('暂无订单')
    })

    it('选中机型后右栏只显示该机型的无人机，并写入 URL', async () => {
      const wrapper = await mountFleet()
      await wrapper.find('[data-testid="aircraft-model-item-2"]').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.query.model).toBe('2')
      expect(wrapper.find('[data-testid="drone-panel-title"]').text()).toContain('Matrice 350')
      expect(droneTable(wrapper)).toContain('SN-M350')
      expect(droneTable(wrapper)).not.toContain('SN-001')
      // 机型筛选在前端完成，不重复请求
      expect(api.getAdminDrones).toHaveBeenCalledTimes(1)

      await wrapper.find('[data-testid="aircraft-model-all"]').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.query.model).toBeUndefined()
      expect(droneTable(wrapper)).toContain('SN-001')
    })

    it('按机场名称筛选写入 URL 并请求，保留选中机型', async () => {
      const wrapper = await mountFleet('?model=1')
      await wrapper.find('[data-testid="drone-airport-filter"]').setValue('浦东')
      await buttonIn(wrapper, '[data-testid="drone-panel"]', '查询').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.query.airport).toBe('浦东')
      expect(router.currentRoute.value.query.model).toBe('1')
      expect(api.getAdminDrones).toHaveBeenLastCalledWith({ page: 0, size: 100, airportName: '浦东' })
    })

    it('在选中机型下登记无人机时预选机型，不填机场字段', async () => {
      api.createAdminDrone.mockResolvedValue(droneC)
      const wrapper = await mountFleet('?model=2')
      await wrapper.find('[data-testid="drone-create"]').trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-testid="drone-airport-default"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="drone-airport-prefilled"]').exists()).toBe(false)
      const serial = wrapper.findAll('.el-dialog input').find((input) => input.attributes('placeholder')?.includes('全局唯一'))!
      await serial.setValue('sn-new')
      await wrapper.find('[data-testid="drone-save"]').trigger('click')
      await flushPromises()
      expect(api.createAdminDrone).toHaveBeenCalledWith({
        aircraftModelId: 2,
        serialNumber: 'sn-new',
      })
    })

    it('点击最近订单跳转派单详情', async () => {
      const wrapper = await mountFleet()
      const link = wrapper.find('[data-testid="drone-latest-order-d-1"]')
      expect(link.exists()).toBe(true)
      const pushSpy = vi.spyOn(router, 'push').mockResolvedValue(undefined as never)
      await link.trigger('click')
      await flushPromises()
      expect(pushSpy).toHaveBeenCalledWith({ name: 'order-detail', params: { orderNum: 'ord-99' } })
    })

    it('切换无人机后忽略旧借还记录响应', async () => {
      let resolveOld!: (value: ReturnType<typeof pageOf>) => void
      api.getAdminDroneBorrows.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve }))
        .mockResolvedValueOnce(pageOf([{ pilotName: '新设备飞手', borrowedAt: '2026-10-25T00:00:00Z' }]))
      const wrapper = await mountFleet()
      const buttons = wrapper.findAll('button').filter((button) => button.text() === '借还记录')
      await buttons[0].trigger('click')
      await buttons[1].trigger('click')
      await flushPromises()
      resolveOld(pageOf([{ pilotName: '旧设备飞手' }]))
      await flushPromises()
      const drawer = wrapper.findComponent({ name: 'ElDrawer' })
      expect(drawer.text()).toContain('新设备飞手')
      expect(drawer.text()).not.toContain('旧设备飞手')
    })

    it('登记时未填机身号不可保存', async () => {
      const wrapper = await mountFleet('?model=1')
      await wrapper.find('[data-testid="drone-create"]').trigger('click')
      await flushPromises()
      await wrapper.find('[data-testid="drone-save"]').trigger('click')
      await flushPromises()
      expect(api.createAdminDrone).not.toHaveBeenCalled()
      expect(api.updateAdminDrone).not.toHaveBeenCalled()
    })

    it('编辑失败时把后端原因留在对话框内', async () => {
      api.updateAdminDrone.mockRejectedValueOnce(new Error('设备已有借还记录，不能更改机身号或机型'))
      const wrapper = await mountFleet()
      await buttonIn(wrapper, '[data-testid="drone-table"]', '编辑').trigger('click')
      await flushPromises()
      await wrapper.find('[data-testid="drone-save"]').trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-testid="drone-save-error"]').text()).toContain('不能更改机身号或机型')
    })
  })
})
