import request from '../request'
import type { UavItem, UavListResult } from '../../types/uav'

interface BackendUavItem {
  id: number
  uavName: string
  djiId: string
}

interface BackendUavListResponse {
  success: boolean
  message?: string
  uav?: BackendUavItem[]
}

const mapBackendUav = (item: BackendUavItem, isOnline: boolean): UavItem => ({
  id: item.id,
  uavName: item.uavName,
  deviceId: item.djiId,
  isOnline,
})

const fetchUavList = async (url: string, isOnline: boolean, onlineOnly?: boolean): Promise<UavListResult> => {
  const response = (await request.get(url, { params: { onlineOnly } })) as { data: BackendUavListResponse }

  return {
    success: response.data.success,
    message: response.data.message,
    list: (response.data.uav ?? []).map((item) => mapBackendUav(item, isOnline)),
  }
}

export const listOnlineUavs = async (): Promise<UavListResult> => fetchUavList('/webUav/getUav', true, true)

export const listAllUavs = async (): Promise<UavListResult> => fetchUavList('/webUav/getUav', false, false)
