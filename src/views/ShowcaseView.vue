<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getAdminStatistics } from '../api/modules/admin'
import { getAdminOrders, getAdminTasks, getAdminPilots } from '../api/modules/admin-query'
import type { AdminStatistics, AdminOrderVo, AdminTaskVo, AdminPilotVo } from '../types/admin'
import { formatClock } from '../utils/date'
import {
  ArrowLeft,
  ArrowRight,
  Avatar,
  FullScreen,
  Odometer,
  Position,
  Tickets,
} from '@element-plus/icons-vue'
import MainLayout from '../layouts/MainLayout.vue'
import { useFullscreen } from '../composables/useFullscreen'

/**
 * 数据大屏展示（轮播）：
 * 4 屏展示实际平台统计及最新任务、订单、飞手，每 5 秒自动切换，可手动刷新。
 */
const slides = [
  { key: 'overview', title: '平台总览', subtitle: '全平台关键指标一览', icon: Odometer },
  { key: 'flight', title: '飞行实况', subtitle: '执行中任务与关联订单', icon: Position },
  { key: 'order', title: '订单监控', subtitle: '订单流转与履约状态', icon: Tickets },
  { key: 'pilot', title: '飞手调度', subtitle: '在册飞手与完成单统计', icon: Avatar },
]

const current = ref(0)
const INTERVAL_MS = 5000
const loading = ref(false)
const error = ref('')
const updatedAt = ref('—')
const statistics = ref<AdminStatistics>()
const tasks = ref<AdminTaskVo[]>([])
const orders = ref<AdminOrderVo[]>([])
const pilots = ref<AdminPilotVo[]>([])
const overview = computed(() => [
  { label: '无人机总数', value: statistics.value?.totalUavs },
  { label: '在线无人机', value: statistics.value?.onlineUavs },
  { label: '可用无人机', value: statistics.value?.availableUavs },
  { label: '直播中无人机', value: statistics.value?.liveUavs },
])
let loadSeq = 0
const refresh = async () => {
  const seq = ++loadSeq
  loading.value = true
  error.value = ''
  try {
    const [stats, taskPage, orderPage, pilotPage] = await Promise.all([
      getAdminStatistics(), getAdminTasks({ page: 0, size: 10, status: 'IN_PROGRESS' }),
      getAdminOrders({ page: 0, size: 10 }), getAdminPilots({ page: 0, size: 10 }),
    ])
    if (seq !== loadSeq) return
    statistics.value = stats
    tasks.value = taskPage.content
    orders.value = orderPage.content
    pilots.value = pilotPage.content
    updatedAt.value = formatClock()
  } catch (err) {
    if (seq === loadSeq) error.value = err instanceof Error ? err.message : '加载大屏数据失败'
  } finally { if (seq === loadSeq) loading.value = false }
}

const { isFullscreen, toggle: toggleFullscreen } = useFullscreen()

let timer: ReturnType<typeof setInterval> | undefined

const stop = () => {
  if (timer !== undefined) {
    clearInterval(timer)
    timer = undefined
  }
}

const start = () => {
  stop()
  timer = setInterval(() => {
    current.value = (current.value + 1) % slides.length
  }, INTERVAL_MS)
}

const goTo = (index: number) => {
  current.value = index
  start()
}

const next = () => goTo((current.value + 1) % slides.length)
const prev = () => goTo((current.value - 1 + slides.length) % slides.length)

onMounted(() => { start(); void refresh() })
onBeforeUnmount(() => { stop(); loadSeq += 1 })
</script>

