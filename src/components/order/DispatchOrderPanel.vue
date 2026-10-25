<script setup lang="ts">
import { computed } from 'vue'
import {
  DISPATCH_FUNDS_META,
  DISPATCH_STAGE_META,
  declaredCargoWeightKg,
} from '../../api/modules/admin-dispatch'
import type {
  AdminDispatchOrderAssignment,
  AdminDispatchOrderConnection,
  AdminDispatchOrderTimelineEvent,
  DispatchOrderVo,
} from '../../types/admin'
const props = defineProps<{
  order: DispatchOrderVo
  shipperName?: string
  pilotName?: string
  timeline: AdminDispatchOrderTimelineEvent[]
  assignments: AdminDispatchOrderAssignment[]
  connections: AdminDispatchOrderConnection[]
}>()

const formatWhen = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

const stageLabel = computed(
  () => DISPATCH_STAGE_META[props.order.stage ?? '']?.label || props.order.stage || '—',
)
const fundsLabel = computed(
  () => DISPATCH_FUNDS_META[props.order.fundsStatus ?? '']?.label || props.order.fundsStatus || '—',
)
const declaredWeight = computed(() => declaredCargoWeightKg(props.order.fields))
const fieldEntries = computed(() =>
  Object.entries(props.order.fields ?? {}).filter(([key]) => !['weightMin', 'weightMax'].includes(key)),
)
const formatMoney = (value?: number | string | null) =>
  value == null || value === '' ? '—' : `¥${Number(value).toFixed(2)}`
const formatEvent = (event?: string) => {
  const map: Record<string, string> = {
    CREATED: '创建订单',
    DEPOSIT_PAID: '定金已付',
    CLAIMED: '飞手接单',
    ARRIVED: '飞手到场',
    TRANSPORT_STARTED: '开始运输',
    DELIVERED: '确认送达',
    RECEIPT_CONFIRMED: '货主签收',
    SETTLED: '结清',
    CANCELLED: '取消',
    ASSIGNMENT_ENDED: '派单结束',
  }
  return map[event ?? ''] || event || '—'
}
</script>

<template>
  <div class="mt-4 flex flex-col gap-4">
    <section class="panel-card p-5">
      <div class="section-title">订单摘要</div>
      <div class="section-hint">派单订单视图（替代旧撮合 /admin/orders）。</div>
      <el-descriptions class="mt-4" :column="2" border>
        <el-descriptions-item label="订单号">{{ order.orderId }}</el-descriptions-item>
        <el-descriptions-item label="阶段">{{ stageLabel }}</el-descriptions-item>
        <el-descriptions-item label="资金状态">{{ fundsLabel }}</el-descriptions-item>
        <el-descriptions-item label="货主">{{ shipperName || '—' }}</el-descriptions-item>
        <el-descriptions-item label="飞手">{{ pilotName || '—' }}</el-descriptions-item>
        <el-descriptions-item label="下单申报载重">
          {{ declaredWeight ? `${declaredWeight} kg` : '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="定金">{{ formatMoney(order.depositAmount) }}</el-descriptions-item>
        <el-descriptions-item label="飞手服务费">{{ formatMoney(order.pilotServiceFee) }}</el-descriptions-item>
        <el-descriptions-item label="实际执行机型">
          {{ order.executedDrone?.modelName || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="实际执行机身号">
          {{ order.executedDrone?.serialNumber || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatWhen(order.createdAt) || '—' }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ formatWhen(order.updatedAt) || '—' }}</el-descriptions-item>
      </el-descriptions>
    </section>

    <section class="panel-card p-5">
      <div class="section-title">运单字段</div>
      <div class="section-hint">货物重量单独标为「下单申报」，与遥测里的同名字段含义一致。</div>
      <el-descriptions class="mt-4" :column="2" border>
        <el-descriptions-item label="下单申报载重">
          {{ declaredWeight ? `${declaredWeight} kg` : '—' }}
        </el-descriptions-item>
        <el-descriptions-item v-for="[key, value] in fieldEntries" :key="key" :label="key">
          {{ value || '—' }}
        </el-descriptions-item>
      </el-descriptions>
    </section>

    <section class="panel-card p-5">
      <div class="section-title">状态时间线</div>
      <el-timeline class="mt-4">
        <el-timeline-item
          v-for="(item, index) in timeline"
          :key="`${item.event}-${index}`"
          :timestamp="formatWhen(item.at) || '—'"
        >
          {{ formatEvent(item.event) }}
          <span v-if="item.reason" class="reason">（{{ item.reason }}）</span>
        </el-timeline-item>
      </el-timeline>
      <el-empty v-if="!timeline.length" description="暂无时间线" :image-size="64" />
    </section>

    <section class="panel-card p-5">
      <div class="section-title">派单记录</div>
      <el-table :data="assignments" size="small" empty-text="暂无派单记录">
        <el-table-column prop="assignmentVersion" label="版本" width="80" />
        <el-table-column label="飞手" min-width="120">
          <template #default="{ row }">{{ row.pilot?.userName || row.pilot?.userId || '—' }}</template>
        </el-table-column>
        <el-table-column label="接单" min-width="150">
          <template #default="{ row }">{{ formatWhen(row.acceptedAt) || '—' }}</template>
        </el-table-column>
        <el-table-column label="到场" min-width="150">
          <template #default="{ row }">{{ formatWhen(row.arrivedAt) || '—' }}</template>
        </el-table-column>
        <el-table-column label="结束" min-width="150">
          <template #default="{ row }">{{ formatWhen(row.endedAt) || '—' }}</template>
        </el-table-column>
        <el-table-column prop="endReason" label="结束原因" min-width="120" />
      </el-table>
    </section>

    <section class="panel-card p-5">
      <div class="section-title">连机记录</div>
      <el-table :data="connections" size="small" empty-text="暂无连机记录">
        <el-table-column label="机型" min-width="120">
          <template #default="{ row }">{{ row.modelName || row.modelCode || '—' }}</template>
        </el-table-column>
        <el-table-column prop="serialNumber" label="机身号" min-width="140" />
        <el-table-column label="开始" min-width="150">
          <template #default="{ row }">{{ formatWhen(row.openedAt) || '—' }}</template>
        </el-table-column>
        <el-table-column label="结束" min-width="150">
          <template #default="{ row }">{{ formatWhen(row.endedAt) || '—' }}</template>
        </el-table-column>
        <el-table-column prop="endReason" label="结束原因" min-width="120" />
      </el-table>
    </section>
  </div>
</template>

<style scoped>
.section-title { font-weight: 700; color: var(--text-strong); }
.section-hint { margin-top: 0.25rem; color: var(--text-secondary); font-size: 0.85rem; }
.reason { color: var(--text-secondary); }
</style>
