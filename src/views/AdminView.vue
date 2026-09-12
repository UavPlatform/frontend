<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { VideoCamera, User } from '@element-plus/icons-vue'
import MainLayout from '../layouts/MainLayout.vue'
import {
  getAdminStatistics,
  getAllUavs,
  getLiveUavs,
  updateUavAvailable,
  getApplicationLogs,
  getErrorLogs
} from '../api/modules/admin'
import type { AdminStatistics, LiveUav, UavDetail } from '../types/admin'

// 1B-5b（U5）：管理员中心与运营台主框架融合——统一侧边导航/页头/登出，移除独立深色容器
const statistics = ref<AdminStatistics>({
  totalUavs: 0,
  onlineUavs: 0,
  availableUavs: 0,
  liveUavs: 0,
  offlineUavs: 0,
  unavailableUavs: 0,
  totalUsers: 0
})

const uavList = ref<UavDetail[]>([])
const liveUavList = ref<LiveUav[]>([])
const appLogs = ref<string[]>([])
const errorLogs = ref<string[]>([])
const loading = ref(false)
const activeTab = ref('statistics')
const logLines = ref(100)

const loadStatistics = async () => {
  try {
    statistics.value = await getAdminStatistics()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载统计信息失败')
  }
}

const loadUavList = async () => {
  try {
    uavList.value = await getAllUavs()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载无人机列表失败')
  }
}

const loadLiveUavs = async () => {
  try {
    liveUavList.value = await getLiveUavs()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载直播无人机失败')
  }
}

const loadAppLogs = async () => {
  try {
    appLogs.value = await getApplicationLogs(logLines.value)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载应用日志失败')
  }
}

const loadErrorLogs = async () => {
  try {
    errorLogs.value = await getErrorLogs(logLines.value)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载错误日志失败')
  }
}

const handleToggleAvailable = async (uav: UavDetail) => {
  const newStatus = uav.isAvailable === '1' ? '0' : '1'
  try {
    await updateUavAvailable(uav.djiId, newStatus)
    ElMessage.success('状态修改成功')
    await loadUavList()
    await loadStatistics()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '修改失败')
  }
}

const handleRefresh = async () => {
  loading.value = true
  try {
    await Promise.all([loadStatistics(), loadUavList(), loadLiveUavs()])
    ElMessage.success('数据已刷新')
  } finally {
    loading.value = false
  }
}

const handleRefreshLogs = async () => {
  await Promise.all([loadAppLogs(), loadErrorLogs()])
  ElMessage.success('日志已刷新')
}

const formatTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleString('zh-CN')
}

onMounted(() => {
  void handleRefresh()
})
</script>

<template>
  <MainLayout title="管理员中心" subtitle="无人机机队、业务数据与系统日志的统一管理。">
    <el-tabs v-model="activeTab" class="admin-tabs">
      <el-tab-pane label="系统概览" name="statistics">
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon drone">
              <VideoCamera :size="24" />
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ statistics.totalUavs }}</div>
              <div class="stat-label">无人机总数</div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon online">
              <VideoCamera :size="24" />
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ statistics.onlineUavs }}</div>
              <div class="stat-label">在线无人机</div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon live">
              <VideoCamera :size="24" />
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ statistics.liveUavs }}</div>
              <div class="stat-label">直播中</div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon user">
              <User :size="24" />
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ statistics.totalUsers }}</div>
              <div class="stat-label">用户总数</div>
            </div>
          </div>
        </div>

        <div class="section-card">
          <h3 class="section-title">直播中的无人机</h3>
          <el-table :data="liveUavList" stripe>
            <el-table-column prop="uavName" label="无人机名称" />
            <el-table-column prop="deviceId" label="设备ID" />
            <el-table-column prop="roomId" label="房间ID" />
            <el-table-column label="更新时间">
              <template #default="scope">
                {{ formatTime(scope.row.updatedAt) }}
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="无人机管理" name="uavs">
        <div class="section-card">
          <h3 class="section-title">无人机列表</h3>
          <el-table :data="uavList" stripe>
            <el-table-column prop="uavName" label="名称" />
            <el-table-column prop="djiId" label="设备ID" />
            <el-table-column label="在线状态">
              <template #default="scope">
                <el-tag :type="scope.row.onlineStatus === '1' ? 'success' : 'info'">
                  {{ scope.row.onlineStatus === '1' ? '在线' : '离线' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="可用状态">
              <template #default="scope">
                <el-tag :type="scope.row.isAvailable === '1' ? 'success' : 'danger'">
                  {{ scope.row.isAvailable === '1' ? '可用' : '不可用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150">
              <template #default="scope">
                <el-button
                  size="small"
                  :type="scope.row.isAvailable === '1' ? 'danger' : 'success'"
                  @click="handleToggleAvailable(scope.row)"
                >
                  {{ scope.row.isAvailable === '1' ? '禁用' : '启用' }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="应用日志" name="logs">
        <div class="section-card">
          <div class="section-header">
            <h3 class="section-title">应用日志</h3>
            <div class="section-actions">
              <el-input-number v-model="logLines" :min="10" :max="500" :step="10" size="small" />
              <el-button type="primary" size="small" @click="handleRefreshLogs">刷新</el-button>
            </div>
          </div>
          <div class="log-container">
            <pre class="log-content">{{ Array.isArray(appLogs) ? appLogs.join('\n') : '暂无日志' }}</pre>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="错误日志" name="errors">
        <div class="section-card">
          <div class="section-header">
            <h3 class="section-title">错误日志</h3>
            <div class="section-actions">
              <el-input-number v-model="logLines" :min="10" :max="500" :step="10" size="small" />
              <el-button type="primary" size="small" @click="handleRefreshLogs">刷新</el-button>
            </div>
          </div>
          <div class="log-container error">
            <pre class="log-content">{{ Array.isArray(errorLogs) ? errorLogs.join('\n') : '暂无错误日志' }}</pre>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </MainLayout>
</template>

<style scoped>
.admin-tabs {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-bottom: 24px;
}

.stat-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.stat-icon.drone {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.stat-icon.online {
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
}

.stat-icon.live {
  background: linear-gradient(135deg, #ee0979 0%, #ff6a00 100%);
}

.stat-icon.user {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: #1a1a2e;
}

.stat-label {
  font-size: 14px;
  color: #6b7280;
  margin-top: 4px;
}

.section-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  margin-top: 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0 0 16px;
}

.section-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.log-container {
  background: #1e1e1e;
  border-radius: 8px;
  padding: 16px;
  max-height: 600px;
  overflow: auto;
}

.log-container.error {
  background: #2d1f1f;
}

.log-content {
  margin: 0;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #d4d4d4;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
