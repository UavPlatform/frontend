<script setup lang="ts">
import type { UavItem } from '../../types/uav'

const props = defineProps<{
  uavs: UavItem[]
  loading: boolean
  total: number
  page: number
  pageSize: number
  activeDeviceId?: string
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

const isPending = (deviceId: string) =>
  props.pendingAction === 'start-live' && props.pendingDeviceId === deviceId
</script>

<template>
  <div class="flex flex-col gap-4">
    <el-table :data="uavs" :loading="loading" border stripe>
      <el-table-column label="设备 ID" min-width="160">
        <template #default="{ row }">
          <div class="font-600 text-[#303133]">{{ row.deviceId }}</div>
          <div class="text-xs text-[#909399]">#{{ row.id }}</div>
        </template>
      </el-table-column>

      <el-table-column label="无人机名称" min-width="220">
        <template #default="{ row }">
          <div class="font-600 text-[#303133]">{{ row.uavName }}</div>
        </template>
      </el-table-column>

      <el-table-column label="状态" min-width="120">
        <template #default="{ row }">
          <el-tag :type="row.isOnline ? 'success' : 'info'" effect="plain">
            {{ row.isOnline ? '在线' : '离线' }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="当前选中" min-width="120">
        <template #default="{ row }">
          <el-tag :type="row.deviceId === activeDeviceId ? 'primary' : 'info'" effect="plain">
            {{ row.deviceId === activeDeviceId ? '已选中' : '未选中' }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="操作" fixed="right" min-width="260">
        <template #default="{ row }">
          <div class="flex flex-wrap gap-2">
            <el-button size="small" @click="emit('select', row)">选择</el-button>
            <el-button
              size="small"
              type="primary"
              plain
              :disabled="!row.isOnline"
              :loading="isPending(row.deviceId)"
              @click="emit('start-live', row.deviceId)"
            >
              启动直播
            </el-button>
            <el-button size="small" type="success" plain @click="emit('enter-operate', row)">
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
