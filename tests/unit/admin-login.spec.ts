import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminLogin } from '../../src/api/modules/admin'
import { clearStoredSession, getStoredSession } from '../../src/api/session'

const { apiPost } = vi.hoisted(() => ({ apiPost: vi.fn() }))
vi.mock('../../src/api/contract', async (original) => ({
  ...await original<typeof import('../../src/api/contract')>(), apiPost,
}))

describe('admin login contract', () => {
  beforeEach(() => { vi.resetAllMocks(); clearStoredSession() })

  it('stores actual admin credentials without inventing a refresh token', async () => {
    apiPost.mockResolvedValue({ success: true, data: { token: 'admin-token', admin: { id: 1, name: 'admin' } } })
    expect((await adminLogin({ name: 'admin', password: 'secret' })).success).toBe(true)
    expect(getStoredSession()).toMatchObject({ token: 'admin-token', user: { role: 'ADMIN' } })
    expect(getStoredSession()?.refreshToken).toBeUndefined()
  })

  it.each([{ token: 't' }, { admin: { name: 'admin' } }, null])('incomplete successful response does not log in: %j', async (data) => {
    apiPost.mockResolvedValue({ success: true, data })
    expect((await adminLogin({ name: 'admin', password: 'secret' })).success).toBe(false)
    expect(getStoredSession()).toBeNull()
  })
})
