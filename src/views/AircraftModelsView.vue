<script setup lang="ts">
import { onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import MainLayout from '../layouts/MainLayout.vue'
import {
  createAdminAircraftModel,
  deleteAdminAircraftModel,
  getAdminAircraftModels,
  setAdminAircraftModelEnabled,
  updateAdminAircraftModel,
  type AdminAircraftModelWrite,
} from '../api/modules/admin-aircraft-model'
import type { AdminAircraftModelVo } from '../types/admin'

/**
 * 机型管理（REQ-SUP-GOV-006）：增改、启停、未引用可删。
 * URL query（page/size）是分页事实源，与飞手/用户列表同一约定。
 */
const route = useRoute()
const router = useRouter()

const PAGE_SIZES = [10, 20, 50, 100]

const pageNo = ref(1)
const pageSize = ref(20)
const rows = ref<AdminAircraftModelVo[]>([])
const total = ref(0)
const loading = ref(false)

const dialogVisible = ref(false)
const saving = ref(false)
const saveError = ref('')
const mutatingId = ref<number | null>(null)
const editing = ref<AdminAircraftModelVo | null>(null)
const form = reactive({
  modelCode: '',
  displayName: '',
  maxPayloadKg: 30 as number | undefined,
  transportEnabled: true,
})

const parseQuery = (query: Record<string, unknown>) => {
  const size = Number(query.size)
  return {
    page: Number.isSafeInteger(Number(query.page)) && Number(query.page) > 0 ? Number(query.page) : 1,
    size: PAGE_SIZES.includes(size) ? size : 20,
  }
}

let loadSeq = 0
const load = async () => {
  const seq = ++loadSeq
  loading.value = true
  try {
    const page = await getAdminAircraftModels({
      page: pageNo.value - 1,
      size: pageSize.value,
    })
    if (seq !== loadSeq) return
    rows.value = page.content
    total.value = page.totalElements ?? page.content.length
  } catch (err) {
    if (seq === loadSeq) {
      rows.value = []
      total.value = 0
      ElMessage.error(err instanceof Error ? err.message : '加载机型失败')
    }
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

const applyQuery = (patch: { page?: number; size?: number } = {}) => {
  const page = patch.page ?? 1
  const size = patch.size ?? pageSize.value
  if (patch.size !== undefined) pageSize.value = patch.size
  const query: Record<string, string> = {}
  if (page > 1) query.page = String(page)
  if (size !== 20) query.size = String(size)
  void router.replace({ name: 'aircraft-models', query })
}

const openCreate = () => {
  editing.value = null
  saveError.value = ''
  form.modelCode = ''
  form.displayName = ''
  form.maxPayloadKg = 30
  form.transportEnabled = true
  dialogVisible.value = true
}

const openEdit = (row: AdminAircraftModelVo) => {
  editing.value = row
  saveError.value = ''
  form.modelCode = row.modelCode ?? ''
  form.displayName = row.displayName ?? ''
  form.maxPayloadKg = row.maxPayloadKg
  form.transportEnabled = row.transportEnabled ?? false
  dialogVisible.value = true
}

const buildBody = (): AdminAircraftModelWrite => ({
  modelCode: form.modelCode.trim(),
  displayName: form.displayName.trim(),
  maxPayloadKg: Number(form.maxPayloadKg),
  transportEnabled: form.transportEnabled,
})

const save = async () => {
  if (saving.value) return
  saveError.value = ''
  if (!form.modelCode.trim() || !form.displayName.trim()) {
    ElMessage.warning('请填写型号代码与显示名')
    return
  }
  if (form.maxPayloadKg == null || !Number.isFinite(form.maxPayloadKg) || form.maxPayloadKg <= 0) {
    ElMessage.warning('最大载重须大于 0')
    return
  }
  saving.value = true
  try {
    const body = buildBody()
    if (editing.value?.id != null) {
      await updateAdminAircraftModel(editing.value.id, body)
      ElMessage.success('机型已更新')
    } else {
      await createAdminAircraftModel(body)
      ElMessage.success('机型已新增')
    }
    dialogVisible.value = false
    await load()
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : '保存机型失败'
    ElMessage.error(saveError.value)
  } finally {
    saving.value = false
  }
}

const toggleEnabled = async (row: AdminAircraftModelVo, enabled: boolean) => {
  if (row.id == null) return
  if (mutatingId.value === row.id) return
  if (!enabled) {
    try {
      await ElMessageBox.confirm(
        `确认停用机型「${row.displayName || row.modelCode}」？停用后登记无人机时不可选。`,
        '确认停用机型',
        { type: 'warning', confirmButtonText: '确认停用', cancelButtonText: '取消' },
      )
    } catch {
      return
    }
  }
  mutatingId.value = row.id
  try {
    await setAdminAircraftModelEnabled(row.id, enabled)
    ElMessage.success(enabled ? '机型已启用' : '机型已停用')
    await load()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '修改机型状态失败')
  } finally {
    mutatingId.value = null
  }
}

const remove = async (row: AdminAircraftModelVo) => {
  if (row.id == null) return
  if (mutatingId.value === row.id) return
  try {
    await ElMessageBox.confirm(
      `确认删除机型「${row.displayName || row.modelCode}」？已被引用的机型无法删除，请改用停用。`,
      '确认删除机型',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  mutatingId.value = row.id
  try {
    await deleteAdminAircraftModel(row.id)
    ElMessage.success('机型已删除')
    await load()
  } catch (err) {
    // 后端已说明原因（如被引用请改停用），不再叠前端文案
    ElMessage.error(err instanceof Error ? err.message : '删除机型失败')
  } finally {
    mutatingId.value = null
  }
}

let firstQuerySync = true
watch(
  () => route.query,
  (query) => {
    const parsed = parseQuery(query)
    pageNo.value = parsed.page
    pageSize.value = parsed.size
    if (firstQuerySync || route.name === 'aircraft-models') {
      firstQuerySync = false
      void load()
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => { loadSeq += 1 })
</script>

<template>
  <MainLayout title="机型" subtitle="维护平台机型目录（型号代码、载重、是否支持吊运），供登记无人机与飞手资质引用。">
    <section class="panel-card p-5">
      <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div class="text-sm text-[var(--text-secondary)]">
          型号代码须与 djifly 连机上报一致（如 FC30）。停用后登记无人机时选不到。
        </div>
        <div class="flex items-center gap-2">
          <el-button data-testid="aircraft-model-refresh" :loading="loading" @click="load">刷新</el-button>
          <el-button type="primary" data-testid="aircraft-model-create" @click="openCreate">新增机型</el-button>
        </div>
      </div>

      <div class="mt-4">
        <el-table v-loading="loading" :data="rows" border stripe data-testid="aircraft-model-table">
          <el-table-column prop="modelCode" label="型号代码" min-width="120" />
          <el-table-column prop="displayName" label="显示名" min-width="160" />
          <el-table-column label="最大载重(kg)" width="130">
            <template #default="{ row }">{{ row.maxPayloadKg ?? '—' }}</template>
          </el-table-column>
          <el-table-column label="支持吊运" width="110">
            <template #default="{ row }">
              <el-tag :type="row.transportEnabled ? 'success' : 'info'" effect="plain">
                {{ row.transportEnabled ? '是' : '否' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'danger'" effect="plain">
                {{ row.enabled ? '启用' : '停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="260" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openEdit(row)">编辑</el-button>
              <el-button
                size="small"
                :type="row.enabled ? 'warning' : 'success'"
                :loading="mutatingId === row.id"
                :disabled="mutatingId != null && mutatingId !== row.id"
                @click="toggleEnabled(row, !row.enabled)"
              >
                {{ row.enabled ? '停用' : '启用' }}
              </el-button>
              <el-button
                size="small"
                type="danger"
                plain
                :loading="mutatingId === row.id"
                :disabled="mutatingId != null && mutatingId !== row.id"
                @click="remove(row)"
              >删除</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty description="暂无机型，请先新增" :image-size="80" />
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
      :title="editing ? '编辑机型' : '新增机型'"
      width="min(480px, 94vw)"
      destroy-on-close
    >
      <el-alert
        v-if="saveError"
        :title="saveError"
        type="error"
        show-icon
        :closable="false"
        class="mb-3"
        data-testid="aircraft-model-save-error"
      />
      <el-form label-width="110px">
        <el-form-item label="型号代码" required>
          <el-input v-model="form.modelCode" maxlength="64" placeholder="如 FC30" />
        </el-form-item>
        <el-form-item label="显示名" required>
          <el-input v-model="form.displayName" maxlength="128" placeholder="如 DJI FlyCart 30" />
        </el-form-item>
        <el-form-item label="最大载重(kg)" required>
          <el-input-number v-model="form.maxPayloadKg" :min="0.01" :step="0.1" :precision="2" class="!w-full" />
        </el-form-item>
        <el-form-item label="支持吊运">
          <el-switch v-model="form.transportEnabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" data-testid="aircraft-model-save" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </MainLayout>
</template>
