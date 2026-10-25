import { apiGet, expectData, type QueryOf } from '../contract'
import type { AdminDispatchOrderDetail, AdminDispatchOrderRow, AdminPageVo } from '../../types/admin'

/** 契约查询参数：GET /admin/dispatch/orders */
export type AdminDispatchOrderListParams = NonNullable<QueryOf<'/admin/dispatch/orders', 'get'>>

/** 派单阶段展示（与后端枚举一致） */
export const DISPATCH_STAGE_META: Record<
  string,
  { label: string; tagType: 'warning' | 'success' | 'info' | 'danger' | 'primary' }
> = {
  AWAITING_DEPOSIT: { label: '待付定金', tagType: 'warning' },
  WAITING_ACCEPTANCE: { label: '等待接单', tagType: 'info' },
  PILOT_PREPARING: { label: '飞手准备中', tagType: 'primary' },
  PILOT_ARRIVED: { label: '飞手到场', tagType: 'primary' },
  IN_TRANSIT: { label: '运输中', tagType: 'warning' },
  DELIVERY_CONFIRMATION: { label: '送达确认中', tagType: 'warning' },
  COMPLETED: { label: '已结单', tagType: 'success' },
  CANCELLED: { label: '已取消', tagType: 'info' },
}

/** 资金状态展示 */
export const DISPATCH_FUNDS_META: Record<
  string,
  { label: string; tagType: 'warning' | 'success' | 'info' | 'danger' | 'primary' }
> = {
  UNPAID: { label: '未支付', tagType: 'warning' },
  PAID: { label: '已付定金', tagType: 'success' },
  BALANCE_DUE: { label: '待付尾款', tagType: 'warning' },
  SETTLED: { label: '已结清', tagType: 'success' },
  REFUNDED: { label: '已退款', tagType: 'danger' },
}

export const getAdminDispatchOrders = async (
  params: AdminDispatchOrderListParams = {},
): Promise<AdminPageVo<AdminDispatchOrderRow>> => {
  const page = expectData(await apiGet('/admin/dispatch/orders', { params }), '查询派单订单失败')
  return { ...page, content: page.content ?? [] }
}

export const getAdminDispatchOrderDetail = async (orderId: string): Promise<AdminDispatchOrderDetail> =>
  expectData(
    await apiGet('/admin/dispatch/orders/{orderId}', { path: { orderId } }),
    '查询派单订单详情失败',
  )

/** 运单货物重量（下单申报）：优先 weightMax，其次 weightMin */
export const declaredCargoWeightKg = (fields?: Record<string, string> | null): string | undefined => {
  if (!fields) return undefined
  const raw = fields.weightMax?.trim() || fields.weightMin?.trim()
  return raw || undefined
}
