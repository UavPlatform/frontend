<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MainLayout from '../layouts/MainLayout.vue'
import LiveStage from '../components/order/LiveStage.vue'
import TelemetryPanel from '../components/order/TelemetryPanel.vue'
import { ORDER_STATUS_META, TASK_STATUS_META } from '../api/modules/admin-query'
import { useOrderDetail } from '../composables/useOrderDetail'

/**
 * 全屏任务监管 `/orders/:orderNum/supervise`（REQ-FRONTEND-001 §2.3）：
 * 收敛旧 OperateView 的「遥测 + 图传」监看能力，但只读——无开播/停播/航线等控制入口；
 * 信息面板可收起，视频区最大化。
 */
const route = useRoute()
const router = useRouter()

const orderNum = computed(() => String(route.params.orderNum ?? ''))
const { order, task, liveDetail, match, loading } = useOrderDetail(orderNum)

const panelCollapsed = ref(false)

const isFlying = computed(() => task.value?.taskStatus === 'IN_PROGRESS')

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

const context = computed(() => {
  const currentOrder = order.value
  const currentTask = task.value
  if (!currentOrder) return []
  return [
    { label: '订单号', value: currentOrder.orderNum || '—' },
    { label: '用户', value: currentOrder.ownerName || '—' },
    { label: '飞手', value: currentTask?.riderName || '—' },
    { label: '任务', value: currentOrder.taskName || currentTask?.taskName || '—' },
    { label: '作业无人机', value: liveDetail.value?.deviceId || '—' },
    { label: '平台直播态', value: liveDetail.value?.liveState || '—' },
    { label: '撮合状态', value: match.value.matchStatus || '—' },
    {
      label: '任务状态',
      value: currentTask
        ? currentTask.taskStatusDesc ||
          TASK_STATUS_META[currentTask.taskStatus ?? '']?.label ||
          currentTask.taskStatus
        : '—',
    },
  ]
})

const backToDetail = () => {
  void router
    .push({ name: 'order-detail', params: { orderNum: orderNum.value } })
    .catch(() => undefined)
}

/** 从全屏直接进订单管理 Tab（详情页支持 ?tab= 定位） */
const openManage = () => {
  void router
    .push({ name: 'order-detail', params: { orderNum: orderNum.value }, query: { tab: 'manage' } })
    .catch(() => undefined)
}
</script>

<template>
  <MainLayout title="任务监管" subtitle="全屏只读监看：视频最大化，信息面板可收起，不含启停控制。">
    <section class="panel-card p-4 md:p-5" v-loading="loading">
      <template v-if="order">
        <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div class="flex flex-wrap items-center gap-3">
            <span class="text-xl font-700 text-[#303133]">#{{ order.orderNum }}</span>
            <el-tag :type="statusTagType" effect="plain">{{ statusLabel }}</el-tag>
            <el-tag v-if="isFlying" type="success" effect="dark">执行中</el-tag>
            <span class="text-lg font-700 text-[#303133]">{{ formatAmount(order.totalAmount) }}</span>
            <span class="text-sm text-[#606266]">{{ order.taskName || '—' }}</span>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <el-button @click="panelCollapsed = !panelCollapsed">
              {{ panelCollapsed ? '展开信息面板' : '收起信息面板' }}
            </el-button>
            <el-button type="primary" @click="openManage">查看订单管理</el-button>
            <el-button @click="backToDetail">退出全屏</el-button>
          </div>
        </div>

        <div class="mt-4 grid gap-4" :class="panelCollapsed ? '' : 'xl:grid-cols-[minmax(0,68fr)_minmax(0,32fr)]'">
          <LiveStage :live-detail="liveDetail" />

          <aside v-if="!panelCollapsed" class="flex flex-col gap-4">
            <section class="panel-card context-panel p-4">
              <div class="panel-title">作业上下文</div>
              <div class="mt-3 flex flex-col gap-2">
                <div v-for="item in context" :key="item.label" class="context-row">
                  <span>{{ item.label }}</span>
                  <strong>{{ item.value }}</strong>
                </div>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <el-button size="small" @click="openManage">返回订单管理</el-button>
                <el-button
                  size="small"
                  @click="
                    router.push({ name: 'pilots', query: task?.riderName ? { q: task.riderName } : {} }).catch(() => undefined)
                  "
                >
                  查看飞手
                </el-button>
              </div>
            </section>

            <TelemetryPanel :order-num="order.orderNum || ''" />
          </aside>
        </div>
      </template>

      <el-empty v-else-if="!loading" description="未查询到该订单（可能订单号不存在）">
        <el-button type="primary" @click="backToDetail">返回订单详情</el-button>
      </el-empty>
    </section>
  </MainLayout>
</template>

<style scoped>
.context-panel {
  border-color: #ebeef5;
  background: #fafafa;
}

.panel-title {
  font-size: 0.98rem;
  font-weight: 800;
  color: #303133;
}

.context-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.9rem;
  color: #606266;
}

.context-row strong {
  color: #303133;
  font-weight: 600;
  text-align: right;
}
</style>
