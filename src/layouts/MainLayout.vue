<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  DataAnalysis,
  Monitor,
  Operation,
  Setting,
  SwitchButton,
  Warning,
  DocumentCopy,
} from '@element-plus/icons-vue'
import { logout } from '../api/modules/auth'
import { getStoredSession } from '../api/session'

defineProps<{
  title: string
  subtitle?: string
}>()

const router = useRouter()
const route = useRoute()

const menuItems = [
  { label: '无人机总览', icon: Monitor, route: 'dashboard' },
  { label: '历史记录', icon: DocumentCopy, route: 'records' },
  { label: '飞行任务', icon: Operation, route: '' },
  { label: '视频监控', icon: DataAnalysis, route: '' },
  { label: '告警中心', icon: Warning, route: '' },
  { label: '系统设置', icon: Setting, route: '' },
]

const userName = computed(() => getStoredSession()?.user.displayName ?? '值班管理员')

const getActiveItem = () => {
  return menuItems.find(item => item.route === route.name)?.route || 'dashboard'
}

const activeRoute = ref(getActiveItem())

watch(() => route.name, () => {
  activeRoute.value = getActiveItem()
})

const handleLogout = () => {
  logout()
  void router.replace({ name: 'login' })
}
</script>

<template>
  <div class="min-h-screen px-4 py-4 md:px-6 md:py-6">
    <div class="mx-auto flex max-w-[1600px] gap-4">
      <aside class="panel-card hidden min-h-[calc(100vh-3rem)] w-[260px] shrink-0 p-5 lg:flex lg:flex-col">
        <div class="border-b border-[#ebeef5] pb-5">
          <div class="text-xs uppercase tracking-[0.28em] text-[#909399]">UAV Console</div>
          <div class="mt-3 text-2xl font-800 tracking-tight text-[#303133]">空域指挥台</div>
        </div>

        <div class="mt-5 flex-1 space-y-2">
          <button
            v-for="item in menuItems"
            :key="item.label"
            class="menu-item"
            :class="{ 'menu-item-active': item.route === activeRoute }"
            type="button"
            @click="item.route && router.push({ name: item.route })"
            :disabled="!item.route"
          >
            <el-icon class="text-lg">
              <component :is="item.icon" />
            </el-icon>
            <span>{{ item.label }}</span>
            <el-tag v-if="!item.route" size="small" type="info" effect="plain">规划中</el-tag>
          </button>
        </div>

        <div class="border-t border-[#ebeef5] pt-4">
          <div class="text-sm font-700 text-[#303133]">{{ userName }}</div>
          <div class="mt-1 text-xs text-[#909399]">控制中心值守席位</div>
        </div>
      </aside>

      <div class="flex min-h-[calc(100vh-3rem)] min-w-0 flex-1 flex-col gap-4">
        <header class="panel-card flex flex-col gap-4 p-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div class="text-xs uppercase tracking-[0.24em] text-[#909399]">Flight Control</div>
            <div class="mt-2 text-3xl font-800 tracking-tight text-[#303133]">{{ title }}</div>
            <div v-if="subtitle" class="mt-2 text-sm leading-6 text-[#606266]">
              {{ subtitle }}
            </div>
          </div>

          <div class="flex flex-col gap-3 md:flex-row md:items-center">
            <slot name="header-extra" />
            <el-tag effect="plain">值守中</el-tag>
            <el-button type="danger" plain @click="handleLogout">
              <el-icon class="mr-1"><SwitchButton /></el-icon>
              退出登录
            </el-button>
          </div>
        </header>

        <div class="panel-card flex gap-2 overflow-x-auto p-3 lg:hidden">
          <div
            v-for="item in menuItems"
            :key="item.label"
            class="rounded-full px-4 py-2 text-sm whitespace-nowrap cursor-pointer"
            :class="item.route === activeRoute ? 'bg-[#ecf5ff] text-[#303133]' : 'bg-[#f5f7fa] text-[#606266]'"
            @click="item.route && router.push({ name: item.route })"
            :style="!item.route && { cursor: 'not-allowed', opacity: 0.6 }"
          >
            {{ item.label }}
          </div>
        </div>

        <main class="min-w-0 flex-1">
          <slot />
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid transparent;
  border-radius: 12px;
  padding: 12px 14px;
  background: transparent;
  color: #606266;
  font-size: 14px;
  font-weight: 600;
}

.menu-item:hover {
  border-color: #ebeef5;
  background: #f5f7fa;
}

.menu-item-active {
  border-color: #d9ecff;
  background: #ecf5ff;
  color: #303133;
}
</style>
