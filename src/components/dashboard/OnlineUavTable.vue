<script setup lang="ts">
import type { UavItem } from '../../types/uav'

const props = defineProps<{
  uavs: UavItem[]
  loading: boolean
  total: number
  page: number
  pageSize: number
  activeUavId?: number
  pendingAction?: 'start-live'
  pendingDeviceId?: string
}>()

const emit = defineEmits<{
  (event: 'select', uav: UavItem): void
  (event: 'start-live', deviceId: string): void
  (event: 'enter-operate', uav: UavItem): void
  (event: 'page-change', page: number): void
  (event: 'size-change', pageSize: number): void
}>()

const liveStateTextMap: Record<NonNullable<UavItem['liveState']>, string> = {
  IDLE: '未启动',
  STARTING: '启动中',
  RUNNING: '直播中',
}

const isPending = (deviceId?: string) =>
  !!deviceId && props.pendingAction === 'start-live' && props.pendingDeviceId === deviceId

const getLinkStatusText = (uav: UavItem) => {
  if (uav.isAvailable === '0') {
    return '已禁用'
  }
  return uav.onlineStatus?.trim() || (uav.isOnline ? '在线' : '离线')
}

const getLiveStateText = (uav: UavItem) => (uav.liveState ? liveStateTextMap[uav.liveState] : '未启动')

const getLiveStateTagType = (uav: UavItem): 'success' | 'warning' | 'info' => {
  if (uav.liveState === 'RUNNING') {
    return 'success'
  }

  if (uav.liveState === 'STARTING') {
    return 'warning'
  }

  return 'info'
}

const getRuntimeSummary = (uav: UavItem) => {
  const parts: string[] = []

  if (typeof uav.latestStatus?.battery === 'number') {
    parts.push(`电量 ${uav.latestStatus.battery}%`)
  }

  if (typeof uav.latestStatus?.speed === 'number') {
    parts.push(`速度 ${uav.latestStatus.speed.toFixed(1)}m/s`)
  }

  if (typeof uav.latestStatus?.altitude === 'number') {
    parts.push(`高度 ${uav.latestStatus.altitude.toFixed(1)}m`)
  }

  return parts.join(' / ') || '暂无上报'
}

const canStartLive = (uav: UavItem) => uav.isOnline && uav.isAvailable !== '0' && uav.liveState !== 'STARTING' && uav.liveState !== 'RUNNING'

const getStartLiveLabel = (uav: UavItem) => {
  if (uav.liveState === 'RUNNING') {
    return '直播中'
  }

  if (uav.liveState === 'STARTING') {
    return '启动中'
  }

  return '启动直播'
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <el-table :data="uavs" :loading="loading" border stripe>
      <el-table-column label="设备 ID" min-width="160">
        <template #default="{ row }">
          <div class="font-600 text-[#303133]">{{ row.deviceId ?? '--' }}</div>
          <div class="text-xs text-[#909399]">#{{ row.id }}</div>
        </template>
      </el-table-column>

      <el-table-column label="无人机名称" min-width="220">
        <template #default="{ row }">
          <div class="font-600 text-[#303133]">{{ row.uavName }}</div>
          <div class="text-xs text-[#909399]">{{ row.controllerModel || '控制器型号待上报' }}</div>
        </template>
      </el-table-column>

      <el-table-column label="链路状态" min-width="140">
        <template #default="{ row }">
          <el-tag :type="row.isAvailable === '0' ? 'danger' : (row.isOnline ? 'success' : 'info')" effect="plain">
            {{ getLinkStatusText(row) }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="直播状态" min-width="120">
        <template #default="{ row }">
          <el-tag :type="getLiveStateTagType(row)" effect="plain">
            {{ getLiveStateText(row) }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="运行摘要" min-width="220">
        <template #default="{ row }">
          <div class="text-sm text-[#303133]">{{ getRuntimeSummary(row) }}</div>
        </template>
      </el-table-column>

      <el-table-column label="当前选中" min-width="120">
        <template #default="{ row }">
          <el-tag :type="row.id === activeUavId ? 'primary' : 'info'" effect="plain">
            {{ row.id === activeUavId ? '已选中' : '未选中' }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="操作" fixed="right" min-width="280">
        <template #default="{ row }">
          <div class="flex flex-wrap gap-2">
            <el-button size="small" @click="emit('select', row)">选择</el-button>
            <el-button
              size="small"
              type="primary"
              plain
              :disabled="!row.deviceId || !canStartLive(row)"
              :loading="isPending(row.deviceId)"
              @click="row.deviceId && emit('start-live', row.deviceId)"
            >
              {{ getStartLiveLabel(row) }}
            </el-button>
            <el-button size="small" type="success" plain :disabled="!row.deviceId || row.isAvailable === '0'" @click="emit('enter-operate', row)">
              进入操作
            </el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <div class="flex justify-end">
      <el-pagination
        background
        layout="total, sizes, prev, pager, next"
        :total="total"
        :current-page="page"
        :page-size="pageSize"
        :page-sizes="[6, 8, 12]"
        @current-change="emit('page-change', $event)"
        @size-change="emit('size-change', $event)"
      />
    </div>
  </div>
</template>
