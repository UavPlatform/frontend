<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import MainLayout from '../layouts/MainLayout.vue'
import OnlineUavTable from '../components/dashboard/OnlineUavTable.vue'
import { listAllUavs, listOnlineUavs } from '../api/modules/uav'
import { requestStartLive } from '../api/modules/live'
import { initUavWs, disconnectUavWs, onUavStatusUpdate, offUavStatusUpdate } from '../api/ws/modules/uav-ws'
import type { UavItem, UavListMode, UavRuntimeStatus } from '../types/uav'

const router = useRouter()

const query = reactive({
  keyword: '',
  page: 1,
  pageSize: 6,
})

const viewMode = ref<UavListMode>('all')
const loading = ref(false)
const allUavs = ref<UavItem[]>([])
const onlineUavs = ref<UavItem[]>([])
const selectedUav = ref<UavItem>()
const pendingAction = ref<'start-live'>()
const pendingDeviceId = ref('')
const lastUpdatedAt = ref('--:--:--')

const liveStateTextMap: Record<NonNullable<UavItem['liveState']>, string> = {
  IDLE: '未启动',
  STARTING: '启动中',
  RUNNING: '直播中',
}

const currentList = computed(() => (viewMode.value === 'online' ? onlineUavs.value : allUavs.value))
const currentModeLabel = computed(() => (viewMode.value === 'online' ? '在线机队' : '全部机队'))
const onlineCoverage = computed(() => `${onlineUavs.value.length}/${allUavs.value.length || 0}`)
const activeLiveCount = computed(
  () => allUavs.value.filter((item) => item.liveState && item.liveState !== 'IDLE').length,
)
const selectedStateLabel = computed(() => {
  if (!selectedUav.value) {
    return '待锁定'
  }

  if (!selectedUav.value.deviceId) {
    return '信息待补齐'
  }

  if (selectedUav.value.isAvailable === '0') {
    return '已禁用'
  }

  return selectedUav.value.onlineStatus?.trim() || (selectedUav.value.isOnline ? '在线待命' : '离线')
})
const selectedStateTagType = computed<'success' | 'info' | 'danger'>(() => {
  if (!selectedUav.value) {
    return 'info'
  }

  if (!selectedUav.value.deviceId) {
    return 'info'
  }

  if (selectedUav.value.isAvailable === '0') {
    return 'danger'
  }

  return selectedUav.value.isOnline ? 'success' : 'info'
})
const selectedLiveState = computed(() => {
  if (!selectedUav.value?.deviceId) {
    return '不可用'
  }

  return selectedUav.value.liveState ? liveStateTextMap[selectedUav.value.liveState] : '未启动'
})
const selectedBatteryText = computed(() => {
  if (typeof selectedUav.value?.latestStatus?.battery !== 'number') {
    return '--'
  }

  return `${selectedUav.value.latestStatus.battery}%`
})
const selectedSpeedText = computed(() => {
  if (typeof selectedUav.value?.latestStatus?.speed !== 'number') {
    return '--'
  }

  return `${selectedUav.value.latestStatus.speed.toFixed(1)} m/s`
})
const selectedAltitudeText = computed(() => {
  if (typeof selectedUav.value?.latestStatus?.altitude !== 'number') {
    return '--'
  }

  return `${selectedUav.value.latestStatus.altitude.toFixed(1)} m`
})
const selectedOperationText = computed(() => selectedUav.value?.latestStatus?.operation?.trim() || '--')
const selectedReportTimeText = computed(() =>
  formatStatusTime(selectedUav.value?.latestStatus?.receivedAt ?? selectedUav.value?.latestStatus?.timestamp),
)

const filteredUavs = computed(() => {
  const keyword = query.keyword.trim().toLowerCase()

  if (!keyword) {
    return currentList.value
  }

  return currentList.value.filter((item) =>
    [item.uavName, item.deviceId ?? '', String(item.id), item.controllerModel, item.onlineStatus]
      .join(' ')
      .toLowerCase()
      .includes(keyword),
  )
})

const total = computed(() => filteredUavs.value.length)

const pagedUavs = computed(() => {
  const start = (query.page - 1) * query.pageSize
  return filteredUavs.value.slice(start, start + query.pageSize)
})

