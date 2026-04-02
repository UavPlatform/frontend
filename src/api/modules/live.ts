import request from '../request'
import type { LiveCredentials, LiveStartResponse, LiveState } from '../../types/uav'
import axios, { type AxiosError } from 'axios'

interface BackendErrorResponse {
  success?: boolean
  code?: string
  message?: string
}

interface LiveActionResponse {
  success: boolean
  code?: string
  message?: string
  requestId?: string
  roomId?: string
  ackConfirmed?: boolean
  liveState?: LiveState
}

interface LiveCredentialsResponse extends LiveActionResponse {
  roomId?: string
  userId?: string
  userSig?: string
  sdkAppId?: number
  wsUrl?: string
}

export const requestStartLive = async (deviceId: string): Promise<LiveStartResponse> => {
  try {
    const response = await request.post<LiveActionResponse>('/live/req', null, {
      params: { deviceId },
    })

    if (!response.data.success) {
      throw new Error(response.data.message ?? '开播请求发送失败')
    }

    return {
      success: true,
      code: response.data.code,
      message: response.data.message ?? '开播请求已发送',
      roomId: response.data.roomId,
      requestId: response.data.requestId,
      ackConfirmed: response.data.ackConfirmed ?? false,
      liveState: response.data.liveState,
    }
  } catch (error) {
    throw new Error(extractBackendMessage(error, '开播请求发送失败'))
  }
}

export const getPullCredentials = async (
  deviceId: string,
  webUserId: string,
): Promise<LiveCredentials> => {
  try {
    const response = await request.post<LiveCredentialsResponse>('/live/get', null, {
      params: { deviceId, webUserId },
    })

    if (!response.data.success || !response.data.roomId || !response.data.userId || !response.data.userSig || !response.data.sdkAppId) {
      throw new Error(response.data.message ?? '拉流凭证生成失败')
    }

    return {
      success: true,
      roomId: response.data.roomId,
      userId: response.data.userId,
      userSig: response.data.userSig,
      sdkAppId: response.data.sdkAppId,
      wsUrl: response.data.wsUrl,
      ackConfirmed: response.data.ackConfirmed ?? false,
      liveState: response.data.liveState,
    }
  } catch (error) {
    throw new Error(extractBackendMessage(error, '拉流凭证生成失败'))
  }
}

export const closeLive = async (deviceId: string): Promise<void> => {
  try {
    const response = await request.post<LiveActionResponse>('/live/close', null, {
      params: { deviceId },
    })

    if (!response.data.success) {
      throw new Error(response.data.message ?? '关闭观看会话失败')
    }
  } catch (error) {
    throw new Error(extractBackendMessage(error, '关闭观看会话失败'))
  }
}

const extractBackendMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<BackendErrorResponse>
    const backendMessage = axiosError.response?.data?.message
    if (typeof backendMessage === 'string' && backendMessage.trim()) {
      return backendMessage
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return fallback
}
