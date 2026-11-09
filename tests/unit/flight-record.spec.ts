import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getFlightHistory, loadFlightHistory } from '../../src/api/modules/flight-record'

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }))
vi.mock('../../src/api/contract', async (original) => ({
  ...await original<typeof import('../../src/api/contract')>(),
  apiGet,
}))

const event = (eventId: string, capturedAt: number) => ({ eventId, capturedAt, type: 'POSITION' })

describe('flight history API', () => {
  beforeEach(() => vi.resetAllMocks())

  it('uses the dispatch order UUID and typed query parameters', async () => {
    apiGet.mockResolvedValue({ success: true, data: { items: [] } })
    await getFlightHistory('order/id', { serialNumber: 'SN1', serialSource: 'FLIGHT_CONTROLLER', limit: 20 })
    expect(apiGet).toHaveBeenCalledWith('/dispatch/orders/{orderId}/flight/history', {
      path: { orderId: 'order/id' },
      params: { serialNumber: 'SN1', serialSource: 'FLIGHT_CONTROLLER', limit: 20 },
    })
  })

  it('reads every page with the (capturedAt, eventId) cursor pair', async () => {
    apiGet
      .mockResolvedValueOnce({
        success: true,
        data: { items: [event('e1', 1000), event('e2', 1000)], hasNext: true, nextCapturedAt: 1000, nextEventId: 'e2' },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { items: [event('e3', 1000)], hasNext: false },
      })

    const result = await loadFlightHistory('dispatch-id')

    expect(apiGet).toHaveBeenCalledTimes(2)
    expect(apiGet.mock.calls[1]).toEqual(['/dispatch/orders/{orderId}/flight/history', {
      path: { orderId: 'dispatch-id' },
      params: { afterCapturedAt: 1000, afterEventId: 'e2' },
    }])
    expect(result.items?.map((item) => item.eventId)).toEqual(['e1', 'e2', 'e3'])
    expect(result.hasNext).toBe(false)
  })

  it('stops on a repeated cursor and reports that the history is incomplete', async () => {
    apiGet.mockResolvedValue({
      success: true,
      data: { items: [event('e1', 1000)], hasNext: true, nextCapturedAt: 1000, nextEventId: 'e1' },
    })
    const result = await loadFlightHistory('dispatch-id')
    expect(apiGet).toHaveBeenCalledTimes(2)
    expect(result.hasNext).toBe(true)
  })

  it('stops safely when the server says there is another page but supplies no cursor', async () => {
    apiGet.mockResolvedValue({
      success: true,
      data: { items: [event('e1', 1000)], hasNext: true },
    })
    const result = await loadFlightHistory('dispatch-id')
    expect(apiGet).toHaveBeenCalledTimes(1)
    expect(result.hasNext).toBe(true)
  })
})
