import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FlightHistoryPanel from '../../src/components/flight/FlightHistoryPanel.vue'
import { deferred } from '../support/deferred'

const { getFlightProjection, loadFlightHistory, onFlightTelemetry } = vi.hoisted(() => ({
  getFlightProjection: vi.fn(),
  loadFlightHistory: vi.fn(),
  onFlightTelemetry: vi.fn<(
    handler: (orderId: string, event: { eventId?: string; type?: string; capturedAt: number }) => void,
  ) => void>(),
}))
vi.mock('../../src/api/modules/flight-record', () => ({ getFlightProjection, loadFlightHistory }))
vi.mock('../../src/api/ws/modules/flight-telemetry-ws', () => ({
  initFlightTelemetryWs: vi.fn(),
  offFlightTelemetry: vi.fn(),
  onFlightTelemetry,
}))
vi.mock('../../src/components/flight/FlightTrackMap.vue', () => ({
  default: {
    name: 'FlightTrackMap',
    props: ['samples', 'selected', 'gaps', 'current', 'trackKey'],
    template: '<div data-testid="flight-track-map" :data-points="samples?.length ?? 0" :data-gaps="gaps?.length ?? 0" />',
  },
}))

const position = (eventId: string, capturedAt: number, latitudeDegE7: number, longitudeDegE7: number) => ({
  eventId, type: 'POSITION', capturedAt, receivedAt: capturedAt,
  serialNumber: 'SN-1', serialSource: 'FLIGHT_CONTROLLER', payload: { latitudeDegE7, longitudeDegE7 },
})
const reading = (eventId: string, type: string, capturedAt: number, payload: Record<string, unknown>) => ({
  eventId, type, capturedAt, receivedAt: capturedAt, serialNumber: 'SN-1', serialSource: 'FLIGHT_CONTROLLER', payload,
})

