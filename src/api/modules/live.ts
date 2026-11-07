import { apiGet, apiPost, expectData, expectSuccess } from '../contract'
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
 * GET /dispatch/orders/{orderId}/live：订单级直播态。
 * 与设备级 `/live/get` 的区别：订单直播按「飞行连接」发凭证，
 * 房间由后端按 liveId 派生，观众只能拿接收权限票据（ADR-0004 只读旁听）。
 */
export const getOrderLive = async (orderId: string) =>
  expectData(
    await apiGet('/dispatch/orders/{orderId}/live', { path: { orderId } }),
    '读取订单直播状态失败',
  )

/**
 * POST /dispatch/orders/{orderId}/live/{liveId}/watch：订单直播观看凭证。
 * 后端按观众身份现签 UserSig + privateMapKey（接收权限），并带 publisherUserId
 * 供播放端过滤——房间里可能同时有多个上行用户，只订阅本单主播。
 */
export const watchOrderLive = async (
  orderId: string,
  liveId: string,
): Promise<LiveCredentials> => {
  const ticket = expectData(
    await apiPost('/dispatch/orders/{orderId}/live/{liveId}/watch', { path: { orderId, liveId } }),
    '获取订单直播凭证失败',
  )

  return {
    success: true,
    roomId: ticket.roomId ?? '',
    userId: ticket.userId ?? '',
    userSig: ticket.userSig ?? '',
    sdkAppId: ticket.sdkAppId ?? 0,
    privateMapKey: ticket.privateMapKey,
    publisherUserId: ticket.publisherUserId,
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
