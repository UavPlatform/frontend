<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import MainLayout from '../layouts/MainLayout.vue'
import {
  getAdminOrderDetail,
  getAdminOrders,
  getAdminTaskDetail,
  getAdminTasks,
  ORDER_STATUS_META,
  TASK_STATUS_META,
} from '../api/modules/admin-query'
import type { AdminOrderVo, AdminTaskVo } from '../types/admin'

// 1B-5b：任务/订单管理视图（Q6=A 旧「航线→下单」流程淘汰，对接 t25 管理端查询 API）

const activeTab = ref<'orders' | 'tasks'>('orders')

// 任务列表懒加载：首次切到任务 tab 时拉取
const taskListLoaded = ref(false)
watch(activeTab, (tab) => {
  if (tab === 'tasks' && !taskListLoaded.value) {
    taskListLoaded.value = true
    void loadTasks()
  }
})

// ==================== 订单查询 ====================
const orders = ref<AdminOrderVo[]>([])
const ordersLoading = ref(false)
const orderTotal = ref(0)
const orderQuery = reactive({
  page: 1,
  pageSize: 10,
  status: '',
  orderNum: '',
  taskNum: '',
})

const orderStatusOptions = Object.entries(ORDER_STATUS_META).map(([code, meta]) => ({
  code,
  label: meta.label,
}))

const loadOrders = async () => {
  ordersLoading.value = true
  try {
    const data = await getAdminOrders({
      page: orderQuery.page - 1,
      size: orderQuery.pageSize,
      status: orderQuery.status || undefined,
      orderNum: orderQuery.orderNum.trim() || undefined,
      taskNum: orderQuery.taskNum.trim() || undefined,
    })
    orders.value = data.content
    orderTotal.value = data.totalElements ?? 0
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '加载订单失败')
  } finally {
    ordersLoading.value = false
  }
}

const handleOrderSearch = () => {
  orderQuery.page = 1
  void loadOrders()
}

const handleOrderReset = () => {
  orderQuery.status = ''
  orderQuery.orderNum = ''
  orderQuery.taskNum = ''
  orderQuery.page = 1
  void loadOrders()
}

const handleOrderPageChange = (page: number) => {
  orderQuery.page = page
  void loadOrders()
}

const handleOrderSizeChange = (size: number) => {
  orderQuery.pageSize = size
  orderQuery.page = 1
  void loadOrders()
}

const orderStatusTagType = (vo: AdminOrderVo) =>
  ORDER_STATUS_META[vo.orderStatusCode ?? -1]?.tagType ?? 'info'

const orderStatusLabel = (vo: AdminOrderVo) =>
  vo.orderStatusDesc ||
  ORDER_STATUS_META[vo.orderStatusCode ?? -1]?.label ||
  String(vo.orderStatusCode ?? '--')

const formatAmount = (value?: number) => `¥${Number(value ?? 0).toFixed(2)}`

const formatDistance = (value?: number) => `${Number(value ?? 0).toFixed(1)} m`

// ==================== 订单详情 ====================
const orderDetailVisible = ref(false)
const orderDetailLoading = ref(false)
const orderDetail = ref<AdminOrderVo>()

const openOrderDetail = async (row: AdminOrderVo) => {
  // 契约里 orderNum 可空（历史数据/异常行），没有订单号就不发请求
  if (!row.orderNum) {
    ElMessage.warning('该订单缺少订单号，无法查看详情')
    return
  }

  orderDetailVisible.value = true
  orderDetailLoading.value = true
  orderDetail.value = undefined
  try {
    orderDetail.value = await getAdminOrderDetail(row.orderNum)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '查询订单详情失败')
    orderDetailVisible.value = false
  } finally {
    orderDetailLoading.value = false
  }
}

// ==================== 任务查询 ====================
const tasks = ref<AdminTaskVo[]>([])
const tasksLoading = ref(false)
const taskTotal = ref(0)
const taskQuery = reactive({
  page: 1,
  pageSize: 10,
  status: '',
  taskNum: '',
})

const taskStatusOptions = Object.entries(TASK_STATUS_META).map(([status, meta]) => ({
  status,
  label: meta.label,
}))

const loadTasks = async () => {
  tasksLoading.value = true
  try {
    const data = await getAdminTasks({
      page: taskQuery.page - 1,
      size: taskQuery.pageSize,
      status: taskQuery.status || undefined,
      taskNum: taskQuery.taskNum.trim() || undefined,
    })
    tasks.value = data.content
    taskTotal.value = data.totalElements ?? 0
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '加载任务失败')
  } finally {
    tasksLoading.value = false
  }
}

const handleTaskSearch = () => {
  taskQuery.page = 1
  void loadTasks()
}

const handleTaskReset = () => {
  taskQuery.status = ''
  taskQuery.taskNum = ''
  taskQuery.page = 1
  void loadTasks()
}

