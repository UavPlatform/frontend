export type LiveState = 'IDLE' | 'STARTING' | 'RUNNING'

export interface UavRuntimeStatus {
  deviceId?: string
  uavId?: number
  uavName?: string
  longitude?: number
  latitude?: number
  altitude?: number
  speed?: number
  battery?: number
  flightStatus?: number
  operation?: string
  timestamp?: number
  receivedAt?: number
  stale?: boolean
}

export interface UavItem {
  id: number
  uavName: string
  deviceId?: string
  isOnline: boolean
  controllerModel?: string
  onlineStatus?: string
  liveState?: LiveState
  latestStatus?: UavRuntimeStatus | null
  isAvailable?: string
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
  code?: string
  roomId?: string
  requestId?: string
  ackConfirmed?: boolean
  liveState?: LiveState
}

export interface LiveCredentials {
  success: boolean
  roomId: string
  userId: string
  userSig: string
  sdkAppId: number
  wsUrl?: string
  ackConfirmed?: boolean
  liveState?: LiveState
}

export interface DashboardStat {
  label: string
  value: number | string
  hint: string
  trend: string
  tone: 'primary' | 'success' | 'warning' | 'danger'
}
