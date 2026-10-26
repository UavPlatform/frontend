<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import LiveStage from './LiveStage.vue'
import TelemetryPanel from './TelemetryPanel.vue'
import FlightHistoryPanel from '../flight/FlightHistoryPanel.vue'
import { DISPATCH_STAGE_META, declaredCargoWeightKg } from '../../api/modules/admin-dispatch'
import type { DispatchOrderVo } from '../../types/admin'

const props = defineProps<{
  orderId: string
  order: DispatchOrderVo
  shipperName?: string
  pilotName?: string
  deviceId?: string | null
}>()

const emit = defineEmits<{ (e: 'back-to-manage'): void }>()
const router = useRouter()

const declaredWeight = computed(() => declaredCargoWeightKg(props.order.fields))
const context = computed(() => [
  { label: '订单号', value: props.order.orderId || '—' },
  {
    label: '阶段',
    value: DISPATCH_STAGE_META[props.order.stage ?? '']?.label || props.order.stage || '—',
  },
  { label: '货主', value: props.shipperName || '—' },
  { label: '飞手', value: props.pilotName || '—' },
  { label: '作业无人机', value: props.deviceId || '—' },
  { label: '下单申报载重', value: declaredWeight.value ? `${declaredWeight.value} kg` : '—' },
])
</script>

<template>
  <div class="mt-4 flex flex-col gap-4">
    <section class="panel-card p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="section-title">任务监管</div>
          <div class="section-hint">图传旁听 + 实时/历史遥测；载重为下单申报值，不是机载秤重。</div>
        </div>
        <div class="flex flex-wrap gap-2">
          <el-button @click="emit('back-to-manage')">返回订单管理</el-button>
          <el-button
            type="primary"
            @click="router.push({ name: 'order-supervise', params: { orderNum: props.orderId } })"
          >
            全屏监管
          </el-button>
        </div>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]">
        <LiveStage :live-detail="null" :device-id="props.deviceId" />
        <div class="flex flex-col gap-4">
          <section class="panel-card context-panel p-4">
            <div class="panel-title">作业上下文</div>
            <div class="mt-3 flex flex-col gap-2">
              <div v-for="item in context" :key="item.label" class="context-row">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </div>
            </div>
          </section>
          <TelemetryPanel :order-num="props.orderId" :device-id="props.deviceId" />
        </div>
      </div>
    </section>

    <FlightHistoryPanel
      :order-id="props.orderId"
      :active="props.order.stage === 'IN_TRANSIT'"
      :declared-payload-kg="declaredWeight"
    />
  </div>
</template>

<style scoped>
.section-title { font-weight: 800; color: var(--text-strong); }
.section-hint { margin-top: 0.25rem; color: var(--text-secondary); font-size: 0.85rem; }
.panel-title { font-weight: 700; }
.context-panel { background: var(--bg-sunken); }
.context-row {
  display: flex; justify-content: space-between; gap: 1rem;
  font-size: 0.9rem; color: var(--text-regular);
}
.context-row strong { color: var(--text-strong); text-align: right; }
</style>
