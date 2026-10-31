import { decodeEnvelope, encodeEnvelope, type WsEnvelope, type WsMessageHandler } from './ws-codec'
import { prepareWsToken } from './ws-auth'
import { triggerAuthFailureLogout } from '../request'
import { getStoredSession } from '../session'

const WS_PATH = '/ws/web'

type ConnectionState = 'disconnected' | 'connecting' | 'connected'

export class WsConnection {
  /**
   * 重连退避分类（dev-backend 分类表，浏览器读不到握手 HTTP 状态，按本地预检结果分类）：
   * - 网络类：token 本地有效但握手失败/连接中断 → 3s/10s/30s（封顶 30s）；
   * - 鉴权类：本地预检过期且刷新失败（对应后端握手必 403）→ 60s 长退避，
   *   期间每次重连重新预检，会话修复（刷新成功/重新登录）即恢复网络类节奏。
   */
  private static readonly NETWORK_BACKOFF_STEPS = [3_000, 10_000, 30_000]
  private static readonly AUTH_BACKOFF_MS = 60_000

  private ws: WebSocket | null = null
  private state: ConnectionState = 'disconnected'
  private handlers = new Map<string, Set<WsMessageHandler>>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private manualClose = false
  private connecting = false
  private networkBackoffIndex = 0
  private authBackoff = false

  get isConnected() {
    return this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN
  }

  connect(): void {
    if (this.ws || this.connecting) {
      return
    }

    this.manualClose = false
    this.state = 'connecting'
    this.connecting = true
    void this.open()
  }

  private async open(): Promise<void> {
    try {
      // ① 本地 JWT exp 预检：过期先走 t18 单飞刷新再建连；刷新失败复用 t18 登出链路
      const prepared = await prepareWsToken()

      if (this.manualClose) {
        return
      }

      if (!prepared.ok) {
        triggerAuthFailureLogout()
        this.scheduleReconnect(true)
        return
      }

      // ② 每次建连现取最新 token（浏览器无法自定义握手头，按 t3 契约走 ?token= 兜底通道）
      const url = buildWsUrl(WS_PATH)
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        this.state = 'connected'
        this.networkBackoffIndex = 0
        this.authBackoff = false
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
        // 建连时 token 已通过本地预检，此处断开按网络/服务端类处理（3s/10s/30s 退避）
        this.scheduleReconnect(false)
      }

      this.ws.onerror = () => {
        this.ws?.close()
      }
    } finally {
      this.connecting = false
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

  private scheduleReconnect(authClass = false): void {
    if (this.manualClose) {
      return
    }

    if (!getStoredSession()) {
      // 会话已不存在（登出链路已清）：停止自动重连，重新登录后由页面挂载重新建连
      return
    }

    let delay: number
    if (authClass) {
      this.authBackoff = true
      this.networkBackoffIndex = 0
    }

    if (this.authBackoff) {
      delay = WsConnection.AUTH_BACKOFF_MS
    } else {
      const steps = WsConnection.NETWORK_BACKOFF_STEPS
      delay = steps[Math.min(this.networkBackoffIndex, steps.length - 1)]
      this.networkBackoffIndex += 1
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }
}

function buildWsUrl(path: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const token = getStoredSession()?.token
  const query = token ? `?token=${encodeURIComponent(token)}` : ''
  return `${protocol}//${window.location.host}${path}${query}`
}

let sharedConnection: WsConnection | null = null

export function getWsConnection(): WsConnection {
  if (!sharedConnection) {
    sharedConnection = new WsConnection()
  }
  return sharedConnection
}
