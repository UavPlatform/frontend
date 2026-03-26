<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  DataAnalysis,
  Monitor,
  Operation,
  Setting,
  SwitchButton,
  Warning,
} from '@element-plus/icons-vue'
import { logout } from '../api/modules/auth'
import { getStoredSession } from '../api/session'

defineProps<{
  title: string
  subtitle: string
}>()

const router = useRouter()

const menuItems = [
  { label: '无人机总览', icon: Monitor, active: true },
  { label: '飞行任务', icon: Operation, active: false },
  { label: '视频监控', icon: DataAnalysis, active: false },
  { label: '告警中心', icon: Warning, active: false },
  { label: '系统设置', icon: Setting, active: false },
]

const userName = computed(() => getStoredSession()?.user.displayName ?? '值班管理员')

const handleLogout = () => {
  logout()
  void router.replace({ name: 'login' })
}
</script>

<template>
  <div class="min-h-screen px-4 py-4 md:px-6 md:py-6">
    <div class="mx-auto flex max-w-[1600px] gap-4">
      <aside class="panel-card hidden min-h-[calc(100vh-3rem)] w-[280px] shrink-0 p-5 lg:flex lg:flex-col">
        <div class="rounded-6 bg-[#10233f] p-5 text-white">
          <div class="text-xs uppercase tracking-[0.3em] text-white/60">UAV Console</div>
          <div class="mt-3 text-2xl font-800 tracking-tight">空域指挥台</div>
          <div class="mt-2 text-sm leading-6 text-white/70">
            统一调度无人机状态、指令和运行概况。
          </div>
        </div>

        <div class="mt-5 flex-1 space-y-2">
          <button
            v-for="item in menuItems"
            :key="item.label"
            class="menu-item"
            :class="{ 'menu-item-active': item.active }"
            type="button"
          >
            <el-icon class="text-lg">
              <component :is="item.icon" />
            </el-icon>
            <span>{{ item.label }}</span>
            <el-tag v-if="!item.active" size="small" type="info" effect="plain">规划中</el-tag>
          </button>
        </div>

        <div class="rounded-6 bg-[#f8fafc] p-4">
          <div class="text-sm font-700 text-[#10233f]">{{ userName }}</div>
          <div class="mt-1 text-xs text-[#6b7a90]">控制中心值守席位</div>
        </div>
      </aside>

      <div class="flex min-h-[calc(100vh-3rem)] min-w-0 flex-1 flex-col gap-4">
        <header class="panel-card flex flex-col gap-4 p-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div class="text-3xl font-800 tracking-tight text-[#10233f]">{{ title }}</div>
            <div class="mt-2 max-w-[820px] text-sm leading-6 text-[#6b7a90]">
              {{ subtitle }}
            </div>
          </div>

          <div class="flex flex-col gap-3 md:flex-row md:items-center">
            <slot name="header-extra" />
            <div class="rounded-5 bg-[#eff6ff] px-4 py-3">
              <div class="text-sm font-700 text-[#10233f]">{{ userName }}</div>
              <div class="text-xs text-[#52709a]">空域控制中心 / 值守中</div>
            </div>
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
            class="rounded-full px-4 py-2 text-sm whitespace-nowrap"
            :class="item.active ? 'bg-[#10233f] text-white' : 'bg-[#f1f5f9] text-[#475569]'"
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
  border-radius: 18px;
  padding: 14px 16px;
  background: transparent;
  color: #516178;
  font-size: 14px;
  font-weight: 600;
}

.menu-item-active {
  border-color: rgba(37, 99, 235, 0.16);
  background: linear-gradient(135deg, #eff6ff, #ffffff);
  color: #10233f;
}
</style>
