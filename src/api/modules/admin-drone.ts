import {
  apiGet,
  apiPost,
  apiPut,
  expectData,
  type BodyOf,
  type QueryOf,
} from '../contract'
import type { AdminDroneBorrowVo, AdminDroneVo, AdminPageVo } from '../../types/admin'

/** 契约查询参数：GET /admin/drones */
export type AdminDroneListParams = NonNullable<QueryOf<'/admin/drones', 'get'>>

/** 契约写入体：POST/PUT /admin/drones（ProviderDroneDTO） */
export type AdminDroneWrite = BodyOf<'/admin/drones', 'post'>

/** GET /admin/drones：平台租借无人机分页 */
export const getAdminDrones = async (
  params: AdminDroneListParams = {},
): Promise<AdminPageVo<AdminDroneVo>> => {
  const page = expectData(await apiGet('/admin/drones', { params }), '查询无人机失败')
  return { ...page, content: page.content ?? [] }
}

/** POST /admin/drones：登记无人机 */
export const createAdminDrone = async (body: AdminDroneWrite): Promise<AdminDroneVo> =>
  expectData(await apiPost('/admin/drones', { body }), '登记无人机失败')

/** PUT /admin/drones/{droneId}：编辑无人机 */
export const updateAdminDrone = async (
  droneId: string,
  body: AdminDroneWrite,
): Promise<AdminDroneVo> =>
  expectData(
    await apiPut('/admin/drones/{droneId}', { path: { droneId }, body }),
    '编辑无人机失败',
  )

/** POST /admin/drones/{droneId}/enabled：启用/停用 */
export const setAdminDroneEnabled = async (
  droneId: string,
  enabled: boolean,
): Promise<AdminDroneVo> =>
  expectData(
    await apiPost('/admin/drones/{droneId}/enabled', {
      path: { droneId },
      body: { enabled },
    }),
    enabled ? '启用无人机失败' : '停用无人机失败',
  )

/** GET /admin/drones/{droneId}/borrows：借还记录分页 */
export type AdminDroneBorrowListParams = NonNullable<
  QueryOf<'/admin/drones/{droneId}/borrows', 'get'>
>

export const getAdminDroneBorrows = async (
  droneId: string,
  params: AdminDroneBorrowListParams = {},
): Promise<AdminPageVo<AdminDroneBorrowVo>> => {
  const page = expectData(
    await apiGet('/admin/drones/{droneId}/borrows', { path: { droneId }, params }),
    '查询借还记录失败',
  )
  return { ...page, content: page.content ?? [] }
}
