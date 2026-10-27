<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AMapLoader from '@amap/amap-jsapi-loader'
import { getMapConfig } from '../../api/modules/map-config'
import type { FlightSample } from '../../api/modules/flight-record'
import { wgs84ToGcj02, type LngLat } from '../../utils/coordinate'

type Coordinate = LngLat
type Overlay = {
  setPath?: (path: Coordinate[]) => void
  setPosition?: (position: Coordinate) => void
  setTitle?: (title: string) => void
}
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
  Marker: new (options: Record<string, unknown>) => Overlay
  Polyline: new (options: Record<string, unknown>) => Overlay
}
type TrackPoint = FlightSample & { latitude: number; longitude: number }

const props = defineProps<{
  samples: FlightSample[]
  selected?: FlightSample
  current?: FlightSample | null
  gaps?: Array<{ from: number; to: number }>
  /** 轨迹归属（如订单号）；变化时视为新轨迹，重新铺满视野 */
  trackKey?: string
}>()

const container = ref<HTMLElement>()
const status = ref<'loading' | 'ready' | 'unavailable'>('loading')
const error = ref('')
const samplePoints = computed(() => props.samples.filter(
  (sample): sample is TrackPoint =>
    Number.isFinite(sample.latitude) && Number.isFinite(sample.longitude),
))

const POINT_BUDGET = 300
const POLYLINE_STYLE = {
  strokeColor: '#1677ff',
  strokeWeight: 5,
  strokeOpacity: 0.85,
  lineJoin: 'round',
  lineCap: 'round',
}

let map: InstanceType<AMapInstance['Map']> | undefined
let amap: AMapInstance | undefined
let activeMarker: unknown
let disposed = false

// 已绘制轨迹的增量状态：实时推送只追加新点，不清图、不重算、不重置视野。
let renderedKeys: string[] = []
let renderedTrackKey: string | undefined
let lastRendered: TrackPoint | undefined
let tailPath: Coordinate[] = []
let tailLine: Overlay | undefined
let endMarker: Overlay | undefined
let fittedTrackKey: string | undefined
let fittedPointCount = 0

const sampleKey = (sample: FlightSample) => sample.sampleId != null
  ? `id:${sample.sampleId}`
  : `time:${sample.capturedAt}:${sample.connectionId ?? ''}`
const toMapCoordinate = (sample: FlightSample): Coordinate =>
  wgs84ToGcj02(sample.longitude!, sample.latitude!)
const sampleTime = (sample: FlightSample) =>
  sample.capturedAt == null ? '' : new Date(sample.capturedAt).toLocaleString()

const breaksTrack = (previous: FlightSample, sample: FlightSample) => {
  const connectionChanged = Boolean(
    previous.connectionId && sample.connectionId && previous.connectionId !== sample.connectionId,
  )
  return connectionChanged || (props.gaps ?? []).some((gap) =>
    previous.capturedAt != null && sample.capturedAt != null &&
    previous.capturedAt <= gap.from && sample.capturedAt >= gap.to,
  )
}

const resetRenderedState = () => {
  renderedKeys = []
  lastRendered = undefined
  tailPath = []
  tailLine = undefined
  endMarker = undefined
}

const renderActiveMarker = () => {
  if (!map || !amap) return
  const sample = props.current ?? props.selected
  if (activeMarker) map.remove(activeMarker)
  activeMarker = undefined
  if (!sample || !Number.isFinite(sample.latitude) || !Number.isFinite(sample.longitude)) return
  const position = toMapCoordinate(sample)
  activeMarker = new amap.Marker({
    position,
    title: props.current ? '实时位置' : '回放位置',
    label: { content: props.current ? '实时' : '回放', direction: 'top' },
    anchor: 'bottom-center',
  })
  map.add([activeMarker])
  if (props.current) map.setCenter(position)
}

const createEndMarker = (sample: TrackPoint, position: Coordinate) => new amap!.Marker({
  position,
  title: `终点 ${sampleTime(sample)}`,
  label: { content: '终点', direction: 'top' },
  anchor: 'bottom-center',
})

