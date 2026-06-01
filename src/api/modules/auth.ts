import request from '../request'
import { clearStoredSession, setStoredSession } from '../session'
import { BizError } from './order'
import type {
  AuthSession,
  LoginRequest,
  RegisterRequest,
  UserRecord,
} from '../../types/auth'

interface ApiResponse<T> {
  success: boolean
  code: number
  errorCode: string | null
  message: string | null
  data: T | null
}

function unwrap<T>(response: { data: ApiResponse<T> }, fallbackMsg: string): T {
  const body = response.data
  if (!body.success || !body.data) {
    throw new BizError(body.errorCode || 'UNKNOWN', body.message || fallbackMsg)
  }
  return body.data
}

const buildSession = (payload: LoginRequest, token: string, refreshToken?: string): AuthSession => ({
  token,
  refreshToken,
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  user: {
    username: payload.userName,
    displayName: payload.userName,
    role: 'web-user',
    teamName: 'UAV Web Console',
  },
})

export const logout = () => {
  clearStoredSession()
}

interface LoginData { token: string; refreshToken: string }

export const login = async (payload: LoginRequest): Promise<AuthSession> => {
  const response = await request.post<ApiResponse<LoginData>>('/user/login', payload)
  const data = unwrap(response, '登录失败')
  const session = buildSession(payload, data.token, data.refreshToken)
  setStoredSession(session)
  return session
}

interface RegisterData { userId: number; userName: string }

export const register = async (payload: RegisterRequest) => {
  const response = await request.post<ApiResponse<RegisterData>>('/user/register', payload)
  const data = unwrap(response, '注册失败')
  return { userId: data.userId, userName: data.userName }
}

interface RefreshData { token: string }

export const refreshAccessToken = async (refreshToken: string) => {
  const response = await request.post<ApiResponse<RefreshData>>('/user/refresh', null, {
    headers: { 'Refresh-Token': refreshToken },
  })
  const data = unwrap(response, '刷新令牌失败')
  return data.token
}

interface RecordsData { records: UserRecord[]; total: number; totalPages: number }

export const getLiveRecords = async (page: number = 0, size: number = 10) => {
  const response = await request.get<ApiResponse<RecordsData>>('/user/records', {
    params: { page, size }
  })
  return unwrap(response, '获取直播记录失败')
}

export const adminLogin = async (payload: { name: string; password: string }): Promise<AuthSession> => {
  const response = await request.post<ApiResponse<{ token: string; admin: { id: number; name: string; phoneNumber: string } }>>('/admin/login', payload)
  const data = unwrap(response, '管理员登录失败')

  const session: AuthSession = {
    token: data.token,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    user: {
      username: data.admin.name,
      displayName: data.admin.name,
      role: 'admin',
      teamName: 'UAV Admin Console',
    },
  }
  setStoredSession(session)
  return session
}