describe('FlightHistoryPanel', () => {
  const mounted: Array<ReturnType<typeof mount>> = []

  beforeEach(() => {
    vi.resetAllMocks()
    getFlightProjection.mockResolvedValue(null)
    loadFlightHistory.mockResolvedValue({
      items: [
        position('p1', 1_000, 300_000_000, 1_200_000_000),
        reading('alt1', 'ALTITUDE', 1_000, { altitudeMm: 25_000 }),
        position('p2', 8_000, 301_000_000, 1_201_000_000),
        reading('b1', 'BATTERY', 8_000, { chargePermille: 790 }),
      ],
      hasNext: false,
    })
  })

  const mountPanel = (active = false, liveExpected = false) => mount(FlightHistoryPanel, {
    props: { orderId: 'dispatch-order-id', active, liveExpected },
    global: {
      stubs: {
        'el-button': {
          props: ['disabled', 'loading'],
          emits: ['click'],
          template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
        },
        'el-slider': { props: ['modelValue'], template: '<input type="range" :value="modelValue" />' },
        'el-table': { props: ['data'], template: '<div data-testid="periods">{{ JSON.stringify(data) }}</div>' },
        'el-table-column': { props: ['label'], template: '<div>{{ label }}</div>' },
        'v-loading': true,
      },
    },
  })

  afterEach(() => {
    while (mounted.length) mounted.pop()?.unmount()
    vi.useRealTimers()
    vi.resetAllMocks()
  })

  it('draws only POSITION events and shows each reading with its own capture time', async () => {
    const wrapper = mountPanel()
    mounted.push(wrapper)
    await flushPromises()
    expect(loadFlightHistory).toHaveBeenCalledWith('dispatch-order-id')
    expect(wrapper.get('[data-testid="flight-track-map"]').attributes('data-points')).toBe('2')
    expect(wrapper.get('[data-testid="flight-track-map"]').attributes('data-gaps')).toBe('1')
    expect(wrapper.text()).toContain('遥测中断区间')
    // Selected point is the first POSITION; only readings captured at or before it are shown.
    expect(wrapper.text()).toContain('高度 25 m')
    expect(wrapper.text()).not.toContain('电量')
  })

  it('shows an empty state when no event exists', async () => {
    loadFlightHistory.mockResolvedValueOnce({ items: [], hasNext: false })
    const wrapper = mountPanel()
    mounted.push(wrapper)
    await flushPromises()
    expect(wrapper.text()).toContain('暂无遥测数据')
    expect(wrapper.find('[data-testid="flight-track-map"]').exists()).toBe(false)
  })

  it('lists flight periods reported by the projection instead of connection records', async () => {
    const landedAt = Date.now() - 181 * 24 * 60 * 60 * 1000
    loadFlightHistory.mockResolvedValueOnce({ items: [], hasNext: false })
    getFlightProjection.mockResolvedValueOnce({
      aircraft: [],
      flightPeriods: [{ serialNumber: 'SN-1', serialSource: 'FLIGHT_CONTROLLER', takeoffAt: landedAt - 60_000, landedAt }],
      stale: true,
    })
    const wrapper = mountPanel()
    mounted.push(wrapper)
    await flushPromises()
    expect(wrapper.text()).toContain('已超过保留期（180 天）')
    expect(wrapper.get('[data-testid="periods"]').text()).toContain('SN-1')
  })

  it('does not classify a still-open flight period as expired', async () => {
    loadFlightHistory.mockResolvedValueOnce({ items: [], hasNext: false })
    getFlightProjection.mockResolvedValueOnce({
      aircraft: [],
      flightPeriods: [
        { serialNumber: 'SN-1', serialSource: 'FLIGHT_CONTROLLER', takeoffAt: 1_000, landedAt: 2_000 },
        { serialNumber: 'SN-1', serialSource: 'FLIGHT_CONTROLLER', takeoffAt: 3_000 },
      ],
      stale: true,
    })
    const wrapper = mountPanel()
    mounted.push(wrapper)
    await flushPromises()
    expect(wrapper.text()).toContain('暂无遥测数据')
    expect(wrapper.text()).not.toContain('已超过保留期')
  })

  it('shows the signal interruption duration for an active order', async () => {
    vi.useFakeTimers()
    const wrapper = mountPanel(true)
    mounted.push(wrapper)
    await flushPromises()
    const handler = onFlightTelemetry.mock.calls[0][0]
    handler('dispatch-order-id', position('p9', Date.now(), 300_000_000, 1_200_000_000))
    await flushPromises()
    expect(wrapper.text()).toContain('实时遥测')
    expect(wrapper.text()).not.toContain('信号中断')

    await vi.advanceTimersByTimeAsync(6_000)
    expect(wrapper.text()).toContain('信号中断 · 已中断 6 秒')
    expect(wrapper.find('[data-testid="flight-track-map"]').exists()).toBe(true)
  })

  it('extends the live track and allows playback to select a historical position', async () => {
    const wrapper = mountPanel(true)
    mounted.push(wrapper)
    await flushPromises()
    const handler = onFlightTelemetry.mock.calls[0][0]
    handler('dispatch-order-id', position('p3', 10_000, 310_000_000, 1_210_000_000))
    await flushPromises()
    const map = wrapper.findComponent({ name: 'FlightTrackMap' })
    expect(map.props('samples')).toHaveLength(3)
    expect(map.props('trackKey')).toBe('dispatch-order-id')
    expect(map.props('current')).toMatchObject({ capturedAt: 10_000 })
    await wrapper.findAll('button').find((button) => button.text() === '播放轨迹')!.trigger('click')
    expect(map.props('current')).toBeNull()
    expect(map.props('selected')).toMatchObject({ capturedAt: 1_000 })
    await wrapper.findAll('button').find((button) => button.text() === '返回实时位置')!.trigger('click')
    expect(map.props('current')).toMatchObject({ capturedAt: 10_000 })
  })

  it('seeds the live track from the projection last position and reports backend stale state', async () => {
    const lastPosition = position('p7', Date.now() - 45_000, 305_000_000, 1_205_000_000)
    getFlightProjection.mockResolvedValueOnce({ aircraft: [], lastPosition, stale: true })
    const wrapper = mountPanel(true)
    mounted.push(wrapper)
    await flushPromises()
    expect(getFlightProjection).toHaveBeenCalledWith('dispatch-order-id')
    expect(wrapper.text()).toContain('信号中断')
    // The map receives a decoded point, not the raw event: degE7 is converted once at the boundary.
    expect(wrapper.findComponent({ name: 'FlightTrackMap' }).props('current')).toMatchObject({
      eventId: 'p7', capturedAt: lastPosition.capturedAt, latitude: 30.5, longitude: 120.5,
    })
  })

  it('keeps the last successful history and map visible when refreshing fails', async () => {
    const wrapper = mountPanel()
    mounted.push(wrapper)
    await flushPromises()
    loadFlightHistory.mockRejectedValueOnce(new Error('历史服务暂不可用'))
    await wrapper.findAll('button').find((button) => button.text() === '刷新')!.trigger('click')
    await vi.waitFor(() => expect(loadFlightHistory).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(wrapper.text()).toContain('历史服务暂不可用'))
    expect(wrapper.get('[role="alert"]').text()).toContain('历史服务暂不可用')
    expect(wrapper.findComponent({ name: 'FlightTrackMap' }).props('samples')).toHaveLength(2)
    expect(wrapper.text()).toContain('高度 25 m')
  })

  it('shows live events even when the history service fails', async () => {
    loadFlightHistory.mockRejectedValueOnce(new Error('历史读取失败'))
    const wrapper = mountPanel(true)
    mounted.push(wrapper)
    await flushPromises()
    onFlightTelemetry.mock.calls[0][0]('dispatch-order-id', position('p4', Date.now(), 300_000_000, 1_200_000_000))
    await flushPromises()
    expect(wrapper.text()).toContain('历史读取失败')
    expect(wrapper.findComponent({ name: 'FlightTrackMap' }).props('samples')).toHaveLength(1)
  })

  it('does not let a rejected old order request overwrite the current order after its projection resolves', async () => {
    const pending = deferred<object>()
    loadFlightHistory.mockRejectedValueOnce(new Error('旧订单失败'))
    getFlightProjection.mockImplementationOnce(() => pending.promise)
    const wrapper = mountPanel(true)
    mounted.push(wrapper)
    await flushPromises()
    await wrapper.setProps({ orderId: 'new-order' })
    await flushPromises()
    pending.resolve({ aircraft: [], lastPosition: position('old', Date.now(), 300_000_000, 1_200_000_000), stale: false })
    await flushPromises()
    expect(wrapper.text()).not.toContain('旧订单失败')
    expect(wrapper.findComponent({ name: 'FlightTrackMap' }).props('samples')).toHaveLength(2)
  })

  it('shows 暂无数据 for realtime after pilot arrival while nothing is reporting', async () => {
    const wrapper = mountPanel(false, true)
    mounted.push(wrapper)
    await flushPromises()
    expect(wrapper.get('[data-testid="flight-live-empty"]').text()).toContain('暂无数据')
    expect(onFlightTelemetry).not.toHaveBeenCalled()
    expect(wrapper.findComponent({ name: 'FlightTrackMap' }).props('current')).toBeNull()
  })

  it('switches between realtime and 暂无数据 as events start and stop arriving', async () => {
    const wrapper = mountPanel(false, true)
    mounted.push(wrapper)
    await flushPromises()
    await wrapper.setProps({ active: true })
    await flushPromises()
    onFlightTelemetry.mock.calls[0][0]('dispatch-order-id', position('p5', Date.now(), 302_000_000, 1_202_000_000))
    await flushPromises()
    expect(wrapper.text()).toContain('实时遥测')
    expect(wrapper.find('[data-testid="flight-live-empty"]').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'FlightTrackMap' }).props('current')).toMatchObject({ latitude: 30.2 })

    await wrapper.setProps({ active: false })
    await flushPromises()
    expect(wrapper.get('[data-testid="flight-live-empty"]').text()).toContain('暂无数据')
    expect(wrapper.text()).not.toContain('信号中断')
    expect(wrapper.findComponent({ name: 'FlightTrackMap' }).props('current')).toBeNull()
    // The recorded track stays available for review.
    expect(wrapper.findComponent({ name: 'FlightTrackMap' }).props('samples')).toHaveLength(3)
  })

  it('does not show a realtime placeholder for orders that cannot be live', async () => {
    const wrapper = mountPanel(false, false)
    mounted.push(wrapper)
    await flushPromises()
    expect(wrapper.find('[data-testid="flight-live-empty"]').exists()).toBe(false)
  })
})
