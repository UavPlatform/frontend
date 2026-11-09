import type { FlightEvent } from '../../modules/flight-record'
import type { WsEnvelope } from '../ws-codec'
import { getWsConnection } from '../ws-connection'

/**
 * FLIGHT_TELEMETRY：一条已提交的事件（ADR-0014）。
 * 服务端只推已入库的投影事件，每次一帧一类读数，不合成 v1 采样快照。
 */
export interface FlightTelemetryEvent extends FlightEvent {
  orderId: string
}

type FlightTelemetryCallback = (orderId: string, event: FlightTelemetryEvent) => void

const listeners = new Set<FlightTelemetryCallback>()
let initialized = false

const handleFlightTelemetry = (envelope: WsEnvelope) => {
  const data = envelope.data as FlightTelemetryEvent | undefined
  if (envelope.type !== 'event' || !data?.orderId || data.capturedAt == null || !data.type) return

  for (const callback of listeners) {
    try {
      callback(data.orderId, data)
    } catch (error) {
      console.error('FLIGHT_TELEMETRY listener threw:', error)
    }
  }
}

export const onFlightTelemetry = (callback: FlightTelemetryCallback) => {
  listeners.add(callback)
}

export const offFlightTelemetry = (callback: FlightTelemetryCallback) => {
  listeners.delete(callback)
}

export const initFlightTelemetryWs = () => {
  const connection = getWsConnection()
  if (!initialized) {
    connection.on('FLIGHT_TELEMETRY', handleFlightTelemetry)
    initialized = true
  }
  void connection.connect()
}
