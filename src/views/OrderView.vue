<script setup lang="ts">
import { onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import MainLayout from '../layouts/MainLayout.vue'
import {
  DISPATCH_FUNDS_META,
  DISPATCH_STAGE_META,
  getAdminDispatchOrders,
} from '../api/modules/admin-dispatch'
import type { AdminDispatchOrderRow } from '../types/admin'

/**
 * 派单订单列表（监管）：统一走 GET /admin/dispatch/orders。
 * 筛选（阶段 / 资金状态 / 创建时间 / 关键字）全部下推服务端，不再扫描旧 /admin/orders。
 * URL query 仍是筛选事实源；旧的 status=in_progress 映射为 stage=IN_TRANSIT。
 */
const route = useRoute()
const router = useRouter()

const PAGE_SIZES = [10, 20, 50, 100]
const STAGE_OPTIONS = Object.entries(DISPATCH_STAGE_META).map(([value, meta]) => ({
  value,
  label: meta.label,
}))
const FUNDS_OPTIONS = Object.entries(DISPATCH_FUNDS_META).map(([value, meta]) => ({
  value,
  label: meta.label,
}))

const filters = reactive({ stage: '', fundsStatus: '', date: '', q: '' })
const pageNo = ref(1)
const pageSize = ref(20)
const rows = ref<AdminDispatchOrderRow[]>([])
const total = ref(0)
const loading = ref(false)
const updatedAt = ref('--:--:--')
let loadSeq = 0

const parseQuery = (query: Record<string, unknown>) => {
  let stage = String(query.stage ?? '').trim().toUpperCase()
  const legacyStatus = String(query.status ?? '').trim().toUpperCase()
  if (!stage && (legacyStatus === 'IN_PROGRESS' || legacyStatus === 'in_progress'.toUpperCase())) {
    stage = 'IN_TRANSIT'
  }
  if (stage && !DISPATCH_STAGE_META[stage]) stage = ''

  let fundsStatus = String(query.fundsStatus ?? '').trim().toUpperCase()
  if (fundsStatus && !DISPATCH_FUNDS_META[fundsStatus]) fundsStatus = ''

  const rawDate = String(query.date ?? '')
  const size = Number(query.size)
  return {
    stage,
    fundsStatus,
    date: rawDate === 'today' || rawDate === '7d' ? rawDate : '',
    q: String(query.q ?? ''),
    page: Number.isSafeInteger(Number(query.page)) && Number(query.page) > 0 ? Number(query.page) : 1,
    size: PAGE_SIZES.includes(size) ? size : 20,
  }
}

const createdRange = () => {
  if (!filters.date) return { createdFrom: undefined as string | undefined, createdTo: undefined as string | undefined }
  const end = new Date()
  const start = new Date(end)
  if (filters.date === 'today') start.setHours(0, 0, 0, 0)
  else start.setTime(end.getTime() - 7 * 24 * 3_600_000)
  return { createdFrom: start.toISOString(), createdTo: end.toISOString() }
}

const syncQuery = () => {
  const query: Record<string, string> = {}
  if (filters.stage) query.stage = filters.stage
  if (filters.fundsStatus) query.fundsStatus = filters.fundsStatus
  if (filters.date) query.date = filters.date
  if (filters.q.trim()) query.q = filters.q.trim()
  if (pageNo.value !== 1) query.page = String(pageNo.value)
  if (pageSize.value !== 20) query.size = String(pageSize.value)
  void router.replace({ name: 'orders', query }).catch(() => undefined)
}

const load = async () => {
  const sequence = ++loadSeq
  loading.value = true
  try {
    const { createdFrom, createdTo } = createdRange()
    const page = await getAdminDispatchOrders({
      page: pageNo.value - 1,
      size: pageSize.value,
      stage: filters.stage || undefined,
      fundsStatus: filters.fundsStatus || undefined,
      createdFrom,
      createdTo,
      keyword: filters.q.trim() || undefined,
    })
    if (sequence !== loadSeq) return
    rows.value = page.content ?? []
    total.value = page.totalElements ?? rows.value.length
    updatedAt.value = new Date().toLocaleTimeString()
  } catch (err) {
    if (sequence !== loadSeq) return
    rows.value = []
    total.value = 0
    ElMessage.error(err instanceof Error ? err.message : '查询派单订单失败')
  } finally {
    if (sequence === loadSeq) loading.value = false
  }
}

watch(
  () => route.query,
  (query) => {
    const parsed = parseQuery(query as Record<string, unknown>)
    filters.stage = parsed.stage
    filters.fundsStatus = parsed.fundsStatus
    filters.date = parsed.date
    filters.q = parsed.q
    pageNo.value = parsed.page
    pageSize.value = parsed.size
    void load()
  },
  { immediate: true },
)

onBeforeUnmount(() => { loadSeq += 1 })

const onFilterChange = () => {
  pageNo.value = 1
  syncQuery()
}

const openDetail = (orderId?: string) => {
  if (!orderId) return
  void router.push({ name: 'order-detail', params: { orderNum: orderId } }).catch(() => undefined)
}

const stageMeta = (stage?: string) => DISPATCH_STAGE_META[stage ?? ''] ?? { label: stage || '—', tagType: 'info' as const }
const fundsMeta = (funds?: string) => DISPATCH_FUNDS_META[funds ?? ''] ?? { label: funds || '—', tagType: 'info' as const }
const money = (value?: number) => (value == null ? '—' : `¥${Number(value).toFixed(2)}`)
const when = (value?: string) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}
</script>

