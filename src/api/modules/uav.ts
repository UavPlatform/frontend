import request from '../request'
import type { LiveState, UavItem, UavListResult, UavRuntimeStatus } from '../../types/uav'

interface BackendUavItem {
  id: number
  uavName: string
  djiId: string
  controllerModel?: string
  onlineStatus?: string
  wsConnected: boolean
  liveState?: LiveState
  latestStatus?: UavRuntimeStatus | null
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
    isOnline: item.wsConnected,
    controllerModel: item.controllerModel,
    onlineStatus: item.onlineStatus,
    liveState: item.liveState,
    latestStatus: item.latestStatus,
  }
}

const fetchUavList = async (onlyOnline: boolean): Promise<UavListResult> => {
  const response = await request.get<BackendUavListResponse>(url)
  const items = response.data.uav ?? []
  const filteredItems = onlyOnline ? items.filter((item) => item.wsConnected) : items

  return {
    success: response.data.success,
    message: response.data.message,
    list: filteredItems.map((item) => mapBackendUav(item)),
  }
}

const url = '/webUav/getUav'

export const listOnlineUavs = async (): Promise<UavListResult> => fetchUavList(true)

export const listAllUavs = async (): Promise<UavListResult> => fetchUavList(false)