/** 只把新到的点接到尾段上；断联/换连接时另起一段。 */
const appendPoints = (points: TrackPoint[]) => {
  if (!map || !amap || !lastRendered) return
  for (const sample of points) {
    const position = toMapCoordinate(sample)
    if (breaksTrack(lastRendered, sample)) {
      tailPath = [position]
      tailLine = undefined
    } else {
      tailPath = [...tailPath, position]
      if (tailLine?.setPath) {
        tailLine.setPath(tailPath)
      } else if (tailPath.length > 1) {
        tailLine = new amap.Polyline({ path: tailPath, ...POLYLINE_STYLE })
        map.add([tailLine])
      }
    }
    if (endMarker?.setPosition) {
      endMarker.setPosition(position)
      endMarker.setTitle?.(`终点 ${sampleTime(sample)}`)
    } else {
      endMarker = createEndMarker(sample, position)
      map.add([endMarker])
    }
    renderedKeys.push(sampleKey(sample))
    lastRendered = sample
  }
}

/** 新点只是在已绘制轨迹末尾追加（同一条轨迹）时才能增量绘制。 */
const isAppendOnly = (points: TrackPoint[]) => {
  if (!renderedKeys.length || renderedTrackKey !== props.trackKey) return false
  if (points.length < renderedKeys.length) return false
  return renderedKeys.every((key, index) => sampleKey(points[index]) === key)
}

const renderFullTrack = (points: TrackPoint[]) => {
  if (!map || !amap) return
  map.clearMap()
  activeMarker = undefined
  resetRenderedState()
  renderedTrackKey = props.trackKey
  if (points.length === 0) return

  const paths: TrackPoint[][] = []
  let path: TrackPoint[] = []
  points.forEach((sample, index) => {
    const previous = points[index - 1]
    if (previous && breaksTrack(previous, sample) && path.length) {
      paths.push(path)
      path = []
    }
    path.push(sample)
  })
  if (path.length) paths.push(path)

  const pointLimit = Math.max(2, Math.floor(POINT_BUDGET / paths.length))
  const reducedPaths = paths.map((segment) => {
    if (segment.length <= pointLimit) return segment
    const stride = (segment.length - 1) / (pointLimit - 1)
    return Array.from({ length: pointLimit }, (_, index) => segment[Math.round(index * stride)])
  })

  const overlays: unknown[] = []
  reducedPaths.forEach((segment, index) => {
    const coordinates = segment.map(toMapCoordinate)
    const line = coordinates.length > 1
      ? new amap!.Polyline({ path: coordinates, ...POLYLINE_STYLE })
      : undefined
    if (line) overlays.push(line)
    if (index === reducedPaths.length - 1) {
      tailPath = coordinates
      tailLine = line
    }
  })

  const first = points[0]
  const last = points[points.length - 1]
  overlays.push(new amap.Marker({
    position: toMapCoordinate(first),
    title: `起点 ${sampleTime(first)}`,
    label: { content: '起点', direction: 'top' },
    anchor: 'bottom-center',
  }))
  if (first !== last) {
    endMarker = createEndMarker(last, toMapCoordinate(last))
    overlays.push(endMarker)
  }

  renderedKeys = points.map(sampleKey)
  lastRendered = last
  map.add(overlays)
  // 只在首次加载、切换订单（或此前只有单点）时铺满视野，避免覆盖监管员手动调整的视角。
  if (fittedPointCount < 2 || fittedTrackKey !== props.trackKey) {
    map.setFitView(overlays, false, [32, 32, 32, 32], 16)
    fittedTrackKey = props.trackKey
    fittedPointCount = points.length
  }
}

const renderTrack = () => {
  if (!map || !amap) return
  error.value = ''
  const points = samplePoints.value
  try {
    if (isAppendOnly(points)) {
      appendPoints(points.slice(renderedKeys.length))
    } else {
      renderFullTrack(points)
    }
    renderActiveMarker()
  } catch (cause) {
    if (!disposed) error.value = cause instanceof Error ? cause.message : '轨迹绘制失败'
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
    renderTrack()
  } catch (cause) {
    if (disposed) return
    status.value = 'unavailable'
    error.value = cause instanceof Error ? cause.message : '地图加载失败'
  }
})

watch(() => [props.samples, props.gaps, props.trackKey], renderTrack)
watch(() => [props.selected, props.current], renderActiveMarker)

onBeforeUnmount(() => {
  disposed = true
  map?.destroy()
  map = undefined
  resetRenderedState()
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
