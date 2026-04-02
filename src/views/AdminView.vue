<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import MainLayout from '../layouts/MainLayout.vue'
import { getAdminStatistics, getLiveUavs, getUavDetail, updateUavAvailable, getApplicationLogs, getErrorLogs } from '../api/modules/admin'
import type { AdminStatistics, LiveUav, UavDetail } from '../types/admin'

const loading = ref(false)
const statistics = ref<AdminStatistics | null>(null)
const liveUavs = ref<LiveUav[]>([])
const selectedUav = ref<UavDetail | null>(null)
const isAvailableDialogVisible = ref(false)
const availableStatus = ref<'0' | '1'>('1')

const activeTab = ref('statistics')
const appLogs = ref<string[]>([])
const errorLogs = ref<string[]>([])
const logLines = ref(100)

const loadStatistics = async () => {
  loading.value = true
  try {
    statistics.value = await getAdminStatistics()
  } catch (error) {
    console.error(error)
    ElMessage.error(error instanceof Error ? error.message : '获取统计信息失败')
  } finally {
    loading.value = false
  }
}

const loadLiveUavs = async () => {
  loading.value = true
  try {
    liveUavs.value = await getLiveUavs()
  } catch (error) {
    console.error(error)
    ElMessage.error(error instanceof Error ? error.message : '获取直播无人机失败')
  } finally {
    loading.value = false
  }
}

const handleViewUavDetail = async (deviceId: string) => {
  loading.value = true
  try {
    selectedUav.value = await getUavDetail(deviceId)
  } catch (error) {
    console.error(error)
    ElMessage.error(error instanceof Error ? error.message : '获取无人机详情失败')
  } finally {
    loading.value = false
  }
}

const openAvailableDialog = (uav: UavDetail) => {
  selectedUav.value = uav
  availableStatus.value = uav.isAvailable as '0' | '1'
  isAvailableDialogVisible.value = true
}

const handleUpdateAvailable = async () => {
  if (!selectedUav.value) return

  loading.value = true
  try {
    await updateUavAvailable(selectedUav.value.djiId, availableStatus.value)
    ElMessage.success('修改成功')
    isAvailableDialogVisible.value = false
    if (selectedUav.value) {
      await handleViewUavDetail(selectedUav.value.djiId)
    }
  } catch (error) {
    console.error(error)
    ElMessage.error(error instanceof Error ? error.message : '修改失败')
  } finally {
    loading.value = false
  }
}

const loadAppLogs = async () => {
  loading.value = true
  try {
    appLogs.value = await getApplicationLogs(logLines.value)
  } catch (error) {
    console.error(error)
    ElMessage.error(error instanceof Error ? error.message : '获取应用日志失败')
  } finally {
    loading.value = false
  }
}

const loadErrorLogs = async () => {
  loading.value = true
  try {
    errorLogs.value = await getErrorLogs(logLines.value)
  } catch (error) {
    console.error(error)
    ElMessage.error(error instanceof Error ? error.message : '获取错误日志失败')
  } finally {
    loading.value = false
  }
}

const handleTabChange = (tab: string) => {
  if (tab === 'logs' && appLogs.value.length === 0) {
    void loadAppLogs()
  } else if (tab === 'errors' && errorLogs.value.length === 0) {
    void loadErrorLogs()
  }
}

const refreshLogs = () => {
  if (activeTab.value === 'logs') {
    void loadAppLogs()
  } else if (activeTab.value === 'errors') {
    void loadErrorLogs()
  }
}

onMounted(() => {
  void loadStatistics()
  void loadLiveUavs()
})
</script>

