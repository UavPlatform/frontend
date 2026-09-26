<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import {
  buildMatchTimeline,
  buildPricing,
  fetchOrderComplaints,
  fetchTaskApplications,
  fetchTaskEvidence,
  type MatchProgressFields,
  type TaskApplicationVo,
  type TaskEvidenceVo,
} from '../../api/modules/order-supervision'
import type { AdminComplaint, AdminOrderVo, AdminTaskVo } from '../../types/admin'

/**
 * 订单管理 Tab（REQ-FRONTEND-001 §2a）：撮合时间线 → 计价 → 应征 → 证据 → 争议 → 关联主体。
 * 金额一律只读（ADR-0003 禁止改价）；争议区块只做数据展示，处置交互由 TASK-FRONTEND-005 嵌入。
 */
const props = defineProps<{
  order: AdminOrderVo
  task?: AdminTaskVo
  match: MatchProgressFields
}>()

const APPLICATION_STATUS_LABELS: Record<string, string> = {
  ACTIVE: '应征中',
  SELECTED: '已选定',
  CLOSED: '已失效',
}

const COMPLAINT_STATUS_LABELS: Record<string, string> = {
  PENDING: '待处理',
  APPROVED: '已批准',
  REJECTED: '已驳回',
}

const COMPLAINT_REASON_LABELS: Record<string, string> = {
  NOT_AS_DESCRIBED: '不符描述',
  QUALITY_ISSUE: '质量问题',
  SERVICE_ISSUE: '服务问题',
  OTHER: '其他',
}

const COMPLAINT_STATUS_TAG: Record<string, 'warning' | 'success' | 'info'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'info',
}

const router = useRouter()

/** 关联主体跳转：带定位参数落到实体列表（用户按 ID 高亮、飞手按昵称筛选），行内「详情」进主体详情页 */
const go = (to: RouteLocationRaw) => {
  void router.push(to).catch(() => undefined)
}

const applications = ref<TaskApplicationVo[] | null>()
const evidence = ref<TaskEvidenceVo[] | null>()
const complaints = ref<AdminComplaint[] | null>()

const loadSideData = async () => {
  applications.value = undefined
  evidence.value = undefined
  complaints.value = undefined

  const taskNum = props.order.taskNum ?? props.task?.taskNum
  const orderNum = props.order.orderNum
  const [applicationRows, evidenceRows, complaintRows] = await Promise.all([
    taskNum ? fetchTaskApplications(taskNum) : Promise.resolve(null),
    taskNum ? fetchTaskEvidence(taskNum) : Promise.resolve(null),
    orderNum ? fetchOrderComplaints(orderNum) : Promise.resolve(null),
  ])
  applications.value = applicationRows
  evidence.value = evidenceRows
  complaints.value = complaintRows
}

watch(
  () => [props.order.orderNum, props.order.taskNum, props.task?.taskNum] as const,
  () => {
    void loadSideData()
  },
  { immediate: true },
)

const timeline = computed(() =>
  buildMatchTimeline({
    order: props.order,
    task: props.task,
    match: props.match,
    applications: applications.value,
  }).map((step) => ({
    ...step,
    tagType: step.state === 'done' ? 'success' : step.state === 'pending' ? 'warning' : 'info',
    tagLabel: step.state === 'done' ? '已完成' : step.state === 'pending' ? '待办' : '暂不可用',
    hollow: step.state !== 'done',
    time: step.time ?? '—',
  })),
)

const pricing = computed(() =>
  buildPricing({
    order: props.order,
    task: props.task,
    match: props.match,
    applications: applications.value,
  }),
)

const money = (value?: number) => (value != null ? `¥${Number(value).toFixed(2)}` : '—')

const applicationRows = computed(() =>
  (applications.value ?? []).map((item) => ({
    rider: item.riderName || `飞手 ${item.riderId ?? '—'}`,
    model: item.aircraftModelName
      ? `${item.aircraftModelName}${item.modelCode ? `（${item.modelCode}）` : ''}`
      : '—',
    payload: item.maxPayloadKg != null ? `${item.maxPayloadKg} kg` : '—',
    quote: money(item.quotedAmount ?? undefined),
    time: item.appliedAt || '—',
    status: APPLICATION_STATUS_LABELS[item.status ?? ''] ?? item.status ?? '—',
    statusType: item.status === 'SELECTED' ? 'success' : item.status === 'ACTIVE' ? 'warning' : 'info',
  })),
)

