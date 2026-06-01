import axios from 'axios'
import { clearStoredSession, getStoredSession } from './session'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || '/api'

const request = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10_000,
})

request.interceptors.request.use((config) => {
  const token = getStoredSession()?.token

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

request.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status
    const body = error.response?.data

    if (status === 401) {
      clearStoredSession()
    }

    // 所有 4xx 业务错误：统一转为 resolved response，由 unwrap() 处理
    if (status && status >= 400 && status < 500 && body && typeof body.success === 'boolean') {
      return Promise.resolve(error.response)
    }

    return Promise.reject(error)
  },
)

export default request
