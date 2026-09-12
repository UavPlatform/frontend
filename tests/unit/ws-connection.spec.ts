import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearStoredSession, setStoredSession } from '../../src/api/session'

const { prepareMock, logoutMock } = vi.hoisted(() => ({
  prepareMock: vi.fn(),
  logoutMock: vi.fn(),
}))

vi.mock('../../src/api/ws/ws-auth', () => ({
  prepareWsToken: prepareMock,
}))

vi.mock('../../src/api/request', () => ({
  triggerAuthFailureLogout: logoutMock,
  refreshAccessTokenOnce: vi.fn(),
}))

// 浏览器 WebSocket 替身：记录握手 URL，close() 触发 onclose（模拟握手失败/断开）
class FakeWebSocket {
  static OPEN = 1
  static instances: FakeWebSocket[] = []

  url: string
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  close() {
    this.onclose?.()
  }
}

const sessionFixture = (token = 'ws-token.a.b') => ({
  token,
  refreshToken: 'refresh-token',
  user: {
    username: 'operator',
    displayName: '运营员',
    role: 'web-user',
    teamName: 'UAV Web Console',
  },
})

const loadModule = async () => await import('../../src/api/ws/ws-connection')

describe('WsConnection 建连鉴权与分类退避（1A-6d）', () => {
  beforeEach(() => {
    window.localStorage.clear()
    FakeWebSocket.instances = []
    prepareMock.mockReset()
    prepareMock.mockResolvedValue({ ok: true, authClass: false })
    logoutMock.mockReset()
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('建连 URL 带 ?token= 且每次建连现取最新 token', async () => {
    setStoredSession(sessionFixture('ws-token.a.b'))
    const { WsConnection } = await loadModule()
    const conn = new WsConnection()
    conn.connect()
    await vi.advanceTimersByTimeAsync(0)

    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(FakeWebSocket.instances[0].url).toBe(
      `ws://${window.location.host}/ws/web?token=${encodeURIComponent('ws-token.a.b')}`,
    )

    // token 换新后断开重连：第二次建连取到新 token
    setStoredSession(sessionFixture('fresh-token.c.d'))
    FakeWebSocket.instances[0].onclose?.()
    await vi.advanceTimersByTimeAsync(3000)

    expect(FakeWebSocket.instances).toHaveLength(2)
    expect(FakeWebSocket.instances[1].url).toBe(
      `ws://${window.location.host}/ws/web?token=${encodeURIComponent('fresh-token.c.d')}`,
    )
  })

  it('网络类握手失败按 3s/10s/30s 退避（30s 封顶）', async () => {
    setStoredSession(sessionFixture())
    const { WsConnection } = await loadModule()
    const conn = new WsConnection()
    conn.connect()
    await vi.advanceTimersByTimeAsync(0)

    const failCurrent = async () => {
      // onerror → 内部 close → onclose → scheduleReconnect（网络类）
      FakeWebSocket.instances[FakeWebSocket.instances.length - 1].onerror?.()
    }

    await failCurrent()
    await vi.advanceTimersByTimeAsync(2999)
    expect(FakeWebSocket.instances).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(FakeWebSocket.instances).toHaveLength(2)

    await failCurrent()
    await vi.advanceTimersByTimeAsync(9999)
    expect(FakeWebSocket.instances).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(FakeWebSocket.instances).toHaveLength(3)

    await failCurrent()
    await vi.advanceTimersByTimeAsync(29999)
    expect(FakeWebSocket.instances).toHaveLength(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(FakeWebSocket.instances).toHaveLength(4)

    // 之后封顶 30s
    await failCurrent()
    await vi.advanceTimersByTimeAsync(30000)
    expect(FakeWebSocket.instances).toHaveLength(5)
  })

  it('鉴权类失败（预检过期且刷新失败）复用 t18 登出链路并长退避 60s', async () => {
    setStoredSession(sessionFixture()) // 会话尚在（模拟刷新刚失败的窗口）
    prepareMock.mockResolvedValue({ ok: false, authClass: true })
    const { WsConnection } = await loadModule()
    const conn = new WsConnection()
    conn.connect()
    await vi.advanceTimersByTimeAsync(0)

    expect(logoutMock).toHaveBeenCalledTimes(1)
    expect(FakeWebSocket.instances).toHaveLength(0) // 未建连

    // 60s 长退避后重新预检（会话可能已被重新登录修复）
    await vi.advanceTimersByTimeAsync(59999)
    expect(prepareMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(prepareMock).toHaveBeenCalledTimes(2)
  })

  it('会话已被登出链路清空时停止自动重连', async () => {
    clearStoredSession()
    prepareMock.mockResolvedValue({ ok: false, authClass: true })
    const { WsConnection } = await loadModule()
    const conn = new WsConnection()
    conn.connect()
    await vi.advanceTimersByTimeAsync(0)

    expect(logoutMock).toHaveBeenCalledTimes(1)
    expect(FakeWebSocket.instances).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(60000)
    expect(prepareMock).toHaveBeenCalledTimes(1) // 不再重试
    expect(FakeWebSocket.instances).toHaveLength(0)
  })
})
