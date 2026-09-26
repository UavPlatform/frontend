import { apiGet, apiGetPending, expectData, type QueryOf } from '../contract'
import type {
  AdminComplaintList,
  AdminOrderVo,
  AdminPageVo,
  AdminPilotDetailVo,
  AdminPilotVo,
  AdminTaskVo,
  AdminUserDetailVo,
  AdminUserVo,
} from '../../types/admin'

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

/** 契约查询参数：GET /admin/complaint/list */
export type AdminComplaintListParams = NonNullable<QueryOf<'/admin/complaint/list', 'get'>>

/** GET /admin/complaint/list：投诉分页列表（首页「待处理争议」指标与待办用） */
export const getAdminComplaints = async (
  params: AdminComplaintListParams = {},
): Promise<AdminComplaintList> =>
  expectData(await apiGet('/admin/complaint/list', { params }), '查询投诉列表失败')

/** 订单状态元数据（契约 C5：0-5；补 6 争议中，与 AdminOrderVo.orderStatusCode 契约一致）；label 以后端 orderStatusDesc 为准，此处为回退 */
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
  6: { label: '争议中', tagType: 'danger' },
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

/* ------------------------------------------------------------------
 * 主体查询（TASK-FRONTEND-004：/users、/pilots 列表与详情）
 *
 * 契约渐进：后端 TASK-BACKEND-006 已提供这 4 个端点，本仓 vendor 契约（openapi/）尚未收录
 * → 走 `apiGetPending`，并在契约门禁 tests/unit/openapi-contract.spec.ts 的 PENDING_OPERATIONS 登记。
 * data 类型用单层泛型传入（门禁按 `apiGetPending<…>(` 正则采集调用点，嵌套泛型会漏采）。
 * ------------------------------------------------------------------ */

/** GET /admin/users 查询参数（page 从 0 起；keyword 昵称模糊；status 1 正常 / 0 停用） */
export type AdminUserListParams = {
  page?: number
  size?: number
  keyword?: string
  status?: number
}

/** GET /admin/pilots 查询参数（page 从 0 起；keyword 昵称模糊） */
export type AdminPilotListParams = {
  page?: number
  size?: number
  keyword?: string
}

/** 响应 data 类型（信封由 apiGetPending 的第二个泛型默认补出） */
type AdminUserPageData = AdminPageVo<AdminUserVo>
type AdminPilotPageData = AdminPageVo<AdminPilotVo>

/** GET /admin/users：注册用户分页列表（含名下订单数） */
export const getAdminUsers = async (
  params: AdminUserListParams = {},
): Promise<AdminPageVo<AdminUserVo>> => {
  const page = expectData(
    await apiGetPending<AdminUserPageData>('/admin/users', { params }),
    '查询用户失败',
  )
  return { ...page, content: page.content ?? [] }
}

/** GET /admin/users/{userId}：基本信息 + 关联订单摘要；飞手 ID 或不存在 → 业务错误 */
export const getAdminUserDetail = async (userId: number | string): Promise<AdminUserDetailVo> =>
  expectData(
    await apiGetPending<AdminUserDetailVo>('/admin/users/{userId}', { path: { userId } }),
    '查询用户详情失败',
  )

/** GET /admin/pilots：注册飞手分页列表（含无人机数/在线数/完成单数） */
export const getAdminPilots = async (
  params: AdminPilotListParams = {},
): Promise<AdminPageVo<AdminPilotVo>> => {
  const page = expectData(
    await apiGetPending<AdminPilotPageData>('/admin/pilots', { params }),
    '查询飞手失败',
  )
  return { ...page, content: page.content ?? [] }
}

/** GET /admin/pilots/{userId}：基本信息 + 绑定无人机表 + 关联订单 */
export const getAdminPilotDetail = async (userId: number | string): Promise<AdminPilotDetailVo> =>
  expectData(
    await apiGetPending<AdminPilotDetailVo>('/admin/pilots/{userId}', { path: { userId } }),
    '查询飞手详情失败',
  )
