import { refreshAccessTokenOnce } from '../request'
import { getStoredSession } from '../session'

export interface JwtPayload {
  exp?: number
  [key: string]: unknown
}

/** 本地解码 JWT payload（base64url，UTF-8 安全），不引依赖；解析失败返回 null */
export const decodeJwtPayload = (token: string): JwtPayload | null => {
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const percentEncoded = atob(base64)
      .split('')
      .map((ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join('')
    const payload: unknown = JSON.parse(decodeURIComponent(percentEncoded))
    return payload && typeof payload === 'object' ? (payload as JwtPayload) : null
  } catch {
    return null
  }
}

/**
 * 本地 JWT exp 预检（1A-6d）：exp 缺失/不可解析/已过期（含 30s 时钟余量）均视为过期。
 * 返回 true 表示需要先刷新才可建连。
 */
export const isJwtExpired = (token: string): boolean => {
  const payload = decodeJwtPayload(token)
  if (!payload || typeof payload.exp !== 'number') {
    return true
  }

  const CLOCK_SKEW_MS = 30_000
  return payload.exp * 1000 <= Date.now() + CLOCK_SKEW_MS
}

export interface WsTokenPreparation {
  ok: boolean
  /** true = 鉴权类失败（token 缺失/过期且刷新未成功），调用方触发 403 长退避 */
  authClass: boolean
}

/**
 * WS 建连前预检：token 本地有效直接通过；缺失/过期先走 request 层单飞刷新（t18）。
 * 刷新失败返回 authClass=true，由调用方复用 t18 登出链路（triggerAuthFailureLogout）并长退避。
 */
export const prepareWsToken = async (): Promise<WsTokenPreparation> => {
  const token = getStoredSession()?.token
  if (token && !isJwtExpired(token)) {
    return { ok: true, authClass: false }
  }

  const newToken = await refreshAccessTokenOnce()
  if (newToken) {
    return { ok: true, authClass: false }
  }

  return { ok: false, authClass: true }
}
