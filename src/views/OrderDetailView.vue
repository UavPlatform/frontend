<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import MainLayout from '../layouts/MainLayout.vue'
import {
  ORDER_STATUS_META,
  TASK_STATUS_META,
  getAdminOrderDetail,
  getAdminTaskDetail,
} from '../api/modules/admin-query'
import type { AdminOrderVo, AdminTaskVo } from '../types/admin'

/**
 * 订单详情（REQ-FRONTEND-001 §2.2）。
 * 双模式 Tab（任务监管 / 订单管理）与全屏 /supervise 由 TASK-FRONTEND-003 承接，
 * 本页先提供订单摘要 + 关联任务（飞手、任务状态、操作提示），
 * 作为订单列表行点击与首页「任务监管」按钮的落点。
 */
const route = useRoute()
const router = useRouter()

const orderNum = computed(() => String(route.params.orderNum ?? ''))
const order = ref<AdminOrderVo>()
const task = ref<AdminTaskVo>()
const loading = ref(false)

let loadSeq = 0
const load = async () => {
  const seq = ++loadSeq
  loading.value = true
  try {
    const detail = await getAdminOrderDetail(orderNum.value)
    if (seq !== loadSeq) return
    order.value = detail

    task.value = undefined
    if (detail.taskNum) {
      // 任务详情用于补齐飞手 / 任务状态 / 操作提示；查不到不阻断摘要展示
      try {
        const taskDetail = await getAdminTaskDetail(detail.taskNum)
        if (seq === loadSeq) task.value = taskDetail
      } catch (err) {
        if (seq === loadSeq) {
          ElMessage.warning(err instanceof Error ? err.message : '查询关联任务失败')
        }
      }
    }
  } catch (err) {
    if (seq === loadSeq) {
      order.value = undefined
      ElMessage.error(err instanceof Error ? err.message : '查询订单详情失败')
    }
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch(orderNum, load, { immediate: true })

const backToList = () => {
  void router.push({ name: 'orders' }).catch(() => undefined)
}

const isFlying = computed(() => task.value?.taskStatus === 'IN_PROGRESS')
const statusTagType = computed(
  () => ORDER_STATUS_META[order.value?.orderStatusCode ?? -1]?.tagType ?? 'info',
)
const statusLabel = computed(
  () =>
    order.value?.orderStatusDesc ||
    ORDER_STATUS_META[order.value?.orderStatusCode ?? -1]?.label ||
    '--',
)
const formatAmount = (value?: number) => `¥${Number(value ?? 0).toFixed(2)}`
const formatDistance = (value?: number) => `${Number(value ?? 0).toFixed(1)} m`
</script>

<template>
  <MainLayout title="订单详情" subtitle="订单摘要与关联任务信息。">
    <section class="panel-card p-5" v-loading="loading">
      <template v-if="order">
        <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div class="flex flex-wrap items-center gap-3">
            <span class="text-xl font-700 text-[#303133]">#{{ order.orderNum }}</span>
            <el-tag :type="statusTagType" effect="plain">{{ statusLabel }}</el-tag>
            <el-tag v-if="isFlying" type="success" effect="dark">飞行中</el-tag>
            <span class="text-lg font-700 text-[#303133]">
              {{ formatAmount(order.totalAmount) }}
            </span>
            <span class="text-sm text-[#606266]">{{ formatDistance(order.totalDistance) }}</span>
          </div>

          <div class="flex items-center gap-2">
            <el-button @click="backToList">返回订单列表</el-button>
          </div>
        </div>

        <el-descriptions class="mt-5" :column="2" border>
          <el-descriptions-item label="订单号">{{ order.orderNum }}</el-descriptions-item>
          <el-descriptions-item label="下单用户">
            {{ order.ownerName || '—' }}
            <span v-if="order.userId" class="ml-1 text-xs text-[#909399]">ID {{ order.userId }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="关联任务">
            {{ order.taskName || '—' }}（{{ order.taskNum || '—' }}）
          </el-descriptions-item>
          <el-descriptions-item label="接单飞手">
            {{ task?.riderName || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="订单状态">
            <el-tag :type="statusTagType" effect="plain">
              {{ statusLabel }}（{{ order.orderStatus }} / {{ order.orderStatusCode }}）
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="任务状态">
            <el-tag v-if="task" :type="TASK_STATUS_META[task.taskStatus ?? '']?.tagType ?? 'info'" effect="plain">
              {{ task.taskStatusDesc || TASK_STATUS_META[task.taskStatus ?? '']?.label || task.taskStatus }}
            </el-tag>
            <span v-else>—</span>
          </el-descriptions-item>
          <el-descriptions-item label="金额">{{ formatAmount(order.totalAmount) }}</el-descriptions-item>
          <el-descriptions-item label="距离">{{ formatDistance(order.totalDistance) }}</el-descriptions-item>
          <el-descriptions-item label="操作提示" :span="2">
            {{ task?.actionHint || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ order.createTime || '—' }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ order.updateTime || '—' }}</el-descriptions-item>
        </el-descriptions>
      </template>

      <el-empty
        v-else-if="!loading"
        description="未查询到该订单（可能订单号不存在）"
      >
        <el-button type="primary" @click="backToList">返回订单列表</el-button>
      </el-empty>
    </section>
  </MainLayout>
</template>
