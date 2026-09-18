import type { Schemas } from '../api/contract'

// 1B-5b（Q7=A）：普通用户登录/注册相关类型已随 LoginView 与 auth.ts login/register 移除；
// 保留运营台会话与观看记录所需类型。

/** 契约 RecordItem：GET /user/records 的 UserRecordsVO.records 条目 */
export type UserRecord = Schemas['RecordItem']

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
