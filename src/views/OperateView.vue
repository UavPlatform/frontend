<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import MainLayout from '../layouts/MainLayout.vue'
import TrtcPlayer from '../components/TrtcPlayer.vue'
import { getStoredSession } from '../api/session'
import { listAllUavs } from '../api/modules/uav'
import { closeLive, getPullCredentials, requestStartLive } from '../api/modules/live'
import { disconnectUavWs, initUavWs, offUavStatusUpdate, onUavStatusUpdate } from '../api/ws/modules/uav-ws'
import type { LiveCredentials, LiveStartResponse, LiveState, UavItem, UavRuntimeStatus } from '../types/uav'

const route = useRoute()
const router = useRouter()

const deviceId = computed(() => String(route.params.deviceId ?? ''))
const session = computed(() => getStoredSession())
const webUserId = computed(() => `web_${session.value?.user.username ?? 'guest'}`)

const deviceInfo = ref<UavItem>()
const deviceLoading = ref(false)
const initializing = ref(false)
const closing = ref(false)
const liveStage = ref<'idle' | 'booting' | 'ready' | 'closing' | 'closed' | 'error'>('idle')
const liveMessage = ref('进入页面后会自动尝试拉起图传。')
const liveRequest = ref<LiveStartResponse>()
const liveCredentials = ref<LiveCredentials>()

const liveStageTagTypeMap = {
  idle: 'info',
  booting: 'warning',
  ready: 'success',
  closing: 'warning',
  closed: 'info',
  error: 'danger',
} as const

const liveStageLabelMap = {
  idle: '待机',
  booting: '初始化中',
  ready: '已初始化',
  closing: '关闭中',
  closed: '已关闭',
  error: '失败',
} as const

const platformLiveStateLabelMap: Record<LiveState, string> = {
  IDLE: '未启动',
  STARTING: '启动中',
  RUNNING: '直播中',
}

const routeLiveState = computed<LiveState | undefined>(() => {
  const raw = String(route.query.liveState ?? '')

  if (raw === 'IDLE' || raw === 'STARTING' || raw === 'RUNNING') {
    return raw
  }

  return undefined
})

const deviceName = computed(() => deviceInfo.value?.uavName ?? String(route.query.name ?? `无人机 ${deviceId.value}`))
const onlineState = computed(() => {
  if (typeof deviceInfo.value?.isOnline === 'boolean') {
    return deviceInfo.value.isOnline
  }

  return String(route.query.online ?? '0') === '1'
})
const controllerModel = computed(() => deviceInfo.value?.controllerModel ?? String(route.query.controllerModel ?? '--'))
const onlineStatusText = computed(
  () => deviceInfo.value?.onlineStatus ?? String(route.query.onlineStatus ?? (onlineState.value ? '在线' : '离线')),
)
const platformLiveState = computed(
  () => liveCredentials.value?.liveState ?? liveRequest.value?.liveState ?? deviceInfo.value?.liveState ?? routeLiveState.value,
)
const platformLiveStateLabel = computed(() =>
  platformLiveState.value ? platformLiveStateLabelMap[platformLiveState.value] : '未启动',
)
const platformLiveStateTagType = computed<'success' | 'warning' | 'info'>(() => {
  if (platformLiveState.value === 'RUNNING') {
    return 'success'
  }

  if (platformLiveState.value === 'STARTING') {
    return 'warning'
  }

  return 'info'
})
const ackStatusLabel = computed(() => {
  const ackConfirmed = liveCredentials.value?.ackConfirmed ?? liveRequest.value?.ackConfirmed

  if (ackConfirmed === true) {
    return '已确认'
  }

  if (ackConfirmed === false && (liveRequest.value || liveCredentials.value)) {
    return '待确认'
  }

  return '--'
})
const roomIdText = computed(() => liveCredentials.value?.roomId ?? liveRequest.value?.roomId ?? '--')
const requestIdText = computed(() => liveRequest.value?.requestId ?? '--')
const wsUrlText = computed(() => liveCredentials.value?.wsUrl ?? '--')
const hasManagedSession = computed(() => Boolean(liveRequest.value || liveCredentials.value))
const batteryText = computed(() => {
  if (typeof deviceInfo.value?.latestStatus?.battery !== 'number') {
    return '--'
  }

  return `${deviceInfo.value.latestStatus.battery}%`
})
const speedText = computed(() => {
  if (typeof deviceInfo.value?.latestStatus?.speed !== 'number') {
    return '--'
  }

  return `${deviceInfo.value.latestStatus.speed.toFixed(1)} m/s`
})
const altitudeText = computed(() => {
  if (typeof deviceInfo.value?.latestStatus?.altitude !== 'number') {
    return '--'
  }

  return `${deviceInfo.value.latestStatus.altitude.toFixed(1)} m`
})
const operationText = computed(() => deviceInfo.value?.latestStatus?.operation?.trim() || '--')
const reportTimeText = computed(() =>
  formatStatusTime(deviceInfo.value?.latestStatus?.receivedAt ?? deviceInfo.value?.latestStatus?.timestamp),
)
const liveReadyText = computed(() => (liveCredentials.value ? '已就绪' : '未获取'))

