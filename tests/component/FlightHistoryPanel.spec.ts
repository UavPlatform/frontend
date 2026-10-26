import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FlightHistoryPanel from '../../src/components/flight/FlightHistoryPanel.vue'

const { getFlightView, loadFlightHistory, onFlightTelemetry } = vi.hoisted(() => ({
  getFlightView: vi.fn(),
  loadFlightHistory: vi.fn(),
  onFlightTelemetry: vi.fn<(
    handler: (orderId: string, sample: { capturedAt: number; latitude: number; longitude: number }) => void,
  ) => void>(),
}))
vi.mock('../../src/api/modules/flight-record', () => ({ getFlightView, loadFlightHistory }))
vi.mock('../../src/api/ws/modules/flight-telemetry-ws', () => ({
  initFlightTelemetryWs: vi.fn(),
  offFlightTelemetry: vi.fn(),
  onFlightTelemetry,
}))
vi.mock('../../src/components/flight/FlightTrackMap.vue', () => ({
  default: {
    name: 'FlightTrackMap',
    props: ['samples', 'selected', 'gaps', 'current'],
    template: '<div data-testid="flight-track-map" :data-points="samples?.length ?? 0" :data-gaps="gaps?.length ?? 0" />',
  },
}))

describe('FlightHistoryPanel', () => {
  const mounted: Array<ReturnType<typeof mount>> = []

  beforeEach(() => {
    vi.resetAllMocks()
    getFlightView.mockResolvedValue(null)
    loadFlightHistory.mockResolvedValue({
      items: [
        { sampleId: 1, capturedAt: 1_000, latitude: 30, longitude: 120, altitude: 25, speed: 4, battery: 80 },
        { sampleId: 2, capturedAt: 8_000, latitude: 30.1, longitude: 120.1, altitude: 35, speed: 5, battery: 79 },
      ],
      connections: [{ connectionId: 'c1', modelName: 'FlyCart', serialNumber: 'SN-1', openedAt: '2026-10-25T00:00:00Z', endedAt: '2026-10-25T00:01:00Z', endReason: 'RETURNED' }],
    })
  })

  const mountPanel = (active = false) => mount(FlightHistoryPanel, {
    props: { orderId: 'dispatch-order-id', active },
    global: {
      stubs: {
        'el-button': {
          props: ['disabled', 'loading'],
          emits: ['click'],
          template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
        },
        'el-slider': { props: ['modelValue'], template: '<input type="range" :value="modelValue" />' },
        'el-table': { props: ['data'], template: '<div><slot /></div>' },
        'el-table-column': { props: ['label', 'prop'], template: '<div><slot :row="row" /></div>', setup: () => ({ row: { modelName: 'FlyCart', serialNumber: 'SN-1', openedAt: '2026-10-25T00:00:00Z', endedAt: '2026-10-25T00:01:00Z', endReason: 'RETURNED' } }) },
        'v-loading': true,
      },
    },
  })

  afterEach(() => {
    while (mounted.length) mounted.pop()?.unmount()
    vi.useRealTimers()
    vi.resetAllMocks()
  })

  it('passes samples and outage intervals to the map and renders telemetry and connection identity', async () => {
    const wrapper = mountPanel()
    mounted.push(wrapper)
    await flushPromises()
    expect(loadFlightHistory).toHaveBeenCalledWith('dispatch-order-id')
    expect(wrapper.get('[data-testid="flight-track-map"]').attributes('data-points')).toBe('2')
    expect(wrapper.get('[data-testid="flight-track-map"]').attributes('data-gaps')).toBe('1')
    expect(wrapper.text()).toContain('遥测中断区间')
    expect(wrapper.text()).toContain('高度 25 m')
    expect(wrapper.text()).toContain('FlyCart · SN-1')
  })

  it('shows an empty state when there is no telemetry', async () => {
    loadFlightHistory.mockResolvedValueOnce({ items: [], connections: [] })
    const wrapper = mountPanel()
    mounted.push(wrapper)
    await flushPromises()
    expect(wrapper.text()).toContain('暂无遥测数据')
    expect(wrapper.find('[data-testid="flight-track-map"]').exists()).toBe(false)
  })

  it('explains when all connection history is outside the retention period', async () => {
    const expiredAt = new Date(Date.now() - 181 * 24 * 60 * 60 * 1000).toISOString()
    loadFlightHistory.mockResolvedValueOnce({
      items: [],
      connections: [{ connectionId: 'old', endedAt: expiredAt }],
    })
    const wrapper = mountPanel()
    mounted.push(wrapper)
    await flushPromises()
    expect(wrapper.text()).toContain('已超过保留期（180 天）')
  })

  it('does not classify a still-active connection as expired', async () => {
    const expiredAt = new Date(Date.now() - 181 * 24 * 60 * 60 * 1000).toISOString()
    loadFlightHistory.mockResolvedValueOnce({
      items: [],
      connections: [{ connectionId: 'old', endedAt: expiredAt }, { connectionId: 'active' }],
    })
    const wrapper = mountPanel()
    mounted.push(wrapper)
    await flushPromises()
    expect(wrapper.text()).toContain('暂无遥测数据')
    expect(wrapper.text()).not.toContain('已超过保留期')
  })

  it('shows the signal interruption duration and keeps connection records without samples', async () => {
    vi.useFakeTimers()
    const openedAt = '2026-10-25T00:00:00Z'
    loadFlightHistory.mockResolvedValueOnce({
      items: [],
      connections: [{ connectionId: 'c1', openedAt, modelName: 'FlyCart' }],
    })
    const wrapper = mountPanel(true)
    mounted.push(wrapper)
    await flushPromises()
    const handler = onFlightTelemetry.mock.calls[0][0]
    handler('dispatch-order-id', { capturedAt: Date.now(), latitude: 30, longitude: 120 })
    await flushPromises()
    expect(wrapper.text()).toContain('FlyCart')
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
    handler('dispatch-order-id', { capturedAt: 10_000, latitude: 31, longitude: 121 })
    await flushPromises()
    const map = wrapper.findComponent({ name: 'FlightTrackMap' })
    expect(map.props('samples')).toHaveLength(3)
    expect(map.props('current')).toMatchObject({ capturedAt: 10_000 })
    await wrapper.findAll('button').find((button) => button.text() === '播放轨迹')!.trigger('click')
    expect(map.props('current')).toBeNull()
    expect(map.props('selected')).toMatchObject({ capturedAt: 1_000 })
    await wrapper.findAll('button').find((button) => button.text() === '返回实时位置')!.trigger('click')
    expect(map.props('current')).toMatchObject({ capturedAt: 10_000 })
  })

  it('loads the current flight snapshot for an active order and reports backend stale state', async () => {
    const sample = {
      sampleId: 3,
      capturedAt: Date.now() - 45_000,
      latitude: 30.5,
      longitude: 120.5,
      altitude: 42,
      speed: 3,
      battery: 75,
    }
    getFlightView.mockResolvedValueOnce({ latest: sample, lastPosition: sample, stale: true })
    const wrapper = mount(FlightHistoryPanel, {
      props: { orderId: 'dispatch-order-id', active: true },
      global: {
        stubs: {
          'el-button': true,
          'el-slider': true,
          'el-table': true,
          'el-table-column': true,
          'v-loading': true,
        },
      },
    })
    mounted.push(wrapper)
    await flushPromises()
    expect(getFlightView).toHaveBeenCalledWith('dispatch-order-id')
    expect(wrapper.text()).toContain('信号中断')
    expect(wrapper.findComponent({ name: 'FlightTrackMap' }).props('current')).toMatchObject(sample)
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

  it('shows live samples even when the history service fails', async () => {
    loadFlightHistory.mockRejectedValueOnce(new Error('历史读取失败'))
    const wrapper = mountPanel(true)
    mounted.push(wrapper)
    await flushPromises()
    onFlightTelemetry.mock.calls[0][0]('dispatch-order-id', {
      capturedAt: Date.now(), latitude: 30, longitude: 120,
    })
    await flushPromises()
    expect(wrapper.text()).toContain('历史读取失败')
    expect(wrapper.findComponent({ name: 'FlightTrackMap' }).props('samples')).toHaveLength(1)
  })

  it('does not let a rejected old order request overwrite the current order after its snapshot resolves', async () => {
    let rejectOld!: (cause: Error) => void
    let resolveOldView!: (view: object) => void
    loadFlightHistory.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject }))
    getFlightView.mockImplementationOnce(() => new Promise((resolve) => { resolveOldView = resolve }))
    const wrapper = mountPanel(true)
    mounted.push(wrapper)
    rejectOld(new Error('旧订单失败'))
    await flushPromises()
    await wrapper.setProps({ orderId: 'new-order' })
    await flushPromises()
    resolveOldView({ latest: { capturedAt: Date.now(), altitude: 999 }, stale: false })
    await flushPromises()
    expect(wrapper.text()).not.toContain('旧订单失败')
    expect(wrapper.text()).not.toContain('999')
    expect(wrapper.findComponent({ name: 'FlightTrackMap' }).props('samples')).toHaveLength(2)
  })
})
