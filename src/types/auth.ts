// 1B-5b（Q7=A）：普通用户登录/注册相关类型已随 LoginView 与 auth.ts login/register 移除；
// 保留运营台会话与观看记录所需类型。
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
  user: UserProfile
}

export interface UserRecord {
  id: number
  djiId: string
  startTime: string
  endTime: string
}
