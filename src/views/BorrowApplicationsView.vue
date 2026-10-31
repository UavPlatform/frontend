<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import MainLayout from '../layouts/MainLayout.vue'
import {
  approveAdminBorrowApplication,
  BORROW_STATUS_META,
  getAdminBorrowApplications,
  rejectAdminBorrowApplication,
} from '../api/modules/admin-borrow'
import { getAdminDrones } from '../api/modules/admin-drone'
import { fetchAllPages } from '../components/fleet/fetch-all'
import type { AdminBorrowApplicationVo, AdminDroneVo } from '../types/admin'

/**
 * 借机审批（REQ-SUP-GOV-007）：待审批列表、手选/随机指定机身号通过、驳回写原因。
 * 飞手已有一台时可特批第二台；归还不在此页审批。
 * URL query（status/page/size）是筛选事实源。
 */
const route = useRoute()
const router = useRouter()

const PAGE_SIZES = [10, 20, 50, 100]
const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'PENDING', label: '待审批' },
  { value: 'APPROVED', label: '已借出' },
  { value: 'REJECTED', label: '已驳回' },
  { value: 'RETURNED', label: '已归还' },
]

const filters = reactive({ status: 'PENDING' })
const pageNo = ref(1)
const pageSize = ref(20)
const rows = ref<AdminBorrowApplicationVo[]>([])
const total = ref(0)
const loading = ref(false)

const approveVisible = ref(false)
const approveTarget = ref<AdminBorrowApplicationVo | null>(null)
const approveMode = ref<'pick' | 'random'>('pick')
const selectedDroneId = ref<string | undefined>(undefined)
const stockLoading = ref(false)
const stockDrones = ref<AdminDroneVo[]>([])
const approving = ref(false)

const rejectVisible = ref(false)
const rejectTarget = ref<AdminBorrowApplicationVo | null>(null)
const rejectReason = ref('')
const rejecting = ref(false)

let loadSeq = 0
let stockSeq = 0

const parseQuery = (query: Record<string, unknown>) => {
  const size = Number(query.size)
  const status = String(query.status ?? 'PENDING')
  const allowed = STATUS_OPTIONS.map((o) => o.value)
  return {
    status: allowed.includes(status) ? status : 'PENDING',
    page: Number.isSafeInteger(Number(query.page)) && Number(query.page) > 0 ? Number(query.page) : 1,
    size: PAGE_SIZES.includes(size) ? size : 20,
  }
}

const when = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

const statusMeta = (status?: string | null) =>
  BORROW_STATUS_META[status ?? ''] ?? { label: status || '—', tagType: 'info' as const }

const load = async () => {
  const seq = ++loadSeq
  loading.value = true
  try {
    const page = await getAdminBorrowApplications({
      page: pageNo.value - 1,
      size: pageSize.value,
      status: filters.status || undefined,
    })
    if (seq !== loadSeq) return
    rows.value = page.content
    total.value = page.totalElements ?? page.content.length
  } catch (err) {
    if (seq === loadSeq) {
      ElMessage.error(err instanceof Error ? err.message : '加载借机申请失败')
    }
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

const applyQuery = (patch: { page?: number; size?: number; status?: string } = {}) => {
  const page = patch.page ?? 1
  const size = patch.size ?? pageSize.value
  if (patch.size !== undefined) pageSize.value = patch.size
  if (patch.status !== undefined) filters.status = patch.status

  const query: Record<string, string> = {}
  if (filters.status) query.status = filters.status
  if (page > 1) query.page = String(page)
  if (size !== 20) query.size = String(size)
  void router.replace({ name: 'borrow-applications', query })
}

const loadStock = async (modelId?: number | null) => {
  const seq = ++stockSeq
  stockDrones.value = []
  selectedDroneId.value = undefined
  if (modelId == null) return
  stockLoading.value = true
  try {
    const result = await fetchAllPages((page, size) => getAdminDrones({ page, size }))
    if (seq !== stockSeq) return
    stockDrones.value = result.items.filter(
      (d) =>
        d.model?.aircraftModelId === modelId &&
        d.enabled === true &&
        d.borrowStatus === 'IN_STOCK' &&
        Boolean(d.droneId),
    )
  } catch (err) {
    if (seq === stockSeq) {
      ElMessage.error(err instanceof Error ? err.message : '加载在库飞机失败')
    }
  } finally {
    if (seq === stockSeq) stockLoading.value = false
  }
}

const openApprove = async (row: AdminBorrowApplicationVo) => {
  if (!row.borrowId) return
  approveTarget.value = row
  approveMode.value = 'pick'
  approveVisible.value = true
  await loadStock(row.aircraftModelId)
}

const confirmApprove = async () => {
  const target = approveTarget.value
  if (!target?.borrowId || approving.value) return

  if (approveMode.value === 'pick' && !selectedDroneId.value) {
    ElMessage.warning('请选择机身号，或改用「随机选一台」')
    return
  }
  if (approveMode.value === 'random' && stockDrones.value.length === 0) {
    ElMessage.warning('该机型当前无在库启用飞机，无法通过')
    return
  }

  if (target.pilotHasActiveLoan) {
    try {
      await ElMessageBox.confirm(
        `${target.pilotName || `飞手#${target.pilotId}`} 当前已有已借出飞机。确认特批第二台？`,
        '特批第二台',
        { type: 'warning', confirmButtonText: '确认特批通过', cancelButtonText: '取消' },
      )
    } catch {
      return
    }
  }

  approving.value = true
  try {
    await approveAdminBorrowApplication(
      target.borrowId,
      approveMode.value === 'random'
        ? { random: true }
        : { droneId: selectedDroneId.value },
    )
    ElMessage.success('已通过并出借')
    approveVisible.value = false
    await load()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '通过失败')
  } finally {
    approving.value = false
  }
}

const openReject = (row: AdminBorrowApplicationVo) => {
  if (!row.borrowId) return
  rejectTarget.value = row
  rejectReason.value = ''
  rejectVisible.value = true
}

const confirmReject = async () => {
  const target = rejectTarget.value
  if (!target?.borrowId || rejecting.value) return
  const reason = rejectReason.value.trim()
  if (!reason) {
    ElMessage.warning('请填写驳回原因')
    return
  }
  rejecting.value = true
  try {
    await rejectAdminBorrowApplication(target.borrowId, { reason })
    ElMessage.success('已驳回')
    rejectVisible.value = false
    await load()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '驳回失败')
  } finally {
    rejecting.value = false
  }
}

