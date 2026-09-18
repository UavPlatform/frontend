import type { Schemas } from '../api/contract'

/**
 * 本文件是「契约 → 前端视图模型」的唯一转换层：
 * 凡是后端返回的结构一律从 `Schemas[...]` 取（禁止再手写字段），
 * 前端自己的视图字段（在线状态、列表包装、UI 元数据）才在本文件里补充声明。
 */

/** 平台直播态（后端 LiveSessionState） */
export type LiveState = 'IDLE' | 'STARTING' | 'RUNNING'

const LIVE_STATES: readonly string[] = ['IDLE', 'STARTING', 'RUNNING']

/** 契约里 liveState 是 string，前端在入口收敛为字面量联合 */
export const toLiveState = (value?: string | null): LiveState | undefined =>
  value && LIVE_STATES.includes(value) ? (value as LiveState) : undefined

/** 契约 UavRuntimeStatusVo：设备最近一次上报的运行状态 */
export type UavRuntimeStatus = Schemas['UavRuntimeStatusVo']

/** 契约 UavVo：GET /webUav/getUav 的列表项 */
export type BackendUavItem = Schemas['UavVo']

/** 契约 WebUavStatusVo：GET /webUav/status 的 data（liveState 已收敛为字面量） */
export type UavDeviceStatus = Omit<Schemas['WebUavStatusVo'], 'liveState'> & {
  liveState?: LiveState
}

/** 前端视图模型：在契约 UavVo 之上补齐在线/直播态（这两个字段由前端结合多路数据判定） */
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

/** 前端视图模型：POST /live/req 的 LiveStartVO + 本地提示文案 */
export interface LiveStartResponse {
  success: boolean
  message: string
  code?: string
  roomId?: string
  requestId?: string
  ackConfirmed?: boolean
  liveState?: LiveState
}

/** 前端视图模型：POST /live/get 的 PullCredentialsVO（liveState 已收敛为字面量） */
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
