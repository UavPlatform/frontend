// 1B-5b（Q7=A）：普通用户登录/注册相关类型已随 LoginView 与 auth.ts login/register 移除；
// REQ-FRONTEND-001：观看记录类型（UserRecord）随 RecordsView 移除，仅保留会话类型。

/** 前端本地会话模型（localStorage），不属于后端契约 */
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
