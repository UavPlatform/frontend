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
    if (error.response?.status === 401) {
      clearStoredSession()
    }

    return Promise.reject(error)
  },
)

export default request
