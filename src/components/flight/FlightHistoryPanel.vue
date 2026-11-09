<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  getFlightProjection,
  loadFlightHistory,
  type FlightEvent,
  type FlightPeriod,
  type FlightProjection,
} from '../../api/modules/flight-record'
import FlightTrackMap from './FlightTrackMap.vue'
import { readingsAt, toFlightPoints, toFlightPoint, type FlightPoint } from '../../utils/flight-events'
import {
  initFlightTelemetryWs,
  offFlightTelemetry,
  onFlightTelemetry,
  type FlightTelemetryEvent,
} from '../../api/ws/modules/flight-telemetry-ws'

const props = defineProps<{
  orderId: string
  /** 有事件正在进来：订阅实时事件并显示实时位置 */
  active?: boolean
  /** 订单处于可飞阶段（飞手到场后）；无数据时实时区显示「暂无数据」 */
  liveExpected?: boolean
  declaredPayloadKg?: string
}>()

const events = ref<FlightEvent[]>([])
const periods = ref<FlightPeriod[]>([])
const loading = ref(false)
const error = ref('')
const selectedIndex = ref(0)
const latest = ref<FlightTelemetryEvent | null>(null)
const followingLive = ref(true)
const now = ref(Date.now())
const playing = ref(false)
const resultHasNext = ref(false)
const serverReportsStale = ref(false)
const RETENTION_MS = 180 * 24 * 60 * 60 * 1000
const MAX_SAMPLE_GAP_MS = 6_000
let sequence = 0
let loadedOrderId = ''
let timer: ReturnType<typeof setInterval> | undefined
let clockTimer: ReturnType<typeof setInterval> | undefined

/** 地图只画 POSITION 事件；其它类型是读数，不产生轨迹点。 */
const points = computed(() => toFlightPoints(events.value))
const selected = computed<FlightPoint | undefined>(() => points.value[selectedIndex.value])
/** 实时点：只有订单在飞且仍在收事件时才把最后一帧当作实时数据。 */
const livePoint = computed<FlightPoint | null>(() => {
  const event = props.active ? latest.value : null
  return event ? toFlightPoint(event) ?? null : null
})
const liveSample = computed<FlightPoint | null>(() =>
  livePoint.value && followingLive.value ? { ...livePoint.value } : null,
)
/** 选中时刻的各类读数，各自带采集时间；不做跨类型合成。 */
const selectedReadings = computed(() => readingsAt(events.value, selected.value?.capturedAt))
const liveReadings = computed(() => readingsAt(events.value))
const liveInterruptionMs = computed(() => {
  if (latest.value?.capturedAt == null) return 0
  const receivedAt = latest.value.receivedAt
  return Math.max(
    serverReportsStale.value ? MAX_SAMPLE_GAP_MS : 0,
    now.value - latest.value.capturedAt,
    receivedAt == null ? 0 : now.value - receivedAt,
  )
})
const gaps = computed(() => points.value.slice(1).flatMap((point, index) => {
  const previous = points.value[index]
  if (point.capturedAt - previous.capturedAt <= MAX_SAMPLE_GAP_MS) return []
  return [{ from: previous.capturedAt, to: point.capturedAt }]
}))
/** 超过保留期：有飞行区间记录、但事件已被 180 天清理。 */
const retentionExpired = computed(() => {
  if (events.value.length || latest.value || periods.value.length === 0) return false
  const landed = periods.value
    .map((period) => period.landedAt)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (landed.length === 0 || landed.length !== periods.value.length) return false
  return Date.now() - Math.max(...landed) > RETENTION_MS
})

const stop = () => {
  playing.value = false
  clearInterval(timer)
  timer = undefined
}
const togglePlayback = () => {
  if (playing.value) { stop(); return }
  if (points.value.length < 2) return
  followingLive.value = false
  if (selectedIndex.value >= points.value.length - 1) selectedIndex.value = 0
  playing.value = true
  timer = setInterval(() => {
    if (selectedIndex.value >= points.value.length - 1) { stop(); return }
    selectedIndex.value += 1
  }, 700)
}
const returnToLive = () => {
  stop()
  followingLive.value = true
  selectedIndex.value = Math.max(0, points.value.length - 1)
}
/**
 * 投影总是读取：起降区间与「所用飞机」是结单后回放的依据，不依赖是否在实时。
 * 只有订单在飞时才把最后位置并进轨迹——投影可能领先于本页历史分页。
 */
