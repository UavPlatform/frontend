<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import MainLayout from '../layouts/MainLayout.vue'
import RelatedOrdersTable from '../components/subject/RelatedOrdersTable.vue'
import { getAdminPilotDetail } from '../api/modules/admin-query'
import {
  BORROW_STATUS_META,
  getAdminBorrowApplications,
} from '../api/modules/admin-borrow'
import { fetchAllPages } from '../components/fleet/fetch-all'
import type { AdminBorrowApplicationVo, AdminPilotDetailVo } from '../types/admin'

/**
 * 飞手详情（REQ-SUP-GOV-004 / REQ-PILOT-EXEC-005 / REQ-SUP-GOV-007）：
 * 实名信息 + 驾驶资质 + 借用记录（借机申请按 pilotId 过滤）+ 关联订单。
 * 不再展示绑定自有机 / 启停开关。
 */
const route = useRoute()
const router = useRouter()

const userId = computed(() => String(route.params.id ?? ''))

const detail = ref<AdminPilotDetailVo>()
const loading = ref(false)
const borrows = ref<AdminBorrowApplicationVo[]>([])
const borrowsLoading = ref(false)
const borrowsTruncated = ref(false)

const ROLE_LABEL: Record<number, string> = {
  0: '普通用户',
  1: '飞手',
  2: '管理员',
}

const when = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

const statusMeta = (status?: string | null) =>
  BORROW_STATUS_META[status ?? ''] ?? { label: status || '—', tagType: 'info' as const }

const airframeLabel = (row: AdminBorrowApplicationVo) =>
  row.serialNumber || row.droneId || '—'

let loadSeq = 0
const reload = async () => {
  const seq = ++loadSeq
  detail.value = undefined
  borrows.value = []
  borrowsTruncated.value = false
  if (!/^\d+$/.test(userId.value)) {
    ElMessage.warning('飞手 ID 无效')
    loading.value = false
    borrowsLoading.value = false
    return
  }
  loading.value = true
  borrowsLoading.value = true
  const currentId = userId.value
  const pilotId = Number(currentId)

  const detailPromise = getAdminPilotDetail(currentId)
    .then((data) => {
      if (seq !== loadSeq) return
      detail.value = data
    })
    .catch((err) => {
      if (seq === loadSeq) {
        ElMessage.error(err instanceof Error ? err.message : '查询飞手详情失败')
      }
    })
    .finally(() => {
      if (seq === loadSeq) loading.value = false
    })

  // 契约 GET /admin/borrow-applications 支持 pilotId 过滤，服务端只回该飞手的借用记录
  const borrowsPromise = fetchAllPages((page, size) =>
    getAdminBorrowApplications({ pilotId, page, size }),
  )
    .then((result) => {
      if (seq !== loadSeq) return
      borrows.value = result.items
      borrowsTruncated.value = result.truncated
    })
    .catch((err) => {
      if (seq === loadSeq) {
        ElMessage.error(err instanceof Error ? err.message : '查询借用记录失败')
      }
    })
    .finally(() => {
      if (seq === loadSeq) borrowsLoading.value = false
    })

  await Promise.all([detailPromise, borrowsPromise])
}

watch(userId, reload, { immediate: true })

const backToList = () => {
  void router.push({ name: 'pilots' }).catch(() => undefined)
}

const qualifications = computed(() => detail.value?.qualifications ?? [])

const openOrder = (orderId?: string | null) => {
  if (!orderId) return
  void router.push({ name: 'order-detail', params: { orderNum: orderId } }).catch(() => undefined)
}
</script>

