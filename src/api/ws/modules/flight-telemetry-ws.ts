import type { FlightSample } from '../../modules/flight-record'
import type { WsEnvelope } from '../ws-codec'
import { getWsConnection } from '../ws-connection'

export interface FlightTelemetryEvent extends FlightSample {
  orderId: string
  modelCode?: string
  modelName?: string
}

type FlightTelemetryCallback = (orderId: string, sample: FlightTelemetryEvent) => void

const listeners = new Set<FlightTelemetryCallback>()
let initialized = false

const handleFlightTelemetry = (envelope: WsEnvelope) => {
  const data = envelope.data as FlightTelemetryEvent | undefined
  if (envelope.type !== 'event' || !data?.orderId || data.capturedAt == null) return

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
