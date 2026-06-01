import request from '../request'
import { BizError } from './order'
import type { LiveCredentials, LiveStartResponse, LiveState } from '../../types/uav'

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

export const closeLive = async (deviceId: string): Promise<void> => {
  const response = await request.post<ApiResponse<null>>('/live/close', null, {
    params: { deviceId },
  })
  unwrap(response, '关闭观看会话失败')
}
