<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AMapLoader from '@amap/amap-jsapi-loader'
import { getMapConfig } from '../../api/modules/map-config'
import type { FlightSample } from '../../api/modules/flight-record'

type Coordinate = [number, number]
type MapCoordinate = Coordinate | { getLng: () => number; getLat: () => number }
type AMapInstance = {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => {
    add: (overlays: unknown[]) => void
    clearMap: () => void
    destroy: () => void
    remove: (overlay: unknown) => void
    setFitView: (overlays?: unknown[], immediately?: boolean, avoid?: number[], maxZoom?: number) => void
    setCenter: (center: Coordinate) => void
    setZoom: (zoom: number) => void
  }
  Marker: new (options: Record<string, unknown>) => unknown
  Polyline: new (options: Record<string, unknown>) => unknown
  convertFrom: (
    coordinates: Coordinate | Coordinate[],
    type: 'gps',
    callback: (status: string, result: { info?: string; locations?: MapCoordinate[] }) => void,
  ) => void
}

const props = defineProps<{
  samples: FlightSample[]
  selected?: FlightSample
  current?: FlightSample | null
  gaps?: Array<{ from: number; to: number }>
}>()

const container = ref<HTMLElement>()
const status = ref<'loading' | 'ready' | 'unavailable'>('loading')
const error = ref('')
const samplePoints = computed(() => props.samples.filter(
  (sample): sample is FlightSample & { latitude: number; longitude: number } =>
    Number.isFinite(sample.latitude) && Number.isFinite(sample.longitude),
))

let map: InstanceType<AMapInstance['Map']> | undefined
let amap: AMapInstance | undefined
let renderSequence = 0
let markerSequence = 0
let activeMarker: unknown
let disposed = false

const convertChunk = (points: Coordinate[]) => new Promise<Coordinate[]>((resolve, reject) => {
  if (!amap || points.length === 0) {
    resolve(points)
    return
  }
  amap.convertFrom(points, 'gps', (resultStatus, result) => {
    if (resultStatus === 'complete' && result.info === 'ok' && result.locations?.length === points.length) {
      const positions = result.locations.map((point): Coordinate =>
        Array.isArray(point) ? point : [point.getLng(), point.getLat()],
      )
      if (positions.every(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))) {
        resolve(positions)
      } else {
        reject(new Error('GPS 坐标转换结果无效'))
      }
    } else {
      reject(new Error('GPS 坐标转换失败'))
    }
  })
})

const toGcj02 = async (points: Coordinate[]) => {
  if (!amap || points.length === 0) return points
  const converted: Coordinate[] = []
  for (let offset = 0; offset < points.length; offset += 40) {
    converted.push(...await convertChunk(points.slice(offset, offset + 40)))
  }
  return converted
}

const renderActiveMarker = async () => {
  if (!map || !amap) return
  const sequence = ++markerSequence
  const sample = props.current ?? props.selected
  if (!sample || !Number.isFinite(sample.latitude) || !Number.isFinite(sample.longitude)) {
    if (activeMarker) map.remove(activeMarker)
    activeMarker = undefined
    return
  }
  try {
    const [position] = await toGcj02([[sample.longitude!, sample.latitude!]])
    if (disposed || sequence !== markerSequence || !map || !amap) return
    if (activeMarker) map.remove(activeMarker)
    error.value = ''
    activeMarker = new amap.Marker({
      position,
      title: props.current ? '实时位置' : '回放位置',
      label: { content: props.current ? '实时' : '回放', direction: 'top' },
      anchor: 'bottom-center',
    })
    map.add([activeMarker])
    if (props.current) map.setCenter(position)
  } catch (cause) {
    if (!disposed && sequence === markerSequence) {
      error.value = cause instanceof Error ? cause.message : '位置坐标转换失败'
    }
  }
}

