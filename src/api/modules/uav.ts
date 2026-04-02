import request from '../request'
import type { LiveState, UavItem, UavListResult, UavRuntimeStatus } from '../../types/uav'

interface BackendUavItem {
  id: number
  uavName: string
  djiId?: string
  controllerModel?: string
  onlineStatus?: string
  wsConnected?: boolean
  liveState?: LiveState
  latestStatus?: UavRuntimeStatus | null
  isAvailable?: string
}

interface BackendUavListResponse {
  success: boolean
  code?: string
  message?: string
  uav?: BackendUavItem[]
}

const mapBackendUav = (item: BackendUavItem): UavItem => {
  return {
    id: item.id,
    uavName: item.uavName,
    deviceId: item.djiId,
    isOnline: item.wsConnected === true,
    controllerModel: item.controllerModel,
    onlineStatus: item.onlineStatus,
    liveState: item.liveState,
    latestStatus: item.latestStatus,
    isAvailable: item.isAvailable,
  }
}

const fetchUavList = async (onlyOnline: boolean): Promise<UavListResult> => {
  const response = await request.get<BackendUavListResponse>(url)
  const items = response.data.uav ?? []
  const filteredItems = onlyOnline ? items.filter((item) => item.wsConnected === true) : items
  const onlineUnavailable = onlyOnline && items.length > 0 && items.every((item) => item.wsConnected == null)

  return {
    success: response.data.success,
    message: onlineUnavailable ? '当前后端列表接口未返回在线状态，在线机队暂不可用' : response.data.message,
    list: filteredItems.map((item) => mapBackendUav(item)),
  }
}

const url = '/webUav/getUav'

export const listOnlineUavs = async (): Promise<UavListResult> => fetchUavList(true)

export const listAllUavs = async (): Promise<UavListResult> => fetchUavList(false)
