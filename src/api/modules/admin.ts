import request from '../request'
import type { AdminLoginRequest, AdminStatistics, LiveUav, UavDetail } from '../../types/admin'
import { setStoredSession } from '../session'

interface AdminLoginApiResponse {
  success: boolean
  message: string
  data?: {
    token: string
    admin: {
      id: number
      name: string
      phoneNumber?: string
    }
  }
}

export const adminLogin = async (data: AdminLoginRequest): Promise<{ success: boolean; message: string }> => {
  const response = await request.post<AdminLoginApiResponse>('/admin/login', data)

  if (response.data.success && response.data.data?.token && response.data.data?.admin) {
    setStoredSession({
      token: response.data.data.token,
      user: {
        id: response.data.data.admin.id,
        username: response.data.data.admin.name,
        displayName: response.data.data.admin.name,
        role: 'ADMIN',
        teamName: 'Admin'
      }
    })
  }

  return {
    success: response.data.success,
    message: response.data.message
  }
}

export const getAdminStatistics = async (): Promise<AdminStatistics> => {
  const response = await request.get<{ success: boolean; data: AdminStatistics }>('/admin/uav/statistics')

  if (!response.data.success || !response.data.data) {
    return {
      totalUavs: 0,
      onlineUavs: 0,
      availableUavs: 0,
      liveUavs: 0,
      offlineUavs: 0,
      unavailableUavs: 0,
      totalUsers: 0
    }
  }

  return response.data.data
}

export const getAllUavs = async (): Promise<UavDetail[]> => {
  const response = await request.get<{ success: boolean; data?: UavDetail[]; message?: string }>('/admin/uav')

  if (!response.data.success || !response.data.data) {
    return []
  }

  return response.data.data
}

export const updateUavAvailable = async (deviceId: string, isAvailable: '0' | '1') => {
  const response = await request.post<{ success: boolean; message: string }>('/admin/uav/available', null, {
    params: { deviceId, isAvailable }
  })

  if (!response.data.success) {
    throw new Error(response.data.message ?? '修改无人机可用状态失败')
  }

  return response.data
}

export const getLiveUavs = async (): Promise<LiveUav[]> => {
  const response = await request.get<{ success: boolean; data?: LiveUav[]; message?: string }>('/admin/uav/live')

  if (!response.data.success || !response.data.data) {
    return []
  }

  return response.data.data
}

/** 后端 Result<LogVO>：{ success, code, errorCode, message, data: { logs } } */
interface LogApiResponse {
  success: boolean
  code?: number
  errorCode?: string | null
  message?: string | null
  data?: { logs?: string[] }
}

const parseLogs = (
  response: { data: LogApiResponse },
  fallbackMsg: string,
): string[] => {
  const body = response.data
  if (!body.success || !body.data) {
    throw new Error(body.message || fallbackMsg)
  }
  return body.data.logs ?? []
}

export const getApplicationLogs = async (lines: number = 100): Promise<string[]> => {
  const response = await request.get<LogApiResponse>('/admin/logs/application', {
    params: { lines }
  })
  return parseLogs(response, '获取应用日志失败')
}

export const getErrorLogs = async (lines: number = 100): Promise<string[]> => {
  const response = await request.get<LogApiResponse>('/admin/logs/error', {
    params: { lines }
  })
  return parseLogs(response, '获取错误日志失败')
}
