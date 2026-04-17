import type { UavRuntimeStatus } from '../../../types/uav'
import type { WsEnvelope } from '../ws-codec'
import { getWsConnection } from '../ws-connection'

type UavStatusCallback = (deviceId: string, status: UavRuntimeStatus) => void

const listeners = new Set<UavStatusCallback>()
let initialized = false

const handleUavStatusUpdate = (envelope: WsEnvelope) => {
  const status = envelope.data as UavRuntimeStatus | undefined
  const deviceId = envelope.deviceId

  if (!status || !deviceId) {
    return
  }

  for (const cb of listeners) {
    try {
      cb(deviceId, status)
    } catch (e) {
      console.error('UAV_STATUS_UPDATE listener threw:', e)
    }
  }
}

export function onUavStatusUpdate(callback: UavStatusCallback) {
  listeners.add(callback)
}

export function offUavStatusUpdate(callback: UavStatusCallback) {
  listeners.delete(callback)
}

export function initUavWs() {
  const ws = getWsConnection()

  if (!initialized) {
    ws.on('UAV_STATUS_UPDATE', handleUavStatusUpdate)
    initialized = true
  }

  ws.connect()
}

export function disconnectUavWs() {
  getWsConnection().disconnect()
}
