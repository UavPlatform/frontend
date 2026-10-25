import {
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  expectData,
  expectSuccess,
  type BodyOf,
  type QueryOf,
} from '../contract'
import type { AdminAircraftModelVo, AdminPageVo } from '../../types/admin'

/** 契约查询参数：GET /admin/aircraft-models */
export type AdminAircraftModelListParams = NonNullable<QueryOf<'/admin/aircraft-models', 'get'>>

/** 契约写入体：POST/PUT /admin/aircraft-models */
export type AdminAircraftModelWrite = BodyOf<'/admin/aircraft-models', 'post'>

/** GET /admin/aircraft-models：机型分页（含已停用） */
export const getAdminAircraftModels = async (
  params: AdminAircraftModelListParams = {},
): Promise<AdminPageVo<AdminAircraftModelVo>> => {
  const page = expectData(await apiGet('/admin/aircraft-models', { params }), '查询机型失败')
  return { ...page, content: page.content ?? [] }
}

/** POST /admin/aircraft-models：新增机型 */
export const createAdminAircraftModel = async (
  body: AdminAircraftModelWrite,
): Promise<AdminAircraftModelVo> =>
  expectData(await apiPost('/admin/aircraft-models', { body }), '新增机型失败')

/** PUT /admin/aircraft-models/{modelId}：编辑机型 */
export const updateAdminAircraftModel = async (
  modelId: number,
  body: AdminAircraftModelWrite,
): Promise<AdminAircraftModelVo> =>
  expectData(
    await apiPut('/admin/aircraft-models/{modelId}', { path: { modelId }, body }),
    '编辑机型失败',
  )

/** POST /admin/aircraft-models/{modelId}/enabled：启用/停用 */
export const setAdminAircraftModelEnabled = async (
  modelId: number,
  enabled: boolean,
): Promise<AdminAircraftModelVo> =>
  expectData(
    await apiPost('/admin/aircraft-models/{modelId}/enabled', {
      path: { modelId },
      body: { enabled },
    }),
    enabled ? '启用机型失败' : '停用机型失败',
  )

/** DELETE /admin/aircraft-models/{modelId}：未引用可删；被引用时服务端拒绝 */
export const deleteAdminAircraftModel = async (modelId: number): Promise<void> => {
  expectSuccess(
    await apiDelete('/admin/aircraft-models/{modelId}', { path: { modelId } }),
    '删除机型失败',
  )
}
