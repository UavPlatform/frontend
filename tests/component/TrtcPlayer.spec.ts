import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TrtcPlayer from '../../src/components/TrtcPlayer.vue'
import type { LiveCredentials } from '../../src/types/uav'

const { create, clients } = vi.hoisted(() => {
  const clients: Array<{
    on: ReturnType<typeof vi.fn>, enterRoom: ReturnType<typeof vi.fn>, exitRoom: ReturnType<typeof vi.fn>,
    destroy: ReturnType<typeof vi.fn>, stopRemoteVideo: ReturnType<typeof vi.fn>, startRemoteVideo: ReturnType<typeof vi.fn>,
  }> = []
  return { clients, create: vi.fn(() => {
    const client = { on: vi.fn(), enterRoom: vi.fn().mockResolvedValue(undefined),
      exitRoom: vi.fn().mockResolvedValue(undefined), destroy: vi.fn(),
      stopRemoteVideo: vi.fn().mockResolvedValue(undefined), startRemoteVideo: vi.fn().mockResolvedValue(undefined) }
    clients.push(client)
    return client
  }) }
})
vi.mock('trtc-sdk-v5', () => ({ default: { create, EVENT: {
  ERROR: 'error', REMOTE_VIDEO_AVAILABLE: 'video', REMOTE_VIDEO_UNAVAILABLE: 'no-video', REMOTE_USER_EXIT: 'exit',
}, TYPE: { STREAM_TYPE_MAIN: 'main' } } }))
const credentials: LiveCredentials = { success: true, sdkAppId: 1, roomId: 'room-A', userId: 'admin', userSig: 'sig-A' }

describe('TRTC player lifecycle', () => {
  beforeEach(() => { vi.clearAllMocks(); clients.length = 0 })

  it('same room with renewed credentials exits and reconnects', async () => {
    const wrapper = mount(TrtcPlayer, { props: { credentials } })
    await flushPromises()
    await wrapper.setProps({ credentials: { ...credentials, userSig: 'sig-B' } })
    await flushPromises()
    expect(clients[0].exitRoom).toHaveBeenCalledOnce()
    expect(clients[0].destroy).toHaveBeenCalledOnce()
    expect(clients[1].enterRoom).toHaveBeenCalledWith(expect.objectContaining({ userSig: 'sig-B' }))
    wrapper.unmount()
    await flushPromises()
    expect(clients[1].destroy).toHaveBeenCalledOnce()
  })

  it('late room connection after unmount is cleaned up without connected event', async () => {
    let enter!: () => void
    create.mockImplementationOnce(() => {
      const client = { on: vi.fn(), enterRoom: vi.fn(() => new Promise<void>((resolve) => { enter = resolve })),
        exitRoom: vi.fn().mockResolvedValue(undefined), destroy: vi.fn(),
        stopRemoteVideo: vi.fn(), startRemoteVideo: vi.fn() }
      clients.push(client)
      return client
    })
    const wrapper = mount(TrtcPlayer, { props: { credentials } })
    await flushPromises()
    wrapper.unmount()
    enter()
    await flushPromises()
    expect(wrapper.emitted('connected')).toBeUndefined()
    expect(clients[0].destroy).toHaveBeenCalledOnce()
  })

  it('destroys the SDK even if exitRoom fails', async () => {
    const wrapper = mount(TrtcPlayer, { props: { credentials } })
    await flushPromises()
    clients[0].exitRoom.mockRejectedValueOnce(new Error('disconnect failed'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    wrapper.unmount()
    await flushPromises()
    expect(clients[0].destroy).toHaveBeenCalledOnce()
    consoleError.mockRestore()
  })
})
