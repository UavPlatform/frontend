<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  Avatar,
  Bell,
  Close,
  DataLine,
  FullScreen,
  HomeFilled,
  Monitor,
  Moon,
  Notebook,
  Search,
  Sunny,
  SwitchButton,
  Tickets,
  User,
} from '@element-plus/icons-vue'
import { logout } from '../api/modules/auth'
import { getStoredSession } from '../api/session'
import { useTheme } from '../composables/useTheme'
import { useFullscreen } from '../composables/useFullscreen'

defineProps<{
  title: string
  subtitle?: string
}>()

const router = useRouter()
const route = useRoute()

const menuItems = [
  { label: '大屏展示', icon: DataLine, route: 'showcase' },
  { label: '首页', icon: HomeFilled, route: 'home' },
  { label: '订单', icon: Tickets, route: 'orders' },
  { label: '用户', icon: User, route: 'users' },
  { label: '飞手', icon: Avatar, route: 'pilots' },
  { label: '系统日志', icon: Notebook, route: 'system' },
]

const MENU_FOR_ROUTE: Record<string, string> = {
  'user-detail': 'users',
  'pilot-detail': 'pilots',
  'order-detail': 'orders',
  'order-supervise': 'orders',
}

const activeRoute = computed(() => {
  const menu = MENU_FOR_ROUTE[String(route.name)] ?? route.name
  return menuItems.find((item) => item.route === menu)?.route ?? 'home'
})

// ---- 已访问界面书签（浏览器式页签） ----
const ROUTE_TITLES: Record<string, string> = {
  showcase: '大屏展示',
  home: '首页',
  orders: '订单',
  users: '用户',
  pilots: '飞手',
  system: '系统日志',
  'order-detail': '订单详情',
  'user-detail': '用户详情',
  'pilot-detail': '飞手详情',
  'order-supervise': '任务监管',
}

interface VisitedTab {
  name: string
  path: string
  title: string
}

const TABS_KEY = 'uav-console-tabs'

const readTabs = (): VisitedTab[] => {
  try {
    const raw = window.localStorage.getItem(TABS_KEY)
    return raw ? (JSON.parse(raw) as VisitedTab[]) : []
  } catch {
    return []
  }
}

const visitedTabs = ref<VisitedTab[]>(readTabs())

const persistTabs = () => {
  window.localStorage.setItem(TABS_KEY, JSON.stringify(visitedTabs.value))
}

const activeTabName = computed(() => String(route.name ?? ''))

const recordTab = () => {
  const name = String(route.name ?? '')
  const title = ROUTE_TITLES[name]
  if (!title) return
  const path = route.fullPath
  const existing = visitedTabs.value.find((tab) => tab.name === name)
  if (existing) {
    existing.path = path
  } else {
    visitedTabs.value.push({ name, path, title })
  }
  persistTabs()
}

watch(() => route.fullPath, recordTab, { immediate: true })

const openTab = (tab: VisitedTab) => {
  void router.push(tab.path).catch(() => undefined)
}

const closeTab = (name: string) => {
  const index = visitedTabs.value.findIndex((tab) => tab.name === name)
  if (index === -1) return
  const wasActive = name === activeTabName.value
  visitedTabs.value.splice(index, 1)
  persistTabs()
  if (wasActive && visitedTabs.value.length > 0) {
    const next = visitedTabs.value[Math.min(index, visitedTabs.value.length - 1)]
    void router.push(next.path).catch(() => undefined)
  }
}

const session = computed(() => getStoredSession())
const userName = computed(() => session.value?.user.displayName ?? '管理员')
const userRole = computed(() => (session.value?.user.role === 'ADMIN' ? '平台管理员' : '监管席位'))

const collapsed = ref(true)

// 悬停展开/收回：加轻微延迟，避免「傻快」——短暂扫过不触发，移开稍停留才收回
let sidebarEnterTimer: ReturnType<typeof setTimeout> | undefined
let sidebarLeaveTimer: ReturnType<typeof setTimeout> | undefined

const onSidebarEnter = () => {
  if (sidebarLeaveTimer !== undefined) {
    clearTimeout(sidebarLeaveTimer)
    sidebarLeaveTimer = undefined
  }
  sidebarEnterTimer = setTimeout(() => {
    collapsed.value = false
  }, 150)
}

const onSidebarLeave = () => {
  if (sidebarEnterTimer !== undefined) {
    clearTimeout(sidebarEnterTimer)
    sidebarEnterTimer = undefined
  }
  sidebarLeaveTimer = setTimeout(() => {
    collapsed.value = true
  }, 300)
}

onBeforeUnmount(() => {
  if (sidebarEnterTimer !== undefined) clearTimeout(sidebarEnterTimer)
  if (sidebarLeaveTimer !== undefined) clearTimeout(sidebarLeaveTimer)
})
const { isDark, toggle } = useTheme()

