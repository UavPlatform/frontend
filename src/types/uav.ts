export interface UavItem {
  id: number
  uavName: string
  deviceId: string
  isOnline: boolean
}

export interface UavListResult {
  success: boolean
  message?: string
  list: UavItem[]
}

export type UavListMode = 'online' | 'all'

export interface LiveStartResponse {
  success: boolean
  message: string
}

export interface LiveCredentials {
  success: boolean
  roomId: string
  userId: string
  userSig: string
}

export interface DashboardStat {
  label: string
  value: number | string
  hint: string
  trend: string
  tone: 'primary' | 'success' | 'warning' | 'danger'
}
