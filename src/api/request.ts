import axios from 'axios'
import { clearStoredSession, getStoredSession, setStoredSession } from './session'
import type { OkBody } from './contract'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || '/api'

const request = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10_000,
})

/** 不带拦截器的裸客户端：专用于令牌刷新，避免 401 → 刷新请求自身再触发 401 的死循环 */
const rawRequest = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10_000,
})

// WEB P1-11：axios 拦截器 401 → 单飞刷新（POST /user/refresh，Refresh-Token 头，@SkipJwt）
// → 成功则原地更新会话并重放原请求（重放时 request 拦截器从会话注入新 token）；
//   失败（无 refreshToken / 刷新 401「无效的刷新令牌」/ 网络失败）→ 清会话并跳登录页。

/** POST /user/refresh 的 200 响应信封（类型来自 openapi 契约，不再手写） */
type RefreshApiResponse = OkBody<'/user/refresh', 'post'>

const doRefreshAccessToken = async (): Promise<string | null> => {
  const session = getStoredSession()
  if (!session?.refreshToken) {
    return null
  }

  try {
    const response = await rawRequest.post<RefreshApiResponse>('/user/refresh', null, {
      headers: { 'Refresh-Token': session.refreshToken },
    })
    const newToken = response.data.data?.token

    if (!response.data.success || !newToken) {
      return null
    }

    // 后端不轮换 refreshToken：仅原地更新 access token，保留 username/role 等会话字段
    setStoredSession({ ...session, token: newToken })
    return newToken
  } catch {
    return null
  }
}

/** 单飞：并发 401 共享同一次刷新调用，避免风暴（WS 建连预检复用此入口） */
export const refreshAccessTokenOnce = (() => {
  let refreshInFlight: Promise<string | null> | null = null

  return (): Promise<string | null> => {
    refreshInFlight ??= doRefreshAccessToken()
    return refreshInFlight.finally(() => {
      refreshInFlight = null
    })
  }
})()

/** 登出处理标记：并发请求同时刷新失败时只触发一次清会话+跳转 */
let authFailureHandling = false

const handleAuthFailure = () => {
  clearStoredSession()

  if (authFailureHandling) {
    return
  }
  authFailureHandling = true

  // 动态引入 router，避免 request ↔ router 模块初始化环；
  // Q7=A：运营台仅管理员单入口，登出一律回 /admin/login
  void import('../router').then(async ({ default: router }) => {
    try {
      await router.replace({ name: 'admin-login' })
    } finally {
      authFailureHandling = false
    }
  })
}

/** 供 WS 建连层复用 t18 登出链路：清会话 + 跳登录页（带防并发重复跳转） */
export const triggerAuthFailureLogout = () => {
  handleAuthFailure()
}

request.interceptors.request.use((config) => {
  const token = getStoredSession()?.token

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

/** 已重放标记：每个请求只允许一次「刷新 → 重放」，重放后仍 401 则登出 */
const retriedRequests = new WeakSet<object>()

request.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status
    const body = error.response?.data

    if (status === 401 && error.config) {
      if (!retriedRequests.has(error.config)) {
        const newToken = await refreshAccessTokenOnce()

        if (newToken) {
          retriedRequests.add(error.config)
          // 重放：request 拦截器会从（已更新的）会话注入新 access token
          return request(error.config)
        }
      }

      handleAuthFailure()
      return Promise.reject(error)
    }

    // 所有非 401 的 4xx 业务错误：统一转为 resolved response，由 unwrap() 处理
    if (status && status >= 400 && status < 500 && body && typeof body.success === 'boolean') {
      return Promise.resolve(error.response)
    }

    return Promise.reject(error)
  },
)

export default request
