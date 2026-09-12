import request from '../request'
import { BizError } from './order'
import type { AdminOrderVo, AdminPageVo, AdminTaskVo } from '../../types/admin'

// 1B-5b：运营端业务查询统一走 t25 管理端 API（/admin/orders、/admin/tasks，@RequireRole(2)）
// 契约：AdminPageVo 信封 { content, page(0起), size, totalElements, totalPages }，size 默认 20、上限 100

interface ApiResponse<T> {
  success: boolean
  code?: number
  errorCode?: string | null
  message?: string | null
  data?: T | null
}

const unwrap = <T>(response: { data: ApiResponse<T> }, fallbackMsg: string): T => {
  const body = response.data
  if (!body.success || body.data == null) {
    throw new BizError(body.errorCode || 'UNKNOWN', body.message || fallbackMsg)
  }
  return body.data
}

export interface AdminOrderListParams {
  page?: number
  size?: number
  /** 枚举名（PAID）或状态码（1），t25 两种都支持 */
  status?: string
  orderNum?: string
  taskNum?: string
}

export const getAdminOrders = async (
  params: AdminOrderListParams = {},
): Promise<AdminPageVo<AdminOrderVo>> =>
  unwrap(
    await request.get<ApiResponse<AdminPageVo<AdminOrderVo>>>('/admin/orders', { params }),
    '查询订单失败',
  )

export const getAdminOrderDetail = async (orderNum: string): Promise<AdminOrderVo> =>
  unwrap(
    await request.get<ApiResponse<AdminOrderVo>>(`/admin/orders/${encodeURIComponent(orderNum)}`),
    '查询订单详情失败',
  )

export interface AdminTaskListParams {
  page?: number
  size?: number
  /** IDLE / IN_PROGRESS / COMPLETED */
  status?: string
  taskNum?: string
}

export const getAdminTasks = async (
  params: AdminTaskListParams = {},
): Promise<AdminPageVo<AdminTaskVo>> =>
  unwrap(
    await request.get<ApiResponse<AdminPageVo<AdminTaskVo>>>('/admin/tasks', { params }),
    '查询任务失败',
  )

export const getAdminTaskDetail = async (taskNum: string): Promise<AdminTaskVo> =>
  unwrap(
    await request.get<ApiResponse<AdminTaskVo>>(`/admin/tasks/${encodeURIComponent(taskNum)}`),
    '查询任务详情失败',
  )

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
