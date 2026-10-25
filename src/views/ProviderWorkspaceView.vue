<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { clearStoredSession } from '../api/session'
import {
  getAircraftModels,
  getProviderBorrows,
  getProviderDrones,
  getProviderProfile,
  registerProviderDrone,
  setProviderDroneEnabled,
  updateProviderDrone,
  type ProviderDrone,
  type ProviderBorrow,
  type ProviderAccount,
  type AircraftModel,
} from '../api/modules/provider'

const router = useRouter()
const loading = ref(true)
const saving = ref(false)
const togglingId = ref<string | null>(null)
const error = ref('')
const profile = ref<ProviderAccount | null>(null)
const drones = ref<ProviderDrone[]>([])
const borrows = ref<ProviderBorrow[]>([])
const aircraftModels = ref<AircraftModel[]>([])
const editing = ref<ProviderDrone | null>(null)
const form = reactive({ aircraftModelId: 0, serialNumber: '', airportName: '', latitude: 0, longitude: 0 })
const formTitle = computed(() => editing.value ? '编辑无人机' : '登记无人机')

const resetForm = () => {
  editing.value = null
  Object.assign(form, { aircraftModelId: 0, serialNumber: '', airportName: '', latitude: 0, longitude: 0 })
}
const edit = (drone: ProviderDrone) => {
  editing.value = drone
  Object.assign(form, {
    aircraftModelId: drone.aircraftModelId ?? 0,
    serialNumber: drone.serialNumber ?? '',
    airportName: drone.airportName ?? '',
    latitude: drone.latitude ?? 0,
    longitude: drone.longitude ?? 0,
  })
}
const save = async () => {
  if (saving.value) return
  saving.value = true
  try {
    if (!form.aircraftModelId || !form.serialNumber.trim() || !form.airportName.trim()) throw new Error('请填写机型、机身号和机场')
    const payload = { ...form, serialNumber: form.serialNumber.trim(), airportName: form.airportName.trim() }
    if (editing.value?.droneId) await updateProviderDrone(editing.value.droneId, payload)
    else await registerProviderDrone(payload)
    ElMessage.success(editing.value ? '无人机资料已更新' : '无人机登记成功')
    resetForm()
    await load()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}
const toggle = async (drone: ProviderDrone) => {
  if (!drone.droneId || togglingId.value) return
  try {
    await ElMessageBox.confirm(`确定${drone.enabled ? '停用' : '启用'}这架无人机吗？`, '确认操作', {
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    })
    togglingId.value = drone.droneId
    await setProviderDroneEnabled(drone.droneId, !drone.enabled)
    ElMessage.success('状态已更新')
    await load()
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error(e instanceof Error ? e.message : '修改状态失败')
    }
  } finally {
    togglingId.value = null
  }
}
const load = async () => {
  loading.value = true; error.value = ''
  try {
    const [me, dronePage, borrowPage, models] = await Promise.all([
      getProviderProfile(),
      getProviderDrones(),
      getProviderBorrows(),
      getAircraftModels(),
    ])
    profile.value = me
    drones.value = dronePage.items ?? []
    borrows.value = borrowPage.items ?? []
    aircraftModels.value = models.filter((model) => model.transportEnabled === true && model.id !== undefined)
  } catch (e) { error.value = e instanceof Error ? e.message : '加载工作台失败' }
  finally { loading.value = false }
}
const logout = () => { clearStoredSession(); void router.replace({ name: 'provider-login' }) }
onMounted(load)
</script>

