import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FlightHistoryPanel from '../../src/components/flight/FlightHistoryPanel.vue'

const { loadFlightHistory } = vi.hoisted(() => ({ loadFlightHistory: vi.fn() }))
vi.mock('../../src/api/modules/flight-record', () => ({ loadFlightHistory }))
vi.mock('../../src/api/ws/modules/flight-telemetry-ws', () => ({
  initFlightTelemetryWs: vi.fn(),
  offFlightTelemetry: vi.fn(),
  onFlightTelemetry: vi.fn(),
}))

describe('FlightHistoryPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    loadFlightHistory.mockResolvedValue({
      items: [
        { sampleId: 1, capturedAt: 1_000, latitude: 30, longitude: 120, altitude: 25, speed: 4, battery: 80 },
        { sampleId: 2, capturedAt: 2_000, latitude: 30.1, longitude: 120.1, altitude: 35, speed: 5, battery: 79 },
      ],
      connections: [{ connectionId: 'c1', modelName: 'FlyCart', serialNumber: 'SN-1', endReason: 'RETURNED' }],
    })
  })

  const mountPanel = () => mount(FlightHistoryPanel, {
    props: { orderId: 'dispatch-order-id' },
    global: {
      stubs: {
        'el-button': { props: ['disabled', 'loading'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
        'el-slider': { props: ['modelValue'], template: '<input type="range" :value="modelValue" />' },
        'el-table': { props: ['data'], template: '<div><slot /></div>' },
        'el-table-column': { props: ['label', 'prop'], template: '<div><slot :row="row" /></div>', setup: () => ({ row: { modelName: 'FlyCart', serialNumber: 'SN-1', openedAt: '2026-10-25T00:00:00Z', endedAt: '2026-10-25T00:01:00Z', endReason: 'RETURNED' } }) },
        'v-loading': true,
      },
    },
  })

  it('renders the sampled path, selected telemetry, and connection identity', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(loadFlightHistory).toHaveBeenCalledWith('dispatch-order-id')
    expect(wrapper.find('polyline').exists()).toBe(true)
    expect(wrapper.text()).toContain('高度 25 m')
    expect(wrapper.text()).toContain('FlyCart · SN-1')
  })

  it('shows a clear empty state when no samples exist', async () => {
    loadFlightHistory.mockResolvedValueOnce({ items: [], connections: [] })
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.text()).toContain('暂无历史采样')
  })
})
