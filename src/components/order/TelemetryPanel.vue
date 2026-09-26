<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { fetchOrderTelemetry } from '../../api/modules/order-supervision'
import type { TelemetrySummary } from '../../utils/telemetry'
import { formatClock, formatDuration } from '../../utils/date'

/**
 * 遥测摘要面板（任务监管 Tab / 全屏监管共用）：
 * 数据源 `/webUav/trajectory?orderNum=`（订单维度，管理端可读），10 秒轮询，卸载即停。
 */
const props = defineProps<{ orderNum: string }>()

const TELEMETRY_POLL_MS = 10_000

const telemetry = ref<TelemetrySummary | null>()
const loading = ref(false)

const refresh = async () => {
  const orderNum = props.orderNum
  if (!orderNum) {
    telemetry.value = null
    return
  }
  loading.value = true
  telemetry.value = await fetchOrderTelemetry(orderNum)
  loading.value = false
}

const metrics = computed(() => {
  const data = telemetry.value
  return [
    { label: '高度', value: data?.altitude != null ? `${data.altitude.toFixed(1)} m` : '—' },
    { label: '速度', value: data?.speed != null ? `${data.speed.toFixed(1)} m/s` : '—' },
    { label: '电量', value: data?.battery != null ? `${data.battery}%` : '—' },
    {
      label: '经纬度',
      value:
        data?.latitude != null && data?.longitude != null
          ? `${data.latitude.toFixed(5)}, ${data.longitude.toFixed(5)}`
          : '—',
    },
    {
      label: '已飞时长',
      value:
        data?.startedAt != null && data?.reportedAt != null
          ? formatDuration(Math.max(0, data.reportedAt - data.startedAt))
          : '—',
    },
    {
      label: '最后上报',
      value: data?.reportedAt != null ? formatClock(new Date(data.reportedAt)) : '—',
    },
  ]
})

const empty = computed(() => !loading.value && telemetry.value === null)

let pollTimer: ReturnType<typeof setInterval> | undefined
const stopPolling = () => {
  if (pollTimer !== undefined) {
    clearInterval(pollTimer)
    pollTimer = undefined
  }
}

watch(
  () => props.orderNum,
  async () => {
    stopPolling()
    await refresh()
    if (props.orderNum) {
      pollTimer = setInterval(() => {
        void refresh()
      }, TELEMETRY_POLL_MS)
    }
  },
  { immediate: true },
)

onBeforeUnmount(stopPolling)
</script>

<template>
  <section class="panel-card p-4" v-loading="loading">
    <div class="flex items-center justify-between">
      <div class="panel-title">遥测摘要</div>
      <el-button size="small" :loading="loading" @click="refresh">刷新</el-button>
    </div>

    <div v-if="empty" class="empty-note">遥测暂无数据（等待设备上报）</div>

    <div v-else class="metric-grid mt-3">
      <div v-for="item in metrics" :key="item.label" class="metric-cell">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </div>
    </div>
  </section>
</template>

<style scoped>
.panel-title {
  font-size: 1rem;
  font-weight: 800;
  color: #303133;
}

.empty-note {
  margin-top: 0.75rem;
  padding: 1rem;
  border: 1px dashed #dcdfe6;
  border-radius: 10px;
  background: #fafafa;
  color: #909399;
  font-size: 0.9rem;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem;
}

.metric-cell {
  padding: 0.7rem 0.8rem;
  border: 1px solid #ebeef5;
  border-radius: 10px;
  background: #fafafa;
}

.metric-cell span {
  display: block;
  font-size: 0.78rem;
  color: #909399;
}

.metric-cell strong {
  display: block;
  margin-top: 0.3rem;
  font-family: 'Fira Code', monospace;
  font-size: 0.98rem;
  color: #303133;
}
</style>