// 全屏模式：隐藏侧边栏 + 顶栏 + 书签栏，仅保留内容区（大表格/长日志/大屏展示时用）
const { isFullscreen: fullscreen, toggle: toggleFullscreen } = useFullscreen()

const searchKeyword = ref('')
const onSearch = () => {
  const q = searchKeyword.value.trim()
  if (!q) return
  void router.push({ name: 'orders', query: { q } }).catch(() => undefined)
}

const handleMenuSelect = (index: string) => {
  void router.push({ name: index }).catch(() => undefined)
}

const handleLogout = () => {
  logout()
  void router.replace({ name: 'admin-login' })
}
</script>

<template>
  <div class="admin-shell">
    <aside
      v-show="!fullscreen"
      class="sidebar"
      :class="{ 'is-collapsed': collapsed }"
      @mouseenter="onSidebarEnter"
      @mouseleave="onSidebarLeave"
    >
      <div class="sidebar__brand">
        <div class="brand-logo">
          <el-icon><Monitor /></el-icon>
        </div>
        <div v-show="!collapsed" class="brand-text">
          <div class="brand-title">吊运监管</div>
          <div class="brand-sub">Supervision Console</div>
        </div>
      </div>

      <div v-show="!collapsed" class="sidebar__section">导航</div>

      <el-menu
        class="sidebar__menu"
        :default-active="activeRoute"
        :collapse="collapsed"
        :collapse-transition="false"
        background-color="transparent"
        text-color="#94a3b8"
        active-text-color="#ffffff"
        @select="handleMenuSelect"
      >
        <el-menu-item v-for="item in menuItems" :key="item.route" :index="item.route">
          <el-icon><component :is="item.icon" /></el-icon>
          <template #title>{{ item.label }}</template>
        </el-menu-item>
      </el-menu>

      <div class="sidebar__footer">
        <el-avatar :size="collapsed ? 32 : 34" class="sidebar__avatar">
          {{ userName.slice(0, 1) }}
        </el-avatar>
        <div v-show="!collapsed" class="sidebar__user">
          <div class="sidebar__user-name">{{ userName }}</div>
          <div class="sidebar__user-role">{{ userRole }}</div>
        </div>
        <button
          v-show="!collapsed"
          class="sidebar__logout"
          type="button"
          title="退出登录"
          @click="handleLogout"
        >
          <el-icon><SwitchButton /></el-icon>
        </button>
      </div>
    </aside>

    <div class="shell-main">
      <header v-show="!fullscreen" class="topbar">
        <div class="topbar__left">
          <el-breadcrumb separator="/" class="topbar__crumb">
            <el-breadcrumb-item :to="{ name: 'home' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item>{{ title }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>

        <div class="topbar__right">
          <el-input
            v-model="searchKeyword"
            class="topbar__search"
            placeholder="搜索订单 / 任务 / 用户 / 飞手"
            clearable
            @keyup.enter="onSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>

          <el-tooltip content="通知">
            <button class="icon-btn" type="button" aria-label="通知">
              <el-badge is-dot>
                <el-icon><Bell /></el-icon>
              </el-badge>
            </button>
          </el-tooltip>

          <el-tooltip :content="isDark ? '切换亮色' : '切换深色'">
            <button class="icon-btn" type="button" :aria-label="isDark ? '切换亮色' : '切换深色'" @click="toggle">
              <el-icon><component :is="isDark ? Sunny : Moon" /></el-icon>
            </button>
          </el-tooltip>

          <el-tooltip :content="fullscreen ? '退出全屏' : '全屏'">
            <button class="icon-btn" type="button" :aria-label="fullscreen ? '退出全屏' : '全屏'" @click="toggleFullscreen">
              <el-icon><FullScreen /></el-icon>
            </button>
          </el-tooltip>

          <span class="topbar__divider"></span>

          <el-tag class="topbar__duty" effect="plain" round>值守中</el-tag>
          <button class="icon-btn" type="button" aria-label="退出登录" @click="handleLogout">
            <el-icon><SwitchButton /></el-icon>
          </button>
        </div>
      </header>

      <div v-if="visitedTabs.length" v-show="!fullscreen" class="tabsbar">
        <div class="tabsbar__scroll">
          <div
            v-for="tab in visitedTabs"
            :key="tab.name"
            class="tab"
            :class="{ 'tab--active': tab.name === activeTabName }"
            role="button"
            tabindex="0"
            @click="openTab(tab)"
          >
            <span class="tab__title">{{ tab.title }}</span>
            <button
              class="tab__close"
              type="button"
              :aria-label="`关闭 ${tab.title}`"
              @click.stop="closeTab(tab.name)"
            >
              <el-icon><Close /></el-icon>
            </button>
          </div>
        </div>
      </div>

      <main class="content">
        <div v-if="subtitle" class="content__subtitle">{{ subtitle }}</div>
        <slot />
      </main>
    </div>

    <button v-if="fullscreen" class="fullscreen-exit" type="button" @click="toggleFullscreen">
      退出全屏
      <el-icon><Close /></el-icon>
    </button>
  </div>
