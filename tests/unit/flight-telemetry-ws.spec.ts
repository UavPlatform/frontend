import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initFlightTelemetryWs, offFlightTelemetry, onFlightTelemetry } from '../../src/api/ws/modules/flight-telemetry-ws'

const { connection } = vi.hoisted(() => ({
  connection: { on: vi.fn(), connect: vi.fn() },
}))
vi.mock('../../src/api/ws/ws-connection', () => ({ getWsConnection: () => connection }))

describe('flight telemetry WebSocket events', () => {
  beforeEach(() => vi.resetAllMocks())

  it('subscribes once, dispatches one event at a time, and ignores malformed messages', () => {
    const callback = vi.fn()
    onFlightTelemetry(callback)
    initFlightTelemetryWs()
    initFlightTelemetryWs()
    expect(connection.on).toHaveBeenCalledTimes(1)
    expect(connection.connect).toHaveBeenCalledTimes(2)
    const handler = connection.on.mock.calls[0][1]
    const event = { orderId: 'order-1', eventId: 'e1', type: 'POSITION', capturedAt: 123, payload: { latitudeDegE7: 1 } }
    handler({ type: 'event', name: 'FLIGHT_TELEMETRY', data: event })
    expect(callback).toHaveBeenCalledWith('order-1', event)
    handler({ type: 'response', name: 'FLIGHT_TELEMETRY', data: event })
    handler({ type: 'event', name: 'FLIGHT_TELEMETRY', data: { orderId: 'order-1' } })
    handler({ type: 'event', name: 'FLIGHT_TELEMETRY', data: { orderId: 'order-1', capturedAt: 123 } })
    expect(callback).toHaveBeenCalledTimes(1)
    offFlightTelemetry(callback)
  })
})