const overviewItems = computed(() => [
  {
    label: '在线机数',
    value: onlineUavs.value.length,
    tag: '实时',
    tagType: 'primary' as const,
  },
  {
    label: '全部机数',
    value: allUavs.value.length,
    tag: '总量',
    tagType: 'success' as const,
  },
  {
    label: '当前目标',
    value: selectedUav.value?.deviceId ?? (selectedUav.value ? `#${selectedUav.value.id}` : '--'),
    tag: selectedStateLabel.value,
    tagType: selectedStateTagType.value,
  },
  {
    label: '直播任务',
    value: activeLiveCount.value,
    tag: '平台上报',
    tagType: 'warning' as const,
  },
])

const formatCurrentTime = () =>
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date())

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

const updateDeviceState = (deviceId: string, patch: Partial<UavItem>) => {
  const applyPatch = (list: UavItem[]) =>
    list.map((item) => (item.deviceId === deviceId ? { ...item, ...patch } : item))

  onlineUavs.value = applyPatch(onlineUavs.value)
  allUavs.value = applyPatch(allUavs.value)

  if (selectedUav.value?.deviceId === deviceId) {
    selectedUav.value = {
      ...selectedUav.value,
      ...patch,
    }
  }
}

const canStartLive = (uav?: UavItem) =>
  Boolean(uav?.deviceId) && Boolean(uav?.isOnline) && uav?.isAvailable !== '0' && uav?.liveState !== 'STARTING' && uav?.liveState !== 'RUNNING'

const getStartLiveLabel = (uav?: UavItem) => {
  if (uav?.liveState === 'RUNNING') {
    return '直播中'
  }

  if (uav?.liveState === 'STARTING') {
    return '启动中'
  }

  return '启动直播'
}

const syncSelectedUav = () => {
  const source = currentList.value.length > 0 ? currentList.value : allUavs.value

  if (source.length === 0) {
    selectedUav.value = undefined
    return
  }

  if (!selectedUav.value) {
    selectedUav.value = source[0]
    return
  }

  const matched = source.find((item) => item.id === selectedUav.value?.id)
  selectedUav.value = matched ?? source[0]
}

