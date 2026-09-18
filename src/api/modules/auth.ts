import { apiGet, expectData } from '../contract'
import { clearStoredSession } from '../session'
import type { UserRecord } from '../../types/auth'

// 1B-5b（Q7=A）：运营台收敛为管理员单入口——普通用户 /user/login、/user/register 登录注册
// 已随 LoginView 移除；管理员登录见 admin.ts（/admin/login）。

export const logout = () => {
  clearStoredSession()
}

export interface RecordsData {
  records: UserRecord[]
  total: number
  totalPages: number
}

/** 契约：GET /user/records?page=&size= → Result<UserRecordsVO> */
export const getLiveRecords = async (page: number = 0, size: number = 10): Promise<RecordsData> => {
  const body = await apiGet('/user/records', { params: { page, size } })
  const data = expectData(body, '获取直播记录失败')

  return {
    records: data.records ?? [],
    total: data.total ?? 0,
    totalPages: data.totalPages ?? 0,
  }
}
