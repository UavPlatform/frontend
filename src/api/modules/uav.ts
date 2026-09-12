import request from '../request'
import { BizError } from './order'
import type { LiveState, UavDeviceStatus, UavItem, UavListResult } from '../../types/uav'

/** 后端 UavVo（GET /webUav/getUav 列表项）：不含 wsConnected/onlineStatus/liveState/latestStatus */
interface BackendUavItem {
  id: number
  uavName: string
  djiId?: string
  controllerModel?: string
  isAvailable?: string
}

/** 后端统一返回体 Result<T>：{ success, code, errorCode, message, data } */
interface BackendEnvelope<T> {
  success: boolean
  code?: number
  errorCode?: string | null
  message?: string | null
  data?: T
}

const toLiveState = (value?: string | null): LiveState | undefined =>
  value === 'IDLE' || value === 'STARTING' || value === 'RUNNING' ? value : undefined

const mapBackendUav = (item: BackendUavItem, isOnline: boolean): UavItem => {
  return {
    id: item.id,
    uavName: item.uavName,
    deviceId: item.djiId,
    isOnline,
    controllerModel: item.controllerModel,
    isAvailable: item.isAvailable,
  }
}

const fetchUavList = async (onlyOnline: boolean): Promise<UavListResult> => {
  const response = await request.get<BackendEnvelope<BackendUavItem[]>>('/webUav/getUav', {
    params: { onlineOnly: onlyOnline },
  })
  const body = response.data
  if (!body.success) {
    throw new BizError(body.errorCode || 'UAV_LIST_FAILED', body.message || '获取无人机列表失败')
  }

  // 列表数据在 Result.data 数组中；onlineOnly=true 时由后端过滤出在线设备。
  // 全量列表不含在线状态字段，调用方需结合在线列表（或 /webUav/status）判定 isOnline。
  const items = body.data ?? []
  return {
    success: true,
    list: items.map((item) => mapBackendUav(item, onlyOnline)),
  }
}

export const listOnlineUavs = async (): Promise<UavListResult> => fetchUavList(true)

export const listAllUavs = async (): Promise<UavListResult> => fetchUavList(false)

/** 单设备实时状态（GET /webUav/status）：补齐列表 VO 缺失的在线/直播状态 */
export const getUavStatus = async (deviceId: string): Promise<UavDeviceStatus> => {
  const response = await request.get<BackendEnvelope<UavDeviceStatus>>('/webUav/status', {
    params: { deviceId },
  })
  const body = response.data
  if (!body.success || !body.data) {
    throw new BizError(body.errorCode || 'UAV_STATUS_FAILED', body.message || '获取无人机状态失败')
  }

  return {
    ...body.data,
    liveState: toLiveState(body.data.liveState),
  }
}
