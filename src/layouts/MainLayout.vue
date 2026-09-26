<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  Avatar,
  HomeFilled,
  Notebook,
  SwitchButton,
  Tickets,
  User,
} from '@element-plus/icons-vue'
import { logout } from '../api/modules/auth'
import { getStoredSession } from '../api/session'

defineProps<{
  title: string
  subtitle?: string
}>()

const router = useRouter()
const route = useRoute()

// REQ-FRONTEND-001：侧边栏四项主导航（首页/订单/用户/飞手），无人机不设一级菜单
const menuItems = [
  { label: '首页', icon: HomeFilled, route: 'home' },
  { label: '订单', icon: Tickets, route: 'orders' },
  { label: '用户', icon: User, route: 'users' },
  { label: '飞手', icon: Avatar, route: 'pilots' },
]

// 次级入口：系统日志（非主监管路径，放页脚）
const secondaryItem = { label: '系统日志', icon: Notebook, route: 'system' }

const userName = computed(() => getStoredSession()?.user.displayName ?? '管理员')

const activeRoute = computed(() => {
  return menuItems.find((item) => item.route === route.name)?.route ?? ''
})

const handleLogout = () => {
  logout()
  void router.replace({ name: 'admin-login' })
}
</script>

<template>
  <div class="min-h-screen px-4 py-4 md:px-6 md:py-6">
    <div class="mx-auto flex max-w-[1600px] gap-4">
      <aside class="panel-card hidden min-h-[calc(100vh-3rem)] w-[260px] shrink-0 p-5 lg:flex lg:flex-col">
        <div class="border-b border-[#ebeef5] pb-5">
          <div class="text-xs uppercase tracking-[0.28em] text-[#909399]">Supervision</div>
          <div class="mt-3 text-2xl font-800 tracking-tight text-[#303133]">吊运监管平台</div>
        </div>

        <div class="mt-5 flex-1 space-y-2">
          <button
            v-for="item in menuItems"
            :key="item.label"
            class="menu-item"
            :class="{ 'menu-item-active': item.route === activeRoute }"
            type="button"
            @click="router.push({ name: item.route })"
          >
            <el-icon class="text-lg">
              <component :is="item.icon" />
            </el-icon>
            <span>{{ item.label }}</span>
          </button>
        </div>

        <div class="border-t border-[#ebeef5] pt-4">
          <button
            class="menu-item"
            :class="{ 'menu-item-active': route.name === secondaryItem.route }"
            type="button"
            @click="router.push({ name: secondaryItem.route })"
          >
            <el-icon class="text-lg">
              <component :is="secondaryItem.icon" />
            </el-icon>
            <span>{{ secondaryItem.label }}</span>
          </button>

          <div class="mt-3 px-3.5">
            <div class="text-sm font-700 text-[#303133]">{{ userName }}</div>
            <div class="mt-1 text-xs text-[#909399]">监管值守席位</div>
          </div>
        </div>
      </aside>

      <div class="flex min-h-[calc(100vh-3rem)] min-w-0 flex-1 flex-col gap-4">
        <header class="panel-card flex flex-col gap-4 p-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div class="text-xs uppercase tracking-[0.24em] text-[#909399]">Supervision</div>
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

        <div class="panel-card flex items-center gap-2 overflow-x-auto p-3 lg:hidden">
          <div
            v-for="item in menuItems"
            :key="item.label"
            class="rounded-full px-4 py-2 text-sm whitespace-nowrap cursor-pointer"
            :class="item.route === activeRoute ? 'bg-[#ecf5ff] text-[#303133]' : 'bg-[#f5f7fa] text-[#606266]'"
            @click="router.push({ name: item.route })"
          >
            {{ item.label }}
          </div>
          <div
            class="rounded-full px-4 py-2 text-sm whitespace-nowrap cursor-pointer"
            :class="route.name === secondaryItem.route ? 'bg-[#ecf5ff] text-[#303133]' : 'bg-transparent text-[#909399]'"
            @click="router.push({ name: secondaryItem.route })"
          >
            {{ secondaryItem.label }}
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
