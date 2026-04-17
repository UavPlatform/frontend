import { decodeEnvelope, encodeEnvelope, type WsEnvelope, type WsMessageHandler } from './ws-codec'

const WS_PATH = '/ws/web'

type ConnectionState = 'disconnected' | 'connecting' | 'connected'

export class WsConnection {
  private ws: WebSocket | null = null
  private state: ConnectionState = 'disconnected'
  private handlers = new Map<string, Set<WsMessageHandler>>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 3000
  private maxReconnectDelay = 30000
  private manualClose = false

  get isConnected() {
    return this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN
  }

  connect() {
    if (this.ws) {
      return
    }

    this.manualClose = false
    this.state = 'connecting'

    const url = buildWsUrl(WS_PATH)
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.state = 'connected'
      this.reconnectDelay = 3000
    }

    this.ws.onmessage = (event) => {
      const envelope = decodeEnvelope(event.data as string)
      if (envelope) {
        this.dispatch(envelope)
      }
    }

    this.ws.onclose = () => {
      this.state = 'disconnected'
      this.ws = null
      if (!this.manualClose) {
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = () => {
      this.ws?.close()
    }
  }

  on(eventName: string, handler: WsMessageHandler) {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, new Set())
    }
    this.handlers.get(eventName)!.add(handler)
  }

  off(eventName: string, handler: WsMessageHandler) {
    this.handlers.get(eventName)?.delete(handler)
  }

  send(envelope: WsEnvelope) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(encodeEnvelope(envelope))
    }
  }

  disconnect() {
    this.manualClose = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
    this.state = 'disconnected'
  }

  private dispatch(envelope: WsEnvelope) {
    const handlers = this.handlers.get(envelope.name)
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(envelope)
        } catch (e) {
          console.error(`Handler for ${envelope.name} threw:`, e)
        }
      }
    }
  }

  private scheduleReconnect() {
    if (this.manualClose) {
      return
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay)
    }, this.reconnectDelay)
  }
}

function buildWsUrl(path: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path}`
}

let sharedConnection: WsConnection | null = null

export function getWsConnection(): WsConnection {
  if (!sharedConnection) {
    sharedConnection = new WsConnection()
  }
  return sharedConnection
}