<template>
  <MainLayout title="大屏展示" subtitle="数据大屏轮播：每 5 秒自动切换，悬停可暂停，下方圆点可手动跳转。">
    <div class="showcase" @mouseenter="stop" @mouseleave="start">
      <div class="flex items-center justify-between">
        <span class="text-sm">更新于 {{ updatedAt }} · 列表展示最新 10 条，完整数据请进入对应管理页</span>
        <el-button :loading="loading" @click="refresh">刷新数据</el-button>
      </div>
      <el-alert v-if="error" :title="error + '，请刷新重试。已有数据可能已过期。'" type="error" :closable="false" />
      <div class="showcase__viewport">
        <div class="showcase__track" :style="{ transform: `translateX(-${current * 100}%)` }">
          <section
            v-for="(slide, i) in slides"
            :key="slide.key"
            class="slide"
            :class="`slide--${slide.key}`"
          >
            <div class="slide__head">
              <span class="slide__icon">
                <el-icon><component :is="slide.icon" /></el-icon>
              </span>
              <div class="slide__titles">
                <div class="slide__title">{{ slide.title }}</div>
                <div class="slide__subtitle">{{ slide.subtitle }}</div>
              </div>
              <span class="slide__index tabular-nums">
                {{ String(i + 1).padStart(2, '0') }} / {{ String(slides.length).padStart(2, '0') }}
              </span>
            </div>

            <div class="slide__body" v-loading="loading">
              <div v-if="slide.key === 'overview'" class="overview-grid">
                <div v-for="metric in overview" :key="metric.label" class="overview-metric">
                  <span>{{ metric.label }}</span><strong>{{ metric.value ?? '—' }}</strong>
                </div>
              </div>
              <el-table v-else-if="slide.key === 'flight'" :data="tasks" height="100%" empty-text="暂无执行中任务">
                <el-table-column prop="taskNum" label="任务编号" min-width="160" />
                <el-table-column prop="taskName" label="任务名称" min-width="160" />
                <el-table-column prop="riderName" label="飞手" min-width="120" />
                <el-table-column prop="orderNum" label="订单号" min-width="160" />
              </el-table>
              <el-table v-else-if="slide.key === 'order'" :data="orders" height="100%" empty-text="暂无订单">
                <el-table-column prop="orderNum" label="订单号" min-width="160" />
                <el-table-column prop="taskName" label="任务名称" min-width="160" />
                <el-table-column prop="ownerName" label="下单用户" min-width="120" />
                <el-table-column prop="orderStatusDesc" label="状态" min-width="120" />
              </el-table>
              <el-table v-else :data="pilots" height="100%" empty-text="暂无在册飞手">
                <el-table-column prop="userId" label="飞手 ID" min-width="120" />
                <el-table-column prop="userName" label="昵称" min-width="160" />
                <el-table-column prop="completedCount" label="累计完成单" min-width="120" />
              </el-table>
            </div>
          </section>
        </div>
      </div>

      <div class="showcase__controls">
        <button class="arrow" type="button" aria-label="上一屏" @click="prev">
          <el-icon><ArrowLeft /></el-icon>
        </button>
        <div class="dots">
          <button
            v-for="(slide, i) in slides"
            :key="slide.key"
            type="button"
            class="dot"
            :class="{ 'dot--active': i === current }"
            :aria-label="`第 ${i + 1} 屏`"
            @click="goTo(i)"
          ></button>
        </div>
        <button class="arrow" type="button" aria-label="下一屏" @click="next">
          <el-icon><ArrowRight /></el-icon>
        </button>
        <el-button size="small" class="showcase__fullscreen" @click="toggleFullscreen">
          <el-icon class="mr-1"><FullScreen /></el-icon>
          {{ isFullscreen ? '退出全屏' : '一键全屏' }}
        </el-button>
      </div>
    </div>
  </MainLayout>
</template>

<style scoped>
.overview-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; width: 100%; }
.overview-metric { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; background: var(--bg-sunken); border-radius: 12px; }
.overview-metric strong { font-size: clamp(30px, 4vw, 60px); color: var(--brand); }
.showcase {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.showcase__viewport {
  overflow: hidden;
  border-radius: var(--radius-card);
  height: calc(100vh - 240px);
  min-height: 460px;
  max-height: 760px;
}

.showcase__track {
  display: flex;
  height: 100%;
  transition: transform 0.55s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide {
  flex: 0 0 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  border-top: 3px solid transparent;
}

.slide--overview { border-top-color: var(--kpi-flying); }
.slide--flight { border-top-color: var(--kpi-today); }
.slide--order { border-top-color: var(--kpi-dispute); }
.slide--pilot { border-top-color: var(--kpi-pilot); }

.slide__head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}

.slide__icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  font-size: 22px;
}

.slide--overview .slide__icon { background: var(--kpi-flying-soft); color: var(--kpi-flying); }
.slide--flight .slide__icon { background: var(--kpi-today-soft); color: var(--kpi-today); }
.slide--order .slide__icon { background: var(--kpi-dispute-soft); color: var(--kpi-dispute); }
.slide--pilot .slide__icon { background: var(--kpi-pilot-soft); color: var(--kpi-pilot); }

.slide__titles {
  min-width: 0;
}

.slide__title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-strong);
}

.slide__subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.slide__index {
  margin-left: auto;
  font-size: 13px;
  color: var(--text-faint);
}

.slide__body {
  flex: 1;
  display: flex;
  padding: 16px;
  min-height: 0;
}

.slide__placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-inner);
  background: var(--bg-sunken);
  color: var(--text-faint);
}

.slide__placeholder-icon {
  font-size: 34px;
  opacity: 0.5;
}

.slide__placeholder-text {
  font-size: 13px;
  letter-spacing: 0.06em;
}

.showcase__controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.showcase__fullscreen {
  margin-left: 12px;
}

.arrow {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 15px;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.arrow:hover {
  border-color: var(--brand);
  color: var(--brand);
}

.dots {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dot {
  width: 8px;
  height: 8px;
  border: none;
  border-radius: 4px;
  background: var(--border-strong);
  padding: 0;
  cursor: pointer;
  transition: width 0.2s ease, background-color 0.2s ease;
}

.dot--active {
  width: 22px;
  background: var(--brand);
}
</style>
