import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import ElementPlus from 'element-plus'
import SystemView from '../../src/views/SystemView.vue'
import { clearStoredSession, setStoredSession } from '../../src/api/session'
import type { AuthSession } from '../../src/types/auth'
import type { AdminLogFile } from '../../src/types/admin'

const {
  getApplicationLogs,
  getErrorLogs,
  getLogFiles,
  readLogFile,
} = vi.hoisted(() => ({
  getApplicationLogs: vi.fn(),
  getErrorLogs: vi.fn(),
  getLogFiles: vi.fn(),
  readLogFile: vi.fn(),
}))

vi.mock('../../src/api/modules/admin', async () => {
  const actual = (await vi.importActual('../../src/api/modules/admin')) as Record<string, unknown>
  return { ...actual, getApplicationLogs, getErrorLogs, getLogFiles, readLogFile }
})

const adminSession: AuthSession = {
  token: 't',
  user: { username: 'admin', displayName: '张监管', role: 'ADMIN', teamName: '平台' },
}

const rootFiles: AdminLogFile[] = [
  { name: 'logs', path: 'logs', directory: true, lastModified: '2026-09-26 10:00:00' },
  { name: 'application.log', path: 'application.log', directory: false, size: 2048, lastModified: '2026-09-26 11:00:00' },
]

const mountView = async (router: Router) => {
  await router.push('/system')
  await router.isReady()
  const wrapper = mount(SystemView, { global: { plugins: [router, ElementPlus] } })
  await flushPromises()
  return wrapper
}

const buildRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/system', name: 'system', component: SystemView },
    ],
  })

const clickTab = async (wrapper: VueWrapper, label: string) => {
  const tab = wrapper.findAll('.el-tabs__item').find((item) => item.text().includes(label))
  expect(tab, `未找到 Tab：${label}`).toBeTruthy()
  await tab!.trigger('click')
  await flushPromises()
}

describe('系统日志页（TASK-FRONTEND-005，自 AdminView 迁移）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearStoredSession()
    setStoredSession(adminSession)
    getApplicationLogs.mockResolvedValue(['2026-09-26 INFO app started'])
    getErrorLogs.mockResolvedValue(['2026-09-26 ERROR boom'])
    getLogFiles.mockResolvedValue(rootFiles)
    readLogFile.mockResolvedValue(['line1', 'line2'])
  })

  it('走 MainLayout 统一导航渲染，应用/错误日志按行数加载并展示', async () => {
    const wrapper = await mountView(buildRouter())

    const text = wrapper.text()
    // 统一壳层（原 AdminView 断言迁移：标题 + 统一登出入口）
    expect(text).toContain('系统日志')
    expect(text).toContain('退出登录')
    // 应用日志默认加载 100 行
    expect(getApplicationLogs).toHaveBeenCalledWith(100)
    expect(text).toContain('2026-09-26 INFO app started')
    // 错误日志同屏预载
    expect(getErrorLogs).toHaveBeenCalledWith(100)
    expect(text).toContain('2026-09-26 ERROR boom')
  })

  it('切换行数后点刷新按新行数重拉当前页签', async () => {
    const wrapper = await mountView(buildRouter())

    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 500)
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text().includes('刷新'))!.trigger('click')
    await flushPromises()

    expect(getApplicationLogs).toHaveBeenLastCalledWith(500)
    // 只重拉当前（应用）页签，错误日志不重复请求
    expect(getErrorLogs).toHaveBeenCalledTimes(1)
  })

  it('错误日志页签切换后刷新只拉错误日志', async () => {
    const wrapper = await mountView(buildRouter())

    await clickTab(wrapper, '错误日志')
    await wrapper.findAll('button').find((button) => button.text().includes('刷新'))!.trigger('click')
    await flushPromises()

    expect(getErrorLogs).toHaveBeenLastCalledWith(100)
    expect(getApplicationLogs).toHaveBeenCalledTimes(1)
  })

  it('日志文件页签：目录列表渲染、下钻后按相对路径重查', async () => {
    const wrapper = await mountView(buildRouter())

    await clickTab(wrapper, '日志文件')
    expect(getLogFiles).toHaveBeenCalledWith('')

    const text = wrapper.text()
    expect(text).toContain('application.log')
    expect(text).toContain('2 KB')
    expect(text).toContain('目录')

    getLogFiles.mockResolvedValueOnce([])
    const dirLink = wrapper.findAll('.el-link').find((node) => node.text().includes('logs'))!
    await dirLink.trigger('click')
    await flushPromises()

    expect(getLogFiles).toHaveBeenLastCalledWith('logs')
    expect(wrapper.text()).toContain('当前目录：/logs')
  })

  it('查看文件按相对路径与行数读取内容', async () => {
    const wrapper = await mountView(buildRouter())
    await clickTab(wrapper, '日志文件')

    const viewButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('查看'))!
    await viewButton.trigger('click')
    await flushPromises()

    expect(readLogFile).toHaveBeenCalledWith('application.log', 100)
    expect(wrapper.text()).toContain('line1')
    expect(wrapper.text()).toContain('2 行')
  })
})
