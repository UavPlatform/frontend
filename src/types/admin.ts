export interface UavDetail {
  id: number
  uavName: string
  djiId: string
  isAvailable: string
  lastActiveTime: string
  onlineStatus?: string
  uavCreateTime?: string
  controllerModel?: string
}

export interface LiveUav {
  deviceId: string
  uavName: string
  roomId: string
  requestId: string
  updatedAt: number
  onlineStatus: string
  isAvailable: string
}

export interface AdminStatistics {
  totalUavs: number
  onlineUavs: number
  availableUavs: number
  liveUavs: number
  offlineUavs: number
  unavailableUavs: number
  totalUsers: number
}

export interface AdminLoginRequest {
  name: string
  password: string
}

export interface AdminLoginResponse {
  success: boolean
  message: string
  token?: string
  user?: {
    id: number
    name: string
    role: string
  }
}

/** t25 管理端分页信封：page 从 0 起 */
export interface AdminPageVo<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

/** GET /admin/orders、/admin/orders/{orderNum}（t25 AdminOrderVo） */
export interface AdminOrderVo {
  orderNum: string
  userId: number
  ownerName: string
  taskNum: string
  taskName: string
  totalAmount: number
  totalDistance: number
  /** 0 PENDING / 1 PAID / 2 CANCELLED / 3 REFUNDED / 4 COMPLETED / 5 WAITING_CONFIRM（C5） */
  orderStatusCode: number
  orderStatus: string
  orderStatusDesc: string
  createTime: string
  updateTime: string
}

/** GET /admin/tasks、/admin/tasks/{taskNum}（t25 AdminTaskVo） */
export interface AdminTaskVo {
  id: number
  taskNum: string
  taskName: string
  userId: number
  ownerName: string
  taskStatus: string
  taskStatusDesc: string
  taskTime: string
  reward: number
  description: string
  orderNum: string
  orderStatusCode: number
  orderStatus: string
  orderStatusDesc: string
  totalAmount: number
  totalDistance: number
  riderName: string
  completeNote: string
  actionHint: string
  createTime: string
  updateTime: string
}
