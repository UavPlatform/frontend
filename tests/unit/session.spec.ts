import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearStoredSession,
  getStoredSession,
  hasSessionToken,
  setStoredSession,
} from '../../src/api/session'
import type { AuthSession } from '../../src/types/auth'

const buildSession = (token = 'jwt-token'): AuthSession => ({
  token,
  refreshToken: 'refresh-token',
  user: {
    username: 'operator',
    displayName: '运营员',
    role: 'web-user',
    teamName: 'UAV Web Console',
  },
})

describe('session 存储（uav-console-session）', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('setStoredSession → getStoredSession 往返一致', () => {
    const session = buildSession()

    setStoredSession(session)

    expect(getStoredSession()).toEqual(session)
  })

  it('无会话时 getStoredSession 返回 null、hasSessionToken 为 false', () => {
    expect(getStoredSession()).toBeNull()
    expect(hasSessionToken()).toBe(false)
  })

  it('会话含 token 时 hasSessionToken 为 true', () => {
    setStoredSession(buildSession())
    expect(hasSessionToken()).toBe(true)
  })

  it('会话 JSON 损坏时返回 null 并清除脏数据', () => {
    window.localStorage.setItem('uav-console-session', '{corrupted-json')

    expect(getStoredSession()).toBeNull()
    expect(window.localStorage.getItem('uav-console-session')).toBeNull()
  })

  it('clearStoredSession 清除会话', () => {
    setStoredSession(buildSession())

    clearStoredSession()

    expect(getStoredSession()).toBeNull()
    expect(hasSessionToken()).toBe(false)
  })
})
