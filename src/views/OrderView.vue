<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import MainLayout from '../layouts/MainLayout.vue'
import { listRoutes, type RouteItem } from '../api/modules/route'
import { createOrder, listOrders, getOrderDetail, cancelOrder, BizError, type OrderItem } from '../api/modules/order'

const route = useRoute()
const router = useRouter()

const activeTab = ref<'create' | 'list'>('create')

// ==================== 创建订单 ====================
const routes = ref<RouteItem[]>([])
const routesLoading = ref(false)
const creatingOrderNum = ref<string | null>(null)

async function loadRoutes() {
  routesLoading.value = true
  try {
    const data = await listRoutes(0, 100)
    routes.value = data.routes
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '加载航线失败')
  } finally {
    routesLoading.value = false
  }
}

async function handleCreateOrder(route: RouteItem) {
  creatingOrderNum.value = route.routeNum
  try {
    const order = await createOrder(route.routeNum)
    ElMessage.success(`订单创建成功，订单号: ${order.orderNum}`)
    activeTab.value = 'list'
    loadOrderList()
  } catch (err) {
    if (err instanceof BizError && err.errorCode === 'ORDER_ALREADY_EXISTS') {
      await ElMessageBox.alert(
        '您当前存在未支付的订单，请先完成支付或取消该订单后再创建新订单。',
        '已有待支付订单',
        { confirmButtonText: '我知道了', type: 'warning' }
      )
      activeTab.value = 'list'
      loadOrderList()
    } else {
      ElMessage.error(err instanceof Error ? err.message : '创建订单失败')
    }
  } finally {
    creatingOrderNum.value = null
  }
}

// ==================== 订单列表 ====================
const orders = ref<OrderItem[]>([])
const ordersLoading = ref(false)
const detailVisible = ref(false)
const detailOrder = ref<OrderItem | null>(null)
const currentPage = ref(0)
const totalPages = ref(0)
const totalElements = ref(0)

async function loadOrderList(page = 0) {
  ordersLoading.value = true
  try {
    const data = await listOrders(page, 10)
    orders.value = data.orders
    currentPage.value = data.currentPage
    totalPages.value = data.totalPages
    totalElements.value = data.totalElements
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '加载订单失败')
  } finally {
    ordersLoading.value = false
  }
}

async function handleShowDetail(orderNum: string) {
  try {
    detailOrder.value = await getOrderDetail(orderNum)
    detailVisible.value = true
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '查询详情失败')
  }
}

async function handleCancelOrder(order: OrderItem) {
  try {
    await ElMessageBox.confirm(`确定取消订单 ${order.orderNum} 吗？`, '确认取消', {
      confirmButtonText: '确定取消',
      cancelButtonText: '再想想',
      type: 'warning',
    })
    await cancelOrder(order.orderNum)
    ElMessage.success('订单已取消')
    loadOrderList(currentPage.value)
  } catch {
    // 用户取消确认
  }
}

function handlePageChange(page: number) {
  loadOrderList(page)
}

const statusMap: Record<number, { label: string; color: string }> = {
  0: { label: '待支付', color: '#e6a23c' },
  1: { label: '已支付', color: '#67c23a' },
  2: { label: '已取消', color: '#909399' },
  3: { label: '已退款', color: '#f56c6c' },
}

onMounted(() => {
  loadRoutes()
  loadOrderList()
  // 从航线规划页跳转过来时自动下单
  const queryRouteNum = route.query.routeNum as string | undefined
  if (queryRouteNum) {
    handleQuickOrder(queryRouteNum)
  }
})

async function handleQuickOrder(routeNum: string) {
  creatingOrderNum.value = routeNum
  try {
    const order = await createOrder(routeNum)
    ElMessage.success(`下单成功，订单号: ${order.orderNum}`)
    activeTab.value = 'list'
    loadOrderList()
  } catch (err) {
    if (err instanceof BizError && err.errorCode === 'ORDER_ALREADY_EXISTS') {
      await ElMessageBox.alert(
        '您当前存在未支付的订单，请先完成支付或取消该订单后再创建新订单。',
        '已有待支付订单',
        { confirmButtonText: '我知道了', type: 'warning' }
      )
      activeTab.value = 'list'
      loadOrderList()
    } else {
      ElMessage.error(err instanceof Error ? err.message : '下单失败')
    }
  } finally {
    creatingOrderNum.value = null
    // 清除 query 参数避免重复触发
    router.replace({ name: 'orders' })
  }
}
</script>

