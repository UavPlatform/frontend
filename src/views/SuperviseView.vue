<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MainLayout from '../layouts/MainLayout.vue'
import LiveStage from '../components/order/LiveStage.vue'
import TelemetryPanel from '../components/order/TelemetryPanel.vue'
import FlightHistoryPanel from '../components/flight/FlightHistoryPanel.vue'
import { DISPATCH_STAGE_META, declaredCargoWeightKg } from '../api/modules/admin-dispatch'
import { useDispatchOrderDetail } from '../composables/useDispatchOrderDetail'

const route = useRoute()
const router = useRouter()
const orderId = computed(() => String(route.params.orderNum ?? ''))
const { order, shipper, pilot, deviceId, loading } = useDispatchOrderDetail(orderId)

const declaredWeight = computed(() => declaredCargoWeightKg(order.value?.fields))
const context = computed(() => [
  { label: '订单号', value: order.value?.orderId || '—' },
  {
    label: '阶段',
    value: DISPATCH_STAGE_META[order.value?.stage ?? '']?.label || order.value?.stage || '—',
  },
  { label: '货主', value: shipper.value?.userName || '—' },
  { label: '飞手', value: pilot.value?.userName || '—' },
  { label: '作业无人机', value: deviceId.value || '—' },
  { label: '下单申报载重', value: declaredWeight.value ? `${declaredWeight.value} kg` : '—' },
])

const back = () => {
  void router.push({ name: 'order-detail', params: { orderNum: orderId.value }, query: { tab: 'supervise' } })
}
</script>

<template>
  <MainLayout title="全屏监管" subtitle="派单飞行旁听与历史轨迹。">
    <section class="panel-card p-5" v-loading="loading">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="section-title">全屏监管</div>
        <el-button @click="back">返回订单详情</el-button>
      </div>

      <template v-if="order">
        <div class="mt-4 grid gap-4 xl:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]">
          <LiveStage :live-detail="null" :device-id="deviceId" />
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
            <TelemetryPanel :order-num="order.orderId || orderId" :device-id="deviceId" />
          </div>
        </div>
        <div class="mt-4">
          <FlightHistoryPanel :order-id="order.orderId || orderId" />
        </div>
      </template>
      <el-empty v-else-if="!loading" description="未查询到该派单订单" />
    </section>
  </MainLayout>
</template>

<style scoped>
.section-title { font-size: 1.1rem; font-weight: 800; }
.panel-title { font-weight: 700; }
.context-panel { background: var(--bg-sunken); }
.context-row {
  display: flex; justify-content: space-between; gap: 1rem;
  font-size: 0.9rem; color: var(--text-regular);
}
.context-row strong { color: var(--text-strong); text-align: right; }
</style>
