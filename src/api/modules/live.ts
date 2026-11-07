import { apiPost, expectData, expectSuccess } from '../contract'
import { toLiveState } from '../../types/uav'
import type { LiveCredentials } from '../../types/uav'

export const getPullCredentials = async (
  deviceId: string,
  webUserId: string,
): Promise<LiveCredentials> => {
  // 契约：POST /live/get?deviceId=…&webUserId=… → Result<PullCredentialsVO>
  // webUserId 仅用于本地日志/占位；TRTC 身份由服务端从登录态生成（客户端不可指定）。
  void webUserId
  const body = await apiPost('/live/get', { params: { deviceId } })
  const data = expectData(body, '拉流凭证生成失败')

  return {
    success: true,
    roomId: data.roomId ?? '',
    userId: data.userId ?? '',
    userSig: data.userSig ?? '',
    sdkAppId: data.sdkAppId ?? 0,
    wsUrl: data.wsUrl,
    ackConfirmed: data.ackConfirmed ?? false,
    liveState: toLiveState(data.liveState),
  }
}

/**
 * POST /live/leave：退出观看（1B-4b 微端点）。
 * 仅结束当前登录用户在该设备的观看记录，不动推流与直播会话；幂等。
 * 用于监管页切换/离开设备；不得以设备停播命令代替本人退出。
 */
export const leaveLive = async (deviceId: string): Promise<void> => {
  const body = await apiPost('/live/leave', { params: { deviceId } })
  expectSuccess(body, '退出观看失败')
}