<template>
  <MainLayout title="飞手详情" subtitle="实名与资质、借用记录、名下履约订单。">
    <div class="flex flex-col gap-4">
      <section class="panel-card p-5" v-loading="loading">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <span class="text-xl font-700 text-[var(--text-strong)]">
              {{ detail?.userName || '飞手' }}
            </span>
            <span v-if="detail" class="text-sm text-[var(--text-secondary)]">ID {{ detail.userId }}</span>
            <el-tag
              v-if="detail"
              :type="detail.status === 0 ? 'danger' : 'success'"
              effect="plain"
            >
              {{ detail.status === 0 ? '停用' : '正常' }}
            </el-tag>
          </div>
          <div class="flex items-center gap-2">
            <el-button :loading="loading || borrowsLoading" @click="reload">刷新</el-button>
            <el-button @click="backToList">返回飞手列表</el-button>
          </div>
        </div>

        <el-descriptions v-if="detail" class="mt-4" :column="2" border>
          <el-descriptions-item label="飞手ID">
            {{ detail.userId ?? '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="昵称">{{ detail.userName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="账号状态">
            {{ detail.status === 0 ? '停用' : '正常' }}
          </el-descriptions-item>
          <el-descriptions-item label="角色">
            {{ ROLE_LABEL[detail.role ?? 1] ?? detail.role ?? '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="累计完成单">
            {{ detail.completedCount ?? 0 }}
          </el-descriptions-item>
          <el-descriptions-item label="借用记录">
            {{ borrows.length }} 条
          </el-descriptions-item>
          <el-descriptions-item label="身份证号">
            <span data-testid="pilot-id-number">{{ detail.idNumberMasked || '未登记' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="证件有效期">
            <span>{{ detail.idExpiryDate || '未登记' }}</span>
            <el-tag
              v-if="detail.idExpired"
              class="ml-2"
              type="danger"
              size="small"
              effect="plain"
              data-testid="pilot-id-expired"
            >
              已过期
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>
      </section>

      <!-- 驾驶资质（机型 × 执照等级，飞手在 App「飞手资料」中维护） -->
      <section v-if="detail" class="panel-card p-5" data-testid="pilot-qualifications">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <div class="section-title">驾驶资质</div>
          <div class="text-xs text-[var(--text-secondary)]">共 {{ qualifications.length }} 项</div>
        </div>
        <el-table v-if="qualifications.length" class="mt-3" :data="qualifications" border>
          <el-table-column label="机型" min-width="180">
            <template #default="{ row }">{{ row.modelName || '—' }}</template>
          </el-table-column>
          <el-table-column label="型号代码" min-width="120">
            <template #default="{ row }">{{ row.modelCode || '—' }}</template>
          </el-table-column>
          <el-table-column label="执照等级" min-width="120">
            <template #default="{ row }">
              <el-tag size="small" effect="plain">{{ row.licenseGradeLabel || row.licenseGrade || '—' }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else description="该飞手尚未登记驾驶资质" :image-size="60" />
      </section>

      <!-- 借用记录（REQ-SUP-GOV-004：详情展示借用记录，不再显示绑定无人机） -->
      <section v-if="detail" class="panel-card p-5" data-testid="pilot-borrow-records">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <div class="section-title">借用记录</div>
          <div class="text-xs text-[var(--text-secondary)]">共 {{ borrows.length }} 条</div>
        </div>

        <el-alert
          v-if="borrowsTruncated"
          class="mt-3"
          type="warning"
          :closable="false"
          title="借用申请列表过长，仅展示前若干页；如需完整数据请到「借机审批」筛选。"
        />

        <el-table
          v-loading="borrowsLoading"
          class="mt-3"
          :data="borrows"
          border
          stripe
          data-testid="pilot-borrow-table"
        >
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <el-tag :type="statusMeta(row.status).tagType" effect="plain">
                {{ statusMeta(row.status).label }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="机型" min-width="160">
            <template #default="{ row }">{{ row.modelName || '—' }}</template>
          </el-table-column>
          <el-table-column label="机身号 / 设备ID" min-width="160">
            <template #default="{ row }">{{ airframeLabel(row) }}</template>
          </el-table-column>
          <el-table-column label="申请时间" min-width="170">
            <template #default="{ row }">{{ when(row.appliedAt) }}</template>
          </el-table-column>
          <el-table-column label="借出时间" min-width="170">
            <template #default="{ row }">{{ when(row.borrowedAt) }}</template>
          </el-table-column>
          <el-table-column label="归还时间" min-width="170">
            <template #default="{ row }">{{ when(row.returnedAt) }}</template>
          </el-table-column>
          <el-table-column label="驳回原因" min-width="160">
            <template #default="{ row }">
              <span v-if="row.rejectReason" class="text-[var(--el-color-danger)]">{{ row.rejectReason }}</span>
              <span v-else class="text-[var(--text-faint)]">—</span>
            </template>
          </el-table-column>
          <el-table-column label="关联订单" min-width="140">
            <template #default="{ row }">
              <el-button
                v-if="row.orderId"
                link
                type="primary"
                @click="openOrder(row.orderId)"
              >
                {{ row.orderId }}
              </el-button>
              <span v-else class="text-[var(--text-faint)]">未关联</span>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty description="该飞手暂无借用记录" :image-size="80" />
          </template>
        </el-table>
      </section>

      <RelatedOrdersTable
        v-if="detail"
        :orders="detail.orders ?? []"
        :loading="loading"
        :hint="`累计完成 ${detail.completedCount ?? 0} 单`"
      />

      <section v-if="!detail && !loading" class="panel-card p-5">
        <el-empty description="未查询到该飞手（可能飞手 ID 不存在）">
          <el-button type="primary" @click="backToList">返回飞手列表</el-button>
        </el-empty>
      </section>
    </div>
  </MainLayout>
</template>

<style scoped>
.section-title {
  font-size: 1.02rem;
  font-weight: 800;
  color: var(--text-strong);
}
</style>
