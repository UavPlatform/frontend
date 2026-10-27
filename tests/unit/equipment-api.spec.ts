import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAdminDrone, getAdminDroneBorrows, getAdminDrones,
  setAdminDroneEnabled, updateAdminDrone,
} from '../../src/api/modules/admin-drone'
import {
  createAdminAircraftModel, deleteAdminAircraftModel, getAdminAircraftModels,
  setAdminAircraftModelEnabled, updateAdminAircraftModel,
} from '../../src/api/modules/admin-aircraft-model'

// Exercise the real typed contract facade and business envelope handling.
const request = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(),
}))
vi.mock('../../src/api/request', () => ({ default: request }))

const drone = { aircraftModelId: 1, serialNumber: 'SN-1', airportName: '测试机场', latitude: 30, longitude: 120 }
const model = { modelCode: 'FC30', displayName: 'FlyCart', maxPayloadKg: 30, transportEnabled: true }
const response = (data: unknown) => ({ data: { success: true, data } })

describe('admin drone and aircraft model API integration (REQ-SUP-GOV-005/006)', () => {
  beforeEach(() => { vi.resetAllMocks() })

  it('preserves airport filtering and normalizes empty page content', async () => {
    request.get.mockResolvedValue(response({ totalElements: 0 }))
    expect(await getAdminDrones({ airportName: '测试', page: 2, size: 10 }))
      .toEqual({ content: [], totalElements: 0 })
    expect(request.get).toHaveBeenCalledWith('/admin/drones', {
      params: { airportName: '测试', page: 2, size: 10 },
    })
    await getAdminDrones()
    expect(request.get).toHaveBeenLastCalledWith('/admin/drones', { params: {} })
  })

  it('encodes drone identities and retains borrow pagination', async () => {
    request.get.mockResolvedValue(response({ totalElements: 0 }))
    expect(await getAdminDroneBorrows('drone/id', { page: 1, size: 20 }))
      .toEqual({ content: [], totalElements: 0 })
    expect(request.get).toHaveBeenLastCalledWith('/admin/drones/drone%2Fid/borrows', { params: { page: 1, size: 20 } })
    await getAdminDroneBorrows('d1')
    expect(request.get).toHaveBeenLastCalledWith('/admin/drones/d1/borrows', { params: {} })
  })

  it('sends drone create, update, and enabled state through the current contract', async () => {
    request.post.mockResolvedValue(response({ droneId: 'd1' }))
    request.put.mockResolvedValue(response({ droneId: 'd1' }))
    expect(await createAdminDrone(drone)).toEqual({ droneId: 'd1' })
    expect(request.post).toHaveBeenLastCalledWith('/admin/drones', drone, undefined)
    await updateAdminDrone('drone/id', drone)
    expect(request.put).toHaveBeenLastCalledWith('/admin/drones/drone%2Fid', drone, undefined)
    for (const enabled of [true, false]) {
      await setAdminDroneEnabled('d1', enabled)
      expect(request.post).toHaveBeenLastCalledWith('/admin/drones/d1/enabled', { enabled }, undefined)
    }
  })

  it('retains backend identity conflict messages', async () => {
    request.put.mockResolvedValue({ data: { success: false, errorCode: 'INVALID_PARAM', message: '设备已有借还记录，不能更改机身号或机型' } })
    await expect(updateAdminDrone('d1', drone)).rejects.toMatchObject({
      errorCode: 'INVALID_PARAM', message: '设备已有借还记录，不能更改机身号或机型',
    })
  })

  it('keeps model pagination and normalizes missing content', async () => {
    request.get.mockResolvedValue(response({ totalElements: 0 }))
    expect(await getAdminAircraftModels({ page: 1, size: 10 })).toEqual({ content: [], totalElements: 0 })
    expect(request.get).toHaveBeenLastCalledWith('/admin/aircraft-models', { params: { page: 1, size: 10 } })
    await getAdminAircraftModels()
    expect(request.get).toHaveBeenLastCalledWith('/admin/aircraft-models', { params: {} })
  })

  it('creates and updates models and passes both enabled states', async () => {
    request.post.mockResolvedValue(response({ id: 1 }))
    request.put.mockResolvedValue(response({ id: 1 }))
    expect(await createAdminAircraftModel(model)).toEqual({ id: 1 })
    expect(request.post).toHaveBeenLastCalledWith('/admin/aircraft-models', model, undefined)
    await updateAdminAircraftModel(1, model)
    expect(request.put).toHaveBeenLastCalledWith('/admin/aircraft-models/1', model, undefined)
    for (const enabled of [true, false]) {
      await setAdminAircraftModelEnabled(1, enabled)
      expect(request.post).toHaveBeenLastCalledWith('/admin/aircraft-models/1/enabled', { enabled }, undefined)
    }
  })

  it('accepts a void deletion response but propagates referenced-model errors', async () => {
    request.delete.mockResolvedValueOnce(response(null))
      .mockResolvedValueOnce({ data: { success: false, errorCode: 'INVALID_PARAM', message: '机型已被引用，请改为停用' } })
    await expect(deleteAdminAircraftModel(1)).resolves.toBeUndefined()
    expect(request.delete).toHaveBeenLastCalledWith('/admin/aircraft-models/1', undefined)
    await expect(deleteAdminAircraftModel(1)).rejects.toMatchObject({ errorCode: 'INVALID_PARAM', message: '机型已被引用，请改为停用' })
  })
})
