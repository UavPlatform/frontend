import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DispatchSupervisePanel from '../../src/components/order/DispatchSupervisePanel.vue'

const { getFlightProjection } = vi.hoisted(() => ({ getFlightProjection: vi.fn() }))
vi.mock('../../src/api/modules/flight-record', () => ({ getFlightProjection }))
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

const reporting = { aircraft: [{ serialNumber: 'SN1', serialSource: 'FLIGHT_CONTROLLER', stale: false }] }
const silent = { aircraft: [{ serialNumber: 'SN1', serialSource: 'FLIGHT_CONTROLLER', stale: true }] }

describe('DispatchSupervisePanel realtime gating (REQ-SUP-MON-007, ADR-0014)', () => {
  beforeEach(() => { vi.resetAllMocks() })
  afterEach(() => { vi.useRealTimers() })

  it('enables realtime once events are arriving after pilot arrival, before IN_TRANSIT', async () => {
    getFlightProjection.mockResolvedValue(reporting)
    const wrapper = mountPanel('PILOT_ARRIVED')
    await flushPromises()
    const history = wrapper.findComponent({ name: 'FlightHistoryPanel' })
    expect(history.props('active')).toBe(true)
    expect(history.props('liveExpected')).toBe(true)
    wrapper.unmount()
  })

  it('keeps realtime off during IN_TRANSIT while every aircraft projection is stale', async () => {
    getFlightProjection.mockResolvedValue(silent)
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
    expect(getFlightProjection).not.toHaveBeenCalled()
    const history = wrapper.findComponent({ name: 'FlightHistoryPanel' })
    expect(history.props('active')).toBe(false)
    expect(history.props('liveExpected')).toBe(false)
    wrapper.unmount()
  })
})
