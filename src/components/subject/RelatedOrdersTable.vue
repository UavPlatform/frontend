<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ORDER_STATUS_META } from '../../api/modules/admin-query'
import type { AdminOrderVo } from '../../types/admin'

/**
 * 关联订单表（用户详情 / 飞手详情共用，REQ-FRONTEND-001 §3.2、§4.2）：
 * 与订单列表同列，行点击 → 订单详情（/orders/:orderNum 双模式详情）。
 */
const props = defineProps<{
  orders: AdminOrderVo[]
  loading?: boolean
  /** 附加统计文案（如飞手的「累计完成 N 单」） */
  hint?: string
}>()

const router = useRouter()

const statusTagType = (vo: AdminOrderVo) =>
  ORDER_STATUS_META[vo.orderStatusCode ?? -1]?.tagType ?? 'info'

const statusLabel = (vo: AdminOrderVo) =>
  vo.orderStatusDesc || ORDER_STATUS_META[vo.orderStatusCode ?? -1]?.label || '--'

const money = (value?: number) => (value != null ? `¥${Number(value).toFixed(2)}` : '—')

const openOrder = (vo: AdminOrderVo) => {
  if (!vo.orderNum) {
    ElMessage.warning('该订单缺少订单号，无法查看详情')
    return
  }
  void router.push({ name: 'order-detail', params: { orderNum: vo.orderNum } }).catch(() => undefined)
}
</script>

<template>
  <section class="panel-card p-5" v-loading="props.loading">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <div class="section-title">关联订单</div>
      <div class="text-xs text-[#909399]">
        <span v-if="props.hint" class="mr-3">{{ props.hint }}</span>
        共 {{ props.orders.length }} 条
      </div>
    </div>

    <el-table
      v-if="props.orders.length"
      class="mt-3"
      :data="props.orders"
      border
      stripe
      @row-click="openOrder"
    >
      <el-table-column prop="orderNum" label="订单号" min-width="180" />
      <el-table-column label="任务" min-width="150">
        <template #default="scope">
          {{ scope.row.taskName || '—' }}
        </template>
      </el-table-column>
      <el-table-column label="金额" width="110">
        <template #default="scope">
          {{ money(scope.row.totalAmount) }}
        </template>
      </el-table-column>
      <el-table-column label="状态" width="130">
        <template #default="scope">
          <el-tag :type="statusTagType(scope.row)" effect="plain">
            {{ statusLabel(scope.row) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" min-width="170">
        <template #default="scope">
          {{ scope.row.createTime || '—' }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="scope">
          <el-button size="small" @click.stop="openOrder(scope.row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-else-if="!props.loading" class="mt-3" :image-size="80" description="暂无关联订单" />
  </section>
</template>

<style scoped>
.section-title {
  font-size: 1.02rem;
  font-weight: 800;
  color: #303133;
}
</style>
