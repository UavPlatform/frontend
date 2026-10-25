import { beforeEach, describe, expect, it } from 'vitest'
import router from '../../src/router'
import { clearStoredSession, setStoredSession } from '../../src/api/session'
import type { AuthSession } from '../../src/types/auth'

const providerSession: AuthSession = {
  token: 'provider-token',
  user: { username: 'acme', displayName: 'ACME', role: 'PROVIDER', teamName: '服务商' },
}

const adminSession: AuthSession = {
  token: 'admin-token',
  user: { username: 'admin', displayName: '管理员', role: 'ADMIN', teamName: '平台' },
}

describe('provider routes', () => {
  beforeEach(async () => {
    clearStoredSession()
    await router.push('/provider/login')
  })

  it('registers public login and protected workspace routes', () => {
    expect(router.resolve('/provider/login').name).toBe('provider-login')
    expect(router.resolve('/provider/workspace').name).toBe('provider-workspace')
  })

  it('sends an unauthenticated workspace visit to provider login', async () => {
    await router.push('/provider/workspace')
    expect(router.currentRoute.value.name).toBe('provider-login')
    expect(router.currentRoute.value.query.redirect).toBe('/provider/workspace')
  })

  it('allows providers into the workspace and keeps them out of admin pages', async () => {
    setStoredSession(providerSession)

    await router.push('/provider/workspace')
    expect(router.currentRoute.value.name).toBe('provider-workspace')

    await router.push('/orders')
    expect(router.currentRoute.value.name).toBe('provider-workspace')
  })

  it('keeps admins in the admin shell and redirects them away from provider pages', async () => {
    setStoredSession(adminSession)

    await router.push('/provider/workspace')
    expect(router.currentRoute.value.name).toBe('home')
  })
})
