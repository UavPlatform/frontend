import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import {
  FLIGHT_CONNECTION_POLL_MS, isFlightConnected, isLiveCapableStage, useFlightConnection,
} from '../../src/composables/useFlightConnection'

const { getFlightView } = vi.hoisted(() => ({ getFlightView: vi.fn() }))
vi.mock('../../src/api/modules/flight-record', () => ({ getFlightView }))

const open = { connection: { connectionId: 'c1', openedAt: '2026-10-27T01:00:00Z' } }
const ended = { connection: { connectionId: 'c1', openedAt: '2026-10-27T01:00:00Z', endedAt: '2026-10-27T01:10:00Z' } }

const harness = (orderId = ref('o1'), enabled = ref(true)) => {
  let state!: ReturnType<typeof useFlightConnection>
  const wrapper = mount(defineComponent({
    setup() {
      state = useFlightConnection(orderId, enabled)
      return () => h('div')
    },
  }))
  return { wrapper, state, orderId, enabled }
}

describe('flight connection state (REQ-SUP-MON-007, docs#22)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks() })
  afterEach(() => { vi.useRealTimers() })

  it('treats only an open connection as connected', () => {
    expect(isFlightConnected(open)).toBe(true)
    expect(isFlightConnected(ended)).toBe(false)
    expect(isFlightConnected({})).toBe(false)
    expect(isFlightConnected(null)).toBe(false)
  })

  it('allows realtime from pilot arrival through delivery confirmation, regardless of IN_TRANSIT', () => {
    for (const stage of ['PILOT_ARRIVED', 'IN_TRANSIT', 'DELIVERY_CONFIRMATION']) expect(isLiveCapableStage(stage)).toBe(true)
    for (const stage of ['WAITING_ACCEPTANCE', 'PILOT_PREPARING', 'COMPLETED', 'CANCELLED', undefined, null]) {
      expect(isLiveCapableStage(stage)).toBe(false)
    }
  })

  it('polls the flight view and follows connect / disconnect', async () => {
    getFlightView.mockResolvedValueOnce(ended).mockResolvedValueOnce(open).mockResolvedValueOnce(ended)
    const { wrapper, state } = harness()
    await flushPromises()
    expect(getFlightView).toHaveBeenCalledWith('o1')
    expect(state.connected.value).toBe(false)
    await vi.advanceTimersByTimeAsync(FLIGHT_CONNECTION_POLL_MS)
    expect(state.connected.value).toBe(true)
    await vi.advanceTimersByTimeAsync(FLIGHT_CONNECTION_POLL_MS)
    expect(state.connected.value).toBe(false)
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(FLIGHT_CONNECTION_POLL_MS * 2)
    expect(getFlightView).toHaveBeenCalledTimes(3)
  })

  it('keeps the last state when a poll fails', async () => {
    getFlightView.mockResolvedValueOnce(open).mockRejectedValueOnce(new Error('offline'))
    const { wrapper, state } = harness()
    await flushPromises()
    expect(state.connected.value).toBe(true)
    await vi.advanceTimersByTimeAsync(FLIGHT_CONNECTION_POLL_MS)
    expect(state.connected.value).toBe(true)
    wrapper.unmount()
  })

  it('does not poll outside live-capable stages and resets when disabled or switching orders', async () => {
    getFlightView.mockResolvedValue(open)
    const { wrapper, state, orderId, enabled } = harness(ref('o1'), ref(false))
    await flushPromises()
    expect(getFlightView).not.toHaveBeenCalled()
    expect(state.connected.value).toBe(false)

    enabled.value = true
    await flushPromises()
    expect(state.connected.value).toBe(true)

    let resolveNew!: (view: object) => void
    getFlightView.mockImplementationOnce(() => new Promise((resolve) => { resolveNew = resolve }))
    orderId.value = 'o2'
    await flushPromises()
    expect(state.connected.value).toBe(false)
    expect(getFlightView).toHaveBeenLastCalledWith('o2')
    resolveNew(open)
    await flushPromises()
    expect(state.connected.value).toBe(true)

    enabled.value = false
    await flushPromises()
    expect(state.connected.value).toBe(false)
    const calls = getFlightView.mock.calls.length
    await vi.advanceTimersByTimeAsync(FLIGHT_CONNECTION_POLL_MS * 2)
    expect(getFlightView).toHaveBeenCalledTimes(calls)
    wrapper.unmount()
  })
})
