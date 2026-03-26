import request from '../request'
import { clearStoredSession, setStoredSession } from '../session'
import type {
  AuthSession,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  RefreshTokenResponse,
} from '../../types/auth'

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

export const login = async (payload: LoginRequest): Promise<AuthSession> => {
  const response = (await request.post('/user/login', payload)) as { data: LoginResponse }

  if (!response.data.success || !response.data.token) {
    throw new Error(response.data.message ?? '登录失败')
  }

  const session = buildSession(payload, response.data.token, response.data.refreshToken)
  setStoredSession(session)
  return session
}

export const register = async (payload: RegisterRequest) => {
  const response = (await request.post('/user/register', payload)) as {
    data: RegisterResponse
  }

  if (!response.data.success || !response.data.userId) {
    throw new Error(response.data.message ?? '注册失败')
  }

  return {
    userId: response.data.userId,
    userName: response.data.userName ?? payload.userName,
  }
}

export const refreshAccessToken = async (refreshToken: string) => {
  const response = (await request.post('/user/refresh', null, {
    headers: {
      'Refresh-Token': refreshToken,
    },
  })) as { data: RefreshTokenResponse }

  if (!response.data.success || !response.data.token) {
    throw new Error(response.data.message ?? '刷新令牌失败')
  }

  return response.data.token
}
