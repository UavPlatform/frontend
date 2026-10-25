import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getFlightHistory, loadFlightHistory } from '../../src/api/modules/flight-record'

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }))
vi.mock('../../src/api/contract', async (original) => ({
  ...await original<typeof import('../../src/api/contract')>(),
  apiGet,
}))

describe('flight history API', () => {
  beforeEach(() => vi.resetAllMocks())

  it('uses the dispatch order UUID and typed query parameters', async () => {
    apiGet.mockResolvedValue({ success: true, data: { items: [] } })
    await getFlightHistory('order/id', { from: 100, to: 200, limit: 20 })
    expect(apiGet).toHaveBeenCalledWith('/dispatch/orders/{orderId}/flight/history', {
      path: { orderId: 'order/id' },
      params: { from: 100, to: 200, limit: 20 },
    })
  })

  it('reads every page with both cursor fields and returns all samples and connection history', async () => {
    apiGet
      .mockResolvedValueOnce({
        success: true,
        data: {
          items: [{ sampleId: 1, capturedAt: 1000 }, { sampleId: 2, capturedAt: 1000 }],
          connections: [{ connectionId: 'c1', serialNumber: 'SN-1' }],
          hasNext: true,
          nextCapturedAt: 1000,
          nextSampleId: 2,
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { items: [{ sampleId: 3, capturedAt: 1000 }], hasNext: false },
      })

    const result = await loadFlightHistory('dispatch-id')

    expect(apiGet).toHaveBeenCalledTimes(2)
    expect(apiGet.mock.calls[1]).toEqual(['/dispatch/orders/{orderId}/flight/history', {
      path: { orderId: 'dispatch-id' },
      params: { afterCapturedAt: 1000, afterSampleId: 2 },
    }])
    expect(result.items?.map((sample) => sample.sampleId)).toEqual([1, 2, 3])
    expect(result.connections).toEqual([{ connectionId: 'c1', serialNumber: 'SN-1' }])
    expect(result.hasNext).toBe(false)
  })

  it('stops safely when the server says there is another page but supplies no cursor', async () => {
    apiGet.mockResolvedValue({
      success: true,
      data: { items: [{ sampleId: 1 }], hasNext: true },
    })
    const result = await loadFlightHistory('dispatch-id')
    expect(apiGet).toHaveBeenCalledTimes(1)
    expect(result.hasNext).toBe(false)
  })
})