const applyProjection = (projection: FlightProjection | null) => {
  if (!projection) return
  periods.value = projection.flightPeriods ?? []
  if (!props.active) return
  const last = projection.lastPosition
  if (!last?.capturedAt) return
  const point = toFlightPoint(last)
  if (!point) return
  // 首帧实时位置可能先于任何 WebSocket 事件到达，投影就是它的来源。
  if (!latest.value || last.capturedAt! >= (latest.value.capturedAt ?? 0)) {
    latest.value = { ...last, orderId: props.orderId }
  }
  const known = events.value.some((event) => event.eventId === point.eventId)
  if (!known) {
    events.value = [...events.value, last].sort((left, right) =>
      (left.capturedAt ?? 0) - (right.capturedAt ?? 0) || (left.eventId ?? '').localeCompare(right.eventId ?? ''))
    if (followingLive.value) selectedIndex.value = Math.max(0, points.value.length - 1)
  }
  serverReportsStale.value = Boolean(projection.stale)
}
const load = async () => {
  const current = ++sequence
  stop()
  if (loadedOrderId !== props.orderId) {
    loadedOrderId = props.orderId
    events.value = []
    periods.value = []
    latest.value = null
    serverReportsStale.value = false
    followingLive.value = true
    selectedIndex.value = 0
  }
  resultHasNext.value = false
  error.value = ''
  loading.value = false
  if (!props.orderId) return
  loading.value = true
  const projectionPromise = getFlightProjection(props.orderId).catch(() => null)
  try {
    const result = await loadFlightHistory(props.orderId)
    const projection = await projectionPromise
    if (current !== sequence) return
    // 历史分页与 WebSocket 可能同时到达：按 eventId 去重后统一按 (capturedAt,eventId) 排序。
    const merged = new Map<string, FlightEvent>()
    for (const event of [...(result.items ?? []), ...events.value]) {
      const key = event.eventId ?? `${event.capturedAt}:${event.type}`
      merged.set(key, event)
    }
    events.value = [...merged.values()].sort((left, right) =>
      (left.capturedAt ?? 0) - (right.capturedAt ?? 0) || (left.eventId ?? '').localeCompare(right.eventId ?? ''))
    applyProjection(projection)
    if (props.active && followingLive.value && points.value.length) {
      selectedIndex.value = points.value.length - 1
    } else if (points.value.length) {
      selectedIndex.value = Math.min(selectedIndex.value, points.value.length - 1)
    } else {
      selectedIndex.value = 0
    }
    resultHasNext.value = result.hasNext ?? false
  } catch (cause) {
    if (current !== sequence) return
    const projection = await projectionPromise
    if (current === sequence) {
      applyProjection(projection)
      error.value = cause instanceof Error ? cause.message : '事件历史读取失败'
    }
  } finally {
    if (current === sequence) loading.value = false
  }
}
const handleLiveEvent = (incomingOrderId: string, event: FlightTelemetryEvent) => {
  if (incomingOrderId !== props.orderId) return
  if (event.capturedAt == null || !Number.isFinite(event.capturedAt)) return
  if (events.value.some((known) => known.eventId === event.eventId)) return
  latest.value = event
  serverReportsStale.value = false
  events.value = [...events.value, event].sort((left, right) =>
    (left.capturedAt ?? 0) - (right.capturedAt ?? 0) || (left.eventId ?? '').localeCompare(right.eventId ?? ''))
  if (event.type === 'POSITION' && followingLive.value) selectedIndex.value = Math.max(0, points.value.length - 1)
}
const formatTime = (value?: number | string | null) =>
  value == null ? '—' : new Date(typeof value === 'number' ? value : value).toLocaleString()
const aircraftLabel = (period: FlightPeriod) =>
  [period.serialNumber, period.serialSource].filter(Boolean).join(' · ') || '未知机身'
watch(() => [props.orderId, props.active] as const, load, { immediate: true })
watch(() => props.active, (active) => {
  if (active) {
    onFlightTelemetry(handleLiveEvent)
    initFlightTelemetryWs()
  } else {
    offFlightTelemetry(handleLiveEvent)
  }
}, { immediate: true })
onMounted(() => { clockTimer = setInterval(() => { now.value = Date.now() }, 1_000) })
onBeforeUnmount(() => {
  sequence += 1
  stop()
  clearInterval(clockTimer)
  offFlightTelemetry(handleLiveEvent)
})
</script>