const normalizeTimestamp = (value?: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }

  return value < 1_000_000_000_000 ? value * 1000 : value
}

const formatStatusTime = (value?: number) => {
  const normalized = normalizeTimestamp(value)

  if (!normalized) {
    return '--'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(normalized))
}

const updateDeviceInfo = (patch: Partial<UavItem>) => {
  if (!deviceInfo.value) {
    return
  }

  deviceInfo.value = {
    ...deviceInfo.value,
    ...patch,
  }
}

const handleRealtimeStatusUpdate = (incomingDeviceId: string, status: UavRuntimeStatus) => {
  if (!deviceId.value || incomingDeviceId !== deviceId.value) {
    return
  }

  updateDeviceInfo({
    isOnline: true,
    latestStatus: {
      ...status,
      deviceId: incomingDeviceId,
    },
  })
}

const loadDeviceInfo = async () => {
  if (!deviceId.value) {
    return
  }

  deviceLoading.value = true

  try {
    const result = await listAllUavs()
    const matched = result.list.find((item) => item.deviceId === deviceId.value)

    if (matched) {
      deviceInfo.value = {
        ...matched,
        liveState: liveCredentials.value?.liveState ?? liveRequest.value?.liveState ?? matched.liveState,
      }
    }
  } catch (error) {
    console.error(error)
  } finally {
    deviceLoading.value = false
  }
}

const handleCloseLive = async (silent: boolean = false) => {
  if (!deviceId.value || closing.value || !hasManagedSession.value) {
    return
  }

  closing.value = true

  if (!silent) {
    liveStage.value = 'closing'
    liveMessage.value = '正在关闭观看会话...'
  }

  try {
    await closeLive(deviceId.value)
    liveRequest.value = undefined
    liveCredentials.value = undefined
    updateDeviceInfo({ liveState: 'IDLE' })
    liveStage.value = 'closed'
    liveMessage.value = '观看会话已关闭。'

    if (!silent) {
      ElMessage.success('观看会话已关闭')
    }
  } catch (error) {
    console.error(error)

    if (!silent) {
      liveStage.value = 'error'
      liveMessage.value = error instanceof Error ? error.message : '关闭观看会话失败'
      ElMessage.error(liveMessage.value)
    }
  } finally {
    closing.value = false
    void loadDeviceInfo()
  }
}

const initializeLive = async () => {
  if (!deviceId.value) {
    liveStage.value = 'error'
    liveMessage.value = '未获取到目标无人机设备 ID'
    return
  }

  if (hasManagedSession.value) {
    await handleCloseLive(true)
  }

  initializing.value = true
  liveStage.value = 'booting'
  liveMessage.value = '正在初始化图传链路，请稍候...'
  liveRequest.value = undefined
  liveCredentials.value = undefined

  try {
    const startResult = await requestStartLive(deviceId.value)
    liveRequest.value = startResult
    updateDeviceInfo({
      liveState: startResult.liveState ?? 'STARTING',
    })

    const credentials = await getPullCredentials(deviceId.value, webUserId.value)
    liveCredentials.value = credentials
    updateDeviceInfo({
      liveState: credentials.liveState ?? startResult.liveState ?? 'STARTING',
    })

    liveStage.value = 'ready'
    liveMessage.value =
      credentials.ackConfirmed === false
        ? '观看凭据已返回，等待设备确认并接入画面。'
        : '观看凭据已就绪，等待画面接入。'
  } catch (error) {
    console.error(error)
    liveStage.value = 'error'
    liveMessage.value = error instanceof Error ? error.message : '图传初始化失败'
    ElMessage.error(liveMessage.value)
  } finally {
    initializing.value = false
    void loadDeviceInfo()
  }
}

const handleTrtcError = (message: string) => {
  liveStage.value = 'error'
  liveMessage.value = message
}

