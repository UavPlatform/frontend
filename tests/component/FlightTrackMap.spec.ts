import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FlightTrackMap from '../../src/components/flight/FlightTrackMap.vue'
import { wgs84ToGcj02 } from '../../src/utils/coordinate'

const { getMapConfig, load, mapInstance, MapConstructor, Marker, Polyline, convertFrom } = vi.hoisted(() => {
  const mapInstance = {
    add: vi.fn(),
    clearMap: vi.fn(),
    destroy: vi.fn(),
    remove: vi.fn(),
    setFitView: vi.fn(),
    setCenter: vi.fn(),
    setZoom: vi.fn(),
  }
  // Present only to prove the component no longer calls the online conversion API.
  const convertFrom = vi.fn()
  const MapConstructor = vi.fn(function Map() { return mapInstance })
  const Marker = vi.fn(function Marker(options: Record<string, unknown>) {
    return { kind: 'marker', ...options, setPosition: vi.fn(), setTitle: vi.fn() }
  })
  const Polyline = vi.fn(function Polyline(options: Record<string, unknown>) {
    return { kind: 'polyline', ...options, setPath: vi.fn() }
  })
  const load = vi.fn()
  const getMapConfig = vi.fn()
  return { getMapConfig, load, mapInstance, MapConstructor, Marker, Polyline, convertFrom }
})

vi.mock('@amap/amap-jsapi-loader', () => ({ default: { load } }))
vi.mock('../../src/api/modules/map-config', () => ({ getMapConfig }))

const gcj = (lng: number, lat: number) => wgs84ToGcj02(lng, lat)
const sample = (index: number, extra: Record<string, unknown> = {}) => ({
  sampleId: index, capturedAt: index * 2_000, latitude: 30 + index * 0.001, longitude: 120 + index * 0.001, ...extra,
})
const markerTitled = (prefix: string) =>
  Marker.mock.results.map((result) => result.value).find((marker) => String(marker.title).startsWith(prefix))

