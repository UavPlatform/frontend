<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  getFlightView,
  loadFlightHistory,
  type FlightConnection,
  type FlightSample,
  type FlightView,
} from '../../api/modules/flight-record'
import FlightTrackMap from './FlightTrackMap.vue'
import {
  initFlightTelemetryWs,
  offFlightTelemetry,
  onFlightTelemetry,
  type FlightTelemetryEvent,
} from '../../api/ws/modules/flight-telemetry-ws'

const props = defineProps<{
  orderId: string
  /** 飞机已连机：订阅实时遥测并显示实时位置 */
  active?: boolean
  /** 订单处于可连机阶段（飞手到场后）；未连机时实时区显示「暂无数据」 */
  liveExpected?: boolean
  declaredPayloadKg?: string
}>()

const samples = ref<FlightSample[]>([])
const connections = ref<FlightConnection[]>([])
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

const selected = computed(() => samples.value[selectedIndex.value])
/** 实时数据只在连机期间展示；断开后不再把最后一帧当作实时数据。 */
const liveLatest = computed(() => (props.active ? latest.value : null))
const liveSample = computed<FlightSample | null>(() =>
  liveLatest.value && followingLive.value ? { ...liveLatest.value } : null,
)
const liveInterruptionMs = computed(() => {
  if (latest.value?.capturedAt == null) return 0
  const receivedAt = latest.value.receivedAt == null
    ? undefined
    : new Date(latest.value.receivedAt).getTime()
  return Math.max(
    serverReportsStale.value ? MAX_SAMPLE_GAP_MS : 0,
    now.value - latest.value.capturedAt,
    receivedAt == null || !Number.isFinite(receivedAt) ? 0 : now.value - receivedAt,
  )
})
const gaps = computed(() => samples.value.slice(1).flatMap((sample, index) => {
  const previous = samples.value[index]
  if (previous.capturedAt == null || sample.capturedAt == null) return []
  if (sample.capturedAt - previous.capturedAt <= MAX_SAMPLE_GAP_MS) return []
  return [{ from: previous.capturedAt, to: sample.capturedAt }]
}))
const retentionExpired = computed(() => {
  if (samples.value.length || latest.value) return false
  const ended = connections.value
    .map((connection) => connection.endedAt ? new Date(connection.endedAt).getTime() : Number.NaN)
    .filter(Number.isFinite)
  if (ended.length === 0 || ended.length !== connections.value.length) return false
  return Date.now() - Math.max(...ended) > RETENTION_MS
})