const renderTrack = async () => {
  if (!map || !amap) return
  const sequence = ++renderSequence
  markerSequence += 1
  error.value = ''
  map.clearMap()
  activeMarker = undefined
  if (samplePoints.value.length === 0) {
    await renderActiveMarker()
    return
  }

  try {
    const gapRanges = (props.gaps ?? []).map((gap) => [gap.from, gap.to] as const)
    const paths: Array<Array<FlightSample & { latitude: number; longitude: number }>> = []
    let path: Array<FlightSample & { latitude: number; longitude: number }> = []
    samplePoints.value.forEach((sample, index) => {
      const previous = samplePoints.value[index - 1]
      const connectionChanged = Boolean(
        previous?.connectionId && sample.connectionId &&
        previous.connectionId !== sample.connectionId,
      )
      const hasGap = previous && (connectionChanged || gapRanges.some(([from, to]) =>
        previous.capturedAt != null && sample.capturedAt != null &&
        previous.capturedAt <= from && sample.capturedAt >= to,
      ))
      if (hasGap && path.length) {
        paths.push(path)
        path = []
      }
      path.push(sample)
    })
    if (path.length) paths.push(path)

    const pointLimit = Math.max(2, Math.floor(300 / paths.length))
    const reducedPaths = paths.map((segment) => {
      if (segment.length <= pointLimit) return segment
      const stride = (segment.length - 1) / (pointLimit - 1)
      return Array.from({ length: pointLimit }, (_, index) => segment[Math.round(index * stride)])
    })
    const mapSamples = [...new Set(reducedPaths.flat())]
    const converted = await toGcj02(mapSamples.map(
      (sample) => [sample.longitude, sample.latitude] as Coordinate,
    ))
    if (disposed || sequence !== renderSequence || !map || !amap) return
    const convertedBySample = new Map(mapSamples.map((sample, index) => [sample, converted[index]]))

    const overlays: unknown[] = []
    for (const segment of reducedPaths) {
      const coordinates = segment.map((sample) => convertedBySample.get(sample)!)
      if (coordinates.length > 1) {
        overlays.push(new amap.Polyline({
          path: coordinates,
          strokeColor: '#1677ff',
          strokeWeight: 5,
          strokeOpacity: 0.85,
          lineJoin: 'round',
          lineCap: 'round',
        }))
      }
    }

    const first = samplePoints.value[0]
    const last = samplePoints.value[samplePoints.value.length - 1]
    const firstPoint = await toGcj02([[first.longitude, first.latitude]])
    const lastPoint = first === last
      ? firstPoint
      : await toGcj02([[last.longitude, last.latitude]])
    if (disposed || sequence !== renderSequence || !map || !amap) return
    overlays.push(new amap.Marker({
      position: firstPoint[0],
      title: `起点 ${first.capturedAt == null ? '' : new Date(first.capturedAt).toLocaleString()}`,
      label: { content: '起点', direction: 'top' },
      anchor: 'bottom-center',
    }))
    if (first !== last) {
      overlays.push(new amap.Marker({
        position: lastPoint[0],
        title: `终点 ${last.capturedAt == null ? '' : new Date(last.capturedAt).toLocaleString()}`,
        label: { content: '终点', direction: 'top' },
        anchor: 'bottom-center',
      }))
    }

    map.add(overlays)
    map.setFitView(overlays, false, [32, 32, 32, 32], 16)
    await renderActiveMarker()
  } catch (cause) {
    if (!disposed && sequence === renderSequence) {
      error.value = cause instanceof Error ? cause.message : '轨迹绘制失败'
    }
  }
}

onMounted(async () => {
  try {
    const config = await getMapConfig()
    if (disposed) return
    if (!config.key?.trim()) throw new Error('地图服务尚未配置')
    if (config.serviceHost) {
      window._AMapSecurityConfig = { serviceHost: config.serviceHost }
    }
    amap = await AMapLoader.load({ key: config.key, version: '2.0', plugins: ['AMap.Scale'] }) as AMapInstance
    if (disposed || !container.value) return
    map = new amap.Map(container.value, {
      viewMode: '2D',
      zoom: 12,
      resizeEnable: true,
      mapStyle: 'amap://styles/normal',
    })
    status.value = 'ready'
    await renderTrack()
  } catch (cause) {
    if (disposed) return
    status.value = 'unavailable'
    error.value = cause instanceof Error ? cause.message : '地图加载失败'
  }
})

watch(() => [props.samples, props.gaps], () => void renderTrack())
watch(() => [props.selected, props.current], () => void renderActiveMarker())

onBeforeUnmount(() => {
  disposed = true
  renderSequence += 1
  markerSequence += 1
  map?.destroy()
  map = undefined
})
</script>

<template>
  <div class="flight-map" data-testid="flight-map">
    <div ref="container" class="flight-map__canvas" aria-label="无人机飞行轨迹地图" />
    <div v-if="status === 'loading'" class="flight-map__message" role="status">正在加载地图…</div>
    <div v-else-if="status === 'unavailable'" class="flight-map__message" role="alert">
      {{ error || '地图暂不可用' }}
    </div>
    <div v-else-if="error" class="flight-map__message flight-map__message--error" role="alert">{{ error }}</div>
  </div>
</template>

<style scoped>
.flight-map {
  position: relative;
  min-height: 340px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: #e9f1f5;
}
.flight-map__canvas { position: absolute; inset: 0; }
.flight-map__message {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: color-mix(in srgb, var(--bg-sunken) 90%, transparent);
  color: var(--text-secondary);
  text-align: center;
}
.flight-map__message--error { inset: auto 0 0; }
</style>

<script lang="ts">
declare global {
  interface Window {
    _AMapSecurityConfig?: { serviceHost: string }
  }
}
</script>
