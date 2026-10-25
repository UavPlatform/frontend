import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearStoredSession, getStoredSession } from '../../src/api/session'
import {
  getAircraftModels,
  getProviderBorrows,
  getProviderDrones,
  getProviderProfile,
  providerLogin,
  registerProviderDrone,
  setProviderDroneEnabled,
  updateProviderDrone,
} from '../../src/api/modules/provider'

const { apiGet, apiPost, apiPut } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
}))

vi.mock('../../src/api/contract', async (original) => ({
  ...await original<typeof import('../../src/api/contract')>(),
  apiGet,
  apiPost,
  apiPut,
}))

describe('provider API module', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    clearStoredSession()
  })

  it('stores a provider session from the login response', async () => {
    apiPost.mockResolvedValue({
      success: true,
      data: {
        token: 'provider-token',
        provider: { providerId: 7, username: 'acme', displayName: 'ACME 航空' },
      },
    })

    await expect(providerLogin('acme', 'secret')).resolves.toMatchObject({
      providerId: 7,
      username: 'acme',
    })
    expect(apiPost).toHaveBeenCalledWith('/equipment/provider/login', {
      body: { username: 'acme', password: 'secret' },
    })
    expect(getStoredSession()).toMatchObject({
      token: 'provider-token',
      user: {
        id: 7,
        username: 'acme',
        displayName: 'ACME 航空',
        role: 'PROVIDER',
        teamName: '服务商',
      },
    })
  })

  it('rejects an incomplete successful login without creating a session', async () => {
    apiPost.mockResolvedValue({ success: true, data: { token: 'provider-token' } })

    await expect(providerLogin('acme', 'secret')).rejects.toThrow('服务商登录响应缺少令牌')
    expect(getStoredSession()).toBeNull()
  })

  it('uses the provider contract for profile, drones and borrows', async () => {
    apiGet
      .mockResolvedValueOnce({ success: true, data: { providerId: 7 } })
      .mockResolvedValueOnce({ success: true, data: { items: [] } })
      .mockResolvedValueOnce({ success: true, data: { items: [] } })

    await getProviderProfile()
    await getProviderDrones('2')
    await getProviderBorrows('3')

    expect(apiGet).toHaveBeenNthCalledWith(1, '/equipment/provider/me')
    expect(apiGet).toHaveBeenNthCalledWith(2, '/equipment/provider/drones', { params: { page: '2' } })
    expect(apiGet).toHaveBeenNthCalledWith(3, '/equipment/provider/borrows', { params: { page: '3' } })
  })

  it('loads the platform aircraft model directory', async () => {
    apiGet.mockResolvedValue({ success: true, data: [{ id: 11, displayName: '飞行器 30' }] })

    await expect(getAircraftModels()).resolves.toEqual([{ id: 11, displayName: '飞行器 30' }])
    expect(apiGet).toHaveBeenCalledWith('/api/aircraft-models')
  })

  it('uses the contract for drone registration, updates and enablement', async () => {
    const drone = {
      aircraftModelId: 11,
      serialNumber: 'SN-11',
      airportName: '虹桥机场',
      latitude: 31.1979,
      longitude: 121.3363,
    }
    apiPost.mockResolvedValue({ success: true, data: { droneId: 'drone-11' } })
    apiPut.mockResolvedValue({ success: true, data: { droneId: 'drone-11' } })

    await registerProviderDrone(drone)
    await updateProviderDrone('drone-11', drone)
    await setProviderDroneEnabled('drone-11', false)

    expect(apiPost).toHaveBeenNthCalledWith(1, '/equipment/provider/drones', { body: drone })
    expect(apiPut).toHaveBeenCalledWith('/equipment/provider/drones/{droneId}', {
      path: { droneId: 'drone-11' },
      body: drone,
    })
    expect(apiPost).toHaveBeenNthCalledWith(2, '/equipment/provider/drones/{droneId}/enabled', {
      path: { droneId: 'drone-11' },
      body: { enabled: false },
    })
  })
})
