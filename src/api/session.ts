import type { AuthSession } from '../types/auth'

const SESSION_KEY = 'uav-console-session'

export const getStoredSession = (): AuthSession | null => {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw)
    if (!session || typeof session.token !== 'string' || !session.token.trim() ||
      !session.user || !['username', 'displayName', 'role', 'teamName'].every(
        (key) => typeof session.user[key] === 'string') ||
      (session.refreshToken != null && typeof session.refreshToken !== 'string')) {
      window.localStorage.removeItem(SESSION_KEY)
      return null
    }
    return session as AuthSession
  } catch {
    window.localStorage.removeItem(SESSION_KEY)
    return null
  }
}

export const setStoredSession = (session: AuthSession) => {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export const clearStoredSession = () => {
  window.localStorage.removeItem(SESSION_KEY)
  window.localStorage.removeItem('uav-console-tabs')
}

export const hasSessionToken = () => Boolean(getStoredSession()?.token)
