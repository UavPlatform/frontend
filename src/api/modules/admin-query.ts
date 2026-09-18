import { apiGet, expectData, type QueryOf } from '../contract'
import type { AdminOrderVo, AdminPageVo, AdminTaskVo } from '../../types/admin'

// 1B-5b：运营端业务查询统一走 t25 管理端 API（/admin/orders、/admin/tasks，@RequireRole(2)）
// 请求参数类型直接取自契约（QueryOf），信封与字段见 src/api/contract.ts。

/** 契约查询参数：GET /admin/orders */
export type AdminOrderListParams = NonNullable<QueryOf<'/admin/orders', 'get'>>

/** 契约查询参数：GET /admin/tasks */
export type AdminTaskListParams = NonNullable<QueryOf<'/admin/tasks', 'get'>>

export const getAdminOrders = async (
  params: AdminOrderListParams = {},
): Promise<AdminPageVo<AdminOrderVo>> => {
  const page = expectData(await apiGet('/admin/orders', { params }), '查询订单失败')
  return { ...page, content: page.content ?? [] }
}

export const getAdminOrderDetail = async (orderNum: string): Promise<AdminOrderVo> =>
  expectData(
    await apiGet('/admin/orders/{orderNum}', { path: { orderNum } }),
    '查询订单详情失败',
  )

export const getAdminTasks = async (
  params: AdminTaskListParams = {},
): Promise<AdminPageVo<AdminTaskVo>> => {
  const page = expectData(await apiGet('/admin/tasks', { params }), '查询任务失败')
  return { ...page, content: page.content ?? [] }
}

export const getAdminTaskDetail = async (taskNum: string): Promise<AdminTaskVo> =>
  expectData(await apiGet('/admin/tasks/{taskNum}', { path: { taskNum } }), '查询任务详情失败')

/** 订单状态元数据（契约清单 C5：0-5 全量，补全 4 已完成 / 5 待验收）；label 以后端 orderStatusDesc 为准，此处为回退 */
export const ORDER_STATUS_META: Record<
  number,
  { label: string; tagType: 'warning' | 'success' | 'info' | 'danger' | 'primary' }
> = {
  0: { label: '待支付', tagType: 'warning' },
  1: { label: '已支付', tagType: 'success' },
  2: { label: '已取消', tagType: 'info' },
  3: { label: '已退款', tagType: 'danger' },
  4: { label: '已完成', tagType: 'success' },
  5: { label: '待验收', tagType: 'warning' },
}

/** 任务状态元数据（C5：IDLE/IN_PROGRESS/COMPLETED） */
export const TASK_STATUS_META: Record<
  string,
  { label: string; tagType: 'warning' | 'success' | 'info' | 'danger' | 'primary' }
> = {
  IDLE: { label: '空闲中', tagType: 'info' },
  IN_PROGRESS: { label: '执行中', tagType: 'warning' },
  COMPLETED: { label: '执行完毕', tagType: 'success' },
}