const evidenceRows = computed(() =>
  (evidence.value ?? []).map((item) => ({
    fileName: item.fileName || item.objectKey || '—',
    contentType: item.contentType || '—',
    size:
      item.sizeBytes != null
        ? item.sizeBytes >= 1024 * 1024
          ? `${(item.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.max(1, Math.round(item.sizeBytes / 1024))} KB`
        : '—',
    time: item.createTime || '—',
    downloadUrl: item.downloadUrl,
  })),
)

const complaintRows = computed(() =>
  (complaints.value ?? []).map((item) => ({
    status: COMPLAINT_STATUS_LABELS[item.status ?? ''] ?? item.status ?? '—',
    statusType: COMPLAINT_STATUS_TAG[item.status ?? ''] ?? 'info',
    reason: COMPLAINT_REASON_LABELS[item.reason ?? ''] ?? item.reason ?? '—',
    description: item.description || '—',
    time: item.createTime || '—',
    adminNote: item.adminNote || '—',
    refund: item.refundAmount != null ? `¥${Number(item.refundAmount).toFixed(2)}` : '—',
  })),
)
</script>

<template>
  <div class="mt-4 flex flex-col gap-4">
    <!-- 撮合时间线 -->
    <section class="panel-card p-5">
      <div class="section-title">撮合时间线</div>
      <div class="section-hint">发布 → 应征 → 选定 → 支付 → 双确认 → 执飞 → 结案</div>
      <el-timeline class="mt-4">
        <el-timeline-item
          v-for="step in timeline"
          :key="step.key"
          :type="step.tagType"
          :hollow="step.hollow"
          :timestamp="step.time"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="step-label">{{ step.label }}</span>
            <el-tag size="small" :type="step.tagType" effect="plain">{{ step.tagLabel }}</el-tag>
          </div>
          <div v-if="step.note" class="step-note">{{ step.note }}</div>
        </el-timeline-item>
      </el-timeline>
    </section>

    <!-- 计价（只读） -->
    <section class="panel-card p-5">
      <div class="section-title">计价</div>
      <div class="section-hint">成交金额由系统报价锁定，页面只读展示（ADR-0003 禁止改价）。</div>
      <el-descriptions class="mt-4" :column="2" border>
        <el-descriptions-item label="成交金额">
          <strong class="amount">{{ money(pricing.totalAmount) }}</strong>
        </el-descriptions-item>
        <el-descriptions-item label="系统报价">
          {{ money(pricing.quotedAmount) }}
        </el-descriptions-item>
        <el-descriptions-item label="任务奖励">
          {{ money(pricing.reward) }}
        </el-descriptions-item>
        <el-descriptions-item label="总里程">
          {{ pricing.distance != null ? `${pricing.distance.toFixed(1)} m` : '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="撮合状态" :span="2">
          {{ props.match.matchStatus || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="约定作业时间" :span="2">
          {{ props.match.scheduledTime || '—' }}
        </el-descriptions-item>
      </el-descriptions>
    </section>

    <!-- 应征列表 -->
    <section class="panel-card p-5" v-loading="applications === undefined">
      <div class="section-title">应征列表</div>
      <div class="section-hint">飞手 + 机型 + 载重 + 系统报价 + 应征时间（GET /task/{taskNum}/applications）。</div>

      <div v-if="applications === null" class="block-note">应征数据暂不可用（接口未同步或无权查看）</div>
      <div v-else-if="applications?.length === 0" class="block-note">暂无飞手应征</div>
      <el-table v-else class="mt-3" :data="applicationRows" size="small">
        <el-table-column label="飞手" prop="rider" min-width="110" />
        <el-table-column label="机型" prop="model" min-width="170" />
        <el-table-column label="载重" prop="payload" width="90" />
        <el-table-column label="系统报价" prop="quote" width="120" />
        <el-table-column label="应征时间" prop="time" width="160" />
        <el-table-column label="状态" width="100">
          <template #default="scope">
            <el-tag size="small" :type="scope.row.statusType" effect="plain">
              {{ scope.row.status }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <!-- 证据 -->
    <section class="panel-card p-5" v-loading="evidence === undefined">
      <div class="section-title">履约证据</div>
      <div class="section-hint">任务交付附件（GET /tasks/{taskNum}/attachments，下载地址 15 分钟有效）。</div>

      <div v-if="evidence === null" class="block-note">证据数据暂不可用（对象存储未配置或无权查看）</div>
      <div v-else-if="evidence?.length === 0" class="block-note">暂无履约证据</div>
      <el-table v-else class="mt-3" :data="evidenceRows" size="small">
        <el-table-column label="文件名" prop="fileName" min-width="200" />
        <el-table-column label="类型" prop="contentType" width="140" />
        <el-table-column label="大小" prop="size" width="100" />
        <el-table-column label="上传时间" prop="time" width="160" />
        <el-table-column label="操作" width="110">
          <template #default="scope">
            <el-link v-if="scope.row.downloadUrl" :href="scope.row.downloadUrl" target="_blank" type="primary">
              查看
            </el-link>
            <span v-else class="text-xs text-[#909399]">—</span>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <!-- 争议（数据展示；处置交互挂载点留给 TASK-FRONTEND-005） -->
    <section class="panel-card p-5" v-loading="complaints === undefined">
      <div class="section-title">争议</div>
      <div class="section-hint">投诉数据来自 /admin/complaint/list，按订单号过滤。</div>
      <!-- TASK-FRONTEND-005：批准/驳回 + adminNote 处置交互在此区块嵌入 -->

      <div v-if="complaints === null" class="block-note">投诉数据暂不可用</div>
      <div v-else-if="complaints?.length === 0" class="block-note">暂无投诉记录</div>
      <div v-else class="mt-3 flex flex-col gap-3">
        <article v-for="row in complaintRows" :key="row.time + row.reason" class="complaint-card">
          <div class="flex flex-wrap items-center gap-2">
            <el-tag size="small" :type="row.statusType" effect="plain">{{ row.status }}</el-tag>
            <span class="step-label">{{ row.reason }}</span>
            <span class="text-xs text-[#909399]">{{ row.time }}</span>
          </div>
          <p class="complaint-desc">{{ row.description }}</p>
          <div class="text-xs text-[#606266]">处理备注：{{ row.adminNote }} · 退款金额：{{ row.refund }}</div>
        </article>
      </div>
    </section>

    <!-- 关联主体 -->
    <section class="panel-card p-5">
      <div class="section-title">关联主体</div>
      <div class="section-hint">带定位参数落到实体列表（用户按 ID 高亮、飞手按昵称筛选），点击目标行即可进入主体详情。</div>
      <div class="mt-3 flex flex-wrap gap-2">
        <el-button
          @click="go({ name: 'users', query: props.order.userId ? { id: String(props.order.userId) } : {} })"
        >
          查看用户 {{ props.order.ownerName || '—' }}
        </el-button>
        <el-button
          @click="go({ name: 'pilots', query: props.task?.riderName ? { q: props.task.riderName } : {} })"
        >
          查看飞手 {{ props.task?.riderName || '—' }}
        </el-button>
        <el-button @click="go({ name: 'pilots' })">查看无人机</el-button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.section-title {
  font-size: 1.02rem;
  font-weight: 800;
  color: #303133;
}

.section-hint {
  margin-top: 0.3rem;
  font-size: 0.85rem;
  color: #909399;
}

.step-label {
  font-weight: 700;
  color: #303133;
}

.step-note {
  margin-top: 0.25rem;
  font-size: 0.82rem;
  color: #909399;
}

.block-note {
  margin-top: 0.85rem;
  padding: 0.9rem 1rem;
  border: 1px dashed #dcdfe6;
  border-radius: 10px;
  background: #fafafa;
  color: #909399;
  font-size: 0.9rem;
}

.amount {
  font-size: 1.05rem;
  font-weight: 800;
  color: #303133;
}

.complaint-card {
  padding: 0.85rem 1rem;
  border: 1px solid #fde2e2;
  border-left: 3px solid #f56c6c;
  border-radius: 10px;
  background: #fef7f7;
}

.complaint-desc {
  margin-top: 0.4rem;
  font-size: 0.9rem;
  color: #303133;
}
</style>
