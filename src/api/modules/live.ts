import request from '../request'
import { BizError } from './order'
import { getUavStatus } from './uav'
import type { LiveCredentials, LiveStartResponse, LiveState, UavDeviceStatus } from '../../types/uav'

interface ApiResponse<T> {
  success: boolean
  code: number
  errorCode: string | null
  message: string | null
  data: T | null
}

function unwrap<T>(response: { data: ApiResponse<T> }, fallbackMsg: string): T {
  const body = response.data
  if (!body.success || !body.data) {
    throw new BizError(body.errorCode || 'UNKNOWN', body.message || fallbackMsg)
  }
  return body.data
}

interface StartLiveData {
  requestId?: string
  roomId?: string
  ackConfirmed?: boolean
  liveState?: LiveState
  code?: string
}

export const requestStartLive = async (deviceId: string): Promise<LiveStartResponse> => {
  const response = await request.post<ApiResponse<StartLiveData>>('/live/req', null, {
    params: { deviceId },
  })
  const data = unwrap(response, '开播请求发送失败')
  return {
    success: true,
    code: data.code,
    message: data.code === 'LIVE_ALREADY_RUNNING' ? '图传已在运行中' : '开播请求已发送',
    roomId: data.roomId,
    requestId: data.requestId,
    ackConfirmed: data.ackConfirmed ?? false,
    liveState: data.liveState,
  }
}

interface PullCredentialsData {
  roomId: string
  userId: string
  userSig: string
  sdkAppId: number
  wsUrl: string
  ackConfirmed?: boolean
  liveState?: LiveState
}

export const getPullCredentials = async (
  deviceId: string,
  webUserId: string,
): Promise<LiveCredentials> => {
  const response = await request.post<ApiResponse<PullCredentialsData>>('/live/get', null, {
    params: { deviceId, webUserId },
  })
  const data = unwrap(response, '拉流凭证生成失败')
  return {
    success: true,
    roomId: data.roomId,
    userId: data.userId,
    userSig: data.userSig,
    sdkAppId: data.sdkAppId,
    wsUrl: data.wsUrl,
    ackConfirmed: data.ackConfirmed ?? false,
    liveState: data.liveState,
  }
}

export interface LiveStopOutcome {
  /** 后端 200 分支文案：设备已确认停止推流 / 停止命令已发送，等待设备确认 / 无人机已离线，直播已结束 / 直播未在运行，观看记录已结束 */
  message: string
  /** false = 「等待设备确认」分支（STOP_LIVE ACK 超时），平台直播态需轮询 /webUav/status 收敛 */
  settled: boolean
}

export const closeLive = async (deviceId: string): Promise<LiveStopOutcome> => {
  const response = await request.post<ApiResponse<null>>('/live/close', null, {
    params: { deviceId },
  })
  const body = response.data
  if (!body.success) {
    // 409 LIVE_STOP_REJECTED（设备拒绝）/ 404 设备未注册等业务分支
    throw new BizError(body.errorCode || 'LIVE_STOP_FAILED', body.message || '结束观看失败')
  }

  // t12 协议：Result<Void>，data 恒为 null，200 各分支仅以 message 文案区分；
  // 「停止命令已发送，等待设备确认」= ACK 超时分支，后端靠设备 LIVE_STOPPED 事件兜底。
  const settled = !(body.message ?? '').includes('等待设备确认')
  return {
    message: body.message || '结束观看完成',
    settled,
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 结束观看后收敛 UI：轮询单设备平台直播态，直到离开 RUNNING/STARTING（进入 IDLE）或次数用尽。
 * 用于 closeLive 的「等待设备确认」分支——后端等设备 LIVE_STOPPED 事件兜底，Web 端以 /webUav/status 为准。
 * 返回 true 表示已观测到终态；false 表示次数用尽或设备状态不可得。
 */
export const watchLiveStop = async (
  deviceId: string,
  onUpdate: (status: UavDeviceStatus) => void,
  options: { intervalMs?: number; maxAttempts?: number } = {},
): Promise<boolean> => {
  const intervalMs = options.intervalMs ?? 3000
  const maxAttempts = options.maxAttempts ?? 5

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(intervalMs)
    }

    let status: UavDeviceStatus
    try {
      status = await getUavStatus(deviceId)
    } catch {
      return false
    }

    onUpdate(status)

    if (!status.liveState || status.liveState === 'IDLE') {
      return true
    }
  }

  return false
}
