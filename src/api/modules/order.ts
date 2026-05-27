import request from '../request'

export interface OrderItem {
  orderNum: string
  totalAmount: number
  distance: number
  djiId: string
  routeName: string
  orderStatus: number // 0=待支付, 1=已支付, 2=已取消, 3=已退款
}

export interface OrderListData {
  orders: OrderItem[]
  currentPage: number
  totalPages: number
  totalElements: number
  message: string
}

interface ApiResponse<T> {
  success: boolean
  code: number
  errorCode: string | null
  message: string | null
  data: T | null
}

export class BizError extends Error {
  errorCode: string
  constructor(errorCode: string, message: string) {
    super(message)
    this.name = 'BizError'
    this.errorCode = errorCode
  }
}

function unwrap<T>(response: { data: ApiResponse<T> }, fallbackMsg: string): T {
  const body = response.data
  if (!body.success || !body.data) {
    throw new BizError(body.errorCode || 'UNKNOWN', body.message || fallbackMsg)
  }
  return body.data
}

export const createOrder = async (routeNum: string): Promise<OrderItem> => {
  const response = await request.post<ApiResponse<OrderItem>>(
    `/order/create?routeNum=${encodeURIComponent(routeNum)}`
  )
  return unwrap(response, '创建订单失败')
}

export const listOrders = async (page = 0, size = 20): Promise<OrderListData> => {
  const response = await request.get<ApiResponse<OrderListData>>(
    `/order/list?page=${page}&size=${size}`
  )
  return unwrap(response, '查询订单失败')
}

export const getOrderDetail = async (orderNum: string): Promise<OrderItem> => {
  const response = await request.get<ApiResponse<OrderItem>>(
    `/order/detail?orderNum=${encodeURIComponent(orderNum)}`
  )
  return unwrap(response, '查询订单详情失败')
}

export const cancelOrder = async (orderNum: string): Promise<void> => {
  const response = await request.post<ApiResponse<null>>(
    `/order/cancel?orderNum=${encodeURIComponent(orderNum)}`
  )
  if (!response.data.success) {
    throw new BizError(response.data.errorCode || 'UNKNOWN', response.data.message || '取消订单失败')
  }
}