</template>

<style scoped>
.admin-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* ---------- 侧边栏（恒深色，slate-900） ---------- */
.sidebar {
  width: 240px;
  flex-shrink: 0;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #0f172a;
  color: #cbd5e1;
  border-right: 1px solid #1e293b;
  transition: width 0.25s ease;
}

.sidebar.is-collapsed {
  width: 64px;
}

.sidebar__brand {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 56px;
  padding: 0 16px;
  flex-shrink: 0;
  border-bottom: 1px solid #1e293b;
  overflow: hidden;
}

.brand-logo {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #ffffff;
  font-size: 16px;
  box-shadow: 0 1px 3px rgba(37, 99, 235, 0.4);
}

.brand-text {
  min-width: 0;
  line-height: 1.2;
}

.brand-title {
  font-size: 14px;
  font-weight: 600;
  color: #f1f5f9;
  white-space: nowrap;
  letter-spacing: 0.02em;
}

.brand-sub {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #475569;
  white-space: nowrap;
  margin-top: 1px;
}

.sidebar__section {
  padding: 16px 16px 6px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #475569;
}

/* ---------- 菜单 ---------- */
.sidebar__menu {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  border-right: none;
  padding: 8px;
}

.sidebar__menu:not(.el-menu--collapse) {
  width: 100%;
}

.sidebar__menu .el-menu-item {
  position: relative;
  height: 40px;
  line-height: 40px;
  margin: 1px 0;
  border-radius: 6px;
  color: #94a3b8;
  font-weight: 500;
  font-size: 14px;
}

.sidebar__menu .el-menu-item:hover {
  background: #1e293b;
  color: #e2e8f0;
}

.sidebar__menu .el-menu-item.is-active {
  background: #1e293b;
  color: #ffffff;
  font-size: 15px;
  font-weight: 600;
}

.sidebar__menu .el-menu-item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 18px;
  border-radius: 2px;
  background: var(--brand);
}

.sidebar__menu .el-icon {
  font-size: 17px;
}

/* ---------- 侧边栏底部 ---------- */
.sidebar__footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  flex-shrink: 0;
  border-top: 1px solid #1e293b;
  overflow: hidden;
}

.sidebar__avatar {
  flex-shrink: 0;
  background: #1d4ed8;
  color: #ffffff;
  font-weight: 600;
}

.sidebar__user {
  flex: 1;
  min-width: 0;
}

.sidebar__user-name {
  font-size: 13px;
  font-weight: 500;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar__user-role {
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
}

.sidebar__logout {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font-size: 15px;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.sidebar__logout:hover {
  background: #1e293b;
  color: #e2e8f0;
}

/* ---------- 右侧主列 ---------- */
.shell-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ---------- 顶栏（56px） ---------- */
.topbar {
  height: 56px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 16px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
}

.topbar__left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.topbar__right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.topbar__crumb {
  white-space: nowrap;
  font-size: 13px;
}

.topbar__search {
  width: 248px;
}

.topbar__divider {
  width: 1px;
  height: 20px;
  background: var(--border);
  margin: 0 6px;
}

.topbar__duty {
  --el-tag-text-color: var(--success);
  --el-tag-border-color: var(--success);
  font-weight: 500;
}

.icon-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 17px;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.icon-btn:hover {
  background: var(--bg-sunken);
  color: var(--text-strong);
}

/* ---------- 已访问书签栏 ---------- */
.tabsbar {
  flex-shrink: 0;
  height: 32px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  overflow-y: hidden;
}

.tabsbar__scroll {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 100%;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 0 8px 0 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-sunken);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease;
}

.tab:hover {
  border-color: var(--border-strong);
  color: var(--text-regular);
}

.tab--active {
  background: var(--brand-soft);
  border-color: var(--brand);
  color: var(--brand-strong);
}

.tab__title {
  line-height: 1;
}

.tab__close {
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 0;
  font-size: 12px;
}

.tab__close:hover {
  background: var(--bg-card);
  color: var(--text-strong);
}

/* ---------- 全屏退出按钮 ---------- */
.fullscreen-exit {
  position: fixed;
  top: 12px;
  right: 16px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg-card);
  color: var(--text-regular);
  font-size: 12px;
  cursor: pointer;
  box-shadow: var(--shadow-float);
}

.fullscreen-exit:hover {
  border-color: var(--brand);
  color: var(--brand);
}

/* ---------- 主内容区（唯一滚动） ---------- */
.content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: var(--bg-body);
}

.content__subtitle {
  margin: 0 0 16px;
  font-size: 12px;
  color: var(--text-faint);
}
</style>
