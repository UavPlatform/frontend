<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MainLayout from '../layouts/MainLayout.vue'
import DispatchOrderPanel from '../components/order/DispatchOrderPanel.vue'
import DispatchSupervisePanel from '../components/order/DispatchSupervisePanel.vue'
import { DISPATCH_STAGE_META } from '../api/modules/admin-dispatch'
import { useDispatchOrderDetail } from '../composables/useDispatchOrderDetail'

const route = useRoute()
const router = useRouter()

const orderId = computed(() => String(route.params.orderNum ?? ''))
const {
  order,
  shipper,
  pilot,
  timeline,
  assignments,
  connections,
  deviceId,
  isFlying,
  loading,
  error,
  reload,
} = useDispatchOrderDetail(orderId)

type DetailTab = 'manage' | 'supervise'
const activeTab = ref<DetailTab>('manage')
const userSwitched = ref(false)

watch(orderId, () => {
  userSwitched.value = false
})

watch(
  [orderId, isFlying],
  () => {
    if (userSwitched.value) return
    const queryTab = String(route.query.tab ?? '')
    if (queryTab === 'manage' || queryTab === 'supervise') {
      activeTab.value = queryTab
      return
    }
    activeTab.value = isFlying.value ? 'supervise' : 'manage'
  },
  { immediate: true },
)

const backToList = () => {
  void router.push({ name: 'orders' }).catch(() => undefined)
}

const openFullscreen = () => {
  void router
    .push({ name: 'order-supervise', params: { orderNum: orderId.value } })
    .catch(() => undefined)
}

const stageMeta = computed(
  () => DISPATCH_STAGE_META[order.value?.stage ?? ''] ?? { label: order.value?.stage || '—', tagType: 'info' as const },
)
const formatAmount = (value?: number) => (value == null ? '—' : `¥${Number(value).toFixed(2)}`)
</script>

<template>
  <MainLayout title="订单详情" subtitle="派单订单监管（管理 / 飞行轨迹）。">
    <section class="panel-card p-5" v-loading="loading">
      <template v-if="order">
        <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div class="flex flex-wrap items-center gap-3">
            <span class="text-xl font-700 text-[var(--text-strong)]">#{{ order.orderId }}</span>
            <el-tag :type="stageMeta.tagType" effect="plain">{{ stageMeta.label }}</el-tag>
            <el-tag v-if="isFlying" type="success" effect="dark">运输中</el-tag>
            <span class="text-lg font-700 text-[var(--text-strong)]">
              {{ formatAmount(order.depositAmount) }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <el-button v-if="isFlying" type="primary" @click="openFullscreen">全屏监管</el-button>
            <el-button @click="backToList">返回订单列表</el-button>
          </div>
        </div>

        <el-tabs
          v-if="!loading"
          v-model="activeTab"
          class="mt-4 detail-tabs"
          @tab-click="userSwitched = true"
        >
          <el-tab-pane label="订单管理" name="manage" lazy>
            <DispatchOrderPanel
              :order="order"
              :shipper-name="shipper?.userName"
              :pilot-name="pilot?.userName"
              :timeline="timeline"
              :assignments="assignments"
              :connections="connections"
            />
          </el-tab-pane>
          <el-tab-pane v-if="isFlying || connections.length" label="任务监管" name="supervise" lazy>
            <DispatchSupervisePanel
              :order-id="order.orderId || orderId"
              :order="order"
              :shipper-name="shipper?.userName"
              :pilot-name="pilot?.userName"
              :device-id="deviceId"
              @back-to-manage="activeTab = 'manage'"
            />
          </el-tab-pane>
        </el-tabs>
      </template>

      <template v-else-if="!loading && error?.code === 'ORDER_NOT_FOUND'">
        <el-empty description="未查询到该派单订单">
          <el-button type="primary" @click="backToList">返回订单列表</el-button>
        </el-empty>
      </template>
      <el-result
        v-else-if="!loading && error"
        icon="error"
        title="订单详情加载失败"
        :sub-title="error.message"
      >
        <template #extra>
          <el-button type="primary" @click="reload">重试</el-button>
          <el-button @click="backToList">返回订单列表</el-button>
        </template>
      </el-result>
    </section>
  </MainLayout>
</template>

<style scoped>
.detail-tabs :deep(.el-tabs__header) {
  margin-bottom: 0.5rem;
}
</style>
