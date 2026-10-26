import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FlightTrackMap from '../../src/components/flight/FlightTrackMap.vue'

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
  const convertFrom = vi.fn((coordinates: [number, number] | [number, number][], _type: string, callback: (status: string, result: { info: string; locations: [number, number][] }) => void) => {
    const points = Array.isArray(coordinates[0])
      ? coordinates as [number, number][]
      : [coordinates as [number, number]]
    callback('complete', { info: 'ok', locations: points.map(([lng, lat]) => [lng + 0.01, lat + 0.01]) })
  })
  const MapConstructor = vi.fn(function Map() { return mapInstance })
  const Marker = vi.fn(function Marker(options: Record<string, unknown>) {
    return { kind: 'marker', ...options }
  })
  const Polyline = vi.fn(function Polyline(options: Record<string, unknown>) {
    return { kind: 'polyline', ...options }
  })
  const load = vi.fn()
  const getMapConfig = vi.fn()
  return { getMapConfig, load, mapInstance, MapConstructor, Marker, Polyline, convertFrom }
})

vi.mock('@amap/amap-jsapi-loader', () => ({ default: { load } }))
vi.mock('../../src/api/modules/map-config', () => ({ getMapConfig }))

describe('FlightTrackMap', () => {
  afterEach(() => { vi.restoreAllMocks() })
  beforeEach(() => {
    vi.clearAllMocks()
    getMapConfig.mockResolvedValue({ key: 'public-map-key', serviceHost: 'https://map-proxy.example' })
    load.mockResolvedValue({ Map: MapConstructor, Marker, Polyline, convertFrom })
  })

  it('converts GPS coordinates, renders the track, and centers on the live position', async () => {
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
    expect(convertFrom).toHaveBeenCalledWith(expect.any(Array), 'gps', expect.any(Function))
    expect(Polyline).toHaveBeenCalledWith(expect.objectContaining({
      path: [[120.01, 30.01], [121.01, 31.01]],
    }))
    expect(Marker).toHaveBeenCalledWith(expect.objectContaining({ title: '实时位置' }))
    expect(mapInstance.setCenter).toHaveBeenCalledWith([122.01, 32.01])
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

  it('accepts LngLat objects returned by the map SDK', async () => {
    const convert = vi.fn((_coordinates, _type, callback) => {
      callback('complete', { info: 'ok', locations: [{ getLng: () => 120.01, getLat: () => 30.01 }] })
    })
    load.mockResolvedValueOnce({ Map: MapConstructor, Marker, Polyline, convertFrom: convert })
    const wrapper = mount(FlightTrackMap, {
      props: { samples: [], current: { latitude: 30, longitude: 120 } },
    })
    await flushPromises()
    expect(mapInstance.setCenter).toHaveBeenCalledWith([120.01, 30.01])
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
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
      [[120.01, 30.01], [121.01, 31.01]],
      [[122.01, 32.01], [123.01, 33.01]],
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
      [[120.01, 30.01], [121.01, 31.01]],
      [[122.01, 32.01], [123.01, 33.01]],
    ])
    wrapper.unmount()
  })
})
