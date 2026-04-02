import request from '../request'
import type { UavDetail, LiveUav, AdminStatistics } from '../../types/admin'

// 无人机管理接口
export const updateUavAvailable = async (deviceId: string, isAvailable: '0' | '1') => {
  const response = (await request.post('/admin/uav/available', {
    deviceId,
    isAvailable
  })) as {
    data: { success: boolean; message: string }
  }

  if (!response.data.success) {
    throw new Error(response.data.message ?? '修改无人机可用状态失败')
  }

  return response.data
}

export const getUavDetail = async (deviceId: string): Promise<UavDetail> => {
  const response = (await request.get('/admin/uav/detail', {
    params: { deviceId }
  })) as {
    data: { success: boolean; message: string; data: UavDetail }
  }

  if (!response.data.success) {
    throw new Error(response.data.message ?? '获取无人机详情失败')
  }

  return response.data.data
}

export const getLiveUavs = async (): Promise<LiveUav[]> => {
  const response = (await request.get('/admin/uav/live')) as {
    data: { success: boolean; message: string; data: LiveUav[] }
  }

  if (!response.data.success) {
    throw new Error(response.data.message ?? '获取正在直播的无人机失败')
  }

  return response.data.data
}

export const getAdminStatistics = async (): Promise<AdminStatistics> => {
  const response = (await request.get('/admin/uav/statistics')) as {
    data: { success: boolean; message: string; data: AdminStatistics }
  }

  if (!response.data.success) {
    throw new Error(response.data.message ?? '获取统计信息失败')
  }

  return response.data.data
}

// 日志管理接口
export const getApplicationLogs = async (lines: number = 100): Promise<string[]> => {
  const response = (await request.get('/admin/logs/application', {
    params: { lines }
  })) as {
    data: { success: boolean; message: string; logs: string[] }
  }

  if (!response.data.success) {
    throw new Error(response.data.message ?? '获取应用日志失败')
  }

  return response.data.logs
}

export const getErrorLogs = async (lines: number = 100): Promise<string[]> => {
  const response = (await request.get('/admin/logs/error', {
    params: { lines }
  })) as {
    data: { success: boolean; message: string; logs: string[] }
  }

  if (!response.data.success) {
    throw new Error(response.data.message ?? '获取错误日志失败')
  }

  return response.data.logs
}