const stop = () => {
  playing.value = false
  if (timer !== undefined) clearInterval(timer)
  timer = undefined
}
const togglePlayback = () => {
  if (playing.value) { stop(); return }
  if (samples.value.length < 2) return
  followingLive.value = false
  if (selectedIndex.value >= samples.value.length - 1) selectedIndex.value = 0
  playing.value = true
  timer = setInterval(() => {
    if (selectedIndex.value >= samples.value.length - 1) { stop(); return }
    selectedIndex.value += 1
  }, 700)
}
const returnToLive = () => {
  stop()
  followingLive.value = true
  selectedIndex.value = Math.max(0, samples.value.length - 1)
}
const applyLiveSnapshot = (view: FlightView | null) => {
  if (!props.active || !view) return
  const viewSample = view.latest ?? view.lastPosition
  const newestHistorySample = samples.value[samples.value.length - 1]
  const newestLiveSample = latest.value
  const candidates = [viewSample, newestHistorySample, newestLiveSample]
    .filter((sample): sample is FlightSample => sample != null && sample.capturedAt != null)
  const seed = candidates.sort((a, b) => (a.capturedAt ?? 0) - (b.capturedAt ?? 0)).at(-1)
  if (seed) {
    latest.value = { ...seed, orderId: props.orderId }
    const key = seed.sampleId != null
      ? `id:${seed.sampleId}`
      : `time:${seed.capturedAt}:${seed.connectionId}`
    const known = samples.value.some((sample) => (sample.sampleId != null
      ? `id:${sample.sampleId}`
      : `time:${sample.capturedAt}:${sample.connectionId}`) === key)
    if (!known) {
      samples.value = [...samples.value, seed].sort((a, b) => (a.capturedAt ?? 0) - (b.capturedAt ?? 0))
      if (followingLive.value) selectedIndex.value = samples.value.length - 1
    }
  }
  serverReportsStale.value = Boolean(view.stale) &&
    (!newestLiveSample || (viewSample?.capturedAt ?? 0) >= (newestLiveSample.capturedAt ?? 0))
}
const load = async () => {
  const current = ++sequence
  stop()
  if (loadedOrderId !== props.orderId) {
    loadedOrderId = props.orderId
    samples.value = []
    connections.value = []
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
  const viewPromise = props.active
    ? getFlightView(props.orderId).catch(() => null)
    : Promise.resolve(null)
  try {
    const result = await loadFlightHistory(props.orderId)
    const view = await viewPromise
    if (current !== sequence) return
    // A websocket point can arrive while history is loading.
    const merged = new Map<string, FlightSample>()
    for (const sample of [...(result.items ?? []), ...samples.value]) {
      const key = sample.sampleId != null
        ? `id:${sample.sampleId}`
        : `time:${sample.capturedAt}:${sample.connectionId}`
      merged.set(key, sample)
    }
    samples.value = [...merged.values()].sort((a, b) => (a.capturedAt ?? 0) - (b.capturedAt ?? 0))
    applyLiveSnapshot(view)
    if (props.active && followingLive.value && samples.value.length) {
      selectedIndex.value = samples.value.length - 1
    } else if (samples.value.length) {
      selectedIndex.value = Math.min(selectedIndex.value, samples.value.length - 1)
    } else {
      selectedIndex.value = 0
    }
    connections.value = result.connections ?? []
    resultHasNext.value = result.hasNext ?? false
  } catch (cause) {
    if (current !== sequence) return
    const view = await viewPromise
    if (current === sequence) {
      applyLiveSnapshot(view)
      error.value = cause instanceof Error ? cause.message : '历史遥测读取失败'
    }
  } finally {
    if (current === sequence) loading.value = false
  }
}
const handleLiveSample = (incomingOrderId: string, sample: FlightTelemetryEvent) => {
  if (incomingOrderId !== props.orderId) return
  if (sample.capturedAt == null || !Number.isFinite(sample.capturedAt)) return
  const latestAt = latest.value?.capturedAt
  if (latestAt != null && sample.capturedAt < latestAt) return
  if (latestAt === sample.capturedAt) {
    const incomingId = sample.sampleId ?? sample.sequence
    const currentId = latest.value?.sampleId ?? latest.value?.sequence
    if (incomingId == null || currentId == null || incomingId <= currentId) return
  }
  latest.value = sample
  serverReportsStale.value = false
  const last = samples.value[samples.value.length - 1]
  if (last?.capturedAt == null || sample.capturedAt > last.capturedAt) {
    samples.value = [...samples.value, sample]
    if (followingLive.value) selectedIndex.value = samples.value.length - 1
  }
}
const formatTime = (value?: number | string) =>
  value == null ? '—' : new Date(typeof value === 'number' ? value : value).toLocaleString()
const connectionLabel = (connection: FlightConnection) =>
  [connection.modelName, connection.serialNumber].filter(Boolean).join(' · ') || connection.connectionId || '设备连接'
watch(() => [props.orderId, props.active] as const, load, { immediate: true })
watch(() => props.active, (active) => {
  if (active) {
    onFlightTelemetry(handleLiveSample)
    initFlightTelemetryWs()
  } else {
    offFlightTelemetry(handleLiveSample)
  }
}, { immediate: true })
onMounted(() => { clockTimer = setInterval(() => { now.value = Date.now() }, 1_000) })
onBeforeUnmount(() => {
  sequence += 1
  stop()
  if (clockTimer !== undefined) clearInterval(clockTimer)
  offFlightTelemetry(handleLiveSample)
})
</script>

<template>
  <section class="panel-card p-4 flight-history" v-loading="loading">
    <div class="flight-history__head">
      <div class="panel-title">历史遥测与轨迹</div>
      <el-button size="small" :loading="loading" @click="load">刷新</el-button>
    </div>
    <div v-if="liveLatest" class="flight-history__live" role="status">
      <strong>实时遥测</strong>
      <span>上报 {{ formatTime(liveLatest.capturedAt) }}</span>
      <span>高度 {{ liveLatest.altitude ?? '—' }} m</span>
      <span>速度 {{ liveLatest.speed ?? '—' }} m/s</span>
      <span>电量 {{ liveLatest.battery ?? '—' }}%</span>
      <span>下单申报 {{ props.declaredPayloadKg ?? '—' }} kg</span>
    </div>
    <div v-else-if="props.liveExpected" class="flight-history__live" role="status" data-testid="flight-live-empty">
      <strong>实时遥测</strong>
      <span>暂无数据</span>
    </div>
    <div v-if="liveLatest && (serverReportsStale || liveInterruptionMs >= MAX_SAMPLE_GAP_MS)" class="flight-history__outages" role="status">
      信号中断 · 已中断 {{ Math.floor(liveInterruptionMs / 1000) }} 秒，地图停留在最后位置
    </div>
    <div v-if="error" class="flight-history__empty" role="alert">{{ error }}</div>
    <div v-if="!loading && !error && retentionExpired" class="flight-history__empty" role="status">
      已超过保留期（180 天），轨迹与历史遥测不可查
    </div>
    <div v-else-if="!loading && !error && samples.length === 0 && !liveLatest" class="flight-history__empty">
      暂无遥测数据
    </div>
    <template v-if="samples.length">
      <div v-if="gaps.length" class="flight-history__outages" role="status">
        <strong>遥测中断区间</strong>
        <span v-for="gap in gaps" :key="`${gap.from}-${gap.to}`">
          {{ formatTime(gap.from) }} 至 {{ formatTime(gap.to) }}
          （{{ Math.max(1, Math.round((gap.to - gap.from) / 1000)) }} 秒）
        </span>
      </div>
      <FlightTrackMap :samples="samples" :selected="selected" :gaps="gaps" :current="liveSample" :track-key="props.orderId" />
      <div class="flight-history__controls">
        <el-button size="small" :disabled="samples.length < 2" @click="togglePlayback">
          {{ playing ? '暂停' : '播放轨迹' }}
        </el-button>
        <el-button v-if="liveLatest && !followingLive" size="small" @click="returnToLive">返回实时位置</el-button>
        <el-slider v-model="selectedIndex" aria-label="轨迹回放时间轴" :min="0" :max="Math.max(0, samples.length - 1)" :show-tooltip="false" @update:model-value="followingLive = false; stop()" />
        <span>{{ selectedIndex + 1 }} / {{ samples.length }}</span>
      </div>
      <div class="flight-history__metrics">
        <span>采集 {{ formatTime(selected?.capturedAt) }}</span>
        <span>高度 {{ selected?.altitude ?? '—' }} m</span>
        <span>速度 {{ selected?.speed ?? '—' }} m/s</span>
        <span>电量 {{ selected?.battery ?? '—' }}%</span>
        <span>下单申报 {{ props.declaredPayloadKg ?? '—' }} kg</span>
      </div>
    </template>
    <FlightTrackMap v-else-if="liveLatest" :samples="[]" :current="liveSample" :track-key="props.orderId" />
    <el-table v-if="connections.length" :data="connections" size="small" max-height="220" empty-text="暂无连机记录">
      <el-table-column label="设备连接" min-width="150">
        <template #default="{ row }">{{ connectionLabel(row) }}</template>
      </el-table-column>
      <el-table-column label="开始" min-width="150">
        <template #default="{ row }">{{ formatTime(row.openedAt) }}</template>
      </el-table-column>
      <el-table-column label="结束" min-width="150">
        <template #default="{ row }">{{ formatTime(row.endedAt) }}</template>
      </el-table-column>
      <el-table-column prop="endReason" label="结束原因" min-width="110" />
    </el-table>
    <div v-if="resultHasNext" class="flight-history__empty" role="status">
      历史数据尚未全部加载，当前显示 {{ samples.length.toLocaleString() }} 条；轨迹可能不完整，请刷新重试。
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
  background: var(--bg-sunken); color: var(--text-regular); font-size: 0.82rem;
}
.flight-history__controls { margin-top: 0.5rem; }
.flight-history__controls .el-slider { flex: 1; }
.flight-history__metrics {
  flex-wrap: wrap; margin: 0.5rem 0 0.75rem; color: var(--text-regular); font-size: 0.82rem;
}
.flight-history__empty { padding: 1rem 0; color: var(--text-secondary); }
@media (max-width: 640px) {
  .flight-history__controls { flex-wrap: wrap; }
  .flight-history__controls .el-slider { flex-basis: 100%; order: 1; }
}
</style>
