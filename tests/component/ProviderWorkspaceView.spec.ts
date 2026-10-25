import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProviderWorkspaceView from '../../src/views/ProviderWorkspaceView.vue'

const { getAircraftModels, getProviderBorrows, getProviderDrones, getProviderProfile } = vi.hoisted(() => ({
  getAircraftModels: vi.fn(),
  getProviderBorrows: vi.fn(),
  getProviderDrones: vi.fn(),
  getProviderProfile: vi.fn(),
}))

vi.mock('../../src/api/modules/provider', () => ({
  getAircraftModels,
  getProviderBorrows,
  getProviderDrones,
  getProviderProfile,
  registerProviderDrone: vi.fn(),
  setProviderDroneEnabled: vi.fn(),
  updateProviderDrone: vi.fn(),
}))
vi.mock('../../src/api/session', () => ({ clearStoredSession: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ replace: vi.fn() }) }))

describe('ProviderWorkspaceView aircraft model selector', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getProviderProfile.mockResolvedValue({ displayName: 'ACME' })
    getProviderDrones.mockResolvedValue({ items: [] })
    getProviderBorrows.mockResolvedValue({ items: [] })
    getAircraftModels.mockResolvedValue([
      {
        id: 11,
        displayName: '飞行器 30',
        modelCode: 'FC30',
        maxPayloadKg: 30,
        transportEnabled: true,
      },
      {
        id: 12,
        displayName: '未启用机型',
        modelCode: 'MODEL-12',
        maxPayloadKg: 12,
        transportEnabled: false,
      },
    ])
  })

  it('loads the platform catalog and shows only enabled transport models with payload', async () => {
    const wrapper = mount(ProviderWorkspaceView, {
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()

    expect(getAircraftModels).toHaveBeenCalledOnce()
    expect(wrapper.text()).not.toContain('机型 ID')

    await wrapper.find('.el-select__wrapper').trigger('click')
    await flushPromises()

    const options = [...document.body.querySelectorAll('.el-select-dropdown__item')]
    expect(options).toHaveLength(1)
    expect(options[0].textContent).toContain('飞行器 30')
    expect(options[0].textContent).toContain('FC30')
    expect(options[0].textContent).toContain('最大载重 30 kg')
    expect(options[0].textContent).not.toContain('未启用机型')
    wrapper.unmount()
  })
})
