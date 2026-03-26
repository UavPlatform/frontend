import type { AuthSession } from '../types/auth'

const SESSION_KEY = 'uav-console-session'

export const getStoredSession = (): AuthSession | null => {
  const raw = window.localStorage.getItem(SESSION_KEY)

  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as AuthSession
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
}

export const hasSessionToken = () => Boolean(getStoredSession()?.token)
