export interface UavDetail {
  id: number
  uavName: string
  djiId: string
  isAvailable: string
  lastActiveTime: string
  onlineStatus?: string
  uavCreateTime?: string
  controllerModel?: string
}

export interface LiveUav {
  deviceId: string
  uavName: string
  roomId: string
  requestId: string
  updatedAt: number
  onlineStatus: string
  isAvailable: string
}

export interface AdminStatistics {
  totalUavs: number
  onlineUavs: number
  availableUavs: number
  liveUavs: number
  offlineUavs: number
  unavailableUavs: number
  totalUsers: number
}

export interface AdminLoginRequest {
  name: string
  password: string
}

export interface AdminLoginResponse {
  success: boolean
  message: string
  token?: string
  user?: {
    id: number
    name: string
    role: string
  }
}
