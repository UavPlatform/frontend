<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import { Avatar, Notebook, Tickets, User } from '@element-plus/icons-vue'
import MainLayout from '../layouts/MainLayout.vue'
import { getAdminComplaints } from '../api/modules/admin-query'
import { scanInProgressTasks, scanOrders } from '../api/modules/admin-scan'
import { getRegisteredRiders } from '../api/modules/rider'
import { getOrderTrajectory } from '../api/modules/uav'
import type { AdminComplaint, AdminOrderVo, AdminTaskVo } from '../types/admin'
import { formatClock, formatDateTime, formatDuration } from '../utils/date'
import { summarizeTrajectory, type TelemetrySummary } from '../utils/telemetry'

/**
 * 首页看板（REQ-FRONTEND-001 §1）：
 *  A. 四指标卡（点击带筛选跳订单/飞手列表）；
 *  B. 正在飞行订单卡片（路线/主体/遥测摘要 + [任务监管]/[详情]，轮询刷新遥测）；
 *  C. 侧栏快捷入口 + 待办 + 今日新发 Top5。
 * 无机队启停直播控件（ADR-0004 移除项）。
 */
const router = useRouter()

interface FlyingCard {
  task: AdminTaskVo
  telemetry?: TelemetrySummary
}

interface TodoItem {
  key: 'dispute' | 'overdue'
  title: string
  detail: string
  to: RouteLocationRaw
}

const COMPLAINT_REASON_LABELS: Record<string, string> = {
  NOT_AS_DESCRIBED: '不符描述',
  QUALITY_ISSUE: '质量问题',
  SERVICE_ISSUE: '服务问题',
  OTHER: '其他',
}

const TELEMETRY_POLL_MS = 10_000

const loading = ref(false)
const updatedAt = ref('--:--:--')
const flyingCards = ref<FlyingCard[] | undefined>(undefined)
const todayOrders = ref<AdminOrderVo[] | undefined>(undefined)
const pendingComplaintTotal = ref<number | undefined>(undefined)
const pendingComplaints = ref<AdminComplaint[]>([])
const registeredRiders = ref<number | undefined>(undefined)
const overdueWaiting = ref<{ total: number; example?: AdminOrderVo } | undefined>(undefined)

/** 路由跳转（守卫重定向/重复导航的失败对用户无意义，静默忽略） */
const go = (to: RouteLocationRaw) => {
  void router.push(to).catch(() => undefined)
}

const flyingRiders = computed(() => {
  const names = new Set<string>()
  for (const card of flyingCards.value ?? []) {
    if (card.task.riderName) {
      names.add(card.task.riderName)
    }
  }
  return names.size
})

const metrics = computed(() => [
  {
    key: 'flying',
    label: '正在飞行',
    value: flyingCards.value ? String(flyingCards.value.length) : '—',
    hint: '执行中任务 · 点按筛选',
    to: { name: 'orders', query: { status: 'in_progress' } } satisfies RouteLocationRaw,
  },
  {
    key: 'today',
    label: '今日订单',
    value: todayOrders.value ? String(todayOrders.value.length) : '—',
    hint: '今日新建 · 点按筛选',
    to: { name: 'orders', query: { date: 'today' } } satisfies RouteLocationRaw,
  },
  {
    key: 'dispute',
    label: '待处理争议',
    value: pendingComplaintTotal.value !== undefined ? String(pendingComplaintTotal.value) : '—',
    hint: '投诉待处理 · 点按筛选',
    to: { name: 'orders', query: { dispute: 'pending' } } satisfies RouteLocationRaw,
  },
  {
    key: 'pilot',
    label: '在线飞手',
    value: `${flyingRiders.value}/${registeredRiders.value ?? '—'}`,
    hint: '在飞 / 在册飞手',
    to: { name: 'pilots' } satisfies RouteLocationRaw,
  },
])

const quickEntries = [
  { label: '全部订单', icon: Tickets, to: { name: 'orders' } satisfies RouteLocationRaw },
  { label: '用户管理', icon: User, to: { name: 'users' } satisfies RouteLocationRaw },
  { label: '飞手管理', icon: Avatar, to: { name: 'pilots' } satisfies RouteLocationRaw },
  { label: '系统日志', icon: Notebook, to: { name: 'system' } satisfies RouteLocationRaw },
]

