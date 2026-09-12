import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { getStoredSession, setStoredSession } from '../../src/api/session'

const { createMock, instances } = vi.hoisted(() => {
  const instances: any[] = []
  const createMock = vi.fn(() => {
    // axios 实例既是可调用对象（request(config) 重放入口），也挂拦截器与方法
    const instance: any = Object.assign(vi.fn(() => Promise.resolve({ status: 200, data: {} })), {
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      post: vi.fn(),
      get: vi.fn(),
    })
    instances.push(instance)
    return instance
  })
  return { createMock, instances }
})

vi.mock('axios', () => ({
  default: { create: createMock },
}))

const { routerReplace, currentRoute } = vi.hoisted(() => {
  const replace = vi.fn(() => Promise.resolve())
  return {
    routerReplace: replace,
    currentRoute: { value: { name: 'dashboard' } },
  }
})

vi.mock('../../src/router', () => ({
  default: { currentRoute, replace: routerReplace },
}))

await import('../../src/api/request')

const requestInstance = instances[0]
const rawInstance = instances[1]
const responseErrorHandler = requestInstance.interceptors.response.use.mock.calls[0][1] as (
  error: unknown,
) => Promise<unknown>
const requestInterceptor = requestInstance.interceptors.request.use.mock.calls[0][0] as (
  config: Record<string, unknown>,
) => Record<string, unknown>
const rawPost = rawInstance.post as Mock
const replayCall = requestInstance as unknown as Mock

const buildSession = () => ({
  token: 'stale-token',
  refreshToken: 'refresh-token',
  user: {
    username: 'operator',
    displayName: '运营员',
    role: 'web-user',
    teamName: 'UAV Web Console',
  },
})

const buildError = (status: number, config: Record<string, unknown>) => ({
  response: {
    status,
    data: { success: false, code: status, errorCode: 'UNAUTHORIZED', message: 'unauthorized' },
  },
  config,
})

describe('request.ts 401 刷新链（WEB P1-11 / 1A-6d）', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
    rawPost.mockResolvedValue({ data: { success: true, data: { token: 'new-token' } } })
  })

  it('401 → 刷新成功 → 原请求重放且会话 token 已换发', async () => {
    setStoredSession(buildSession())
    const config = { url: '/user/records', headers: {} }
    replayCall.mockResolvedValueOnce({ status: 200, data: { success: true } })

    const result = (await responseErrorHandler(buildError(401, config))) as { status: number }

    expect(rawPost).toHaveBeenCalledTimes(1)
    expect(rawPost.mock.calls[0][0]).toBe('/user/refresh')
    expect((rawPost.mock.calls[0][2] as { headers: Record<string, string> }).headers['Refresh-Token']).toBe(
      'refresh-token',
    )
    expect(getStoredSession()?.token).toBe('new-token')
    expect(replayCall).toHaveBeenCalledWith(config)
    expect(result.status).toBe(200)
  })

  it('401 → 刷新失败 → 清会话并复用 t18 登出链路跳登录页', async () => {
    setStoredSession(buildSession())
    rawPost.mockRejectedValueOnce(new Error('invalid refresh token'))

    await expect(responseErrorHandler(buildError(401, { headers: {} }))).rejects.toMatchObject({
      response: { status: 401 },
    })

    expect(window.localStorage.getItem('uav-console-session')).toBeNull()
    // 1B-5b（Q7=A）：运营台仅管理员单入口，登出统一回 admin-login
    await vi.waitFor(() => expect(routerReplace).toHaveBeenCalledWith({ name: 'admin-login' }))
  })

  it('并发 401 单飞刷新：/user/refresh 仅调用一次，请求均被重放', async () => {
    setStoredSession(buildSession())
    rawPost.mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ data: { success: true, data: { token: 'race-token' } } }), 20),
        ),
    )
    replayCall.mockResolvedValue({ status: 200 })

    await Promise.all([
      responseErrorHandler(buildError(401, { url: '/a', headers: {} })),
      responseErrorHandler(buildError(401, { url: '/b', headers: {} })),
    ])

    expect(rawPost).toHaveBeenCalledTimes(1)
    expect(replayCall).toHaveBeenCalledTimes(2)
    expect(getStoredSession()?.token).toBe('race-token')
  })

  it('重放后仍 401 → 不再二次刷新，直接走登出链路', async () => {
    setStoredSession(buildSession())
    const config = { url: '/user/records', headers: {} }
    const err1 = buildError(401, config)
    const err2 = buildError(401, config) // 同一 config 对象 → WeakSet 命中

    replayCall.mockRejectedValueOnce(err2)
    await expect(responseErrorHandler(err1)).rejects.toMatchObject({ response: { status: 401 } })
    await expect(responseErrorHandler(err2)).rejects.toMatchObject({ response: { status: 401 } })

    expect(rawPost).toHaveBeenCalledTimes(1)
    // 1B-5b（Q7=A）：运营台仅管理员单入口，登出统一回 admin-login
    await vi.waitFor(() => expect(routerReplace).toHaveBeenCalledWith({ name: 'admin-login' }))
  })

  it('非 401 的 4xx 业务错误维持 resolve 语义，不触发刷新', async () => {
    setStoredSession(buildSession())
    const error = {
      response: { status: 404, data: { success: false, code: 404, message: 'not found' } },
      config: { headers: {} },
    }

    await expect(responseErrorHandler(error)).resolves.toBe(error.response)
    expect(rawPost).not.toHaveBeenCalled()
  })

  it('请求拦截器从会话注入 Bearer token', () => {
    setStoredSession(buildSession())

    const out = requestInterceptor({ headers: {} }) as { headers: Record<string, string> }

    expect(out.headers.Authorization).toBe('Bearer stale-token')
  })
})