<template>
  <MainLayout title="订单监管" subtitle="派单订单列表（/admin/dispatch/orders），已下线旧撮合 /admin/orders。">
    <section class="panel-card p-5">
      <div class="toolbar">
        <el-select v-model="filters.stage" clearable placeholder="阶段" style="width: 160px" @change="onFilterChange">
          <el-option v-for="item in STAGE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="filters.fundsStatus" clearable placeholder="资金状态" style="width: 140px" @change="onFilterChange">
          <el-option v-for="item in FUNDS_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="filters.date" clearable placeholder="创建时间" style="width: 120px" @change="onFilterChange">
          <el-option label="今天" value="today" />
          <el-option label="近 7 天" value="7d" />
        </el-select>
        <el-input
          v-model="filters.q"
          clearable
          placeholder="订单号 / 货主 / 飞手"
          style="width: 220px"
          @keyup.enter="onFilterChange"
          @clear="onFilterChange"
        />
        <el-button type="primary" :loading="loading" @click="onFilterChange">查询</el-button>
        <span class="updated">更新于 {{ updatedAt }}</span>
      </div>

      <el-table v-loading="loading" :data="rows" class="mt-4" @row-click="(row: AdminDispatchOrderRow) => openDetail(row.orderId)">
        <el-table-column prop="orderId" label="订单号" min-width="220" />
        <el-table-column label="阶段" width="120">
          <template #default="{ row }">
            <el-tag :type="stageMeta(row.stage).tagType" effect="plain">{{ stageMeta(row.stage).label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="资金" width="110">
          <template #default="{ row }">
            <el-tag :type="fundsMeta(row.fundsStatus).tagType" effect="plain">{{ fundsMeta(row.fundsStatus).label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="货主" min-width="120">
          <template #default="{ row }">{{ row.shipper?.userName || '—' }}</template>
        </el-table-column>
        <el-table-column label="飞手" min-width="120">
          <template #default="{ row }">{{ row.pilot?.userName || '—' }}</template>
        </el-table-column>
        <el-table-column label="定金" width="100">
          <template #default="{ row }">{{ money(row.depositAmount) }}</template>
        </el-table-column>
        <el-table-column label="执行机型" min-width="120">
          <template #default="{ row }">{{ row.executedModelName || '—' }}</template>
        </el-table-column>
        <el-table-column label="机身号" min-width="140">
          <template #default="{ row }">{{ row.executedSerialNumber || '—' }}</template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="170">
          <template #default="{ row }">{{ when(row.createdAt) }}</template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="pageNo"
          v-model:page-size="pageSize"
          background
          layout="total, sizes, prev, pager, next"
          :total="total"
          :page-sizes="PAGE_SIZES"
          @current-change="syncQuery"
          @size-change="() => { pageNo = 1; syncQuery() }"
        />
      </div>
    </section>
  </MainLayout>
</template>

<style scoped>
.toolbar { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; }
.updated { margin-left: auto; color: var(--text-secondary); font-size: 0.85rem; }
.pager { display: flex; justify-content: flex-end; margin-top: 1rem; }
:deep(.el-table__row) { cursor: pointer; }
</style>