const openOrder = (orderId?: string | null) => {
  if (!orderId) return
  void router.push({ name: 'order-detail', params: { orderNum: orderId } }).catch(() => undefined)
}

const openPilot = (pilotId?: number | null) => {
  if (pilotId == null) return
  void router.push({ name: 'pilot-detail', params: { id: String(pilotId) } }).catch(() => undefined)
}

const stockHint = computed(() => {
  if (stockLoading.value) return '正在加载在库飞机…'
  if (stockDrones.value.length === 0) return '该机型当前无在库启用飞机，无法通过，可驳回或等回库'
  return `可选 ${stockDrones.value.length} 架在库启用飞机`
})

watch(approveVisible, (visible) => {
  if (!visible) stockSeq += 1
})
onBeforeUnmount(() => {
  loadSeq += 1
  stockSeq += 1
})

defineExpose({
  approveMode,
  selectedDroneId,
  confirmApprove,
  stockDrones,
})

let firstQuerySync = true
watch(
  () => route.query,
  (query) => {
    const parsed = parseQuery(query)
    filters.status = parsed.status
    pageNo.value = parsed.page
    pageSize.value = parsed.size
    if (firstQuerySync || route.name === 'borrow-applications') {
      firstQuerySync = false
      void load()
    }
  },
  { immediate: true },
)
</script>

