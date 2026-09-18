import { apiGet, apiPost, expectData } from '../contract'
import type { AdminLoginRequest, AdminStatistics, LiveUav, UavDetail } from '../../types/admin'
import { setStoredSession } from '../session'

// 管理端接口。请求/响应结构一律来自 OpenAPI 契约（src/api/contract.ts），不再手写信封与字段。

export const adminLogin = async (data: AdminLoginRequest): Promise<{ success: boolean; message: string }> => {
  // 契约：POST /admin/login（body=AdminDto）→ Result<AdminLoginVO>
  const body = await apiPost('/admin/login', { body: data })

  if (body.success && body.data?.token && body.data.admin) {
    setStoredSession({
      token: body.data.token,
      user: {
        id: body.data.admin.id ?? 0,
        username: body.data.admin.name ?? '',
        displayName: body.data.admin.name ?? '',
        role: 'ADMIN',
        teamName: 'Admin',
      },
    })
  }

  return {
    success: body.success ?? false,
    message: body.message ?? '',
  }
}

export const getAdminStatistics = async (): Promise<AdminStatistics> => {
  // 契约：GET /admin/uav/statistics → Result<AdminStatisticsVO>
  const body = await apiGet('/admin/uav/statistics')

  if (!body.success || !body.data) {
    return {
      totalUavs: 0,
      onlineUavs: 0,
      availableUavs: 0,
      liveUavs: 0,
      offlineUavs: 0,
      unavailableUavs: 0,
      totalUsers: 0,
    }
  }

  return body.data
}

export const getAllUavs = async (): Promise<UavDetail[]> => {
  // 契约：GET /admin/uav → Result<List<Uav>>
  const body = await apiGet('/admin/uav')

  if (!body.success || !body.data) {
    return []
  }

  return body.data
}

export const updateUavAvailable = async (deviceId: string, isAvailable: '0' | '1') => {
  // 契约：POST /admin/uav/available?deviceId=…&isAvailable=… → Result<Void>
  const body = await apiPost('/admin/uav/available', { params: { deviceId, isAvailable } })

  if (!body.success) {
    throw new Error(body.message ?? '修改无人机可用状态失败')
  }

  return { success: true, message: body.message ?? '' }
}

export const getLiveUavs = async (): Promise<LiveUav[]> => {
  // 契约：GET /admin/uav/live → Result<List<LiveUavVO>>
  const body = await apiGet('/admin/uav/live')

  if (!body.success || !body.data) {
    return []
  }

  return body.data
}

// 两个日志端点各自成函数（而不是共享一个「路径当参数」的 helper）：
// 端点字面量必须出现在调用点，消费侧门禁才能机器核对「登记表 ↔ 代码」一致。

/** GET /admin/logs/application → Result<LogVO>：data.logs 为日志行 */
export const getApplicationLogs = async (lines: number = 100): Promise<string[]> => {
  const body = await apiGet('/admin/logs/application', { params: { lines } })
  const data = expectData(body, '获取应用日志失败')
  return data.logs ?? []
}

/** GET /admin/logs/error → Result<LogVO>：data.logs 为日志行 */
export const getErrorLogs = async (lines: number = 100): Promise<string[]> => {
  const body = await apiGet('/admin/logs/error', { params: { lines } })
  const data = expectData(body, '获取错误日志失败')
  return data.logs ?? []
}
