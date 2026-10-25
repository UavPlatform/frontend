import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessage } from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProviderLoginView from '../../src/views/ProviderLoginView.vue'

const { providerLogin, replace } = vi.hoisted(() => ({
  providerLogin: vi.fn(),
  replace: vi.fn(),
}))

vi.mock('../../src/api/modules/provider', () => ({ providerLogin }))
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }))

describe('ProviderLoginView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  const mountView = () => mount(ProviderLoginView, {
    global: { plugins: [ElementPlus] },
  })

  it('requires both credentials before calling the API', async () => {
    const warning = vi.spyOn(ElMessage, 'warning').mockImplementation(() => undefined as never)
    const wrapper = mountView()

    await wrapper.find('form').trigger('submit')
    expect(providerLogin).not.toHaveBeenCalled()
    expect(warning).toHaveBeenCalledWith('请输入服务商账号和密码')
  })

  it('logs in and routes to the workspace', async () => {
    providerLogin.mockResolvedValue({ providerId: 7 })
    const success = vi.spyOn(ElMessage, 'success').mockImplementation(() => undefined as never)
    const wrapper = mountView()
    const inputs = wrapper.findAll('input')

    await inputs[0].setValue(' acme ')
    await inputs[1].setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(providerLogin).toHaveBeenCalledWith('acme', 'secret')
    expect(success).toHaveBeenCalledWith('登录成功')
    expect(replace).toHaveBeenCalledWith({ name: 'provider-workspace' })
  })

  it('shows API errors and clears loading after failure', async () => {
    providerLogin.mockRejectedValue(new Error('账号或密码错误'))
    const error = vi.spyOn(ElMessage, 'error').mockImplementation(() => undefined as never)
    const wrapper = mountView()

    await wrapper.findAll('input')[0].setValue('acme')
    await wrapper.findAll('input')[1].setValue('bad')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(error).toHaveBeenCalledWith('账号或密码错误')
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })
})
