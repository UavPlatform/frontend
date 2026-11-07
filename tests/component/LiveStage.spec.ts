import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LiveStage from '../../src/components/order/LiveStage.vue'
import * as liveApi from '../../src/api/modules/live'

const { post } = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('../../src/api/request', () => ({ default: { post } }))
vi.mock('../../src/components/TrtcPlayer.vue', () => ({
  default: { name: 'TrtcPlayer', props: ['credentials'], template: '<div data-testid="player" />' },
}))

const credentials = (deviceId: string, liveState = 'RUNNING') => ({
  success: true,
  data: { roomId: `room-${deviceId}`, userId: 'viewer', userSig: 'sig', sdkAppId: 1, liveState },
})
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
let wrapper: VueWrapper | undefined
const open = (deviceId: string | null | undefined) => {
  wrapper = mount(LiveStage, { props: { deviceId }, global: { stubs: { 'el-tag': { template: '<span><slot /></span>' } } } })
  return wrapper
}
const paths = () => post.mock.calls.map(([path]) => path)

describe('LiveStage read-only viewing with real live-watch and API adapters', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockImplementation(async (path: string, _body: unknown, config: { params: { deviceId: string } }) => {
      if (path === '/live/get') return { data: credentials(config.params.deviceId) }
      if (path === '/live/leave') return { data: { success: true, data: null } }
      throw new Error(`Unexpected endpoint: ${path}`)
    })
  })
  afterEach(async () => {
    wrapper?.unmount()
    wrapper = undefined
    await flushPromises()
    // This is a strict allowlist, so neither remote start nor remote stop can slip in.
    expect(paths().every((path) => path === '/live/get' || path === '/live/leave')).toBe(true)
    vi.restoreAllMocks()
  })

  it('keeps viewing and displays the server live state, not inferred start success', async () => {
    const view = open('a')
    await flushPromises()
    expect(paths()).toEqual(['/live/get'])
    expect(post).toHaveBeenCalledWith('/live/get', null, { params: { deviceId: 'a' } })
    expect(view.findComponent({ name: 'TrtcPlayer' }).props('credentials')).toMatchObject({ roomId: 'room-a', liveState: 'RUNNING' })
    expect(view.text()).toContain('平台直播态 RUNNING')
    expect(view.emitted('live-state')?.at(-1)).toEqual(['RUNNING'])
    expect(view.find('button').exists()).toBe(false)
    expect(view.text()).not.toContain('开播成功')
  })

  it('does not turn a valid IDLE state into RUNNING', async () => {
    post.mockResolvedValueOnce({ data: credentials('idle', 'IDLE') })
    const view = open('idle')
    await flushPromises()
    expect(view.text()).toContain('平台直播态 IDLE')
    expect(view.emitted('live-state')?.at(-1)).toEqual(['IDLE'])
  })

  it('switches devices and unmounts by ending only the corresponding personal watch', async () => {
    const view = open('a')
    await flushPromises()
    await view.setProps({ deviceId: 'b' })
    await flushPromises()
    expect(post).toHaveBeenCalledWith('/live/leave', null, { params: { deviceId: 'a' } })
    expect(view.findComponent({ name: 'TrtcPlayer' }).props('credentials')).toMatchObject({ roomId: 'room-b' })
    view.unmount()
    wrapper = undefined
    await flushPromises()
    expect(post).toHaveBeenCalledWith('/live/leave', null, { params: { deviceId: 'b' } })
    expect(paths().filter((path) => path === '/live/leave')).toHaveLength(2)
  })

  it('releases a pending acquisition after unmount without leaking a watch', async () => {
    const pending = deferred<{ data: ReturnType<typeof credentials> }>()
    post.mockReturnValueOnce(pending.promise)
    const view = open('pending')
    await flushPromises()
    view.unmount()
    wrapper = undefined
    pending.resolve({ data: credentials('pending') })
    await flushPromises()
    expect(paths()).toEqual(['/live/get', '/live/leave'])
    expect(post).toHaveBeenLastCalledWith('/live/leave', null, { params: { deviceId: 'pending' } })
  })

  it('ignores a stale device response while still releasing its watch', async () => {
    const pending = deferred<{ data: ReturnType<typeof credentials> }>()
    post.mockReturnValueOnce(pending.promise)
    const view = open('old')
    await flushPromises()
    await view.setProps({ deviceId: 'new' })
    await flushPromises()
    pending.resolve({ data: credentials('old') })
    await flushPromises()
    expect(view.findComponent({ name: 'TrtcPlayer' }).props('credentials')).toMatchObject({ roomId: 'room-new' })
    expect(post).toHaveBeenCalledWith('/live/leave', null, { params: { deviceId: 'old' } })
  })

  it('degrades an unavailable stream to a hint without remote control or an acquired watch', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    post.mockResolvedValueOnce({ data: { success: false, errorCode: 'LIVE_NOT_RUNNING', message: '设备未开播' } })
    const view = open('offline')
    await flushPromises()
    expect(view.text()).toContain('设备离线或未开播')
    expect(view.findComponent({ name: 'TrtcPlayer' }).exists()).toBe(false)
    view.unmount()
    wrapper = undefined
    await flushPromises()
    expect(paths()).toEqual(['/live/get'])
  })

  it('keeps playback errors local and releases the personal watch on unmount', async () => {
    const view = open('playback-error')
    await flushPromises()
    view.findComponent({ name: 'TrtcPlayer' }).vm.$emit('error', '播放视频流失败')
    await flushPromises()
    // Existing behavior: playback error does not release the HTTP watch immediately.
    expect(paths()).toEqual(['/live/get'])
    view.unmount()
    wrapper = undefined
    await flushPromises()
    expect(paths()).toEqual(['/live/get', '/live/leave'])
  })

  it('orders the old personal leave before reacquiring the same device', async () => {
    const pending = deferred<{ data: ReturnType<typeof credentials> }>()
    post.mockReturnValueOnce(pending.promise)
    const view = open('same')
    await flushPromises()
    await view.setProps({ deviceId: null })
    await view.setProps({ deviceId: 'same' })
    await flushPromises()
    expect(paths()).toEqual(['/live/get'])
    pending.resolve({ data: credentials('same') })
    await flushPromises()
    expect(paths()).toEqual(['/live/get', '/live/leave', '/live/get'])
  })

  it('does not acquire a watch without a resolved device', async () => {
    const view = open(undefined)
    await flushPromises()
    expect(view.text()).toContain('正在解析作业设备')
    await view.setProps({ deviceId: null })
    await flushPromises()
    expect(view.text()).toContain('暂无可观看图传')
    expect(post).not.toHaveBeenCalled()
  })

  it('exports only viewing operations from the handwritten live API', () => {
    expect(Object.keys(liveApi).sort()).toEqual(['getPullCredentials', 'leaveLive'])
  })
})
