export interface WsEnvelope<T = unknown> {
  id?: string
  type: string
  name: string
  replyTo?: string
  deviceId?: string
  timestamp?: number
  success?: boolean
  code?: string
  message?: string
  data?: T
}

export type WsMessageHandler = (envelope: WsEnvelope) => void

export const encodeEnvelope = (envelope: WsEnvelope): string => JSON.stringify(envelope)

export const decodeEnvelope = (raw: string): WsEnvelope | null => {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.type === 'string' && typeof parsed.name === 'string') {
      return parsed as WsEnvelope
    }
    return null
  } catch {
    return null
  }
}
