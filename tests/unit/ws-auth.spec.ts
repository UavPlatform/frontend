import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearStoredSession, setStoredSession } from '../../src/api/session'

const { refreshOnceMock } = vi.hoisted(() => ({ refreshOnceMock: vi.fn() }))

vi.mock('../../src/api/request', () => ({
  refreshAccessTokenOnce: refreshOnceMock,
  triggerAuthFailureLogout: vi.fn(),
}))

const loadWsAuth = async () => await import('../../src/api/ws/ws-auth')

const b64url = (value: string) => {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const makeJwt = (payload: Record<string, unknown>) => `hdr.${b64url(JSON.stringify(payload))}.sig`

const sessionFixture = (token: string) => ({
  token,
  refreshToken: 'refresh-token',
  user: {
    username: 'operator',
    displayName: '运营员',
    role: 'web-user',
    teamName: 'UAV Web Console',
  },
})

describe('ws-auth：JWT exp 本地预检与建连前置刷新（1A-6d）', () => {
  beforeEach(() => {
    window.localStorage.clear()
    refreshOnceMock.mockReset()
    refreshOnceMock.mockResolvedValue(null)
  })

  it('decodeJwtPayload 解析 base64url payload，非法输入返回 null', async () => {
    const { decodeJwtPayload } = await loadWsAuth()

    expect(decodeJwtPayload(makeJwt({ exp: 123, name: '巡检' }))).toMatchObject({ exp: 123, name: '巡检' })
    expect(decodeJwtPayload('garbage')).toBeNull()
    expect(decodeJwtPayload('a.not-base64!!')).toBeNull()
  })

  it('isJwtExpired：未过期 false；过期/缺 exp/不可解析 true', async () => {
    const { isJwtExpired } = await loadWsAuth()
    const nowSec = Math.floor(Date.now() / 1000)

    expect(isJwtExpired(makeJwt({ exp: nowSec + 3600 }))).toBe(false)
    expect(isJwtExpired(makeJwt({ exp: nowSec - 3600 }))).toBe(true)
    expect(isJwtExpired(makeJwt({ sub: 'no-exp' }))).toBe(true)
    expect(isJwtExpired('garbage')).toBe(true)
  })

  it('prepareWsToken：token 有效直接通过，不触发刷新', async () => {
    const { prepareWsToken } = await loadWsAuth()
    setStoredSession(sessionFixture(makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 })))

    await expect(prepareWsToken()).resolves.toEqual({ ok: true, authClass: false })
    expect(refreshOnceMock).not.toHaveBeenCalled()
  })

  it('prepareWsToken：token 过期先走单飞刷新，刷新成功放行建连', async () => {
    const { prepareWsToken } = await loadWsAuth()
    setStoredSession(sessionFixture(makeJwt({ exp: Math.floor(Date.now() / 1000) - 3600 })))
    refreshOnceMock.mockResolvedValueOnce('fresh-token')

    await expect(prepareWsToken()).resolves.toEqual({ ok: true, authClass: false })
    expect(refreshOnceMock).toHaveBeenCalledTimes(1)
  })

  it('prepareWsToken：token 过期且刷新失败 → 鉴权类失败（403 长退避信号）', async () => {
    const { prepareWsToken } = await loadWsAuth()
    setStoredSession(sessionFixture(makeJwt({ exp: Math.floor(Date.now() / 1000) - 3600 })))
    refreshOnceMock.mockResolvedValueOnce(null)

    await expect(prepareWsToken()).resolves.toEqual({ ok: false, authClass: true })
  })

  it('prepareWsToken：无会话 → 尝试刷新失败 → 鉴权类失败', async () => {
    const { prepareWsToken } = await loadWsAuth()
    clearStoredSession()

    await expect(prepareWsToken()).resolves.toEqual({ ok: false, authClass: true })
    expect(refreshOnceMock).toHaveBeenCalledTimes(1)
  })
})
