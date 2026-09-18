import type { Schemas } from '../api/contract'

// 管理端视图模型：字段一律来自 OpenAPI 契约生成的 Schemas，禁止手写重复声明。

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