const handleTaskPageChange = (page: number) => {
  taskQuery.page = page
  void loadTasks()
}

const handleTaskSizeChange = (size: number) => {
  taskQuery.pageSize = size
  taskQuery.page = 1
  void loadTasks()
}

const taskStatusTagType = (vo: AdminTaskVo) =>
  TASK_STATUS_META[vo.taskStatus ?? '']?.tagType ?? 'info'

const taskStatusLabel = (vo: AdminTaskVo) =>
  vo.taskStatusDesc || TASK_STATUS_META[vo.taskStatus ?? '']?.label || vo.taskStatus

// ==================== 任务详情 ====================
const taskDetailVisible = ref(false)
const taskDetailLoading = ref(false)
const taskDetail = ref<AdminTaskVo>()

const openTaskDetail = async (row: AdminTaskVo) => {
  // 契约里 taskNum 可空，没有任务号就不发请求
  if (!row.taskNum) {
    ElMessage.warning('该任务缺少任务号，无法查看详情')
    return
  }

  taskDetailVisible.value = true
  taskDetailLoading.value = true
  taskDetail.value = undefined
  try {
    taskDetail.value = await getAdminTaskDetail(row.taskNum)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '查询任务详情失败')
    taskDetailVisible.value = false
  } finally {
    taskDetailLoading.value = false
  }
}

onMounted(() => {
  void loadOrders()
})
</script>

