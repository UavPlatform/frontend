import type { Schemas } from '../api/contract'

// 管理端视图模型：字段一律来自 OpenAPI 契约生成的 Schemas，禁止手写重复声明。
// 例外见文件末尾「契约渐进 VO」：后端已上线、本仓 vendor 契约（openapi/）尚未收录的端点，
// 其 VO 在此手工声明并标注 backend/spec 来源（与 order-supervision.ts 的渐进字段同一约定）。

/** 契约 Uav：GET /admin/uav 列表项 */
export type UavDetail = Schemas['Uav']

/** 契约 LiveUavVO：GET /admin/uav/live */
export type LiveUav = Schemas['LiveUavVO']

/** 契约 AdminStatisticsVO：GET /admin/uav/statistics */
export type AdminStatistics = Schemas['AdminStatisticsVO']

/** 契约 AdminDto：POST /admin/login 请求体 */
export type AdminLoginRequest = Schemas['AdminDto']

/** 契约 AdminLoginVO：POST /admin/login 的 data */
export type AdminLoginResult = Schemas['AdminLoginVO']

/** 契约 AdminOrderVo：GET /admin/orders、/admin/orders/{orderNum} */
export type AdminOrderVo = Schemas['AdminOrderVo']

/** 契约 AdminTaskVo：GET /admin/tasks、/admin/tasks/{taskNum} */
export type AdminTaskVo = Schemas['AdminTaskVo']

/** 契约分页信封：后端按泛型实例化成多个 schema，前端用映射类型收敛为一个泛型 */
export type AdminPageVo<T> = Omit<Schemas['AdminPageVoAdminOrderVo'], 'content'> & {
  content: T[]
}

/** 契约 OrderComplaint：GET /admin/complaint/list 列表项 */
export type AdminComplaint = Schemas['OrderComplaint']

/** 契约 ComplaintListVO：GET /admin/complaint/list 的 data */
export type AdminComplaintList = Schemas['ComplaintListVO']

/** 契约 GpsPointVO：GET /webUav/trajectory 的点位（遥测摘要数据源） */
export type OrderGpsPoint = Schemas['GpsPointVO']

/** 契约 RiderStatsVO：GET /rider/recommended 列表项（首页在册飞手数） */
export type RiderStats = Schemas['RiderStatsVO']

/* ------------------------------------------------------------------
 * 契约渐进 VO（TASK-FRONTEND-004 主体页）：
 * 后端 TASK-BACKEND-006 已上线 /admin/users、/admin/pilots 系列端点，
 * 本仓 vendor 契约（openapi/）尚未同步 → 字段以
 * backend/spec/openapi/drone-backend.openapi.json 的 Admin*Vo 为准，vendor 同步后删除本段。
 * ------------------------------------------------------------------ */

/** 契约 AdminUserVo：GET /admin/users 列表项（注册普通用户 role=0） */
export interface AdminUserVo {
  userId?: number
  userName?: string
  /** 账号状态（1 正常 / 0 停用） */
  status?: number
  /** 名下订单总数 */
  orderCount?: number
}

/** 契约 AdminUserDetailVo：GET /admin/users/{userId}（飞手不走本详情） */
export interface AdminUserDetailVo {
  userId?: number
  userName?: string
  /** 角色（0 普通用户 / 2 管理员） */
  role?: number
  status?: number
  /** 关联订单（按创建时间倒序） */
  orders?: AdminOrderVo[]
}

/** 契约 AdminPilotVo：GET /admin/pilots 列表项（注册飞手 role=1） */
export interface AdminPilotVo {
  userId?: number
  userName?: string
  status?: number
  /** 绑定无人机数（rider_uav 记录数） */
  uavCount?: number
  /** 在线无人机数（online_status=1 的绑定设备） */
  onlineUavCount?: number
  /** 累计完成单数（接单记录 complete_time 非空） */
  completedCount?: number
}

/** 契约 AdminPilotDroneVo：飞手详情绑定无人机表项（djiId + 机型 + 在线 + 可用） */
export interface AdminPilotDroneVo {
  djiId?: string
  /** 机型ID（未映射时为 null） */
  aircraftModelId?: number
  /** 机型显示名（未映射时为 null） */
  modelName?: string | null
  /** 是否在线（无设备档案为 false） */
  online?: boolean
  /** 是否可用/启用（设备未注册时为 null → 不可启停） */
  available?: boolean | null
}

/** 契约 AdminPilotDetailVo：GET /admin/pilots/{userId}（绑定无人机 + 关联订单） */
export interface AdminPilotDetailVo {
  userId?: number
  userName?: string
  /** 角色（恒为 1 飞手） */
  role?: number
  status?: number
  completedCount?: number
  /** 绑定无人机表（无绑定为空数组） */
  drones?: AdminPilotDroneVo[]
  /** 关联订单（按创建时间倒序） */
  orders?: AdminOrderVo[]
}