<template>
  <section class="panel-card p-4 flight-history" v-loading="loading">
    <div class="flight-history__head">
      <div class="panel-title">事件历史与轨迹</div>
      <el-button size="small" :loading="loading" @click="load">刷新</el-button>
    </div>
    <div v-if="livePoint" class="flight-history__live" role="status">
      <strong>实时遥测</strong>
      <span>上报 {{ formatTime(livePoint.capturedAt) }}</span>
      <span v-for="reading in liveReadings" :key="reading.type">{{ reading.label }} {{ reading.value }}</span>
      <span>下单申报 {{ props.declaredPayloadKg ?? '—' }} kg</span>
    </div>
    <div v-else-if="props.liveExpected" class="flight-history__live" role="status" data-testid="flight-live-empty">
      <strong>实时遥测</strong>
      <span>暂无数据</span>
    </div>
    <div v-if="livePoint && (serverReportsStale || liveInterruptionMs >= MAX_SAMPLE_GAP_MS)" class="flight-history__outages" role="status">
      信号中断 · 已中断 {{ Math.floor(liveInterruptionMs / 1000) }} 秒，地图停留在最后位置
    </div>
    <div v-if="error" class="flight-history__empty" role="alert">{{ error }}</div>
    <div v-if="!loading && !error && retentionExpired" class="flight-history__empty" role="status">
      已超过保留期（180 天），轨迹与历史遥测不可查
    </div>
    <div v-else-if="!loading && !error && points.length === 0 && !livePoint" class="flight-history__empty">
      暂无遥测数据
    </div>
    <template v-if="points.length">
      <div v-if="gaps.length" class="flight-history__outages" role="status">
        <strong>遥测中断区间</strong>
        <span v-for="gap in gaps" :key="`${gap.from}-${gap.to}`">
          {{ formatTime(gap.from) }} 至 {{ formatTime(gap.to) }}
          （{{ Math.max(1, Math.round((gap.to - gap.from) / 1000)) }} 秒）
        </span>
      </div>
      <FlightTrackMap :samples="points" :selected="selected" :gaps="gaps" :current="liveSample" :track-key="props.orderId" />
      <div class="flight-history__controls">
        <el-button size="small" :disabled="points.length < 2" @click="togglePlayback">
          {{ playing ? '暂停' : '播放轨迹' }}
        </el-button>
        <el-button v-if="livePoint && !followingLive" size="small" @click="returnToLive">返回实时位置</el-button>
        <el-slider v-model="selectedIndex" aria-label="轨迹回放时间轴" :min="0" :max="Math.max(0, points.length - 1)" :show-tooltip="false" @update:model-value="followingLive = false; stop()" />
        <span>{{ selectedIndex + 1 }} / {{ points.length }}</span>
      </div>
      <div class="flight-history__metrics">
        <span>采集 {{ formatTime(selected?.capturedAt) }}</span>
        <span v-for="reading in selectedReadings" :key="reading.type">
          {{ reading.label }} {{ reading.value }}
          <small v-if="reading.capturedAt !== selected?.capturedAt">（{{ formatTime(reading.capturedAt) }}）</small>
        </span>
        <span>下单申报 {{ props.declaredPayloadKg ?? '—' }} kg</span>
      </div>
    </template>
    <FlightTrackMap v-else-if="livePoint" :samples="[]" :current="liveSample" :track-key="props.orderId" />
    <el-table v-if="periods.length" :data="periods" size="small" max-height="220" empty-text="暂无飞行区间">
      <el-table-column label="飞机" min-width="170">
        <template #default="{ row }">{{ aircraftLabel(row) }}</template>
      </el-table-column>
      <el-table-column label="起飞" min-width="150">
        <template #default="{ row }">{{ formatTime(row.takeoffAt) }}</template>
      </el-table-column>
      <el-table-column label="降落" min-width="150">
        <template #default="{ row }">{{ formatTime(row.landedAt) }}</template>
      </el-table-column>
    </el-table>
    <div v-if="resultHasNext" class="flight-history__empty" role="status">
      历史数据尚未全部加载，当前显示 {{ events.length.toLocaleString() }} 条事件；轨迹可能不完整，请刷新重试。
    </div>
  </section>
</template>

<style scoped>
.flight-history { min-width: 0; }
.flight-history__head, .flight-history__controls, .flight-history__metrics, .flight-history__live {
  display: flex; align-items: center; gap: 0.75rem;
}
.flight-history__live {
  flex-wrap: wrap; margin-top: 0.75rem; padding: 0.65rem 0.8rem;
  border-left: 3px solid var(--success); background: var(--bg-sunken); font-size: 0.82rem;
}
.flight-history__head { justify-content: space-between; }
.flight-history__outages {
  display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; margin: 0.75rem 0;
  padding: 0.65rem 0.8rem; border-left: 3px solid var(--warning);
  background: var(--bg-sunken); font-size: 0.82rem;
}
.flight-history__controls { margin-top: 0.5rem; }
.flight-history__controls .el-slider { flex: 1; }
.flight-history__metrics {
  flex-wrap: wrap; margin-top: 0.5rem; font-size: 0.85rem; color: var(--text-secondary);
}
.flight-history__metrics small { color: var(--text-secondary); opacity: 0.8; }
.flight-history__empty { padding: 1rem 0; color: var(--text-secondary); }
@media (max-width: 720px) {
  .flight-history__controls { flex-wrap: wrap; }
  .flight-history__controls .el-slider { flex-basis: 100%; order: 1; }
}
</style>
