<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { loadFlightHistory, type FlightConnection, type FlightSample } from '../../api/modules/flight-record'
import {
  initFlightTelemetryWs,
  offFlightTelemetry,
  onFlightTelemetry,
  type FlightTelemetryEvent,
} from '../../api/ws/modules/flight-telemetry-ws'

const props = defineProps<{ orderId: string }>()

const samples = ref<FlightSample[]>([])
const connections = ref<FlightConnection[]>([])
const loading = ref(false)
const error = ref('')
const selectedIndex = ref(0)
const latest = ref<FlightTelemetryEvent | null>(null)
const playing = ref(false)
let sequence = 0
let timer: ReturnType<typeof setInterval> | undefined

const selected = computed(() => samples.value[selectedIndex.value])
const validPoints = computed(() => samples.value.filter(
  (item) => item.latitude != null && item.longitude != null,
))
const plot = computed(() => {
  const points = validPoints.value
  if (!points.length) return ''
  const lats = points.map((point) => point.latitude!)
  const lngs = points.map((point) => point.longitude!)
  const minLat = Math.min(...lats); const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs); const maxLng = Math.max(...lngs)
  return points.map((point) => {
    const x = 12 + (maxLng === minLng ? 0.5 : (point.longitude! - minLng) / (maxLng - minLng)) * 276
    const y = 12 + (maxLat === minLat ? 0.5 : 1 - (point.latitude! - minLat) / (maxLat - minLat)) * 136
    return `${x},${y}`
  }).join(' ')
})

const stop = () => {
  playing.value = false
  if (timer !== undefined) clearInterval(timer)
  timer = undefined
}
const togglePlayback = () => {
  if (playing.value) { stop(); return }
  if (samples.value.length < 2) return
  playing.value = true
  timer = setInterval(() => {
    if (selectedIndex.value >= samples.value.length - 1) { stop(); return }
    selectedIndex.value += 1
  }, 700)
}
const load = async () => {
  const current = ++sequence
  stop()
  samples.value = []
  connections.value = []
  latest.value = null
  selectedIndex.value = 0
  error.value = ''
  if (!props.orderId) return
  loading.value = true
  try {
    const result = await loadFlightHistory(props.orderId)
    if (current !== sequence) return
    samples.value = result.items ?? []
    connections.value = result.connections ?? []
  } catch (cause) {
    if (current === sequence) error.value = cause instanceof Error ? cause.message : '历史遥测读取失败'
  } finally {
    if (current === sequence) loading.value = false
  }
}
const handleLiveSample = (incomingOrderId: string, sample: FlightTelemetryEvent) => {
  if (incomingOrderId !== props.orderId) return
  if (sample.capturedAt == null) return
  if (latest.value?.capturedAt != null && sample.capturedAt <= latest.value.capturedAt) return
  latest.value = sample
}
const formatTime = (value?: number | string) =>
  value == null ? '—' : new Date(typeof value === 'number' ? value : value).toLocaleString()
const connectionLabel = (connection: FlightConnection) =>
  [connection.modelName, connection.serialNumber].filter(Boolean).join(' · ') || connection.connectionId || '设备连接'
watch(() => props.orderId, load, { immediate: true })
onFlightTelemetry(handleLiveSample)
initFlightTelemetryWs()
onBeforeUnmount(() => {
  sequence += 1
  stop()
  offFlightTelemetry(handleLiveSample)
})
</script>

<template>
  <section class="panel-card p-4 flight-history" v-loading="loading">
    <div class="flight-history__head">
      <div class="panel-title">历史遥测与轨迹</div>
      <el-button size="small" :loading="loading" @click="load">刷新</el-button>
    </div>
    <div v-if="latest" class="flight-history__live" role="status">
      <strong>实时遥测</strong>
      <span>上报 {{ formatTime(latest.capturedAt) }}</span>
      <span>高度 {{ latest.altitude ?? '—' }} m</span>
      <span>速度 {{ latest.speed ?? '—' }} m/s</span>
      <span>电量 {{ latest.battery ?? '—' }}%</span>
      <span>载重 {{ latest.payloadKg ?? '—' }} kg</span>
    </div>
    <div v-if="error" class="flight-history__empty" role="alert">{{ error }}</div>
    <div v-else-if="!loading && samples.length === 0" class="flight-history__empty">暂无历史采样</div>
    <template v-else-if="samples.length">
      <div class="flight-history__chart" aria-label="飞行轨迹示意图">
        <svg viewBox="0 0 300 160" role="img" aria-label="按实际经纬度比例绘制的采样轨迹">
          <polyline v-if="plot" :points="plot" fill="none" stroke="var(--kpi-today)" stroke-width="3" />
          <circle v-for="(point, index) in validPoints" :key="point.sampleId ?? index"
            :cx="plot.split(' ')[index]?.split(',')[0]" :cy="plot.split(' ')[index]?.split(',')[1]"
            :r="point === selected ? 5 : 2.5" :fill="point === selected ? 'orange' : 'steelblue'" />
        </svg>
        <div v-if="!plot" class="flight-history__no-gps">样本没有可绘制的经纬度</div>
      </div>
      <div class="flight-history__controls">
        <el-button size="small" :disabled="samples.length < 2" @click="togglePlayback">
          {{ playing ? '暂停' : '播放轨迹' }}
        </el-button>
        <el-slider v-model="selectedIndex" :min="0" :max="Math.max(0, samples.length - 1)" :show-tooltip="false" />
        <span>{{ selectedIndex + 1 }} / {{ samples.length }}</span>
      </div>
      <div class="flight-history__metrics">
        <span>采集 {{ formatTime(selected?.capturedAt) }}</span>
        <span>高度 {{ selected?.altitude ?? '—' }} m</span>
        <span>速度 {{ selected?.speed ?? '—' }} m/s</span>
        <span>电量 {{ selected?.battery ?? '—' }}%</span>
      </div>
      <el-table :data="connections" size="small" max-height="220" empty-text="暂无连机记录">
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
    </template>
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
.flight-history__chart {
  position: relative; margin-top: 0.75rem; height: 180px; border: 1px solid var(--border);
  background: var(--bg-sunken);
}
.flight-history__chart svg { width: 100%; height: 100%; }
.flight-history__no-gps {
  position: absolute; inset: 0; display: grid; place-items: center; color: var(--text-secondary);
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
