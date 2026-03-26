<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import MainLayout from '../layouts/MainLayout.vue'
import DroneStats from '../components/dashboard/DroneStats.vue'
import OnlineUavTable from '../components/dashboard/OnlineUavTable.vue'
import { listAllUavs, listOnlineUavs } from '../api/modules/uav'
import { requestStartLive } from '../api/modules/live'
import type { DashboardStat, UavItem, UavListMode } from '../types/uav'

const router = useRouter()

const query = reactive({
  keyword: '',
  page: 1,
  pageSize: 6,
})

const viewMode = ref<UavListMode>('online')
const loading = ref(false)
const allUavs = ref<UavItem[]>([])
const onlineUavs = ref<UavItem[]>([])
const selectedUav = ref<UavItem>()
const pendingAction = ref<'start-live'>()
const pendingDeviceId = ref('')
const startedDeviceIds = ref<string[]>([])

const currentList = computed(() => (viewMode.value === 'online' ? onlineUavs.value : allUavs.value))

const filteredUavs = computed(() => {
  const keyword = query.keyword.trim().toLowerCase()

  if (!keyword) {
    return currentList.value
  }

  return currentList.value.filter((item) =>
    [item.uavName, item.deviceId, String(item.id)].join(' ').toLowerCase().includes(keyword),
  )
})

const total = computed(() => filteredUavs.value.length)

const pagedUavs = computed(() => {
  const start = (query.page - 1) * query.pageSize
  return filteredUavs.value.slice(start, start + query.pageSize)
})

const stats = computed<DashboardStat[]>(() => [
  {
    label: '在线无人机',
    value: onlineUavs.value.length,
    hint: '当前正在连接中的无人机数量',
    trend: '实时更新',
    tone: 'primary',
  },
  {
    label: '全部无人机',
    value: allUavs.value.length,
    hint: '系统当前可查看的全部无人机数据',
    trend: '完整机队',
    tone: 'success',
  },
  {
    label: '当前选中设备',
    value: selectedUav.value?.deviceId ?? '--',
    hint: '右侧操作面板会跟随当前选中无人机切换',
    trend: selectedUav.value?.uavName ?? '未选择',
    tone: 'warning',
  },
  {
    label: '已发起直播',
    value: startedDeviceIds.value.length,
    hint: '本次会话里已执行过直播启动的设备数',
    trend: '操作记录',
    tone: 'danger',
  },
])

const syncSelectedUav = () => {
  if (!selectedUav.value) {
    selectedUav.value = currentList.value[0]
    return
  }

  const matched = allUavs.value.find((item) => item.deviceId === selectedUav.value?.deviceId)
  selectedUav.value = matched ?? currentList.value[0]
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

    const mergedAll = (allResult.list.length > 0 ? allResult.list : onlineResult.list).map((item) => ({
      ...item,
      isOnline: onlineIdSet.has(item.id),
    }))

    allUavs.value = mergedAll
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

    if (!startedDeviceIds.value.includes(deviceId)) {
      startedDeviceIds.value = [...startedDeviceIds.value, deviceId]
    }

    ElMessage.success(result.message)
  } catch (error) {
    console.error(error)
    ElMessage.error(error instanceof Error ? error.message : '直播启动失败')
  } finally {
    pendingAction.value = undefined
    pendingDeviceId.value = ''
  }
}

const handleEnterOperate = (uav: UavItem) => {
  selectedUav.value = uav
  void router.push({
    name: 'operate',
    params: { deviceId: uav.deviceId },
    query: {
      name: uav.uavName,
      online: uav.isOnline ? '1' : '0',
    },
  })
}

onMounted(() => {
  void loadUavs()
})
</script>

<template>
  <MainLayout
    title="无人机管理总台"
    subtitle="统一查看在线无人机和全部无人机数据，选中设备后在右侧执行直播或进入操作界面。"
  >
    <div class="flex flex-col gap-4">
      <DroneStats :items="stats" />

      <div class="grid gap-4 2xl:grid-cols-[minmax(0,1.6fr)_380px]">
        <section class="panel-card p-4 md:p-5">
          <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div class="text-xl font-800 tracking-tight text-[#10233f]">无人机列表</div>
              <div class="mt-1 text-sm text-[#6b7a90]">
                支持查看当前在线无人机和全部无人机数据，并从列表快速进入操作。
              </div>
            </div>

            <div class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
              <el-radio-group v-model="viewMode" @change="handleReset">
                <el-radio-button label="online" value="online">在线无人机</el-radio-button>
                <el-radio-button label="all" value="all">全部无人机</el-radio-button>
              </el-radio-group>
              <el-input
                v-model="query.keyword"
                class="md:!w-[240px]"
                clearable
                placeholder="搜索设备 ID / 名称"
                @input="handleSearch"
              />
              <el-button @click="handleReset">重置</el-button>
              <el-button @click="loadUavs">刷新列表</el-button>
            </div>
          </div>

          <div class="mt-5">
            <OnlineUavTable
              :uavs="pagedUavs"
              :loading="loading"
              :total="total"
              :page="query.page"
              :page-size="query.pageSize"
              :active-device-id="selectedUav?.deviceId"
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
            <div class="text-lg font-800 tracking-tight text-[#10233f]">操作面板</div>
            <div v-if="selectedUav" class="mt-4 rounded-5 bg-[#f8fafc] p-4">
              <div class="text-sm text-[#6b7a90]">无人机名称</div>
              <div class="mt-1 text-xl font-800 text-[#10233f]">{{ selectedUav.uavName }}</div>

              <div class="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <div class="text-sm text-[#6b7a90]">设备 ID</div>
                  <div class="mt-1 text-base font-700 text-[#10233f]">{{ selectedUav.deviceId }}</div>
                </div>
                <div>
                  <div class="text-sm text-[#6b7a90]">连接状态</div>
                  <div class="mt-1">
                    <el-tag :type="selectedUav.isOnline ? 'success' : 'info'" effect="dark">
                      {{ selectedUav.isOnline ? '在线' : '离线' }}
                    </el-tag>
                  </div>
                </div>
              </div>

              <div class="mt-5 grid grid-cols-1 gap-3">
                <el-button
                  type="primary"
                  :disabled="!selectedUav.isOnline"
                  :loading="pendingAction === 'start-live' && pendingDeviceId === selectedUav.deviceId"
                  @click="handleStartLive(selectedUav.deviceId)"
                >
                  启动直播
                </el-button>
                <el-button type="success" plain @click="handleEnterOperate(selectedUav)">
                  进入操作
                </el-button>
                <el-button @click="loadUavs">刷新设备数据</el-button>
              </div>
            </div>
            <el-empty v-else description="当前没有可操作的无人机" />
          </section>

          <section class="panel-card p-5">
            <div class="text-lg font-800 tracking-tight text-[#10233f]">操作提示</div>
            <div class="mt-4 space-y-3 text-sm leading-6 text-[#516178]">
              <div class="rounded-5 bg-[#f8fafc] p-4">
                选中无人机后，可以在这里直接启动直播或进入操作界面。
              </div>
              <div class="rounded-5 bg-[#f8fafc] p-4">
                进入操作页后会自动尝试拉起图传，页面只保留图传与操作区的界面骨架。
              </div>
              <div class="rounded-5 bg-[#f8fafc] p-4">
                图传播放逻辑可以后续直接挂到操作页的视频区域。
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  </MainLayout>
</template>
