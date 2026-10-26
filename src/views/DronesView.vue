<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import MainLayout from '../layouts/MainLayout.vue'
import { getAdminAircraftModels } from '../api/modules/admin-aircraft-model'
import {
  createAdminDrone,
  getAdminDroneBorrows,
  getAdminDrones,
  setAdminDroneEnabled,
  updateAdminDrone,
  type AdminDroneWrite,
} from '../api/modules/admin-drone'
import { DISPATCH_STAGE_META } from '../api/modules/admin-dispatch'
import type { AdminAircraftModelVo, AdminDroneBorrowVo, AdminDroneVo } from '../types/admin'

/**
 * 机场 / 无人机管理（REQ-SUP-GOV-005）：登记、启停、在库/已借出/执飞中、最近订单、借还记录。
 * URL query（airport/page/size）是筛选事实源。
 */
const route = useRoute()
const router = useRouter()

const PAGE_SIZES = [10, 20, 50, 100]

const filters = reactive({ airport: '' })
const pageNo = ref(1)
const pageSize = ref(20)
const rows = ref<AdminDroneVo[]>([])
const total = ref(0)
const loading = ref(false)

const modelOptions = ref<AdminAircraftModelVo[]>([])
const dialogVisible = ref(false)
const saving = ref(false)
const saveError = ref('')
const editing = ref<AdminDroneVo | null>(null)
const form = reactive({
  aircraftModelId: undefined as number | undefined,
  serialNumber: '',
  airportName: '',
  latitude: undefined as number | undefined,
  longitude: undefined as number | undefined,
})

const borrowsVisible = ref(false)
const borrowsLoading = ref(false)
const borrowsDrone = ref<AdminDroneVo | null>(null)
const borrows = ref<AdminDroneBorrowVo[]>([])
const borrowsTotal = ref(0)
const borrowsPage = ref(1)
let borrowsSeq = 0

const parseQuery = (query: Record<string, unknown>) => {
  const size = Number(query.size)
  return {
    airport: String(query.airport ?? ''),
    page: Number.isSafeInteger(Number(query.page)) && Number(query.page) > 0 ? Number(query.page) : 1,
    size: PAGE_SIZES.includes(size) ? size : 20,
  }
}

const when = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

const stageLabel = (stage?: string | null) => {
  if (!stage) return '—'
  return DISPATCH_STAGE_META[stage]?.label ?? stage
}

const enabledModels = computed(() =>
  modelOptions.value.filter((m) => m.enabled && m.id != null),
)

/** 编辑时若当前机型已停用，仍在下拉中展示一条不可选的当前值 */
const currentDisabledModel = computed(() => {
  const model = editing.value?.model
  const id = model?.aircraftModelId
  if (id == null) return null
  if (enabledModels.value.some((m) => m.id === id)) return null
  return model
})

/** VO 已标明正被借出时可锁定机身号/机型；历史借还无字段，靠保存失败把后端文案展示在对话框内 */
const identityLocked = computed(
  () =>
    editing.value != null &&
    (editing.value.borrowStatus === 'BORROWED' || editing.value.currentBorrow != null),
)