<template>
  <MainLayout title="订单管理" subtitle="选择航线创建订单，或查看已有的订单记录。">
    <div class="order-page">
      <!-- Tab 切换 -->
      <div class="tabs">
        <button :class="{ active: activeTab === 'create' }" @click="activeTab = 'create'">
          创建订单
        </button>
        <button :class="{ active: activeTab === 'list' }" @click="activeTab = 'list'">
          我的订单 ({{ totalElements }})
        </button>
      </div>

      <!-- 创建订单 -->
      <section v-if="activeTab === 'create'" class="panel-card p-5">
        <div class="text-lg font-700 mb-4 text-[#10233f]">选择航线下单</div>
        <div v-if="routesLoading" class="loading-text">加载航线中...</div>
        <div v-else-if="routes.length === 0" class="empty-text">
          暂无可用航线，
          <span class="link" @click="router.push({ name: 'route' })">去创建航线</span>
        </div>
        <div v-else class="route-grid">
          <div v-for="r in routes" :key="r.routeNum" class="route-card">
            <div class="route-name">{{ r.routeName }}</div>
            <div class="route-meta">编号: {{ r.routeNum }}</div>
            <div class="route-meta">无人机: {{ r.djiId }}</div>
            <div class="route-meta">
              航点数: {{ r.waypoints?.length ?? 0 }}
              <span v-if="r.defaultSpeed"> · 速度: {{ r.defaultSpeed }}m/s</span>
              <span v-if="r.defaultHeight"> · 高度: {{ r.defaultHeight }}m</span>
            </div>
            <button
              class="create-btn"
              :disabled="creatingOrderNum === r.routeNum"
              @click="handleCreateOrder(r)"
            >
              {{ creatingOrderNum === r.routeNum ? '创建中...' : '下单' }}
            </button>
          </div>
        </div>
      </section>

      <!-- 订单列表 -->
      <section v-if="activeTab === 'list'" class="panel-card p-5">
        <div v-if="ordersLoading" class="loading-text">加载中...</div>
        <div v-else-if="orders.length === 0" class="empty-text">
          暂无订单，
          <span class="link" @click="activeTab = 'create'">去创建订单</span>
        </div>
        <div v-else>
          <div class="order-table">
            <div class="table-header">
              <span class="col-num">订单号</span>
              <span class="col-route">航线</span>
              <span class="col-amount">金额</span>
              <span class="col-status">状态</span>
              <span class="col-action">操作</span>
            </div>
            <div v-for="o in orders" :key="o.orderNum" class="table-row">
              <span class="col-num mono">{{ o.orderNum }}</span>
              <span class="col-route">{{ o.routeName }}</span>
              <span class="col-amount">¥{{ o.totalAmount }}</span>
              <span class="col-status">
                <span class="status-tag" :style="{ background: statusMap[o.orderStatus]?.color }">
                  {{ statusMap[o.orderStatus]?.label ?? o.orderStatus }}
                </span>
              </span>
              <span class="col-action">
                <button class="action-btn" @click="handleShowDetail(o.orderNum)">详情</button>
                <button
                  v-if="o.orderStatus === 0"
                  class="action-btn danger"
                  @click="handleCancelOrder(o)"
                >
                  取消
                </button>
              </span>
            </div>
          </div>

          <!-- 分页 -->
          <div v-if="totalPages > 1" class="pagination">
            <button :disabled="currentPage <= 0" @click="handlePageChange(currentPage - 1)">
              上一页
            </button>
            <span class="page-info">{{ currentPage + 1 }} / {{ totalPages }}</span>
            <button :disabled="currentPage >= totalPages - 1" @click="handlePageChange(currentPage + 1)">
              下一页
            </button>
          </div>
        </div>
      </section>

      <!-- 订单详情弹窗 -->
      <div v-if="detailVisible" class="modal-overlay" @click.self="detailVisible = false">
        <div class="modal-content">
          <div class="modal-header">
            <span class="modal-title">订单详情</span>
            <button class="modal-close" @click="detailVisible = false">✕</button>
          </div>
          <div v-if="detailOrder" class="modal-body">
            <div class="detail-row"><label>订单号</label><span class="mono">{{ detailOrder.orderNum }}</span></div>
            <div class="detail-row"><label>航线</label><span>{{ detailOrder.routeName }}</span></div>
            <div class="detail-row"><label>无人机</label><span>{{ detailOrder.djiId }}</span></div>
            <div class="detail-row"><label>金额</label><span class="price">¥{{ detailOrder.totalAmount }}</span></div>
            <div class="detail-row"><label>距离</label><span>{{ detailOrder.distance }}m</span></div>
            <div class="detail-row">
              <label>状态</label>
              <span class="status-tag" :style="{ background: statusMap[detailOrder.orderStatus]?.color }">
                {{ statusMap[detailOrder.orderStatus]?.label ?? detailOrder.orderStatus }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </MainLayout>
</template>

<style scoped>
.order-page {
  max-width: 960px;
  margin: 0 auto;
}
.tabs {
  display: flex;
  gap: 0;
  margin-bottom: 20px;
  background: #f5f7fa;
  border-radius: 10px;
  padding: 4px;
}
.tabs button {
  flex: 1;
  padding: 10px 24px;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #606266;
  cursor: pointer;
  transition: all 0.2s;
}
.tabs button.active {
  background: #fff;
  color: #1791fc;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
}
.route-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}
.route-card {
  background: #f8fafc;
  border: 1px solid #ebeef5;
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.route-name {
  font-weight: 700;
  font-size: 15px;
  color: #10233f;
}
.route-meta {
  font-size: 12px;
  color: #909399;
}
.create-btn {
  margin-top: 8px;
  padding: 8px 0;
  border: none;
  border-radius: 8px;
  background: #1791fc;
  color: #fff;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: opacity 0.2s;
}
.create-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.create-btn:not(:disabled):hover {
  background: #4091fc;
}

/* 订单表格 */
.order-table {
  border: 1px solid #ebeef5;
  border-radius: 10px;
  overflow: hidden;
}
.table-header, .table-row {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  gap: 8px;
}
.table-header {
  background: #f8fafc;
  font-size: 12px;
  font-weight: 700;
  color: #909399;
}
.table-row {
  border-top: 1px solid #ebeef5;
  font-size: 13px;
}
.col-num { flex: 2; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-route { flex: 1.5; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-amount { flex: 1; text-align: right; }
.col-status { flex: 0.8; text-align: center; }
.col-action { flex: 1; display: flex; gap: 6px; justify-content: flex-end; }
.mono { font-family: 'Fira Code', 'Consolas', monospace; font-size: 12px; }
.status-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}
.action-btn {
  padding: 4px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
  color: #606266;
  transition: all 0.2s;
}
.action-btn:hover { border-color: #1791fc; color: #1791fc; }
.action-btn.danger:hover { border-color: #f56c6c; color: #f56c6c; }

/* 分页 */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 20px;
}
.pagination button {
  padding: 6px 16px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
}
.pagination button:disabled { opacity: 0.4; cursor: not-allowed; }
.page-info { font-size: 13px; color: #606266; }

/* 弹窗 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
.modal-content {
  background: #fff;
  border-radius: 14px;
  width: 480px;
  max-height: 80vh;
  overflow-y: auto;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #ebeef5;
}
.modal-title { font-size: 16px; font-weight: 700; }
.modal-close { border: none; background: none; font-size: 20px; cursor: pointer; color: #909399; }
.modal-body { padding: 16px 20px; }
.detail-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #f5f7fa;
  font-size: 14px;
}
.detail-row label { color: #909399; }
.price { color: #f56c6c; font-weight: 700; font-size: 16px; }

.loading-text, .empty-text {
  text-align: center;
  padding: 40px 0;
  color: #909399;
  font-size: 14px;
}
.link { color: #1791fc; cursor: pointer; text-decoration: underline; }

.panel-card {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #ebeef5;
}
</style>