const handleTrtcConnected = () => {
  liveMessage.value = '视频流已连接，正在播放画面。'
}

const handleTrtcDisconnected = () => {
  liveMessage.value = '视频流已断开。'
}

onMounted(() => {
  onUavStatusUpdate(handleRealtimeStatusUpdate)
  initUavWs()
  void loadDeviceInfo()
  void initializeLive()
})

onBeforeUnmount(() => {
  offUavStatusUpdate(handleRealtimeStatusUpdate)
  disconnectUavWs()
  if (hasManagedSession.value && !closing.value) {
    void handleCloseLive(true)
  }
})
</script>

<template>
  <MainLayout
    title="无人机操作界面"
    subtitle="主画面优先，链路状态与设备信息统一收纳在右侧信息栏。"
  >
    <div class="operate-console">
      <section class="panel-card console-toolbar p-4 md:p-5">
        <div class="console-toolbar-content">
          <div class="min-w-0">
            <div class="console-kicker">Operate Console</div>
            <div class="console-title-row">
              <h2 class="console-title">{{ deviceName }}</h2>
              <el-tag size="small" :type="onlineState ? 'success' : 'info'" effect="plain">
                {{ onlineStatusText }}
              </el-tag>
              <el-tag size="small" :type="platformLiveStateTagType" effect="plain">
                {{ platformLiveStateLabel }}
              </el-tag>
            </div>
            <div class="console-meta">
              <span>设备 ID：<strong>{{ deviceId }}</strong></span>
              <span>控制器：<strong>{{ controllerModel }}</strong></span>
              <span>当前任务：<strong>{{ operationText }}</strong></span>
              <span>最近遥测：<strong>{{ reportTimeText }}</strong></span>
            </div>
          </div>

          <div class="toolbar-actions">
            <el-button type="primary" :loading="initializing" @click="initializeLive">重新拉起图传</el-button>
            <el-button plain :loading="deviceLoading" @click="loadDeviceInfo">刷新状态</el-button>
            <el-button type="danger" plain :disabled="!hasManagedSession" :loading="closing" @click="handleCloseLive()">
              关闭会话
            </el-button>
            <el-button @click="router.push({ name: 'dashboard' })">返回主页</el-button>
          </div>
        </div>
      </section>

      <div class="console-main">
        <section class="panel-card stage-panel p-4 md:p-5">
          <div class="panel-header">
            <div>
              <div class="panel-title">飞行主画面</div>
            </div>
            <div class="panel-tags">
              <el-tag size="small" effect="plain">房间 {{ roomIdText }}</el-tag>
              <el-tag size="small" effect="plain">请求 {{ requestIdText }}</el-tag>
            </div>
          </div>

          <div class="stage-canvas mt-4">
            <div class="operation-video-shell">
              <TrtcPlayer
                :credentials="liveCredentials ?? null"
                @error="handleTrtcError"
                @connected="handleTrtcConnected"
                @disconnected="handleTrtcDisconnected"
              />
            </div>
          </div>

          <div class="telemetry-strip mt-4">
            <div class="metric-card">
              <span>电量</span>
              <strong>{{ batteryText }}</strong>
            </div>
            <div class="metric-card">
              <span>速度</span>
              <strong>{{ speedText }}</strong>
            </div>
            <div class="metric-card">
              <span>高度</span>
              <strong>{{ altitudeText }}</strong>
            </div>
            <div class="metric-card">
              <span>设备确认</span>
              <strong>{{ ackStatusLabel }}</strong>
            </div>
          </div>
        </section>

        <aside class="sidebar-stack">
          <section class="panel-card info-panel p-4">
            <div class="panel-title">直播状态</div>
            <div class="info-list mt-4">
              <div class="info-row">
                <span>页面阶段</span>
                <el-tag :type="liveStageTagTypeMap[liveStage]">{{ liveStageLabelMap[liveStage] }}</el-tag>
              </div>
              <div class="info-row">
                <span>平台状态</span>
                <el-tag :type="platformLiveStateTagType" effect="plain">{{ platformLiveStateLabel }}</el-tag>
              </div>
              <div class="info-row">
                <span>凭据状态</span>
                <strong>{{ liveReadyText }}</strong>
              </div>
            </div>
            <div class="status-note mt-4">{{ liveMessage }}</div>
          </section>

          <section class="panel-card info-panel p-4">
            <div class="panel-title">设备信息</div>
            <el-descriptions class="info-descriptions mt-4" :column="1" border size="small">
              <el-descriptions-item label="在线状态">
                {{ onlineStatusText }}
              </el-descriptions-item>
              <el-descriptions-item label="无人机名称">
                {{ deviceName }}
              </el-descriptions-item>
              <el-descriptions-item label="设备 ID">
                {{ deviceId }}
              </el-descriptions-item>
              <el-descriptions-item label="控制器">
                {{ controllerModel }}
              </el-descriptions-item>
            </el-descriptions>
          </section>

          <section class="panel-card info-panel p-4">
            <div class="panel-title">链路详情</div>
            <el-descriptions class="info-descriptions mt-4" :column="1" border size="small">
              <el-descriptions-item label="房间 ID">
                {{ roomIdText }}
              </el-descriptions-item>
              <el-descriptions-item label="请求 ID">
                {{ requestIdText }}
              </el-descriptions-item>
              <el-descriptions-item label="设备确认">
                {{ ackStatusLabel }}
              </el-descriptions-item>
              <el-descriptions-item label="拉流地址">
                <span class="break-all">{{ wsUrlText }}</span>
              </el-descriptions-item>
            </el-descriptions>
          </section>
        </aside>
      </div>
    </div>
  </MainLayout>