let loadSeq = 0
const load = async () => {
  const seq = ++loadSeq
  loading.value = true
  try {
    const page = await getAdminDrones({
      page: pageNo.value - 1,
      size: pageSize.value,
      airportName: filters.airport.trim() || undefined,
    })
    if (seq !== loadSeq) return
    rows.value = page.content
    total.value = page.totalElements ?? page.content.length
  } catch (err) {
    if (seq === loadSeq) {
      ElMessage.error(err instanceof Error ? err.message : '加载无人机失败')
    }
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

const loadModels = async () => {
  try {
    const page = await getAdminAircraftModels({ page: 0, size: 100 })
    modelOptions.value = page.content
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '加载机型失败')
  }
}

const applyQuery = (patch: { page?: number; size?: number } = {}) => {
  const page = patch.page ?? 1
  const size = patch.size ?? pageSize.value
  if (patch.size !== undefined) pageSize.value = patch.size
  const query: Record<string, string> = {}
  if (filters.airport.trim()) query.airport = filters.airport.trim()
  if (page > 1) query.page = String(page)
  if (size !== 20) query.size = String(size)
  void router.replace({ name: 'drones', query })
}

const resetFilters = () => {
  filters.airport = ''
  applyQuery()
}

const openCreate = async () => {
  editing.value = null
  saveError.value = ''
  form.aircraftModelId = undefined
  form.serialNumber = ''
  form.airportName = ''
  form.latitude = undefined
  form.longitude = undefined
  if (modelOptions.value.length === 0) await loadModels()
  dialogVisible.value = true
}

const openEdit = async (row: AdminDroneVo) => {
  editing.value = row
  saveError.value = ''
  form.aircraftModelId = row.model?.aircraftModelId
  form.serialNumber = row.serialNumber ?? ''
  form.airportName = row.airportName ?? ''
  form.latitude = row.latitude
  form.longitude = row.longitude
  if (modelOptions.value.length === 0) await loadModels()
  dialogVisible.value = true
}

const buildBody = (): AdminDroneWrite => ({
  aircraftModelId: Number(form.aircraftModelId),
  serialNumber: form.serialNumber.trim(),
  airportName: form.airportName.trim(),
  latitude: Number(form.latitude),
  longitude: Number(form.longitude),
})

const save = async () => {
  if (saving.value) return
  if (!form.aircraftModelId) {
    ElMessage.warning('请选择机型')
    return
  }
  if (!form.serialNumber.trim() || !form.airportName.trim()) {
    ElMessage.warning('请填写机身号与机场名称')
    return
  }
  if (form.latitude == null || form.longitude == null ||
    !Number.isFinite(form.latitude) || !Number.isFinite(form.longitude) ||
    Math.abs(form.latitude) > 90 || Math.abs(form.longitude) > 180) {
    ElMessage.warning('请填写有效的机场经纬度')
    return
  }
  saving.value = true
  saveError.value = ''
  try {
    const body = buildBody()
    if (editing.value?.droneId) {
      await updateAdminDrone(editing.value.droneId, body)
      ElMessage.success('无人机已更新')
    } else {
      await createAdminDrone(body)
      ElMessage.success('无人机已登记')
    }
    dialogVisible.value = false
    await load()
  } catch (err) {
    // 借还记录导致机身号/机型不可改等冲突，把后端 message 留在对话框内，避免只闪一下 toast
    const message = err instanceof Error ? err.message : '保存无人机失败'
    saveError.value = message
    ElMessage.error(message)
  } finally {
    saving.value = false
  }
}

const toggleEnabled = async (row: AdminDroneVo, enabled: boolean) => {
  if (!row.droneId) return
  if (!enabled) {
    try {
      await ElMessageBox.confirm(
        `确认停用无人机 ${row.serialNumber}？停用后飞手不可借用。`,
        '确认停用无人机',
        { type: 'warning', confirmButtonText: '确认停用', cancelButtonText: '取消' },
      )
    } catch {
      return
    }
  }
  try {
    await setAdminDroneEnabled(row.droneId, enabled)
    ElMessage.success(enabled ? '无人机已启用' : '无人机已停用')
    await load()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '修改无人机状态失败')
  }
}

const openLatestOrder = (row: AdminDroneVo) => {
  const orderId = row.latestOrder?.orderId
  if (!orderId) {
    ElMessage.info('暂无订单')
    return
  }
  void router.push({ name: 'order-detail', params: { orderNum: orderId } }).catch(() => undefined)
}

const openBorrows = async (row: AdminDroneVo) => {
  if (!row.droneId) return
  borrowsDrone.value = row
  borrows.value = []
  borrowsTotal.value = 0
  borrowsPage.value = 1
  borrowsVisible.value = true
  await loadBorrows()
}

