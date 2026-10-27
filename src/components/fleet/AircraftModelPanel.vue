<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createAdminAircraftModel,
  deleteAdminAircraftModel,
  getAdminAircraftModels,
  setAdminAircraftModelEnabled,
  updateAdminAircraftModel,
  type AdminAircraftModelWrite,
} from '../../api/modules/admin-aircraft-model'
import type { AdminAircraftModelVo } from '../../types/admin'
import { fetchAllPages } from './fetch-all'

/**
 * 机型目录（REQ-SUP-GOV-006）：增改、启停、未引用可删。
 * 作为「无人机与机型」页左栏：选中机型即筛选右侧无人机；「全部机型」= null。
 */
const props = defineProps<{
  /** 当前选中的机型 id；null 表示全部机型 */
  selectedId: number | null
  /** 各机型下的无人机数量（由右栏已加载的无人机推导）；未加载时为 null */
  counts: Record<number, number> | null
  totalDrones: number | null
}>()

const emit = defineEmits<{
  select: [id: number | null]
  /** 机型列表已加载（供右栏下拉与名称展示） */
  loaded: [models: AdminAircraftModelVo[]]
  /** 机型增改/启停/删除后，右栏内嵌的机型信息可能过期 */
  changed: []
}>()

const rows = ref<AdminAircraftModelVo[]>([])
const loading = ref(false)
const truncated = ref(false)

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

const countOf = (id?: number) => (id == null || !props.counts ? null : props.counts[id] ?? 0)

const enabledCount = computed(() => rows.value.filter((m) => m.enabled).length)

let loadSeq = 0
const load = async () => {
  const seq = ++loadSeq
  loading.value = true
  try {
    const result = await fetchAllPages((page, size) => getAdminAircraftModels({ page, size }))
    if (seq !== loadSeq) return
    rows.value = result.items
    truncated.value = result.truncated
    emit('loaded', result.items)
  } catch (err) {
    if (seq === loadSeq) {
      rows.value = []
      emit('loaded', [])
      ElMessage.error(err instanceof Error ? err.message : '加载机型失败')
    }
  } finally {
    if (seq === loadSeq) loading.value = false
  }
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
    emit('changed')
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
    emit('changed')
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
    if (props.selectedId === row.id) emit('select', null)
    await load()
    emit('changed')
  } catch (err) {
    // 后端已说明原因（如被引用请改停用），不再叠前端文案
    ElMessage.error(err instanceof Error ? err.message : '删除机型失败')
  } finally {
    mutatingId.value = null
  }
}

onBeforeUnmount(() => { loadSeq += 1 })

defineExpose({ load })
void load()
</script>

<template>
  <section class="panel-card flex flex-col p-4" data-testid="aircraft-model-panel">
    <div class="flex items-center justify-between gap-2">
      <div>
        <div class="text-base font-semibold text-[var(--text-strong)]">机型目录</div>
        <div class="text-xs text-[var(--text-faint)]">
          共 {{ rows.length }} 个 · 启用 {{ enabledCount }} 个
        </div>
      </div>
      <div class="flex items-center gap-1">
        <el-button size="small" data-testid="aircraft-model-refresh" :loading="loading" @click="load">刷新</el-button>
        <el-button size="small" type="primary" data-testid="aircraft-model-create" @click="openCreate">新增机型</el-button>
      </div>
    </div>
    <div class="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
      型号代码须与 djifly 连机上报一致（如 FC30）。停用后登记无人机时选不到。
    </div>
    <el-alert
      v-if="truncated"
      class="mt-2"
      type="warning"
      :closable="false"
      show-icon
      title="机型过多，仅展示前 2000 个"
    />

    <div v-loading="loading" class="mt-3 flex flex-col gap-2" data-testid="aircraft-model-table">
      <button
        type="button"
        class="fleet-model-item"
        :class="{ 'is-active': selectedId == null }"
        data-testid="aircraft-model-all"
        @click="emit('select', null)"
      >
        <div class="flex items-center justify-between">
          <span class="font-medium">全部机型</span>
          <span v-if="totalDrones != null" class="fleet-count">{{ totalDrones }} 架</span>
        </div>
      </button>

      <div
        v-for="row in rows"
        :key="row.id"
        class="fleet-model-item"
        :class="{ 'is-active': selectedId === row.id, 'is-disabled': !row.enabled }"
        role="button"
        tabindex="0"
        :data-testid="`aircraft-model-item-${row.id}`"
        @click="emit('select', row.id ?? null)"
        @keyup.enter="emit('select', row.id ?? null)"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="truncate font-medium">{{ row.displayName || '—' }}</div>
            <div class="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-[var(--text-faint)]">
              <span class="font-mono">{{ row.modelCode }}</span>
              <span>· 载重 {{ row.maxPayloadKg ?? '—' }} kg</span>
            </div>
          </div>
          <span v-if="countOf(row.id) != null" class="fleet-count">{{ countOf(row.id) }} 架</span>
        </div>
        <div class="mt-2 flex items-center justify-between gap-2">
          <div class="flex flex-wrap gap-1">
            <el-tag size="small" :type="row.enabled ? 'success' : 'danger'" effect="plain">
              {{ row.enabled ? '启用' : '停用' }}
            </el-tag>
            <el-tag size="small" :type="row.transportEnabled ? 'success' : 'info'" effect="plain">
              {{ row.transportEnabled ? '支持吊运' : '不支持吊运' }}
            </el-tag>
          </div>
          <div class="flex items-center" @click.stop>
            <el-button size="small" link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button
              size="small"
              link
              :type="row.enabled ? 'warning' : 'success'"
              :loading="mutatingId === row.id"
              :disabled="mutatingId != null && mutatingId !== row.id"
              @click="toggleEnabled(row, !row.enabled)"
            >
              {{ row.enabled ? '停用' : '启用' }}
            </el-button>
            <el-button
              size="small"
              link
              type="danger"
              :loading="mutatingId === row.id"
              :disabled="mutatingId != null && mutatingId !== row.id"
              @click="remove(row)"
            >删除</el-button>
          </div>
        </div>
      </div>

      <el-empty v-if="!loading && rows.length === 0" description="暂无机型，请先新增" :image-size="64" />
    </div>

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
  </section>
</template>

<style scoped>
.fleet-model-item {
  width: 100%;
  text-align: left;
  cursor: pointer;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  color: var(--text-strong);
  background: transparent;
  transition: border-color 0.15s, background-color 0.15s;
}
.fleet-model-item:hover {
  border-color: var(--border-strong);
}
.fleet-model-item.is-active {
  border-color: var(--brand);
  background: var(--brand-soft);
}
.fleet-model-item.is-disabled {
  opacity: 0.72;
}
.fleet-count {
  flex-shrink: 0;
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 12px;
  color: var(--brand);
  background: var(--brand-soft);
}
.fleet-model-item.is-active .fleet-count {
  background: var(--bg-card);
}
</style>
