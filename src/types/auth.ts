export interface LoginRequest {
  userName: string
  password: string
}

export interface RegisterRequest {
  userName: string
  password: string
}

export interface LoginResponse {
  success: boolean
  token?: string
  refreshToken?: string
  message?: string
}

export interface RegisterResponse {
  success: boolean
  userId?: number
  userName?: string
  message?: string
}

export interface RefreshTokenResponse {
  success: boolean
  token?: string
  message?: string
}

export interface UserProfile {
  id?: number
  username: string
  displayName: string
  role: string
  teamName: string
}

export interface AuthSession {
  token: string
  refreshToken?: string
  expiresAt: string
  user: UserProfile
}

export interface UserRecord {
  id: number
  userName: string
  djiId: string
  start_time: string
  end_time: string
}

export interface RecordsResponse {
  success: boolean
  records: UserRecord[]
  total: number
  page: number
  size: number
  totalPages: number
  message?: string
}
