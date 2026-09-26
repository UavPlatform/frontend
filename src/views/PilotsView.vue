<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import MainLayout from '../layouts/MainLayout.vue'
import { getAdminPilots } from '../api/modules/admin-query'
import type { AdminPilotVo } from '../types/admin'

/**
 * 飞手列表（REQ-FRONTEND-001 §4.1）。
 *
 * URL query（q/page/size）是筛选的唯一事实源（与 /orders、/users 同一约定）。
 * `?q=` 承接 TASK-FRONTEND-003 订单详情/任务监管的定位参数：后端按昵称模糊过滤，
 * 与关键字完全同名的行额外高亮，方便一眼定位目标飞手。
 */
const route = useRoute()
const router = useRouter()

const PAGE_SIZES = [10, 20, 50, 100]

type PilotRow = AdminPilotVo

/** 解析 URL query（非法值一律回落为空，避免把脏参数打到后端） */
const parseQuery = (query: Record<string, unknown>) => {
  const size = Number(query.size)
  return {
    q: String(query.q ?? ''),
    page: Math.max(1, Number(query.page) || 1),
    size: PAGE_SIZES.includes(size) ? size : 10,
  }
}

const filters = reactive({ q: '' })
const pageNo = ref(1)
const pageSize = ref(10)

const rows = ref<PilotRow[]>([])
const total = ref(0)
const loading = ref(false)

let loadSeq = 0
const load = async () => {
  const seq = ++loadSeq
  loading.value = true
  try {
    const page = await getAdminPilots({
      page: pageNo.value - 1,
      size: pageSize.value,
      keyword: filters.q.trim() || undefined,
    })
    if (seq !== loadSeq) return
    rows.value = page.content
    total.value = page.totalElements ?? page.content.length
  } catch (err) {
    if (seq === loadSeq) {
      ElMessage.error(err instanceof Error ? err.message : '加载飞手失败')
    }
  } finally {
    if (seq === loadSeq) {
      loading.value = false
    }
  }
}

/** 定位行：关键字完全命中昵称的行高亮（后端只提供模糊过滤） */
const rowClassName = ({ row }: { row: PilotRow }) => {
  const keyword = filters.q.trim()
  return keyword && row.userName && row.userName.toLowerCase() === keyword.toLowerCase()
    ? 'locate-row'
    : ''
}

/** 把本地筛选回写 URL（page 默认 1、size 默认 10 不入参），导航后由 watch 触发加载 */
const applyQuery = (patch: { page?: number; size?: number } = {}) => {
  const page = patch.page ?? 1
  const size = patch.size ?? pageSize.value
  if (patch.size !== undefined) {
    pageSize.value = patch.size
  }

  const query: Record<string, string> = {}
  if (filters.q.trim()) query.q = filters.q.trim()
  if (page > 1) query.page = String(page)
  if (size !== 10) query.size = String(size)

  void router.replace({ name: 'pilots', query })
}

const resetFilters = () => {
  filters.q = ''
  applyQuery()
}

const openDetail = (row: PilotRow) => {
  if (!row.userId) {
    ElMessage.warning('该飞手缺少 ID，无法查看详情')
    return
  }
  void router
    .push({ name: 'pilot-detail', params: { id: String(row.userId) } })
    .catch(() => undefined)
}

// 首次同步必须加载；此后 query 变化只可能来自导航：留在 /pilots = 筛选变化 → 加载
let firstQuerySync = true
watch(
  () => route.query,
  (query) => {
    const parsed = parseQuery(query)
    filters.q = parsed.q
    pageNo.value = parsed.page
    pageSize.value = parsed.size
    if (firstQuerySync || route.name === 'pilots') {
      firstQuerySync = false
      void load()
    }
  },
  { immediate: true },
)

const onlineLabel = (row: PilotRow) => `${row.onlineUavCount ?? 0} / ${row.uavCount ?? 0}`
</script>

<template>
  <MainLayout title="飞手" subtitle="注册飞手列表与详情（含绑定无人机、履约记录）。">
    <section class="panel-card p-5">
      <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
          <el-input
            v-model="filters.q"
            class="md:!w-[240px]"
            clearable
            placeholder="搜索飞手昵称"
            @keyup.enter="applyQuery()"
            @clear="applyQuery()"
          />
          <el-button type="primary" @click="applyQuery()">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </div>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>

      <el-alert
        v-if="filters.q.trim()"
        class="mt-4"
        type="info"
        :closable="false"
        :title="`已按关键字「${filters.q.trim()}」筛选飞手列表，完全同名的行已高亮`"
      />

      <div class="mt-4">
        <el-table
          v-loading="loading"
          :data="rows"
          border
          stripe
          :row-class-name="rowClassName"
          @row-click="openDetail"
        >
          <el-table-column prop="userId" label="飞手ID" width="110" />
          <el-table-column label="昵称" min-width="150">
            <template #default="scope">
              {{ scope.row.userName || '—' }}
            </template>
          </el-table-column>
          <el-table-column label="账号状态" width="110">
            <template #default="scope">
              <el-tag :type="scope.row.status === 0 ? 'danger' : 'success'" effect="plain">
                {{ scope.row.status === 0 ? '停用' : '正常' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="完成单" width="100">
            <template #default="scope">
              {{ scope.row.completedCount ?? 0 }}
            </template>
          </el-table-column>
          <el-table-column label="无人机（在线/绑定）" width="170">
            <template #default="scope">
              {{ onlineLabel(scope.row) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="scope">
              <el-button size="small" @click.stop="openDetail(scope.row)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="mt-4 flex justify-center">
          <el-pagination
            background
            layout="total, sizes, prev, pager, next, jumper"
            :total="total"
            :current-page="pageNo"
            :page-size="pageSize"
            :page-sizes="PAGE_SIZES"
            @current-change="(page: number) => applyQuery({ page })"
            @size-change="(size: number) => applyQuery({ size })"
          />
        </div>
      </div>
    </section>
  </MainLayout>
</template>

<style scoped>
/* 定位行高亮：浅蓝底 + 首列色条（承接 003 的 ?q= 定位参数） */
:deep(.el-table .locate-row) {
  background-color: #ecf5ff;
}

:deep(.el-table .locate-row > td:first-child) {
  box-shadow: inset 3px 0 0 0 #409eff;
}

:deep(.el-table .locate-row:hover > td) {
  background-color: #e3f0ff;
}
</style>
