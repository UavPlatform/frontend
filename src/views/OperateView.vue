<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import MainLayout from '../layouts/MainLayout.vue'
import TrtcPlayer from '../components/TrtcPlayer.vue'
import { getStoredSession } from '../api/session'
import { listAllUavs } from '../api/modules/uav'
import { closeLive, getPullCredentials, requestStartLive } from '../api/modules/live'
import type { LiveCredentials, LiveStartResponse, LiveState, UavItem } from '../types/uav'

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
  void loadDeviceInfo()
  void initializeLive()
})

onBeforeUnmount(() => {
  if (hasManagedSession.value && !closing.value) {
    void handleCloseLive(true)
  }
})
</script>

<template>
  <MainLayout
    title="无人机操作界面"
    subtitle="进入操作页后自动尝试拉起图传，左侧为图传画面接入区，右侧为设备操作与状态面板。"
  >
    <div class="grid gap-4 2xl:grid-cols-[minmax(0,1.7fr)_380px]">
      <section class="panel-card flex min-h-[620px] flex-col p-5">
        <div class="flex items-center justify-between gap-4">
          <div>
            <div class="text-2xl font-900 tracking-tight text-[#10233f]">{{ deviceName }}</div>
            <div class="mt-2 text-sm text-[#6b7a90]">设备 ID：{{ deviceId }}</div>
            <div class="mt-2 text-sm text-[#6b7a90]">控制器：{{ controllerModel }}</div>
          </div>
          <el-tag :type="onlineState ? 'success' : 'info'" effect="dark">
            {{ onlineState ? '在线' : '离线' }}
          </el-tag>
        </div>

        <div class="operation-video-shell mt-5 flex-1">
          <TrtcPlayer :credentials="liveCredentials ?? null" @error="handleTrtcError" @connected="handleTrtcConnected" @disconnected="handleTrtcDisconnected" />
        </div>
      </section>

      <aside class="flex flex-col gap-4">
        <section class="panel-card p-5">
          <div class="text-lg font-800 tracking-tight text-[#10233f]">图传状态</div>
          <div class="mt-4 rounded-5 bg-[#f8fafc] p-4">
            <div class="flex items-center justify-between gap-4">
              <div class="text-sm text-[#6b7a90]">页面阶段</div>
              <el-tag :type="liveStageTagTypeMap[liveStage]">
                {{ liveStageLabelMap[liveStage] }}
              </el-tag>
            </div>
            <div class="mt-3 flex items-center justify-between gap-4">
              <div class="text-sm text-[#6b7a90]">平台状态</div>
              <el-tag :type="platformLiveStateTagType" effect="plain">
                {{ platformLiveStateLabel }}
              </el-tag>
            </div>
            <div class="mt-3 text-sm leading-6 text-[#516178]">{{ liveMessage }}</div>
            <div class="mt-4 grid grid-cols-1 gap-2 text-sm text-[#516178]">
              <div class="flex items-center justify-between rounded-4 bg-white px-3 py-2">
                <span>请求 ID</span>
                <strong class="text-[#10233f]">{{ requestIdText }}</strong>
              </div>
              <div class="flex items-center justify-between rounded-4 bg-white px-3 py-2">
                <span>房间 ID</span>
                <strong class="text-[#10233f]">{{ roomIdText }}</strong>
              </div>
              <div class="flex items-center justify-between rounded-4 bg-white px-3 py-2">
                <span>设备确认</span>
                <strong class="text-[#10233f]">{{ ackStatusLabel }}</strong>
              </div>
            </div>
          </div>
        </section>

        <section class="panel-card p-5">
          <div class="text-lg font-800 tracking-tight text-[#10233f]">快捷操作</div>
          <div class="mt-4 grid grid-cols-1 gap-3">
            <el-button type="primary" :loading="initializing" @click="initializeLive">
              重新拉起图传
            </el-button>
            <el-button type="warning" plain :disabled="!hasManagedSession" :loading="closing" @click="handleCloseLive()">
              关闭观看会话
            </el-button>
            <el-button plain :loading="deviceLoading" @click="loadDeviceInfo">
              刷新设备信息
            </el-button>
            <el-button @click="router.push({ name: 'dashboard' })">返回主页</el-button>
          </div>
        </section>

        <section class="panel-card p-5">
          <div class="text-lg font-800 tracking-tight text-[#10233f]">设备信息</div>
          <div class="mt-4 space-y-3">
            <div class="rounded-5 bg-[#f8fafc] p-4">
              <div class="text-sm text-[#6b7a90]">无人机名称</div>
              <div class="mt-1 text-base font-700 text-[#10233f]">{{ deviceName }}</div>
            </div>
            <div class="rounded-5 bg-[#f8fafc] p-4">
              <div class="text-sm text-[#6b7a90]">设备 ID</div>
              <div class="mt-1 text-base font-700 text-[#10233f]">{{ deviceId }}</div>
            </div>
            <div class="rounded-5 bg-[#f8fafc] p-4">
              <div class="text-sm text-[#6b7a90]">平台链路状态</div>
              <div class="mt-1 text-base font-700 text-[#10233f]">
                {{ onlineStatusText }}
              </div>
            </div>
            <div class="rounded-5 bg-[#f8fafc] p-4">
              <div class="text-sm text-[#6b7a90]">凭据状态</div>
              <div class="mt-1 text-base font-700 text-[#10233f]">{{ liveCredentials ? '已就绪' : '未获取' }}</div>
            </div>
            <div class="rounded-5 bg-[#f8fafc] p-4">
              <div class="text-sm text-[#6b7a90]">拉流地址</div>
              <div class="mt-1 break-all text-sm font-700 text-[#10233f]">{{ wsUrlText }}</div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="rounded-5 bg-[#f8fafc] p-4">
                <div class="text-sm text-[#6b7a90]">电量</div>
                <div class="mt-1 text-base font-700 text-[#10233f]">{{ batteryText }}</div>
              </div>
              <div class="rounded-5 bg-[#f8fafc] p-4">
                <div class="text-sm text-[#6b7a90]">速度</div>
                <div class="mt-1 text-base font-700 text-[#10233f]">{{ speedText }}</div>
              </div>
              <div class="rounded-5 bg-[#f8fafc] p-4">
                <div class="text-sm text-[#6b7a90]">高度</div>
                <div class="mt-1 text-base font-700 text-[#10233f]">{{ altitudeText }}</div>
              </div>
              <div class="rounded-5 bg-[#f8fafc] p-4">
                <div class="text-sm text-[#6b7a90]">当前任务</div>
                <div class="mt-1 text-base font-700 text-[#10233f]">{{ operationText }}</div>
              </div>
            </div>
            <div class="rounded-5 bg-[#f8fafc] p-4">
              <div class="text-sm text-[#6b7a90]">最近上报时间</div>
              <div class="mt-1 text-base font-700 text-[#10233f]">{{ reportTimeText }}</div>
            </div>
          </div>
        </section>
      </aside>
    </div>
  </MainLayout>
</template>

<style scoped>
.operation-video-shell {
  position: relative;
  overflow: hidden;
  border-radius: 28px;
  background: linear-gradient(135deg, #0f172a, #10233f);
}
</style>
