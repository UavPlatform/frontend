import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import {
  FLIGHT_PROJECTION_POLL_MS, isFlightReporting, isLiveCapableStage, useFlightReporting,
  type FlightReporting,
} from '../../src/composables/useFlightReporting'
import { deferred } from '../support/deferred'

const { getFlightProjection } = vi.hoisted(() => ({ getFlightProjection: vi.fn() }))
vi.mock('../../src/api/modules/flight-record', () => ({ getFlightProjection }))

const fresh = { aircraft: [{ serialNumber: 'SN1', serialSource: 'FLIGHT_CONTROLLER', stale: false }] }
const stale = { aircraft: [{ serialNumber: 'SN1', serialSource: 'FLIGHT_CONTROLLER', stale: true }] }

const harness = (orderId = ref('o1'), enabled = ref(true)) => {
  let state!: FlightReporting
  const wrapper = mount(defineComponent({
    setup() {
      state = useFlightReporting(orderId, enabled)
      return () => h('div')
    },
  }))
  return { wrapper, state, orderId, enabled }
}

describe('flight reporting state (REQ-SUP-MON-007, ADR-0014)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks() })
  afterEach(() => { vi.useRealTimers() })

  it('treats the order as reporting only while some aircraft has a fresh projection', () => {
    expect(isFlightReporting(fresh)).toBe(true)
    expect(isFlightReporting(stale)).toBe(false)
    expect(isFlightReporting({ aircraft: [] })).toBe(false)
    expect(isFlightReporting({})).toBe(false)
    expect(isFlightReporting(null)).toBe(false)
  })

  it('allows realtime from pilot arrival through delivery confirmation, regardless of IN_TRANSIT', () => {
    for (const stage of ['PILOT_ARRIVED', 'IN_TRANSIT', 'DELIVERY_CONFIRMATION']) expect(isLiveCapableStage(stage)).toBe(true)
    for (const stage of ['WAITING_ACCEPTANCE', 'PILOT_PREPARING', 'COMPLETED', 'CANCELLED', undefined, null]) {
      expect(isLiveCapableStage(stage)).toBe(false)
    }
  })

  it('polls the projection and follows fresh / stale aircraft', async () => {
    getFlightProjection.mockResolvedValueOnce(stale).mockResolvedValueOnce(fresh).mockResolvedValueOnce(stale)
    const { wrapper, state } = harness()
    await flushPromises()
    expect(getFlightProjection).toHaveBeenCalledWith('o1')
    expect(state.reporting.value).toBe(false)
    await vi.advanceTimersByTimeAsync(FLIGHT_PROJECTION_POLL_MS)
    expect(state.reporting.value).toBe(true)
    await vi.advanceTimersByTimeAsync(FLIGHT_PROJECTION_POLL_MS)
    expect(state.reporting.value).toBe(false)
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(FLIGHT_PROJECTION_POLL_MS * 2)
    expect(getFlightProjection).toHaveBeenCalledTimes(3)
  })

  it('keeps the last state when a poll fails', async () => {
    getFlightProjection.mockResolvedValueOnce(fresh).mockRejectedValueOnce(new Error('offline'))
    const { wrapper, state } = harness()
    await flushPromises()
    expect(state.reporting.value).toBe(true)
    await vi.advanceTimersByTimeAsync(FLIGHT_PROJECTION_POLL_MS)
    expect(state.reporting.value).toBe(true)
    wrapper.unmount()
  })

  it('does not poll outside live-capable stages and resets when disabled or switching orders', async () => {
    getFlightProjection.mockResolvedValue(fresh)
    const { wrapper, state, orderId, enabled } = harness(ref('o1'), ref(false))
    await flushPromises()
    expect(getFlightProjection).not.toHaveBeenCalled()
    expect(state.reporting.value).toBe(false)

    enabled.value = true
    await flushPromises()
    expect(state.reporting.value).toBe(true)

    const next = deferred<object>()
    getFlightProjection.mockImplementationOnce(() => next.promise)
    orderId.value = 'o2'
    await flushPromises()
    expect(state.reporting.value).toBe(false)
    expect(getFlightProjection).toHaveBeenLastCalledWith('o2')
    next.resolve(fresh)
    await flushPromises()
    expect(state.reporting.value).toBe(true)

    enabled.value = false
    await flushPromises()
    expect(state.reporting.value).toBe(false)
    const calls = getFlightProjection.mock.calls.length
    await vi.advanceTimersByTimeAsync(FLIGHT_PROJECTION_POLL_MS * 2)
    expect(getFlightProjection).toHaveBeenCalledTimes(calls)
    wrapper.unmount()
  })

  it('stops polling on unmount and ignores a response that lands afterwards', async () => {
    const late = deferred<object>()
    getFlightProjection.mockResolvedValueOnce(stale).mockImplementationOnce(() => late.promise)
    const { wrapper, state } = harness()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(FLIGHT_PROJECTION_POLL_MS)
    expect(getFlightProjection).toHaveBeenCalledTimes(2)
    wrapper.unmount()
    late.resolve(fresh)
    await flushPromises()
    expect(state.reporting.value).toBe(false)
    await vi.advanceTimersByTimeAsync(FLIGHT_PROJECTION_POLL_MS * 5)
    expect(getFlightProjection).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores a late response for the previous order after switching orders', async () => {
    const old = deferred<object>()
    getFlightProjection.mockImplementationOnce(() => old.promise).mockResolvedValueOnce(stale)
    const { wrapper, state, orderId } = harness()
    await flushPromises()
    orderId.value = 'o2'
    await flushPromises()
    expect(getFlightProjection).toHaveBeenLastCalledWith('o2')
    expect(state.reporting.value).toBe(false)
    old.resolve(fresh)
    await flushPromises()
    expect(state.reporting.value).toBe(false)
    wrapper.unmount()
  })

  it('ignores an out-of-order older poll for the same order', async () => {
    const first = deferred<object>()
    getFlightProjection.mockImplementationOnce(() => first.promise).mockResolvedValueOnce(fresh)
    const { wrapper, state } = harness()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(FLIGHT_PROJECTION_POLL_MS)
    expect(state.reporting.value).toBe(true)
    first.resolve(stale)
    await flushPromises()
    expect(state.reporting.value).toBe(true)
    wrapper.unmount()
  })

  it('still applies a slow poll when no newer response has arrived', async () => {
    const first = deferred<object>()
    const second = deferred<object>()
    getFlightProjection.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)
    const { wrapper, state } = harness()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(FLIGHT_PROJECTION_POLL_MS)
    first.resolve(fresh)
    await flushPromises()
    expect(state.reporting.value).toBe(true)
    second.resolve(stale)
    await flushPromises()
    expect(state.reporting.value).toBe(false)
    wrapper.unmount()
  })
})