<template>
  <MainLayout
    title="管理员控制台"
    subtitle="管理无人机状态、查看统计信息和系统日志。"
  >
    <div class="flex flex-col gap-4">
      <el-tabs v-model="activeTab" class="w-full" @tab-change="handleTabChange">
        <el-tab-pane label="系统概览" name="statistics">
          <div class="flex flex-col gap-4">
            <section class="panel-card p-5">
              <div class="text-xl font-800 tracking-tight text-[#10233f]">系统统计</div>
              <div class="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                <div class="rounded-5 bg-[#f8fafc] p-4">
                  <div class="text-sm text-[#6b7a90]">总无人机数</div>
                  <div class="mt-1 text-2xl font-800 text-[#10233f]">{{ statistics?.totalUavs || 0 }}</div>
                </div>
                <div class="rounded-5 bg-[#f8fafc] p-4">
                  <div class="text-sm text-[#6b7a90]">在线无人机</div>
                  <div class="mt-1 text-2xl font-800 text-[#10233f]">{{ statistics?.onlineUavs || 0 }}</div>
                </div>
                <div class="rounded-5 bg-[#f8fafc] p-4">
                  <div class="text-sm text-[#6b7a90]">直播中无人机</div>
                  <div class="mt-1 text-2xl font-800 text-[#10233f]">{{ statistics?.liveUavs || 0 }}</div>
                </div>
                <div class="rounded-5 bg-[#f8fafc] p-4">
                  <div class="text-sm text-[#6b7a90]">总用户数</div>
                  <div class="mt-1 text-2xl font-800 text-[#10233f]">{{ statistics?.totalUsers || 0 }}</div>
                </div>
              </div>
            </section>

            <section class="panel-card p-5">
              <div class="text-xl font-800 tracking-tight text-[#10233f]">直播中的无人机</div>
              <div class="mt-4">
                <el-table :data="liveUavs" style="width: 100%">
                  <el-table-column prop="deviceId" label="设备ID" />
                  <el-table-column prop="uavName" label="无人机名称" />
                  <el-table-column prop="roomId" label="房间ID" />
                  <el-table-column prop="onlineStatus" label="在线状态">
                    <template #default="scope">
                      <el-tag :type="scope.row.onlineStatus === '1' ? 'success' : 'info'">
                        {{ scope.row.onlineStatus === '1' ? '在线' : '离线' }}
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column prop="isAvailable" label="可用状态">
                    <template #default="scope">
                      <el-tag :type="scope.row.isAvailable === '1' ? 'success' : 'danger'">
                        {{ scope.row.isAvailable === '1' ? '可用' : '不可用' }}
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column label="操作" width="120">
                    <template #default="scope">
                      <el-button type="primary" size="small" @click="handleViewUavDetail(scope.row.deviceId)">
                        查看详情
                      </el-button>
                    </template>
                  </el-table-column>
                </el-table>
              </div>
            </section>

            <section v-if="selectedUav" class="panel-card p-5">
              <div class="text-xl font-800 tracking-tight text-[#10233f]">无人机详情</div>
              <div class="mt-4 grid gap-4 md:grid-cols-2">
                <div class="rounded-5 bg-[#f8fafc] p-4">
                  <div class="text-sm text-[#6b7a90]">无人机名称</div>
                  <div class="mt-1 text-xl font-800 text-[#10233f]">{{ selectedUav.uavName }}</div>
                </div>
                <div class="rounded-5 bg-[#f8fafc] p-4">
                  <div class="text-sm text-[#6b7a90]">设备ID</div>
                  <div class="mt-1 text-xl font-800 text-[#10233f]">{{ selectedUav.djiId }}</div>
                </div>
                <div class="rounded-5 bg-[#f8fafc] p-4">
                  <div class="text-sm text-[#6b7a90]">可用状态</div>
                  <div class="mt-1">
                    <el-tag :type="selectedUav.isAvailable === '1' ? 'success' : 'danger'" effect="dark">
                      {{ selectedUav.isAvailable === '1' ? '可用' : '不可用' }}
                    </el-tag>
                  </div>
                </div>
                <div class="rounded-5 bg-[#f8fafc] p-4">
                  <div class="text-sm text-[#6b7a90]">创建时间</div>
                  <div class="mt-1 text-xl font-800 text-[#10233f]">{{ selectedUav.uavCreateTime || '-' }}</div>
                </div>
              </div>
              <div class="mt-4">
                <el-button type="primary" @click="openAvailableDialog(selectedUav)">
                  修改可用状态
                </el-button>
              </div>
            </section>
          </div>
        </el-tab-pane>

        <el-tab-pane label="应用日志" name="logs">
          <section class="panel-card p-5">
            <div class="flex items-center justify-between">
              <div class="text-xl font-800 tracking-tight text-[#10233f]">应用日志</div>
              <div class="flex items-center gap-2">
                <el-input-number v-model="logLines" :min="10" :max="500" :step="10" size="small" />
                <el-button type="primary" size="small" @click="refreshLogs">刷新</el-button>
              </div>
            </div>
            <div class="mt-4 max-h-[600px] overflow-auto rounded bg-[#1e1e1e] p-4">
              <pre class="text-sm text-[#d4d4d4] whitespace-pre-wrap break-all font-mono">{{ appLogs.join('\n') || '暂无日志' }}</pre>
            </div>
          </section>
        </el-tab-pane>

        <el-tab-pane label="错误日志" name="errors">
          <section class="panel-card p-5">
            <div class="flex items-center justify-between">
              <div class="text-xl font-800 tracking-tight text-[#10233f]">错误日志</div>
              <div class="flex items-center gap-2">
                <el-input-number v-model="logLines" :min="10" :max="500" :step="10" size="small" />
                <el-button type="primary" size="small" @click="refreshLogs">刷新</el-button>
              </div>
            </div>
            <div class="mt-4 max-h-[600px] overflow-auto rounded bg-[#1e1e1e] p-4">
              <pre class="text-sm text-[#f14c4c] whitespace-pre-wrap break-all font-mono">{{ errorLogs.join('\n') || '暂无错误日志' }}</pre>
            </div>
          </section>
        </el-tab-pane>
      </el-tabs>

      <el-dialog
        v-model="isAvailableDialogVisible"
        title="修改无人机可用状态"
        width="500px"
      >
        <div v-if="selectedUav" class="space-y-4">
          <div>
            <div class="text-sm text-[#6b7a90]">无人机名称</div>
            <div class="mt-1 text-lg font-700 text-[#10233f]">{{ selectedUav.uavName }}</div>
          </div>
          <div>
            <div class="text-sm text-[#6b7a90]">设备ID</div>
            <div class="mt-1 text-lg font-700 text-[#10233f]">{{ selectedUav.djiId }}</div>
          </div>
          <div>
            <div class="text-sm text-[#6b7a90]">当前状态</div>
            <div class="mt-1">
              <el-tag :type="selectedUav.isAvailable === '1' ? 'success' : 'danger'" effect="dark">
                {{ selectedUav.isAvailable === '1' ? '可用' : '不可用' }}
              </el-tag>
            </div>
          </div>
          <div>
            <div class="text-sm text-[#6b7a90]">新状态</div>
            <div class="mt-2">
              <el-radio-group v-model="availableStatus">
                <el-radio-button value="1">可用</el-radio-button>
                <el-radio-button value="0">不可用</el-radio-button>
              </el-radio-group>
            </div>
          </div>
        </div>
        <template #footer>
          <span class="dialog-footer">
            <el-button @click="isAvailableDialogVisible = false">取消</el-button>
            <el-button type="primary" :loading="loading" @click="handleUpdateAvailable">
              确认修改
            </el-button>
          </span>
        </template>
      </el-dialog>
    </div>
  </MainLayout>
</template>
