import { apiGet, apiPost, apiPut, expectData, expectSuccess } from '../contract'
import type { Schemas } from '../contract'
import { setStoredSession } from '../session'

export type ProviderDrone = Schemas['ProviderDroneVO']
export type ProviderBorrow = Schemas['DroneBorrowVO']
export type ProviderAccount = Schemas['ProviderAccountVO']
export type AircraftModel = Schemas['AircraftModelVO']

export const getAircraftModels = async (): Promise<AircraftModel[]> => {
  const body = await apiGet('/api/aircraft-models')
  return expectData(body, '获取平台机型目录失败')
}

export const providerLogin = async (username: string, password: string) => {
  const body = await apiPost('/equipment/provider/login', { body: { username, password } })
  const data = expectData(body, '服务商登录失败')
  if (!data.token || !data.provider) throw new Error('服务商登录响应缺少令牌')
  setStoredSession({
    token: data.token,
    user: {
      id: data.provider.providerId,
      username: data.provider.username ?? username,
      displayName: data.provider.displayName ?? username,
      role: 'PROVIDER',
      teamName: '服务商',
    },
  })
  return data.provider
}

export const getProviderDrones = async (page = '0') => {
  const body = await apiGet('/equipment/provider/drones', { params: { page } })
  return expectData(body, '获取无人机列表失败')
}

export const registerProviderDrone = async (body: Schemas['ProviderDroneDTO']) => {
  const result = await apiPost('/equipment/provider/drones', { body })
  return expectData(result, '登记无人机失败')
}

export const updateProviderDrone = async (droneId: string, body: Schemas['ProviderDroneDTO']) => {
  const result = await apiPut('/equipment/provider/drones/{droneId}', { path: { droneId }, body })
  return expectData(result, '更新无人机资料失败')
}

export const setProviderDroneEnabled = async (droneId: string, enabled: boolean) => {
  const result = await apiPost('/equipment/provider/drones/{droneId}/enabled', {
    path: { droneId },
    body: { enabled },
  })
  return expectData(result, '修改无人机状态失败')
}

export const getProviderBorrows = async (page = '0') => {
  const body = await apiGet('/equipment/provider/borrows', { params: { page } })
  return expectData(body, '获取借用记录失败')
}

export const getProviderProfile = async () => {
  const body = await apiGet('/equipment/provider/me')
  return expectData(body, '获取服务商资料失败')
}

export const assertProviderSuccess = (body: { success?: boolean; message?: string | null }) =>
  expectSuccess(body, '服务商操作失败')