const loadUavs = async () => {
  loading.value = true

  try {
    const [onlineResult, allResult] = await Promise.all([listOnlineUavs(), listAllUavs()])
    const onlineIdSet = new Set(onlineResult.list.map((item) => item.id))

    onlineUavs.value = onlineResult.list.map((item) => ({
      ...item,
      isOnline: true,
    }))

    allUavs.value = (allResult.list.length > 0 ? allResult.list : onlineResult.list).map((item) => ({
      ...item,
      isOnline: onlineIdSet.has(item.id),
    }))

    lastUpdatedAt.value = formatCurrentTime()
    syncSelectedUav()

    if (onlineResult.message && onlineResult.list.length === 0 && viewMode.value === 'online') {
      ElMessage.info(onlineResult.message)
    }
  } catch (error) {
    console.error(error)
    ElMessage.error(error instanceof Error ? error.message : '无人机数据加载失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  query.page = 1
}

const handleReset = () => {
  query.keyword = ''
  query.page = 1
  query.pageSize = 6
  syncSelectedUav()
}

const handleSelect = (uav: UavItem) => {
  selectedUav.value = uav
}

const handleStartLive = async (deviceId: string) => {
  pendingAction.value = 'start-live'
  pendingDeviceId.value = deviceId

  try {
    const result = await requestStartLive(deviceId)
    updateDeviceState(deviceId, {
      liveState: result.liveState ?? 'STARTING',
    })
    lastUpdatedAt.value = formatCurrentTime()
    ElMessage.success(result.message)
  } catch (error) {
    console.error(error)
    ElMessage.error(error instanceof Error ? error.message : '直播启动失败')
  } finally {
    pendingAction.value = undefined
    pendingDeviceId.value = ''
  }
}

const handleStartSelectedLive = () => {
  if (!selectedUav.value?.deviceId) {
    ElMessage.info('当前后端列表接口未返回设备 ID，暂时无法发起直播')
    return
  }

  void handleStartLive(selectedUav.value.deviceId)
}

const handleEnterOperate = (uav: UavItem) => {
  if (!uav.deviceId) {
    ElMessage.info('当前后端列表接口未返回设备 ID，暂时无法进入操作页')
    return
  }

  if (uav.isAvailable === '0') {
    ElMessage.warning('该设备已被禁用，无法进入操作页')
    return
  }

  selectedUav.value = uav
  void router.push({
    name: 'operate',
    params: { deviceId: uav.deviceId },
    query: {
      name: uav.uavName,
      online: uav.isOnline ? '1' : '0',
      controllerModel: uav.controllerModel ?? '',
      liveState: uav.liveState ?? '',
      onlineStatus: uav.onlineStatus ?? '',
    },
  })
}

const handleEnterSelectedOperate = () => {
  if (!selectedUav.value) {
    return
  }

  handleEnterOperate(selectedUav.value)
}

onMounted(() => {
  void loadUavs()
})
</script>

<template>
  <MainLayout title="无人机管理总台">
    <div class="flex flex-col gap-4">
      <section class="panel-card p-4 md:p-5">
        <div class="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
          <div
            v-for="item in overviewItems"
            :key="item.label"
            class="rounded-4 border border-[#ebeef5] bg-[#fafafa] px-4 py-3"
          >
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm text-[#606266]">{{ item.label }}</span>
              <el-tag size="small" :type="item.tagType" effect="plain">
                {{ item.tag }}
              </el-tag>
            </div>
            <div class="mt-3 text-3xl font-700 tracking-tight text-[#303133]">
              {{ item.value }}
            </div>
          </div>
        </div>
      </section>

      <div class="grid gap-4 2xl:grid-cols-[minmax(0,1.8fr)_340px]">
        <section class="panel-card p-4 md:p-5">
          <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div class="text-xl font-700 tracking-tight text-[#303133]">设备队列</div>
            </div>

            <div class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
              <el-radio-group v-model="viewMode" @change="handleReset">
                <el-radio-button label="online" value="online">在线机队</el-radio-button>
                <el-radio-button label="all" value="all">全部机队</el-radio-button>
              </el-radio-group>
              <el-input
                v-model="query.keyword"
                class="md:!w-[220px]"
                clearable
                placeholder="搜索设备 ID / 名称 / 型号"
                @input="handleSearch"
              />
              <el-button @click="handleReset">重置</el-button>
              <el-button @click="loadUavs">刷新</el-button>
            </div>
          </div>

          <div class="mt-4 flex flex-wrap gap-x-6 gap-y-2 rounded-4 border border-[#ebeef5] bg-[#fafafa] px-4 py-3 text-sm text-[#606266]">
            <span>当前视图：<strong class="text-[#303133] font-600">{{ currentModeLabel }}</strong></span>
            <span>选中目标：<strong class="text-[#303133] font-600">{{ selectedUav?.deviceId ?? (selectedUav ? `#${selectedUav.id}` : '--') }}</strong></span>
            <span>直播状态：<strong class="text-[#303133] font-600">{{ selectedLiveState }}</strong></span>
            <span>最近更新：<strong class="text-[#303133] font-600">{{ lastUpdatedAt }}</strong></span>
          </div>

          <div class="mt-5">
            <OnlineUavTable
              :uavs="pagedUavs"
              :loading="loading"
              :total="total"
              :page="query.page"
              :page-size="query.pageSize"
              :active-uav-id="selectedUav?.id"
              :pending-action="pendingAction"
              :pending-device-id="pendingDeviceId"
              @select="handleSelect"
              @start-live="handleStartLive"
              @enter-operate="handleEnterOperate"
              @page-change="(page) => { query.page = page }"
              @size-change="(pageSize) => { query.page = 1; query.pageSize = pageSize }"
            />
          </div>
        </section>

        <aside class="flex flex-col gap-4">
          <section class="panel-card p-5">
            <div class="flex items-center justify-between gap-3">
              <div class="text-lg font-700 tracking-tight text-[#303133]">当前设备</div>
              <el-tag :type="selectedStateTagType" effect="plain">
                {{ selectedStateLabel }}
              </el-tag>
            </div>

            <template v-if="selectedUav">
              <el-descriptions class="mt-4" :column="1" border size="small">
                <el-descriptions-item label="无人机名称">
                  {{ selectedUav.uavName }}
                </el-descriptions-item>
                <el-descriptions-item label="设备 ID">
                  {{ selectedUav.deviceId ?? '--' }}
                </el-descriptions-item>
                <el-descriptions-item label="控制器型号">
                  {{ selectedUav.controllerModel || '--' }}
                </el-descriptions-item>
                <el-descriptions-item label="链路状态">
                  {{ selectedUav.onlineStatus || (selectedUav.isOnline ? '可下发指令' : '等待上线') }}
                </el-descriptions-item>
                <el-descriptions-item label="直播任务">
                  {{ selectedLiveState }}
                </el-descriptions-item>
                <el-descriptions-item label="最近上报">
                  {{ selectedReportTimeText }}
                </el-descriptions-item>
              </el-descriptions>

              <div class="mt-4 grid grid-cols-2 gap-3">
                <div class="rounded-4 border border-[#ebeef5] bg-[#fafafa] px-4 py-3">
                  <div class="text-xs text-[#909399]">电量</div>
                  <div class="mt-2 text-lg font-700 text-[#303133]">{{ selectedBatteryText }}</div>
                </div>
                <div class="rounded-4 border border-[#ebeef5] bg-[#fafafa] px-4 py-3">
                  <div class="text-xs text-[#909399]">速度</div>
                  <div class="mt-2 text-lg font-700 text-[#303133]">{{ selectedSpeedText }}</div>
                </div>
                <div class="rounded-4 border border-[#ebeef5] bg-[#fafafa] px-4 py-3">
                  <div class="text-xs text-[#909399]">高度</div>
                  <div class="mt-2 text-lg font-700 text-[#303133]">{{ selectedAltitudeText }}</div>
                </div>
                <div class="rounded-4 border border-[#ebeef5] bg-[#fafafa] px-4 py-3">
                  <div class="text-xs text-[#909399]">当前任务</div>
                  <div class="mt-2 text-lg font-700 text-[#303133]">{{ selectedOperationText }}</div>
                </div>
              </div>

              <div class="mt-4 grid grid-cols-1 gap-3">
                <el-button
                  type="primary"
                  :disabled="!canStartLive(selectedUav)"
                  :loading="pendingAction === 'start-live' && pendingDeviceId === selectedUav.deviceId"
                  @click="handleStartSelectedLive"
                >
                  {{ getStartLiveLabel(selectedUav) }}
                </el-button>
                <el-button type="success" plain @click="handleEnterSelectedOperate">
                  进入操作
                </el-button>
                <el-button @click="loadUavs">刷新设备</el-button>
              </div>
            </template>
            <el-empty v-else description="暂无目标设备" :image-size="80" />
          </section>

          <section class="panel-card p-5">
            <div class="text-lg font-700 tracking-tight text-[#303133]">运行状态</div>

            <div class="mt-4 flex flex-col gap-3">
              <div class="flex items-center justify-between rounded-4 border border-[#ebeef5] bg-[#fafafa] px-4 py-3 text-sm">
                <span class="text-[#606266]">在线覆盖</span>
                <strong class="text-[#303133] font-600">{{ onlineCoverage }}</strong>
              </div>
              <div class="flex items-center justify-between rounded-4 border border-[#ebeef5] bg-[#fafafa] px-4 py-3 text-sm">
                <span class="text-[#606266]">平台直播数</span>
                <strong class="text-[#303133] font-600">{{ activeLiveCount }}</strong>
              </div>
              <div class="flex items-center justify-between rounded-4 border border-[#ebeef5] bg-[#fafafa] px-4 py-3 text-sm">
                <span class="text-[#606266]">选中设备电量</span>
                <strong class="text-[#303133] font-600">{{ selectedBatteryText }}</strong>
              </div>
              <div class="flex items-center justify-between rounded-4 border border-[#ebeef5] bg-[#fafafa] px-4 py-3 text-sm">
                <span class="text-[#606266]">设备最近上报</span>
                <strong class="text-[#303133] font-600">{{ selectedReportTimeText }}</strong>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  </MainLayout>
</template>
