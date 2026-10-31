<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Bell } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import {
  getEquipmentNotifications,
  readEquipmentNotification,
} from '../api/modules/admin-borrow'
import type { EquipmentNotificationVo } from '../types/admin'

/**
 * 顶栏借机通知铃铛（REQ-SUP-GOV-007 / REQ-ALL-XC-005 最小可用）：
 * 拉 /equipment/notifications，未读角标，点击标记已读并跳转借机审批。
 */
const router = useRouter()

const open = ref(false)
const loading = ref(false)
const items = ref<EquipmentNotificationVo[]>([])
const unreadCount = ref(0)
let pollTimer: ReturnType<typeof setInterval> | null = null
let loadSeq = 0

const when = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

const load = async () => {
  const seq = ++loadSeq
  loading.value = true
  try {
    const page = await getEquipmentNotifications(0)
    if (seq !== loadSeq) return
    items.value = page.items ?? []
    unreadCount.value = page.unreadCount ?? 0
  } catch {
    // 顶栏静默：登录页/瞬时失败不打断操作
    if (seq === loadSeq) {
      items.value = []
    }
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

const onClickItem = async (item: EquipmentNotificationVo) => {
  if (item.notificationId && !item.readAt) {
    try {
      await readEquipmentNotification(item.notificationId)
      item.readAt = new Date().toISOString()
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    } catch (err) {
      ElMessage.error(err instanceof Error ? err.message : '标记已读失败')
    }
  }
  open.value = false
  const status =
    item.kind === 'BORROW_PENDING'
      ? 'PENDING'
      : item.kind === 'BORROW_RETURNED'
        ? 'RETURNED'
        : undefined
  void router
    .push({
      name: 'borrow-applications',
      query: status ? { status } : {},
    })
    .catch(() => undefined)
}

onMounted(() => {
  // 组件测挂 MainLayout 时不打真实网络；生产仍进页拉未读角标
  if (import.meta.env.MODE === 'test') return
  void load()
  pollTimer = setInterval(() => {
    void load()
  }, 60_000)
})

onBeforeUnmount(() => {
  loadSeq += 1
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <el-popover
    v-model:visible="open"
    placement="bottom-end"
    :width="360"
    trigger="click"
    @show="() => void load()"
  >
    <template #reference>
      <button
        class="icon-btn notification-bell"
        type="button"
        aria-label="借机通知"
        data-testid="equipment-notification-bell"
      >
        <el-badge :value="unreadCount" :hidden="unreadCount <= 0" :max="99">
          <el-icon :size="18"><Bell /></el-icon>
        </el-badge>
      </button>
    </template>

    <div class="notification-panel" data-testid="equipment-notification-panel">
      <div class="notification-panel__head">
        <span>借机通知</span>
        <el-button link type="primary" :loading="loading" @click="load">刷新</el-button>
      </div>
      <div v-loading="loading" class="notification-panel__list">
        <button
          v-for="item in items"
          :key="item.notificationId"
          type="button"
          class="notification-item"
          :class="{ 'notification-item--unread': !item.readAt }"
          :data-testid="`equipment-notification-${item.notificationId}`"
          @click="onClickItem(item)"
        >
          <div class="notification-item__title">{{ item.title || '借机通知' }}</div>
          <div class="notification-item__body">{{ item.body }}</div>
          <div class="notification-item__meta">{{ when(item.createdAt) }}</div>
        </button>
        <el-empty v-if="!loading && items.length === 0" description="暂无借机通知" :image-size="56" />
      </div>
    </div>
  </el-popover>
</template>

<style scoped>
.notification-bell :deep(.el-badge__content) {
  transform: translateY(-2px) translateX(6px);
}

.notification-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-strong);
}

.notification-panel__list {
  max-height: 360px;
  overflow: auto;
}

.notification-item {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  border-radius: 8px;
  background: transparent;
  padding: 10px 8px;
  cursor: pointer;
  color: inherit;
}

.notification-item:hover {
  background: var(--el-fill-color-light);
}

.notification-item--unread {
  background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
}

.notification-item__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-strong);
}

.notification-item__body {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.notification-item__meta {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-faint);
}
</style>