</template>

<style scoped>
.operate-console {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.console-toolbar {
  border-color: #e5e7eb;
}

.console-toolbar-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.console-kicker {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #909399;
}

.console-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.55rem;
}

.console-title {
  margin: 0;
  font-size: clamp(1.45rem, 2.2vw, 1.95rem);
  font-weight: 800;
  line-height: 1.12;
  color: #303133;
}

.console-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  margin-top: 0.85rem;
  font-size: 0.9rem;
  color: #606266;
}

.console-meta strong {
  color: #303133;
  font-weight: 600;
}

.toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.console-main {
  display: grid;
  gap: 1rem;
  align-items: start;
}

.stage-panel,
.info-panel {
  border-color: #e5e7eb;
}

.panel-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.panel-title {
  font-size: 1rem;
  font-weight: 800;
  color: #303133;
}

.panel-note,
.info-panel-note {
  margin-top: 0.35rem;
  font-size: 0.88rem;
  line-height: 1.55;
  color: #909399;
}

.panel-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.stage-canvas {
  display: flex;
  justify-content: center;
}

.operation-video-shell {
  position: relative;
  width: min(100%, 1120px);
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid #111827;
  background: #020617;
  aspect-ratio: 16 / 9;
  min-height: clamp(320px, 48vh, 560px);
}

.telemetry-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
  width: min(100%, 1120px);
  margin: 0 auto;
}

.metric-card {
  padding: 0.95rem 1rem;
  border-radius: 12px;
  background: #fafafa;
  border: 1px solid #ebeef5;
}

.metric-card span {
  display: block;
  font-size: 0.8rem;
  color: #909399;
}

.metric-card strong {
  display: block;
  margin-top: 0.45rem;
  font-family: 'Fira Code', monospace;
  font-size: 1.05rem;
  color: #303133;
}

.sidebar-stack {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.8rem 0.9rem;
  border-radius: 12px;
  border: 1px solid #ebeef5;
  background: #fafafa;
  color: #606266;
  font-size: 0.9rem;
}

.info-row strong {
  color: #303133;
  font-weight: 600;
}

.status-note {
  padding: 0.9rem 0.95rem;
  border-radius: 12px;
  border: 1px solid #ebeef5;
  background: #f5f7fa;
  color: #606266;
  font-size: 0.88rem;
  line-height: 1.6;
}

.info-descriptions :deep(.el-descriptions__label) {
  width: 96px;
  color: #606266;
}

.info-descriptions :deep(.el-descriptions__content) {
  color: #303133;
  word-break: break-word;
}

.info-descriptions :deep(.el-descriptions__cell) {
  font-size: 0.88rem;
}

@media (min-width: 1280px) {
  .console-toolbar-content {
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
  }

  .console-main {
    grid-template-columns: minmax(0, 1fr) 300px;
  }
}

@media (min-width: 1440px) {
  .console-main {
    grid-template-columns: minmax(0, 1fr) 320px;
  }
}

@media (max-width: 1023px) {
  .telemetry-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 767px) {
  .toolbar-actions {
    width: 100%;
  }

  .toolbar-actions :deep(.el-button) {
    flex: 1 1 calc(50% - 0.375rem);
    min-width: 0;
  }

  .telemetry-strip {
    grid-template-columns: 1fr;
  }

  .operation-video-shell {
    min-height: 280px;
  }
}
</style>