describe('FlightTrackMap', () => {
  afterEach(() => { vi.restoreAllMocks() })
  beforeEach(() => {
    vi.clearAllMocks()
    getMapConfig.mockResolvedValue({ key: 'public-map-key', serviceHost: 'https://map-proxy.example' })
    load.mockResolvedValue({ Map: MapConstructor, Marker, Polyline, convertFrom })
  })

  it('converts GPS coordinates locally, renders the track, and centers on the live position', async () => {
    mount(FlightTrackMap, {
      props: {
        samples: [
          { sampleId: 1, capturedAt: 1_000, latitude: 30, longitude: 120 },
          { sampleId: 2, capturedAt: 2_000, latitude: 31, longitude: 121 },
        ],
        current: { capturedAt: 3_000, latitude: 32, longitude: 122 },
      },
    })
    await flushPromises()

    expect(load).toHaveBeenCalledWith({
      key: 'public-map-key',
      version: '2.0',
      plugins: ['AMap.Scale'],
    })
    expect(convertFrom).not.toHaveBeenCalled()
    expect(Polyline).toHaveBeenCalledWith(expect.objectContaining({
      path: [gcj(120, 30), gcj(121, 31)],
    }))
    expect(Marker).toHaveBeenCalledWith(expect.objectContaining({ title: '实时位置' }))
    expect(mapInstance.setCenter).toHaveBeenCalledWith(gcj(122, 32))
    expect(mapInstance.setFitView).toHaveBeenCalledTimes(1)
  })

  it('reports a missing public map key without loading the map SDK', async () => {
    getMapConfig.mockResolvedValueOnce({ key: '  ', serviceHost: undefined })
    const wrapper = mount(FlightTrackMap, { props: { samples: [] } })
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('地图服务尚未配置')
    expect(load).not.toHaveBeenCalled()
  })

  it('reports map configuration failures accessibly', async () => {
    getMapConfig.mockRejectedValueOnce(new Error('配置服务不可用'))
    const wrapper = mount(FlightTrackMap, { props: { samples: [] } })
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('配置服务不可用')
    expect(load).not.toHaveBeenCalled()
  })

  it('works when the map SDK exposes no online conversion API', async () => {
    load.mockResolvedValueOnce({ Map: MapConstructor, Marker, Polyline })
    const wrapper = mount(FlightTrackMap, {
      props: { samples: [], current: { latitude: 30, longitude: 120 } },
    })
    await flushPromises()
    expect(mapInstance.setCenter).toHaveBeenCalledWith(gcj(120, 30))
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('appends realtime samples incrementally without redrawing or resetting the view', async () => {
    const history = [sample(1), sample(2)]
    const wrapper = mount(FlightTrackMap, { props: { samples: history, trackKey: 'order-1' } })
    await flushPromises()
    expect(mapInstance.clearMap).toHaveBeenCalledTimes(1)
    expect(mapInstance.setFitView).toHaveBeenCalledTimes(1)
    expect(Polyline).toHaveBeenCalledTimes(1)
    const line = Polyline.mock.results[0].value
    const end = markerTitled('终点')

    // FlightHistoryPanel builds a new array for every pushed sample.
    let samples = history
    for (const index of [3, 4, 5]) {
      samples = [...samples, sample(index)]
      await wrapper.setProps({ samples, current: sample(index) })
    }
    await flushPromises()

    expect(mapInstance.clearMap).toHaveBeenCalledTimes(1)
    expect(mapInstance.setFitView).toHaveBeenCalledTimes(1)
    expect(Polyline).toHaveBeenCalledTimes(1)
    expect(line.setPath).toHaveBeenCalledTimes(3)
    expect(line.setPath).toHaveBeenLastCalledWith([1, 2, 3, 4, 5].map((index) => gcj(120 + index * 0.001, 30 + index * 0.001)))
    expect(end.setPosition).toHaveBeenLastCalledWith(gcj(120.005, 30.005))
    expect(Marker.mock.calls.filter(([options]) => String(options.title).startsWith('终点'))).toHaveLength(1)
    expect(convertFrom).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('starts a new segment when a realtime sample arrives after an outage', async () => {
    const wrapper = mount(FlightTrackMap, { props: { samples: [sample(1), sample(2)], trackKey: 'order-1' } })
    await flushPromises()
    const firstLine = Polyline.mock.results[0].value
    const afterGap = [sample(1), sample(2), sample(10)]
    await wrapper.setProps({ samples: afterGap, gaps: [{ from: 4_000, to: 20_000 }] })
    expect(Polyline).toHaveBeenCalledTimes(1)
    await wrapper.setProps({ samples: [...afterGap, sample(11)] })
    expect(Polyline).toHaveBeenCalledTimes(2)
    expect(Polyline.mock.calls[1][0].path).toEqual([gcj(120.01, 30.01), gcj(120.011, 30.011)])
    expect(firstLine.setPath).not.toHaveBeenCalled()
    expect(mapInstance.clearMap).toHaveBeenCalledTimes(1)
    expect(mapInstance.setFitView).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('redraws without refitting when history is merged into the same order', async () => {
    const wrapper = mount(FlightTrackMap, { props: { samples: [sample(3), sample(4)], trackKey: 'order-1' } })
    await flushPromises()
    await wrapper.setProps({ samples: [sample(1), sample(2), sample(3), sample(4)] })
    expect(mapInstance.clearMap).toHaveBeenCalledTimes(2)
    expect(mapInstance.setFitView).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('refits the view when switching to another order', async () => {
    const wrapper = mount(FlightTrackMap, { props: { samples: [sample(1), sample(2)], trackKey: 'order-1' } })
    await flushPromises()
    await wrapper.setProps({ samples: [sample(1), sample(2)], trackKey: 'order-2' })
    expect(mapInstance.clearMap).toHaveBeenCalledTimes(2)
    expect(mapInstance.setFitView).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('fits once the first real track replaces a single live point', async () => {
    const wrapper = mount(FlightTrackMap, { props: { samples: [sample(5)], trackKey: 'order-1' } })
    await flushPromises()
    await wrapper.setProps({ samples: [sample(1), sample(2), sample(5)] })
    await wrapper.setProps({ samples: [sample(0), sample(1), sample(2), sample(5)] })
    expect(mapInstance.setFitView).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('does not join track segments across a telemetry outage', async () => {
    const wrapper = mount(FlightTrackMap, {
      props: {
        samples: [1_000, 3_000, 12_000, 14_000].map((capturedAt, index) => ({
          capturedAt, latitude: 30 + index, longitude: 120 + index,
        })),
        gaps: [{ from: 3_000, to: 12_000 }],
      },
    })
    await flushPromises()
    expect(Polyline).toHaveBeenCalledTimes(2)
    expect(Polyline.mock.calls.map(([options]) => options.path)).toEqual([
      [gcj(120, 30), gcj(121, 31)],
      [gcj(122, 32), gcj(123, 33)],
    ])
    wrapper.unmount()
  })

  it('keeps separate paths when the aircraft connection changes without labeling it an outage', async () => {
    const wrapper = mount(FlightTrackMap, {
      props: {
        samples: [
          { capturedAt: 1_000, connectionId: 'first', latitude: 30, longitude: 120 },
          { capturedAt: 3_000, connectionId: 'first', latitude: 31, longitude: 121 },
          { capturedAt: 4_000, connectionId: 'second', latitude: 32, longitude: 122 },
          { capturedAt: 6_000, connectionId: 'second', latitude: 33, longitude: 123 },
        ],
      },
    })
    await flushPromises()
    expect(Polyline).toHaveBeenCalledTimes(2)
    expect(Polyline.mock.calls.map(([options]) => options.path)).toEqual([
      [gcj(120, 30), gcj(121, 31)],
      [gcj(122, 32), gcj(123, 33)],
    ])
    wrapper.unmount()
  })
})
