<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MainLayout from '../layouts/MainLayout.vue'
import OrderManagePanel from '../components/order/OrderManagePanel.vue'
import SupervisionPanel from '../components/order/SupervisionPanel.vue'
import { ORDER_STATUS_META, TASK_STATUS_META } from '../api/modules/admin-query'
import { useOrderDetail } from '../composables/useOrderDetail'

/**
 * 订单详情（REQ-FRONTEND-001 §2.2）双模式：
 *   订单管理 —— 撮合时间线 / 计价 / 应征 / 证据 / 争议 / 关联主体；
 *   任务监管 —— 图传只读 + 遥测（仅执行中订单可见）。
 * 默认 Tab 由任务是否执行中决定：非执行中 → 订单管理，执行中 → 任务监管（可切回）。
 */
const route = useRoute()
const router = useRouter()

const orderNum = computed(() => String(route.params.orderNum ?? ''))
const { order, task, liveDetail, deviceId, match, loading, reload } = useOrderDetail(orderNum)

type DetailTab = 'manage' | 'supervise'

const activeTab = ref<DetailTab>('manage')
/** 用户手动切过 Tab 后，不再用状态回推默认值（避免任务状态回填覆盖用户选择） */
const userSwitched = ref(false)

const isFlying = computed(() => task.value?.taskStatus === 'IN_PROGRESS')

watch(orderNum, () => {
  userSwitched.value = false
})

watch(
  [orderNum, isFlying],
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
    .push({ name: 'order-supervise', params: { orderNum: orderNum.value } })
    .catch(() => undefined)
}

const statusTagType = computed(
  () => ORDER_STATUS_META[order.value?.orderStatusCode ?? -1]?.tagType ?? 'info',
)
const statusLabel = computed(
  () =>
    order.value?.orderStatusDesc ||
    ORDER_STATUS_META[order.value?.orderStatusCode ?? -1]?.label ||
    '--',
)
const formatAmount = (value?: number) => `¥${Number(value ?? 0).toFixed(2)}`
const formatDistance = (value?: number) => `${Number(value ?? 0).toFixed(1)} m`
</script>

<template>
  <MainLayout title="订单详情" subtitle="订单摘要与双模式视图（订单管理 / 任务监管）。">
    <section class="panel-card p-5" v-loading="loading">
      <template v-if="order">
        <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div class="flex flex-wrap items-center gap-3">
            <span class="text-xl font-700 text-[#303133]">#{{ order.orderNum }}</span>
            <el-tag :type="statusTagType" effect="plain">{{ statusLabel }}</el-tag>
            <el-tag v-if="isFlying" type="success" effect="dark">飞行中</el-tag>
            <span class="text-lg font-700 text-[#303133]">
              {{ formatAmount(order.totalAmount) }}
            </span>
            <span class="text-sm text-[#606266]">{{ formatDistance(order.totalDistance) }}</span>
          </div>

          <div class="flex items-center gap-2">
            <el-button v-if="isFlying" type="primary" @click="openFullscreen">全屏监管</el-button>
            <el-button @click="backToList">返回订单列表</el-button>
          </div>
        </div>

        <el-descriptions class="mt-5" :column="2" border>
          <el-descriptions-item label="订单号">{{ order.orderNum }}</el-descriptions-item>
          <el-descriptions-item label="下单用户">
            {{ order.ownerName || '—' }}
            <span v-if="order.userId" class="ml-1 text-xs text-[#909399]">ID {{ order.userId }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="关联任务">
            {{ order.taskName || '—' }}（{{ order.taskNum || '—' }}）
          </el-descriptions-item>
          <el-descriptions-item label="接单飞手">
            {{ task?.riderName || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="订单状态">
            <el-tag :type="statusTagType" effect="plain">
              {{ statusLabel }}（{{ order.orderStatus }} / {{ order.orderStatusCode }}）
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="任务状态">
            <el-tag v-if="task" :type="TASK_STATUS_META[task.taskStatus ?? '']?.tagType ?? 'info'" effect="plain">
              {{ task.taskStatusDesc || TASK_STATUS_META[task.taskStatus ?? '']?.label || task.taskStatus }}
            </el-tag>
            <span v-else>—</span>
          </el-descriptions-item>
          <el-descriptions-item label="金额">{{ formatAmount(order.totalAmount) }}</el-descriptions-item>
          <el-descriptions-item label="距离">{{ formatDistance(order.totalDistance) }}</el-descriptions-item>
          <el-descriptions-item label="操作提示" :span="2">
            {{ task?.actionHint || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ order.createTime || '—' }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ order.updateTime || '—' }}</el-descriptions-item>
        </el-descriptions>

        <!-- 加载完成前不挂载 Tab：否则默认值会在任务状态未知时先落到「订单管理」并预渲染其内容 -->
        <el-tabs
          v-if="!loading"
          v-model="activeTab"
          class="mt-4 detail-tabs"
          @tab-click="userSwitched = true"
        >
          <el-tab-pane label="订单管理" name="manage" lazy>
            <OrderManagePanel
              v-if="order"
              :order="order"
              :task="task"
              :match="match"
              @order-changed="reload"
            />
          </el-tab-pane>
          <el-tab-pane v-if="isFlying" label="任务监管" name="supervise" lazy>
            <SupervisionPanel
              v-if="order"
              :order="order"
              :task="task"
              :live-detail="liveDetail"
              :device-id="deviceId"
              @back-to-manage="activeTab = 'manage'"
            />
          </el-tab-pane>
        </el-tabs>
      </template>

      <el-empty
        v-else-if="!loading"
        description="未查询到该订单（可能订单号不存在）"
      >
        <el-button type="primary" @click="backToList">返回订单列表</el-button>
      </el-empty>
    </section>
  </MainLayout>
</template>

<style scoped>
.detail-tabs :deep(.el-tabs__header) {
  margin-bottom: 0.5rem;
}
</style>