const todos = computed<TodoItem[]>(() => {
  const items: TodoItem[] = []

  if ((pendingComplaintTotal.value ?? 0) > 0) {
    const latest = pendingComplaints.value[0]
    const reason = latest?.reason ? COMPLAINT_REASON_LABELS[latest.reason] ?? latest.reason : ''
    items.push({
      key: 'dispute',
      title: `${pendingComplaintTotal.value} 条待处理争议`,
      detail: latest?.orderNum
        ? `最新 ${latest.orderNum}${reason ? ` · ${reason}` : ''}`
        : '投诉中心有待处理项',
      to: latest?.orderNum
        ? { name: 'order-detail', params: { orderNum: latest.orderNum } }
        : { name: 'orders', query: { dispute: 'pending' } },
    })
  }

  if ((overdueWaiting.value?.total ?? 0) > 0) {
    const example = overdueWaiting.value?.example
    items.push({
      key: 'overdue',
      title: `${overdueWaiting.value?.total} 单待验收超 24 小时`,
      detail: example?.orderNum
        ? `例 ${example.orderNum} · 创建于 ${example.createTime ?? '—'}`
        : '创建超 24 小时仍未确认完成',
      to: example?.orderNum
        ? { name: 'order-detail', params: { orderNum: example.orderNum } }
        : { name: 'orders', query: { status: '5' } },
    })
  }

  return items
})

const todayTop5 = computed(() => (todayOrders.value ?? []).slice(0, 5))

const orderStatusLabel = (order: AdminOrderVo) => order.orderStatusDesc || order.orderStatus || '—'

const telemetrySummary = (card: FlyingCard) => {
  const telemetry = card.telemetry
  if (!telemetry) {
    return '遥测暂无数据（等待设备上报）'
  }
  const parts = [
    telemetry.altitude != null ? `高度 ${telemetry.altitude.toFixed(1)} m` : '',
    telemetry.speed != null ? `速度 ${telemetry.speed.toFixed(1)} m/s` : '',
    telemetry.battery != null ? `电量 ${telemetry.battery}%` : '',
    telemetry.startedAt ? `已飞 ${formatDuration(Date.now() - telemetry.startedAt)}` : '',
    telemetry.reportedAt ? `上报 ${formatClock(new Date(telemetry.reportedAt))}` : '',
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '遥测暂无数据（等待设备上报）'
}

/** 拉取全部飞行卡的轨迹并截取首尾点位 → 遥测摘要 */
const refreshTelemetry = async () => {
  await Promise.all(
    (flyingCards.value ?? []).map(async (card) => {
      const orderNum = card.task.orderNum
      if (!orderNum) {
        card.telemetry = undefined
        return
      }
      try {
        const points = await getOrderTrajectory(orderNum)
        card.telemetry = summarizeTrajectory(points)
      } catch {
        card.telemetry = undefined
      }
    }),
  )
}

let telemetryTimer: ReturnType<typeof setInterval> | undefined
const stopPolling = () => {
  if (telemetryTimer !== undefined) {
    clearInterval(telemetryTimer)
    telemetryTimer = undefined
  }
}

const startPolling = () => {
  stopPolling()
  const hasTrackable = (flyingCards.value ?? []).some((card) => card.task.orderNum)
  if (hasTrackable) {
    telemetryTimer = setInterval(() => {
      void refreshTelemetry()
    }, TELEMETRY_POLL_MS)
  }
}

onBeforeUnmount(stopPolling)

let loadSeq = 0
const load = async () => {
  const seq = ++loadSeq
  loading.value = true
  try {
    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)
    const overdueCutoff = formatDateTime(new Date(Date.now() - 24 * 3_600_000))

    const [inProgress, todayScan, complaints, riders, waitingScan] = await Promise.all([
      scanInProgressTasks(),
      scanOrders({ cutoff: formatDateTime(midnight), pageSize: 100, maxPages: 5 }),
      // 以下三项失败不阻断看板：对应指标显示「—」或折叠待办
      getAdminComplaints({ page: 0, size: 10, status: 'PENDING' }).catch(() => null),
      getRegisteredRiders().catch(() => null),
      scanOrders({ status: '5', cutoff: overdueCutoff, pageSize: 100, maxPages: 5 }).catch(
        () => null,
      ),
    ])
    if (seq !== loadSeq) return

    flyingCards.value = inProgress
      .filter((task) => task.taskStatus === 'IN_PROGRESS')
      .map((task) => ({ task }))
    todayOrders.value = todayScan.rows
    pendingComplaints.value = complaints?.complaints ?? []
    pendingComplaintTotal.value = complaints
      ? complaints.totalElements ?? pendingComplaints.value.length
      : undefined
    registeredRiders.value = riders?.length
    // 待验收超期 = 待验收总数 - 仍新鲜（cutoff 之后创建）的部分；扫描被截断则无法确定，折叠该待办
    overdueWaiting.value = waitingScan
      ? waitingScan.truncated
        ? undefined
        : {
            total: Math.max(0, waitingScan.totalElements - waitingScan.rows.length),
            example: waitingScan.firstExcluded,
          }
      : undefined

    await refreshTelemetry()
    if (seq !== loadSeq) return
    startPolling()
  } catch (err) {
    if (seq === loadSeq) {
      console.error(err)
    }
  } finally {
    if (seq === loadSeq) {
      loading.value = false
      updatedAt.value = formatClock()
    }
  }
}

