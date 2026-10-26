import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import AircraftModelsView from '../../src/views/AircraftModelsView.vue'
import router from '../../src/router'
import { clearStoredSession, setStoredSession } from '../../src/api/session'
import type { AuthSession } from '../../src/types/auth'
import type { AdminAircraftModelVo } from '../../src/types/admin'

const api = vi.hoisted(() => ({
  getAdminAircraftModels: vi.fn(),
  createAdminAircraftModel: vi.fn(),
  updateAdminAircraftModel: vi.fn(),
  setAdminAircraftModelEnabled: vi.fn(),
  deleteAdminAircraftModel: vi.fn(),
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
  size: 20,
  totalElements,
  totalPages: 1,
})

const modelA: AdminAircraftModelVo = {
  id: 1,
  modelCode: 'FC30',
  displayName: 'DJI FlyCart 30',
  maxPayloadKg: 30,
  transportEnabled: true,
  enabled: true,
  coefficient: 1,
}

const adminSession: AuthSession = {
  token: 't',
  user: { username: 'admin', displayName: '张监管', role: 'ADMIN', teamName: '平台' },
}

const cleanups: Array<() => void> = []

const mountList = async () => {
  await router.push('/aircraft-models')
  const wrapper = mount(AircraftModelsView, { global: { plugins: [router, ElementPlus] } })
  cleanups.push(() => wrapper.unmount())
  await flushPromises()
  return wrapper
}

describe('机型列表（REQ-SUP-GOV-006）', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    clearStoredSession()
    setStoredSession(adminSession)
    await router.push('/orders')
    api.getAdminAircraftModels.mockResolvedValue(pageOf([modelA]))
  })

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup()
    clearStoredSession()
  })

  it('默认拉取 page=0/size=20 并渲染型号代码与显示名', async () => {
    const wrapper = await mountList()
    expect(api.getAdminAircraftModels).toHaveBeenCalledWith({ page: 0, size: 20 })
    const text = wrapper.find('[data-testid="aircraft-model-table"]').text()
    expect(text).toContain('FC30')
    expect(text).toContain('DJI FlyCart 30')
    expect(text).toContain('启用')
  })

  it('点击新增打开对话框并提交 create', async () => {
    api.createAdminAircraftModel.mockResolvedValue(modelA)
    const wrapper = await mountList()
    await wrapper.find('[data-testid="aircraft-model-create"]').trigger('click')
    await flushPromises()

    const inputs = wrapper.findAll('.el-dialog input')
    expect(inputs.length).toBeGreaterThan(0)
    await inputs[0].setValue('M350')
    await inputs[1].setValue('Matrice 350')

    await wrapper.find('[data-testid="aircraft-model-save"]').trigger('click')
    await flushPromises()

    expect(api.createAdminAircraftModel).toHaveBeenCalled()
    const body = api.createAdminAircraftModel.mock.calls[0][0]
    expect(body.modelCode).toBe('M350')
    expect(body.displayName).toBe('Matrice 350')
    expect(body.transportEnabled).toBe(true)
  })

  it('保存失败时保留后端错误，并忽略重复提交', async () => {
    let resolveSave!: (value: AdminAircraftModelVo) => void
    api.createAdminAircraftModel.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve }))
    const wrapper = await mountList()
    await wrapper.find('[data-testid="aircraft-model-create"]').trigger('click')
    const inputs = wrapper.findAll('.el-dialog input')
    await inputs[0].setValue('M350')
    await inputs[1].setValue('Matrice 350')
    const save = wrapper.find('[data-testid="aircraft-model-save"]')
    await save.trigger('click')
    await save.trigger('click')
    expect(api.createAdminAircraftModel).toHaveBeenCalledTimes(1)
    resolveSave(modelA)
    await flushPromises()
    api.updateAdminAircraftModel.mockRejectedValueOnce(new Error('机型已被引用'))
    await wrapper.findAll('button').find((button) => button.text() === '编辑')!.trigger('click')
    await wrapper.find('[data-testid="aircraft-model-save"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="aircraft-model-save-error"]').text()).toContain('机型已被引用')
  })

  it('加载失败后清空旧列表，避免展示过期机型', async () => {
    const wrapper = await mountList()
    api.getAdminAircraftModels.mockRejectedValueOnce(new Error('机型服务不可用'))
    await wrapper.find('[data-testid="aircraft-model-refresh"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="aircraft-model-table"]').text()).not.toContain('FC30')
  })
})