<template>
  <MainLayout
    title="借机审批"
    subtitle="处理飞手借机申请：通过时必须指定机身号（手选或随机）；驳回需写原因。归还不需审批，误归还可在「无人机与机型」借还记录中改回已借出。"
  >
    <section class="panel-card p-5" data-testid="borrow-applications-panel">
      <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
          <el-select
            v-model="filters.status"
            class="md:!w-[180px]"
            data-testid="borrow-status-filter"
            @change="(v: string) => applyQuery({ status: v, page: 1 })"
          >
            <el-option
              v-for="opt in STATUS_OPTIONS"
              :key="opt.value || 'all'"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
          <el-button type="primary" @click="applyQuery({ page: pageNo })">查询</el-button>
          <el-button @click="applyQuery({ status: 'PENDING', page: 1 })">只看待审批</el-button>
        </div>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>

      <div class="mt-4">
        <el-table v-loading="loading" :data="rows" border stripe data-testid="borrow-applications-table">
          <el-table-column label="飞手" min-width="140">
            <template #default="{ row }">
              <el-button link type="primary" @click="openPilot(row.pilotId)">
                {{ row.pilotName || (row.pilotId != null ? `#${row.pilotId}` : '—') }}
              </el-button>
              <el-tag
                v-if="row.pilotHasActiveLoan && row.status === 'PENDING'"
                class="ml-1"
                size="small"
                type="warning"
                effect="plain"
                data-testid="borrow-active-loan-hint"
              >
                已有借出
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="申请机型" min-width="160">
            <template #default="{ row }">
              <div>{{ row.modelName || '—' }}</div>
              <div class="text-xs text-[var(--text-faint)]">在库 {{ row.inStockCount ?? 0 }} 架</div>
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
          <el-table-column label="申请时间" min-width="170">
            <template #default="{ row }">{{ when(row.appliedAt) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <el-tag :type="statusMeta(row.status).tagType" effect="plain">
                {{ statusMeta(row.status).label }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="出借机身" min-width="140">
            <template #default="{ row }">
              <span v-if="row.serialNumber">{{ row.serialNumber }}</span>
              <span v-else class="text-[var(--text-faint)]">—</span>
              <div v-if="row.rejectReason" class="mt-1 text-xs text-[var(--el-color-danger)]">
                {{ row.rejectReason }}
              </div>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <template v-if="row.status === 'PENDING'">
                <el-button
                  size="small"
                  type="primary"
                  :data-testid="`borrow-approve-${row.borrowId}`"
                  @click="openApprove(row)"
                >
                  通过
                </el-button>
                <el-button
                  size="small"
                  type="danger"
                  plain
                  :data-testid="`borrow-reject-${row.borrowId}`"
                  @click="openReject(row)"
                >
                  驳回
                </el-button>
              </template>
              <span v-else class="text-xs text-[var(--text-faint)]">—</span>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty description="暂无借机申请" :image-size="80" />
          </template>
        </el-table>

        <div class="mt-4 flex justify-center">
          <el-pagination
            background
            layout="total, sizes, prev, pager, next, jumper"
            :total="total"
            :current-page="pageNo"
            :page-size="pageSize"
            :page-sizes="PAGE_SIZES"
            @current-change="(p: number) => applyQuery({ page: p })"
            @size-change="(s: number) => applyQuery({ page: 1, size: s })"
          />
        </div>
      </div>
    </section>

    <el-dialog
      v-model="approveVisible"
      title="通过借机申请"
      width="min(520px, 94vw)"
      destroy-on-close
      data-testid="borrow-approve-dialog"
    >
      <div v-if="approveTarget" class="mb-3 text-sm text-[var(--text-secondary)]">
        <div>
          飞手
          <strong>{{ approveTarget.pilotName || `#${approveTarget.pilotId}` }}</strong>
          · 机型 <strong>{{ approveTarget.modelName || '—' }}</strong>
        </div>
        <div v-if="approveTarget.pilotHasActiveLoan" class="mt-1 text-[var(--el-color-warning)]">
          该飞手当前已有已借出飞机，通过即为特批第二台。
        </div>
        <div class="mt-1 text-xs text-[var(--text-faint)]">{{ stockHint }}</div>
      </div>

      <el-radio-group v-model="approveMode" class="mb-3" data-testid="borrow-approve-mode">
        <el-radio-button value="pick">手选机身号</el-radio-button>
        <el-radio-button value="random">随机选一台</el-radio-button>
      </el-radio-group>

      <el-select
        v-if="approveMode === 'pick'"
        v-model="selectedDroneId"
        class="!w-full"
        filterable
        clearable
        :loading="stockLoading"
        placeholder="选择该机型在库启用飞机"
        data-testid="borrow-approve-drone"
      >
        <el-option
          v-for="d in stockDrones"
          :key="d.droneId"
          :label="`${d.serialNumber}${d.airport?.name ? ` · ${d.airport.name}` : ''}`"
          :value="d.droneId!"
        />
      </el-select>
      <el-alert
        v-else
        class="mt-1"
        type="info"
        :closable="false"
        show-icon
        :title="stockDrones.length ? `将从 ${stockDrones.length} 架在库启用飞机中随机出借一台` : '当前无在库启用飞机，无法随机出借'"
      />

      <template #footer>
        <el-button @click="approveVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="approving"
          :disabled="approveMode === 'pick' ? !selectedDroneId : stockDrones.length === 0"
          data-testid="borrow-approve-confirm"
          @click="confirmApprove"
        >
          确认通过
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="rejectVisible"
      title="驳回借机申请"
      width="min(480px, 94vw)"
      destroy-on-close
      data-testid="borrow-reject-dialog"
    >
      <el-form label-width="90px">
        <el-form-item label="驳回原因" required>
          <el-input
            v-model="rejectReason"
            type="textarea"
            :rows="4"
            maxlength="500"
            show-word-limit
            placeholder="飞手将看到此原因"
            data-testid="borrow-reject-reason"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectVisible = false">取消</el-button>
        <el-button
          type="danger"
          :loading="rejecting"
          data-testid="borrow-reject-confirm"
          @click="confirmReject"
        >
          确认驳回
        </el-button>
      </template>
    </el-dialog>
  </MainLayout>
</template>
