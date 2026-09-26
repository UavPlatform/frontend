<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import MainLayout from '../layouts/MainLayout.vue'
import { getAdminUserDetail, getAdminUsers } from '../api/modules/admin-query'
import type { AdminUserDetailVo, AdminUserVo } from '../types/admin'

/**
 * 用户列表（REQ-FRONTEND-001 §3.1）。
 *
 * URL query（q/status/page/size/id）是筛选的唯一事实源：控件改动经 router.replace 回写 URL，
 * 再由 watch 统一解析并加载（与 /orders 同一约定）。
 *
 * `?id=` 是 TASK-FRONTEND-003 订单详情「查看用户」的定位参数：后端列表无 userId 过滤，
 * 因此按该 ID 另取详情，命中行置顶高亮并给出直达详情入口。
 */
const route = useRoute()
const router = useRouter()

const PAGE_SIZES = [10, 20, 50, 100]

const statusOptions = [
  { value: '1', label: '正常' },
  { value: '0', label: '停用' },
]

type UserRow = AdminUserVo & { userId?: number }

/** 解析 URL query（非法值一律回落为空，避免把脏参数打到后端） */
const parseQuery = (query: Record<string, unknown>) => {
  const size = Number(query.size)
  const rawStatus = String(query.status ?? '')
  const rawId = String(query.id ?? '').trim()
  return {
    q: String(query.q ?? ''),
    status: rawStatus === '1' || rawStatus === '0' ? rawStatus : '',
    page: Math.max(1, Number(query.page) || 1),
    size: PAGE_SIZES.includes(size) ? size : 10,
    id: /^\d+$/.test(rawId) ? rawId : '',
  }
}

const filters = reactive({ q: '', status: '' })
const pageNo = ref(1)
const pageSize = ref(10)

const rows = ref<UserRow[]>([])
const total = ref(0)
const loading = ref(false)

/** 定位参数 `?id=` 对应的用户（undefined = 未请求/未命中） */
const locateId = ref('')
const locate = ref<AdminUserDetailVo>()
const locateLoading = ref(false)

let loadSeq = 0
const load = async () => {
  const seq = ++loadSeq
  loading.value = true
  try {
    const page = await getAdminUsers({
      page: pageNo.value - 1,
      size: pageSize.value,
      keyword: filters.q.trim() || undefined,
      status: filters.status === '' ? undefined : Number(filters.status),
    })
    if (seq !== loadSeq) return
    rows.value = page.content
    total.value = page.totalElements ?? page.content.length
  } catch (err) {
    if (seq === loadSeq) {
      ElMessage.error(err instanceof Error ? err.message : '加载用户失败')
    }
  } finally {
    if (seq === loadSeq) {
      loading.value = false
    }
  }
}

/** 定位用户：命中后置顶显示，未命中给出提示（不阻断列表加载） */
let locateSeq = 0
const loadLocate = async (id: string) => {
  const seq = ++locateSeq
  locate.value = undefined
  if (!id) {
    locateLoading.value = false
    return
  }
  locateLoading.value = true
  try {
    const detail = await getAdminUserDetail(id)
    if (seq !== locateSeq) return
    locate.value = detail
  } catch (err) {
    if (seq === locateSeq) {
      ElMessage.warning(
        err instanceof Error ? err.message : `未查询到 ID 为 ${id} 的用户`,
      )
    }
  } finally {
    if (seq === locateSeq) {
      locateLoading.value = false
    }
  }
}

/** 定位行：用户不在当前页时置顶补入（在页内则只做高亮） */
const pagedRows = computed<UserRow[]>(() => {
  const target = locate.value
  if (!target?.userId) return rows.value
  const exists = rows.value.some((row) => row.userId === target.userId)
  if (exists) return rows.value
  return [{ ...target, orderCount: target.orders?.length ?? 0 }, ...rows.value]
})

const rowClassName = ({ row }: { row: UserRow }) =>
  locateId.value && String(row.userId) === locateId.value ? 'locate-row' : ''

/** 把本地筛选回写 URL（page 默认 1、size 默认 10 不入参），导航后由 watch 触发加载 */
const applyQuery = (patch: { page?: number; size?: number } = {}) => {
  const page = patch.page ?? 1
  const size = patch.size ?? pageSize.value
  if (patch.size !== undefined) {
    pageSize.value = patch.size
  }

  const query: Record<string, string> = {}
  if (filters.q.trim()) query.q = filters.q.trim()
  if (filters.status) query.status = filters.status
  if (locateId.value) query.id = locateId.value
  if (page > 1) query.page = String(page)
  if (size !== 10) query.size = String(size)

  void router.replace({ name: 'users', query })
}

const resetFilters = () => {
  filters.q = ''
  filters.status = ''
  applyQuery()
}

const openDetail = (row: UserRow) => {
  if (!row.userId) {
    ElMessage.warning('该用户缺少 ID，无法查看详情')
    return
  }
  void router.push({ name: 'user-detail', params: { id: String(row.userId) } }).catch(() => undefined)
}

// 首次同步必须加载；此后 query 变化只可能来自导航：留在 /users = 筛选变化 → 加载
let firstQuerySync = true
watch(
  () => route.query,
  (query) => {
    const parsed = parseQuery(query)
    filters.q = parsed.q
    filters.status = parsed.status
    pageNo.value = parsed.page
    pageSize.value = parsed.size
    locateId.value = parsed.id
    if (firstQuerySync || route.name === 'users') {
      firstQuerySync = false
      void load()
    }
  },
  { immediate: true },
)

watch(locateId, (id) => void loadLocate(id), { immediate: true })

const statusLabel = (row: UserRow) => (row.status === 0 ? '停用' : '正常')
const statusTagType = (row: UserRow) => (row.status === 0 ? 'danger' : 'success')
</script>

<template>
  <MainLayout title="用户" subtitle="注册用户列表与详情（含历史订单、争议）。">
    <section class="panel-card p-5">
      <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
          <el-input
            v-model="filters.q"
            class="md:!w-[240px]"
            clearable
            placeholder="搜索用户昵称"
            @keyup.enter="applyQuery()"
            @clear="applyQuery()"
          />
          <el-select
            v-model="filters.status"
            class="md:!w-[130px]"
            clearable
            placeholder="账号状态"
            @change="applyQuery()"
          >
            <el-option
              v-for="option in statusOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-button type="primary" @click="applyQuery()">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </div>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>

      <el-alert
        v-if="locateId && locate?.userId"
        class="mt-4"
        type="info"
        :closable="false"
        :title="`已按链接定位到用户「${locate.userName || '—'}」（ID ${locate.userId}），行已高亮`"
      >
        <template #default>
          <el-button size="small" type="primary" @click="openDetail(locate)">
            查看该用户详情
          </el-button>
        </template>
      </el-alert>

      <div class="mt-4">
        <el-table
          v-loading="loading || locateLoading"
          :data="pagedRows"
          border
          stripe
          :row-class-name="rowClassName"
          @row-click="openDetail"
        >
          <el-table-column prop="userId" label="用户ID" width="110" />
          <el-table-column label="昵称" min-width="160">
            <template #default="scope">
              {{ scope.row.userName || '—' }}
            </template>
          </el-table-column>
          <el-table-column label="账号状态" width="110">
            <template #default="scope">
              <el-tag :type="statusTagType(scope.row)" effect="plain">
                {{ statusLabel(scope.row) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="订单数" width="110">
            <template #default="scope">
              {{ scope.row.orderCount ?? '—' }}
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
/* 定位行高亮：浅蓝底 + 首列色条（承接 003 的 ?id= 定位参数） */
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