void load()

const openOrderDetail = (orderNum?: string) => {
  if (!orderNum) {
    return
  }
  go({ name: 'order-detail', params: { orderNum } })
}
</script>

<template>
  <MainLayout title="首页" subtitle="值守第一屏：平台指标、正在飞行订单与快捷入口。">
    <div class="flex flex-col gap-4">
      <!-- A. 指标卡片区 -->
      <section class="panel-card p-4 md:p-5">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-sm font-700 text-[#303133]">平台指标</div>
            <div class="mt-1 text-xs text-[#909399]">更新于 {{ updatedAt }}</div>
          </div>
          <el-button :loading="loading" @click="load">刷新</el-button>
        </div>

        <div class="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
          <button
            v-for="metric in metrics"
            :key="metric.key"
            type="button"
            class="metric-card"
            @click="go(metric.to)"
          >
            <div class="text-sm text-[#606266]">{{ metric.label }}</div>
            <div class="mt-2 text-3xl font-800 text-[#303133]">{{ metric.value }}</div>
            <div class="mt-1 text-xs text-[#909399]">{{ metric.hint }}</div>
          </button>
        </div>
      </section>

      <!-- B + C：飞行区（主） + 快捷/待办/今日新发（侧栏） -->
      <div class="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section class="panel-card p-4 md:p-5">
          <div class="flex items-center justify-between gap-3">
            <div class="text-sm font-700 text-[#303133]">正在飞行的订单</div>
            <el-tag v-if="flyingCards?.length" type="success" effect="plain">
              {{ flyingCards.length }} 单在飞
            </el-tag>
          </div>

          <div v-if="flyingCards?.length" class="mt-4 flex flex-col gap-3">
            <article
              v-for="card in flyingCards"
              :key="card.task.taskNum || card.task.orderNum"
              class="flying-card"
            >
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-700 text-[#303133]">#{{ card.task.orderNum || '暂无订单号' }}</span>
                <el-tag type="success" effect="dark" size="small">飞行中</el-tag>
                <span class="text-sm text-[#606266]">{{ card.task.taskName || '—' }}</span>
                <span class="ml-auto text-sm font-700 text-[#303133]">
                  {{ card.task.totalAmount != null ? `¥${card.task.totalAmount.toFixed(2)}` : '—' }}
                </span>
              </div>

              <div class="route-line">
                路线：{{ card.task.description || '暂无路线描述' }}
              </div>

              <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#606266]">
                <button type="button" class="subject-link" @click="go({ name: 'users' })">
                  用户 {{ card.task.ownerName || '—' }}
                </button>
                <button type="button" class="subject-link" @click="go({ name: 'pilots' })">
                  飞手 {{ card.task.riderName || '—' }}
                </button>
                <span>距离 {{ card.task.totalDistance != null ? `${card.task.totalDistance.toFixed(1)} m` : '—' }}</span>
              </div>

              <div class="telemetry-line">{{ telemetrySummary(card) }}</div>

              <div class="mt-1 flex flex-wrap gap-2">
                <el-button
                  v-if="card.task.orderNum"
                  type="primary"
                  size="small"
                  @click="go({ name: 'order-supervise', params: { orderNum: card.task.orderNum } })"
                >
                  任务监管
                </el-button>
                <el-button
                  v-if="card.task.orderNum"
                  size="small"
                  @click="openOrderDetail(card.task.orderNum)"
                >
                  详情
                </el-button>
                <span v-else class="self-center text-xs text-[#909399]">订单生成中，暂无可跳转目标</span>
              </div>
            </article>
          </div>

          <el-empty v-else-if="!loading" class="mt-4" description="当前无飞行作业">
            <el-button type="primary" plain @click="go({ name: 'orders' })">
              查看全部订单
            </el-button>
          </el-empty>
        </section>

        <aside class="flex flex-col gap-4">
          <section class="panel-card p-4">
            <div class="text-sm font-700 text-[#303133]">快捷入口</div>
            <div class="mt-3 grid grid-cols-2 gap-2">
              <button
                v-for="entry in quickEntries"
                :key="entry.label"
                type="button"
                class="quick-entry"
                @click="go(entry.to)"
              >
                <el-icon class="text-lg">
                  <component :is="entry.icon" />
                </el-icon>
                <span>{{ entry.label }}</span>
              </button>
            </div>
          </section>

          <section v-if="todos.length > 0" class="panel-card p-4">
            <div class="text-sm font-700 text-[#303133]">待办</div>
            <div class="mt-3 flex flex-col gap-2">
              <button
                v-for="item in todos"
                :key="item.key"
                type="button"
                class="todo-item"
                @click="go(item.to)"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="font-600 text-[#303133]">{{ item.title }}</span>
                  <span class="text-xs text-[#909399]">处理 →</span>
                </div>
                <div v-if="item.detail" class="mt-1 truncate text-xs text-[#909399]">
                  {{ item.detail }}
                </div>
              </button>
            </div>
          </section>

          <section v-if="todayOrders?.length" class="panel-card p-4">
            <div class="flex items-center justify-between gap-2">
              <div class="text-sm font-700 text-[#303133]">今日新发</div>
              <button type="button" class="subject-link" @click="go({ name: 'orders', query: { date: 'today' } })">
                查看更多 →
              </button>
            </div>

            <el-table
              class="mt-3"
              :data="todayTop5"
              size="small"
              @row-click="(row: AdminOrderVo) => openOrderDetail(row.orderNum)"
            >
              <el-table-column prop="orderNum" label="订单号" min-width="130" />
              <el-table-column prop="ownerName" label="用户" min-width="80" />
              <el-table-column label="状态" width="90">
                <template #default="scope">
                  {{ orderStatusLabel(scope.row) }}
                </template>
              </el-table-column>
            </el-table>
          </section>
        </aside>
      </div>
    </div>
  </MainLayout>
</template>

<style scoped>
.metric-card {
  text-align: left;
  border: 1px solid #ebeef5;
  border-radius: 14px;
  background: #fafafa;
  padding: 14px 16px;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.metric-card:hover {
  border-color: #d9ecff;
  background: #f5faff;
}

.flying-card {
  border: 1px solid #e1f3d8;
  border-left: 3px solid #67c23a;
  border-radius: 12px;
  background: #f7fbf4;
  padding: 14px 16px;
}

.route-line {
  margin-top: 6px;
  font-size: 14px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.telemetry-line {
  margin-top: 8px;
  font-size: 13px;
  color: #606266;
}

.subject-link {
  color: #409eff;
  cursor: pointer;
  font-weight: 600;
}

.subject-link:hover {
  text-decoration: underline;
}

.quick-entry {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid #ebeef5;
  border-radius: 10px;
  background: #f5f7fa;
  padding: 12px 8px;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  cursor: pointer;
}

.quick-entry:hover {
  border-color: #d9ecff;
  background: #ecf5ff;
}

.todo-item {
  width: 100%;
  text-align: left;
  border: 1px solid #fde2e2;
  border-radius: 10px;
  background: #fef0f0;
  padding: 10px 12px;
  cursor: pointer;
}

.todo-item:hover {
  border-color: #fbc4c4;
}
</style>