const loadBorrows = async () => {
  const seq = ++borrowsSeq
  const droneId = borrowsDrone.value?.droneId
  if (!droneId) return
  borrowsLoading.value = true
  try {
    const page = await getAdminDroneBorrows(droneId, {
      page: borrowsPage.value - 1,
      size: 20,
    })
    if (seq !== borrowsSeq) return
    borrows.value = page.content
    borrowsTotal.value = page.totalElements ?? page.content.length
  } catch (err) {
    if (seq === borrowsSeq) {
      borrows.value = []
      borrowsTotal.value = 0
      ElMessage.error(err instanceof Error ? err.message : '加载借还记录失败')
    }
  } finally {
    if (seq === borrowsSeq) borrowsLoading.value = false
  }
}

watch(borrowsVisible, (visible) => {
  if (!visible) {
    borrowsSeq += 1
    borrowsLoading.value = false
  }
})
onBeforeUnmount(() => { loadSeq += 1; borrowsSeq += 1 })

let firstQuerySync = true
watch(
  () => route.query,
  (query) => {
    const parsed = parseQuery(query)
    filters.airport = parsed.airport
    pageNo.value = parsed.page
    pageSize.value = parsed.size
    if (firstQuerySync || route.name === 'drones') {
      firstQuerySync = false
      void load()
    }
  },
  { immediate: true },
)
</script>