<template>
  <MainLayout title="订单" subtitle="全平台任务与订单状态管理（管理员视图）。">
    <div class="flex flex-col gap-4">
      <el-tabs v-model="activeTab" class="manage-tabs">
        <el-tab-pane label="订单管理" name="orders">
          <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
              <el-select
                v-model="orderQuery.status"
                class="md:!w-[140px]"
                clearable
                placeholder="订单状态"
              >
                <el-option
                  v-for="option in orderStatusOptions"
                  :key="option.code"
                  :label="option.label"
                  :value="option.code"
                />
              </el-select>
              <el-input
                v-model="orderQuery.orderNum"
                class="md:!w-[200px]"
                clearable
                placeholder="订单号"
                @keyup.enter="handleOrderSearch"
              />
              <el-input
                v-model="orderQuery.taskNum"
                class="md:!w-[200px]"
                clearable
                placeholder="任务编号"
                @keyup.enter="handleOrderSearch"
              />
              <el-button type="primary" @click="handleOrderSearch">查询</el-button>
              <el-button @click="handleOrderReset">重置</el-button>
            </div>
            <el-button :loading="ordersLoading" @click="loadOrders">刷新</el-button>
          </div>

          <div class="mt-4">
            <el-table :data="orders" :loading="ordersLoading" border stripe>
              <el-table-column prop="orderNum" label="订单号" min-width="180" />
              <el-table-column prop="taskName" label="任务名称" min-width="160" />
              <el-table-column prop="ownerName" label="下单用户" min-width="110" />
              <el-table-column label="金额" width="110">
                <template #default="scope">
                  {{ formatAmount(scope.row.totalAmount) }}
                </template>
              </el-table-column>
              <el-table-column label="距离" width="110">
                <template #default="scope">
                  {{ formatDistance(scope.row.totalDistance) }}
                </template>
              </el-table-column>
              <el-table-column label="状态" width="120">
                <template #default="scope">
                  <el-tag :type="orderStatusTagType(scope.row)" effect="plain">
                    {{ orderStatusLabel(scope.row) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="createTime" label="创建时间" min-width="170" />
              <el-table-column label="操作" width="90" fixed="right">
                <template #default="scope">
                  <el-button size="small" @click="openOrderDetail(scope.row)">详情</el-button>
                </template>
              </el-table-column>
            </el-table>

            <div class="mt-4 flex justify-center">
              <el-pagination
                background
                layout="total, sizes, prev, pager, next, jumper"
                :total="orderTotal"
                :current-page="orderQuery.page"
                :page-size="orderQuery.pageSize"
                :page-sizes="[10, 20, 50, 100]"
                @current-change="handleOrderPageChange"
                @size-change="handleOrderSizeChange"
              />
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="任务管理" name="tasks">
          <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
              <el-select
                v-model="taskQuery.status"
                class="md:!w-[140px]"
                clearable
                placeholder="任务状态"
              >
                <el-option
                  v-for="option in taskStatusOptions"
                  :key="option.status"
                  :label="option.label"
                  :value="option.status"
                />
              </el-select>
              <el-input
                v-model="taskQuery.taskNum"
                class="md:!w-[200px]"
                clearable
                placeholder="任务编号"
                @keyup.enter="handleTaskSearch"
              />
              <el-button type="primary" @click="handleTaskSearch">查询</el-button>
              <el-button @click="handleTaskReset">重置</el-button>
            </div>
            <el-button :loading="tasksLoading" @click="loadTasks">刷新</el-button>
          </div>

          <div class="mt-4">
            <el-table :data="tasks" :loading="tasksLoading" border stripe>
              <el-table-column prop="taskNum" label="任务编号" min-width="180" />
              <el-table-column prop="taskName" label="任务名称" min-width="150" />
              <el-table-column prop="ownerName" label="发布用户" min-width="110" />
              <el-table-column label="接单飞手" min-width="110">
                <template #default="scope">
                  {{ scope.row.riderName || '--' }}
                </template>
              </el-table-column>
              <el-table-column label="酬劳" width="110">
                <template #default="scope">
                  {{ formatAmount(scope.row.reward) }}
                </template>
              </el-table-column>
              <el-table-column label="任务状态" width="120">
                <template #default="scope">
                  <el-tag :type="taskStatusTagType(scope.row)" effect="plain">
                    {{ taskStatusLabel(scope.row) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="订单状态" width="120">
                <template #default="scope">
                  <el-tag :type="orderStatusTagType(scope.row)" effect="plain">
                    {{ scope.row.orderStatusDesc || '--' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="taskTime" label="任务时间" min-width="170" />
              <el-table-column label="操作" width="90" fixed="right">
                <template #default="scope">
                  <el-button size="small" @click="openTaskDetail(scope.row)">详情</el-button>
                </template>
              </el-table-column>
            </el-table>

            <div class="mt-4 flex justify-center">
              <el-pagination
                background
                layout="total, sizes, prev, pager, next, jumper"
                :total="taskTotal"
                :current-page="taskQuery.page"
                :page-size="taskQuery.pageSize"
                :page-sizes="[10, 20, 50, 100]"
                @current-change="handleTaskPageChange"
                @size-change="handleTaskSizeChange"
              />
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <el-drawer v-model="orderDetailVisible" title="订单详情" size="420px">
      <div v-loading="orderDetailLoading">
        <template v-if="orderDetail">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="订单号">{{ orderDetail.orderNum }}</el-descriptions-item>
            <el-descriptions-item label="任务">{{ orderDetail.taskName }}（{{ orderDetail.taskNum }}）</el-descriptions-item>
            <el-descriptions-item label="下单用户">{{ orderDetail.ownerName }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="orderStatusTagType(orderDetail)" effect="plain">
                {{ orderStatusLabel(orderDetail) }}（{{ orderDetail.orderStatus }} / {{ orderDetail.orderStatusCode }}）
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="金额">{{ formatAmount(orderDetail.totalAmount) }}</el-descriptions-item>
            <el-descriptions-item label="距离">{{ formatDistance(orderDetail.totalDistance) }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ orderDetail.createTime }}</el-descriptions-item>
            <el-descriptions-item label="更新时间">{{ orderDetail.updateTime }}</el-descriptions-item>
          </el-descriptions>
        </template>
      </div>
    </el-drawer>

    <el-drawer v-model="taskDetailVisible" title="任务详情" size="460px">
      <div v-loading="taskDetailLoading">
        <template v-if="taskDetail">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="任务编号">{{ taskDetail.taskNum }}</el-descriptions-item>
            <el-descriptions-item label="任务名称">{{ taskDetail.taskName }}</el-descriptions-item>
            <el-descriptions-item label="发布用户">{{ taskDetail.ownerName }}</el-descriptions-item>
            <el-descriptions-item label="接单飞手">{{ taskDetail.riderName || '--' }}</el-descriptions-item>
            <el-descriptions-item label="任务状态">
              <el-tag :type="taskStatusTagType(taskDetail)" effect="plain">
                {{ taskStatusLabel(taskDetail) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="任务时间">{{ taskDetail.taskTime }}</el-descriptions-item>
            <el-descriptions-item label="酬劳">{{ formatAmount(taskDetail.reward) }}</el-descriptions-item>
            <el-descriptions-item label="任务说明">{{ taskDetail.description || '--' }}</el-descriptions-item>
            <el-descriptions-item label="完成说明">{{ taskDetail.completeNote || '--' }}</el-descriptions-item>
            <el-descriptions-item label="操作提示">{{ taskDetail.actionHint || '--' }}</el-descriptions-item>
            <el-descriptions-item label="关联订单">
              {{ taskDetail.orderNum || '--' }}
              <el-tag
                v-if="taskDetail.orderNum"
                class="ml-2"
                :type="orderStatusTagType(taskDetail)"
                effect="plain"
              >
                {{ taskDetail.orderStatusDesc }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="订单金额">{{ formatAmount(taskDetail.totalAmount) }}</el-descriptions-item>
          </el-descriptions>
        </template>
      </div>
    </el-drawer>
  </MainLayout>
</template>

<style scoped>
.manage-tabs {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
}
</style>
