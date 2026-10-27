import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DispatchSupervisePanel from '../../src/components/order/DispatchSupervisePanel.vue'

const { getFlightView } = vi.hoisted(() => ({ getFlightView: vi.fn() }))
vi.mock('../../src/api/modules/flight-record', () => ({ getFlightView }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('../../src/components/order/LiveStage.vue', () => ({ default: { name: 'LiveStage', template: '<div />' } }))
vi.mock('../../src/components/order/TelemetryPanel.vue', () => ({ default: { name: 'TelemetryPanel', template: '<div />' } }))
vi.mock('../../src/components/flight/FlightHistoryPanel.vue', () => ({
  default: { name: 'FlightHistoryPanel', props: ['orderId', 'active', 'liveExpected', 'declaredPayloadKg'], template: '<div />' },
}))

const mountPanel = (stage: string) => mount(DispatchSupervisePanel, {
  props: { orderId: 'o1', order: { orderId: 'o1', stage } },
  global: { stubs: { 'el-button': true } },
})

describe('DispatchSupervisePanel realtime gating (REQ-SUP-MON-007, docs#22)', () => {
  beforeEach(() => { vi.resetAllMocks() })
  afterEach(() => { vi.useRealTimers() })

  it('enables realtime once the aircraft is connected after pilot arrival, before IN_TRANSIT', async () => {
    getFlightView.mockResolvedValue({ connection: { connectionId: 'c1', openedAt: '2026-10-27T01:00:00Z' } })
    const wrapper = mountPanel('PILOT_ARRIVED')
    await flushPromises()
    const history = wrapper.findComponent({ name: 'FlightHistoryPanel' })
    expect(history.props('active')).toBe(true)
    expect(history.props('liveExpected')).toBe(true)
    wrapper.unmount()
  })

  it('keeps realtime off during IN_TRANSIT when the aircraft is not connected', async () => {
    getFlightView.mockResolvedValue({ connection: { connectionId: 'c1', endedAt: '2026-10-27T01:10:00Z' } })
    const wrapper = mountPanel('IN_TRANSIT')
    await flushPromises()
    const history = wrapper.findComponent({ name: 'FlightHistoryPanel' })
    expect(history.props('active')).toBe(false)
    expect(history.props('liveExpected')).toBe(true)
    wrapper.unmount()
  })

  it('does not poll connection state for completed orders', async () => {
    const wrapper = mountPanel('COMPLETED')
    await flushPromises()
    expect(getFlightView).not.toHaveBeenCalled()
    const history = wrapper.findComponent({ name: 'FlightHistoryPanel' })
    expect(history.props('active')).toBe(false)
    expect(history.props('liveExpected')).toBe(false)
    wrapper.unmount()
  })
})