<template>
  <MainLayout
    title="机场 / 无人机"
    subtitle="登记平台租借无人机及所在机场，查看在库 / 已借出 / 执飞中状态与最近订单。"
  >
    <section class="panel-card p-5">
      <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
          <el-input
            v-model="filters.airport"
            class="md:!w-[240px]"
            clearable
            placeholder="按机场名称筛选"
            data-testid="drone-airport-filter"
            @keyup.enter="applyQuery()"
            @clear="applyQuery()"
          />
          <el-button type="primary" @click="applyQuery()">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </div>
        <div class="flex items-center gap-2">
          <el-button :loading="loading" @click="load">刷新</el-button>
          <el-button type="primary" data-testid="drone-create" @click="openCreate">登记无人机</el-button>
        </div>
      </div>

      <div class="mt-4">
        <el-table v-loading="loading" :data="rows" border stripe data-testid="drone-table">
          <el-table-column label="机型" min-width="160">
            <template #default="{ row }">
              <div>{{ row.model?.displayName || '—' }}</div>
              <div class="text-xs text-[var(--text-faint)]">{{ row.model?.modelCode || '' }}</div>
            </template>
          </el-table-column>
          <el-table-column prop="serialNumber" label="机身号" min-width="140" />
          <el-table-column prop="airportName" label="机场" min-width="140" />
          <el-table-column label="启用" width="90">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'danger'" effect="plain">
                {{ row.enabled ? '启用' : '停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="借用状态" min-width="220">
            <template #default="{ row }">
              <div class="flex flex-wrap items-center gap-1">
                <el-tag
                  :type="row.borrowStatus === 'BORROWED' ? 'warning' : 'success'"
                  effect="plain"
                >
                  {{ row.borrowStatus === 'BORROWED' ? '已借出' : '在库' }}
                </el-tag>
                <el-tag v-if="row.executing" type="danger" effect="dark">执飞中</el-tag>
              </div>
              <div
                v-if="row.borrowStatus === 'BORROWED' && row.currentBorrow"
                class="mt-1 text-xs text-[var(--text-secondary)]"
              >
                {{ row.currentBorrow.pilotName || `飞手#${row.currentBorrow.pilotId}` }}
                · {{ when(row.currentBorrow.borrowedAt) }}
              </div>
            </template>
          </el-table-column>
          <el-table-column label="最近订单" min-width="180">
            <template #default="{ row }">
              <el-button
                v-if="row.latestOrder?.orderId"
                link
                type="primary"
                :data-testid="`drone-latest-order-${row.droneId}`"
                @click="openLatestOrder(row)"
              >
                {{ row.latestOrder.orderId }}
                <span class="ml-1 text-xs text-[var(--text-faint)]">
                  （{{ stageLabel(row.latestOrder.stage) }}）
                </span>
              </el-button>
              <span v-else class="text-[var(--text-faint)]">暂无订单</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="260" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openEdit(row)">编辑</el-button>
              <el-button
                size="small"
                :type="row.enabled ? 'warning' : 'success'"
                @click="toggleEnabled(row, !row.enabled)"
              >
                {{ row.enabled ? '停用' : '启用' }}
              </el-button>
              <el-button size="small" @click="openBorrows(row)">借还记录</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty description="暂无无人机，请先登记" :image-size="80" />
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
      v-model="dialogVisible"
      :title="editing ? '编辑无人机' : '登记无人机'"
      width="min(520px, 94vw)"
      destroy-on-close
    >
      <el-alert
        v-if="saveError"
        :title="saveError"
        type="error"
        show-icon
        :closable="false"
        class="mb-3"
        data-testid="drone-save-error"
      />
      <el-alert
        v-if="identityLocked"
        title="该机正被借出，机身号与机型不可更改（机场信息仍可改）"
        type="info"
        show-icon
        :closable="false"
        class="mb-3"
        data-testid="drone-identity-locked"
      />
      <el-form label-width="110px">
        <el-form-item label="机型" required>
          <el-select
            v-model="form.aircraftModelId"
            class="!w-full"
            filterable
            placeholder="选择启用中的机型"
            :disabled="identityLocked"
          >
            <el-option
              v-for="m in enabledModels"
              :key="m.id"
              :label="`${m.displayName}（${m.modelCode}）`"
              :value="m.id!"
            />
            <el-option
              v-if="currentDisabledModel?.aircraftModelId != null"
              :key="`current-${currentDisabledModel.aircraftModelId}`"
              :label="`${currentDisabledModel.displayName || '当前机型'}（${currentDisabledModel.modelCode || currentDisabledModel.aircraftModelId} · 已停用）`"
              :value="currentDisabledModel.aircraftModelId"
              disabled
            />
          </el-select>
        </el-form-item>
        <el-form-item label="机身号" required>
          <el-input
            v-model="form.serialNumber"
            maxlength="128"
            placeholder="全局唯一，保存后转大写"
            :disabled="identityLocked"
          />
        </el-form-item>
        <el-form-item label="机场名称" required>
          <el-input v-model="form.airportName" maxlength="100" placeholder="如 浦东机场" />
        </el-form-item>
        <el-form-item label="纬度" required>
          <el-input-number
            v-model="form.latitude"
            :min="-90"
            :max="90"
            :step="0.0001"
            :precision="6"
            class="!w-full"
          />
        </el-form-item>
        <el-form-item label="经度" required>
          <el-input-number
            v-model="form.longitude"
            :min="-180"
            :max="180"
            :step="0.0001"
            :precision="6"
            class="!w-full"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" data-testid="drone-save" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-drawer
      v-model="borrowsVisible"
      :title="`借还记录 · ${borrowsDrone?.serialNumber || ''}`"
      size="min(480px, 100vw)"
      destroy-on-close
    >
      <el-table v-loading="borrowsLoading" :data="borrows" border stripe size="small">
        <el-table-column label="飞手" min-width="120">
          <template #default="{ row }">
            {{ row.pilotName || (row.pilotId != null ? `#${row.pilotId}` : '—') }}
          </template>
        </el-table-column>
        <el-table-column label="借出" min-width="150">
          <template #default="{ row }">{{ when(row.borrowedAt) }}</template>
        </el-table-column>
        <el-table-column label="归还" min-width="150">
          <template #default="{ row }">{{ row.returnedAt ? when(row.returnedAt) : '未归还' }}</template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无借还记录" :image-size="64" />
        </template>
      </el-table>
      <div class="mt-4 flex justify-center">
        <el-pagination
          background
          layout="total, prev, pager, next"
          :total="borrowsTotal"
          :current-page="borrowsPage"
          :page-size="20"
          @current-change="(p: number) => { borrowsPage = p; void loadBorrows() }"
        />
      </div>
    </el-drawer>
  </MainLayout>
</template>