<template>
  <main class="workspace" aria-labelledby="provider-workspace-title">
    <header class="workspace__header">
      <div>
        <h1 id="provider-workspace-title">服务商工作台</h1>
        <span>{{ profile?.displayName || profile?.username || '服务商' }}</span>
      </div>
      <div class="workspace__actions">
        <el-button :loading="loading" :disabled="loading" @click="load">刷新</el-button>
        <el-button @click="logout">退出登录</el-button>
      </div>
    </header>
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
      show-icon
      role="alert"
    >
      <template #default>
        <span>{{ error }}</span>
        <el-button link type="danger" @click="load">重试</el-button>
      </template>
    </el-alert>
    <section class="workspace__grid" v-loading="loading">
      <article class="panel" aria-labelledby="provider-drones-title">
        <div class="panel__head">
          <h2 id="provider-drones-title">我的无人机</h2>
          <el-button size="small" @click="resetForm">新登记</el-button>
        </div>
        <el-table :data="drones" empty-text="暂无无人机登记" table-layout="auto">
          <el-table-column prop="serialNumber" label="机身号" />
          <el-table-column prop="modelName" label="机型" />
          <el-table-column prop="airportName" label="机场" />
          <el-table-column label="状态">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'info'">
                {{ row.enabled ? '可借用' : '已停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180">
            <template #default="{ row }">
              <el-button link size="small" @click="edit(row)">编辑</el-button>
              <el-button
                link
                size="small"
                :loading="togglingId === row.droneId"
                :disabled="Boolean(togglingId && togglingId !== row.droneId)"
                @click="toggle(row)"
              >
                {{ row.enabled ? '停用' : '启用' }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </article>
      <article class="panel" aria-labelledby="provider-drone-form-title">
        <h2 id="provider-drone-form-title">{{ formTitle }}</h2>
        <el-form label-position="top">
          <el-form-item label="无人机机型">
            <el-select
              v-model="form.aircraftModelId"
              placeholder="选择平台启用的机型"
              filterable
              class="model-select"
              aria-label="无人机机型"
            >
              <el-option
                v-for="model in aircraftModels"
                :key="model.id"
                :label="`${model.displayName || model.modelCode || `机型 ${model.id}`} (${model.modelCode || '无型号编码'})`"
                :value="model.id"
              >
                <span>{{ model.displayName || `机型 ${model.id}` }}</span>
                <span class="model-option__details">
                  {{ model.modelCode || '无型号编码' }} · 最大载重 {{ model.maxPayloadKg ?? '—' }} kg
                </span>
              </el-option>
            </el-select>
            <span v-if="aircraftModels.length === 0" class="field-hint">
              暂无可登记的启用机型
            </span>
          </el-form-item>
          <el-form-item label="机身号"><el-input v-model="form.serialNumber" /></el-form-item>
          <el-form-item label="机场名称"><el-input v-model="form.airportName" /></el-form-item>
          <div class="coords"><el-form-item label="纬度"><el-input-number v-model="form.latitude" :precision="6" /></el-form-item><el-form-item label="经度"><el-input-number v-model="form.longitude" :precision="6" /></el-form-item></div>
          <el-button type="primary" :loading="saving" :disabled="saving" @click="save">保存</el-button>
          <el-button :disabled="saving" @click="resetForm">清空</el-button>
        </el-form>
      </article>
      <article class="panel panel--wide" aria-labelledby="provider-borrows-title">
        <h2 id="provider-borrows-title">借用记录</h2>
        <el-table :data="borrows" empty-text="暂无借用记录" table-layout="auto">
          <el-table-column prop="borrowedAt" label="借出时间" />
          <el-table-column prop="returnedAt" label="归还时间" />
          <el-table-column label="无人机">
            <template #default="{ row }">{{ row.drone?.serialNumber || '—' }}</template>
          </el-table-column>
          <el-table-column prop="pilotId" label="飞手 ID" />
        </el-table>
      </article>
    </section>
  </main>
</template>

<style scoped>
.workspace { min-height: 100vh; padding: 24px; background: var(--bg-body); color: var(--text-regular); }
.workspace__header, .panel__head { display:flex; align-items:center; justify-content:space-between; gap:16px; }
h1,h2 { margin:0; color:var(--text-strong); } h1 { font-size:24px; } h2 { font-size:18px; }
.workspace__header { margin-bottom:20px; } .workspace__header span { color:var(--text-secondary); }
.workspace__actions { display:flex; gap:8px; }
.workspace__grid { display:grid; grid-template-columns:minmax(0, 2fr) minmax(280px, 1fr); gap:16px; margin-top:16px; }
.panel { padding:20px; border:1px solid var(--border); border-radius:12px; background:var(--bg-card); overflow:auto; }
.panel--wide { grid-column:1 / -1; } .coords { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.model-select { width:100%; }
.model-option__details { float:right; margin-left:16px; color:var(--text-secondary); }
.field-hint { display:block; margin-top:6px; color:var(--text-secondary); font-size:12px; }
@media(max-width:800px){.workspace{padding:12px}.workspace__grid{grid-template-columns:1fr}.panel--wide{grid-column:auto}.workspace__header{align-items:flex-start;flex-direction:column}.workspace__actions{width:100%}.workspace__actions .el-button{flex:1}}
</style>
