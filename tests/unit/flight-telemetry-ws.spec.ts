import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initFlightTelemetryWs, offFlightTelemetry, onFlightTelemetry } from '../../src/api/ws/modules/flight-telemetry-ws'

const { connection } = vi.hoisted(() => ({
  connection: { on: vi.fn(), connect: vi.fn() },
}))
vi.mock('../../src/api/ws/ws-connection', () => ({ getWsConnection: () => connection }))

describe('flight telemetry WebSocket events', () => {
  beforeEach(() => vi.resetAllMocks())

  it('subscribes once, dispatches valid events, and ignores malformed messages', () => {
    const callback = vi.fn()
    onFlightTelemetry(callback)
    initFlightTelemetryWs()
    initFlightTelemetryWs()
    expect(connection.on).toHaveBeenCalledTimes(1)
    expect(connection.connect).toHaveBeenCalledTimes(2)
    const handler = connection.on.mock.calls[0][1]
    const sample = { orderId: 'order-1', capturedAt: 123, latitude: 1 }
    handler({ type: 'event', name: 'FLIGHT_TELEMETRY', data: sample })
    expect(callback).toHaveBeenCalledWith('order-1', sample)
    handler({ type: 'response', name: 'FLIGHT_TELEMETRY', data: { orderId: 'order-1', capturedAt: 123 } })
    handler({ type: 'event', name: 'FLIGHT_TELEMETRY', data: { orderId: 'order-1' } })
    expect(callback).toHaveBeenCalledTimes(1)
    offFlightTelemetry(callback)
  })
})
