import request from '../request'
import type { LiveCredentials, LiveStartResponse } from '../../types/uav'

interface LiveActionResponse {
  success: boolean
  message?: string
}

interface LiveCredentialsResponse extends LiveActionResponse {
  roomId?: string
  userId?: string
  userSig?: string
}

export const requestStartLive = async (deviceId: string): Promise<LiveStartResponse> => {
  const response = (await request.post('/live/req', null, {
    params: { deviceId },
  })) as { data: LiveActionResponse }

  if (!response.data.success) {
    throw new Error(response.data.message ?? '开播请求发送失败')
  }

  return {
    success: true,
    message: response.data.message ?? '开播请求已发送',
  }
}

export const getPullCredentials = async (
  deviceId: string,
  webUserId: string,
): Promise<LiveCredentials> => {
  const response = (await request.post('/live/get', null, {
    params: { deviceId, webUserId },
  })) as { data: LiveCredentialsResponse }

  if (!response.data.success || !response.data.roomId || !response.data.userId || !response.data.userSig) {
    throw new Error(response.data.message ?? '拉流凭证生成失败')
  }

  return {
    success: true,
    roomId: response.data.roomId,
    userId: response.data.userId,
    userSig: response.data.userSig,
  }
}
