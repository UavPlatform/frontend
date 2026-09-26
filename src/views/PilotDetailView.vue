<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import MainLayout from '../layouts/MainLayout.vue'
import RelatedOrdersTable from '../components/subject/RelatedOrdersTable.vue'
import { getAdminPilotDetail } from '../api/modules/admin-query'
import { updateUavAvailable } from '../api/modules/admin'
import type { AdminPilotDetailVo, AdminPilotDroneVo } from '../types/admin'

/**
 * 飞手详情（REQ-FRONTEND-001 §4.2、ADR-0004）：
 * 绑定无人机表（djiId / 机型 / 在线 / 可用）+ 启停开关（POST /admin/uav/available）+ 关联订单。
 * 无人机不设一级菜单：归属与合规开关只在这里维护。
 */
const route = useRoute()
const router = useRouter()

const userId = computed(() => String(route.params.id ?? ''))

const detail = ref<AdminPilotDetailVo>()
const loading = ref(false)
/** 正在提交启停请求的 djiId（同一设备锁住开关，避免重复提交） */
const toggling = ref('')

const ROLE_LABEL: Record<number, string> = {
  0: '普通用户',
  1: '飞手',
  2: '管理员',
}

let loadSeq = 0
const reload = async () => {
  const seq = ++loadSeq
  detail.value = undefined
  if (!/^\d+$/.test(userId.value)) {
    ElMessage.warning('飞手 ID 无效')
    loading.value = false
    return
  }
  loading.value = true
  try {
    const data = await getAdminPilotDetail(userId.value)
    if (seq !== loadSeq) return
    detail.value = data
  } catch (err) {
    if (seq === loadSeq) {
      ElMessage.error(err instanceof Error ? err.message : '查询飞手详情失败')
    }
  } finally {
    if (seq === loadSeq) {
      loading.value = false
    }
  }
}

watch(userId, reload, { immediate: true })

const backToList = () => {
  void router.push({ name: 'pilots' }).catch(() => undefined)
}

const drones = computed(() => detail.value?.drones ?? [])

/** available=null（设备档案未注册）→ 开关禁用 + 提示，不发请求 */
const unregisteredCount = computed(
  () => drones.value.filter((drone) => drone.available === null || drone.available === undefined)
    .length,
)

const isDroneDisabled = (drone: AdminPilotDroneVo) =>
  drone.available === null ||
  drone.available === undefined ||
  !drone.djiId ||
  toggling.value === drone.djiId

const toggleAvailable = async (drone: AdminPilotDroneVo, next: boolean) => {
  if (drone.available === null || drone.available === undefined) {
    ElMessage.warning('该设备未注册档案，无法修改可用状态')
    return
  }
  if (!drone.djiId) {
    ElMessage.warning('该设备缺少 DJI 设备ID，无法修改可用状态')
    return
  }

  toggling.value = drone.djiId
  try {
    await updateUavAvailable(drone.djiId, next ? '1' : '0')
    ElMessage.success(next ? '无人机已启用' : '无人机已禁用')
    await reload()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '修改可用状态失败')
  } finally {
    toggling.value = ''
  }
}
</script>

<template>
  <MainLayout title="飞手详情" subtitle="绑定无人机的归属与合规开关、名下履约订单。">
    <div class="flex flex-col gap-4">
      <section class="panel-card p-5" v-loading="loading">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <span class="text-xl font-700 text-[#303133]">
              {{ detail?.userName || '飞手' }}
            </span>
            <span v-if="detail" class="text-sm text-[#909399]">ID {{ detail.userId }}</span>
            <el-tag
              v-if="detail"
              :type="detail.status === 0 ? 'danger' : 'success'"
              effect="plain"
            >
              {{ detail.status === 0 ? '停用' : '正常' }}
            </el-tag>
          </div>
          <div class="flex items-center gap-2">
            <el-button :loading="loading" @click="reload">刷新</el-button>
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
          <el-descriptions-item label="绑定无人机">
            {{ drones.length }} 架（在线 {{ drones.filter((d) => d.online).length }} 架）
          </el-descriptions-item>
        </el-descriptions>
      </section>

      <!-- 绑定无人机（ADR-0004：无人机不设一级菜单，启停只在此处） -->
      <section v-if="detail" class="panel-card p-5">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <div class="section-title">绑定无人机</div>
          <div class="text-xs text-[#909399]">共 {{ drones.length }} 架</div>
        </div>

        <el-alert
          v-if="unregisteredCount > 0"
          class="mt-3"
          type="warning"
          :closable="false"
          :title="`其中 ${unregisteredCount} 架设备档案未注册，开关已禁用；请先在设备侧注册档案后再启停`"
        />

        <el-table
          v-if="drones.length"
          class="mt-3"
          :data="drones"
          border
          stripe
        >
          <el-table-column label="DJI ID" min-width="170">
            <template #default="scope">
              {{ scope.row.djiId || '—' }}
            </template>
          </el-table-column>
          <el-table-column label="机型" min-width="160">
            <template #default="scope">
              {{ scope.row.modelName || '未映射' }}
            </template>
          </el-table-column>
          <el-table-column label="在线" width="100">
            <template #default="scope">
              <el-tag :type="scope.row.online ? 'success' : 'info'" effect="plain">
                {{ scope.row.online ? '在线' : '离线' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="可用" width="170">
            <template #default="scope">
              <div class="flex items-center gap-2">
                <el-switch
                  :model-value="scope.row.available === true"
                  :disabled="isDroneDisabled(scope.row)"
                  :loading="toggling === scope.row.djiId"
                  @change="(value: string | number | boolean) => toggleAvailable(scope.row, value === true)"
                />
                <span
                  v-if="scope.row.available === null || scope.row.available === undefined"
                  class="text-xs text-[#909399]"
                >
                  未注册
                </span>
                <span v-else class="text-xs text-[#909399]">
                  {{ scope.row.available ? '已启用' : '已禁用' }}
                </span>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <el-empty v-else class="mt-3" :image-size="80" description="该飞手暂未绑定无人机" />
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
  color: #303133;
}
</style>
