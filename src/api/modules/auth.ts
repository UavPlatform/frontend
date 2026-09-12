import request from '../request'
import { clearStoredSession } from '../session'
import { BizError } from './order'
import type { UserRecord } from '../../types/auth'

// 1B-5b（Q7=A）：运营台收敛为管理员单入口——普通用户 /user/login、/user/register 登录注册
// 已随 LoginView 移除；管理员登录见 admin.ts（/admin/login）。

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

export const logout = () => {
  clearStoredSession()
}

interface RecordsData { records: UserRecord[]; total: number; totalPages: number }

export const getLiveRecords = async (page: number = 0, size: number = 10) => {
  const response = await request.get<ApiResponse<RecordsData>>('/user/records', {
    params: { page, size }
  })
  return unwrap(response, '获取直播记录失败')
}
