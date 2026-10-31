import {
  apiGet,
  apiPost,
  expectData,
  expectSuccess,
  type BodyOf,
  type QueryOf,
} from '../contract'
import type {
  AdminBorrowApplicationVo,
  AdminPageVo,
  EquipmentNotificationPageVo,
} from '../../types/admin'

/** 契约查询参数：GET /admin/borrow-applications */
export type AdminBorrowApplicationListParams = NonNullable<
  QueryOf<'/admin/borrow-applications', 'get'>
>

/** 契约：POST /admin/borrow-applications/{borrowId}/approve body */
export type BorrowApproveBody = BodyOf<'/admin/borrow-applications/{borrowId}/approve', 'post'>

/** 契约：POST /admin/borrow-applications/{borrowId}/reject body */
export type BorrowRejectBody = BodyOf<'/admin/borrow-applications/{borrowId}/reject', 'post'>

/** 申请状态展示（REQ-SUP-GOV-007） */
export const BORROW_STATUS_META: Record<
  string,
  { label: string; tagType: 'warning' | 'success' | 'info' | 'danger' | 'primary' }
> = {
  PENDING: { label: '待审批', tagType: 'warning' },
  APPROVED: { label: '已借出', tagType: 'success' },
  REJECTED: { label: '已驳回', tagType: 'danger' },
  RETURNED: { label: '已归还', tagType: 'info' },
}

/** GET /admin/borrow-applications：借机申请分页 */
export const getAdminBorrowApplications = async (
  params: AdminBorrowApplicationListParams = {},
): Promise<AdminPageVo<AdminBorrowApplicationVo>> => {
  const page = expectData(
    await apiGet('/admin/borrow-applications', { params }),
    '查询借机申请失败',
  )
  return { ...page, content: page.content ?? [] }
}

/** POST /admin/borrow-applications/{borrowId}/approve：手选或随机指定机身号通过 */
export const approveAdminBorrowApplication = async (
  borrowId: string,
  body: BorrowApproveBody,
) =>
  expectData(
    await apiPost('/admin/borrow-applications/{borrowId}/approve', {
      path: { borrowId },
      body,
    }),
    '通过借机申请失败',
  )

/** POST /admin/borrow-applications/{borrowId}/reject：驳回并写原因 */
export const rejectAdminBorrowApplication = async (
  borrowId: string,
  body: BorrowRejectBody,
) =>
  expectData(
    await apiPost('/admin/borrow-applications/{borrowId}/reject', {
      path: { borrowId },
      body,
    }),
    '驳回借机申请失败',
  )

/** POST /admin/borrow-applications/{borrowId}/restore：误归还改回已借出 */
export const restoreAdminBorrowApplication = async (borrowId: string) =>
  expectData(
    await apiPost('/admin/borrow-applications/{borrowId}/restore', {
      path: { borrowId },
    }),
    '改回已借出失败',
  )

/** GET /equipment/notifications：借机通知（按当前登录角色 audience 隔离） */
export const getEquipmentNotifications = async (
  page = 0,
): Promise<EquipmentNotificationPageVo> => {
  const data = expectData(
    await apiGet('/equipment/notifications', { params: { page: String(page) } }),
    '查询借机通知失败',
  )
  return {
    ...data,
    items: data.items ?? [],
    unreadCount: data.unreadCount ?? 0,
  }
}

/** POST /equipment/notifications/{notificationId}/read */
export const readEquipmentNotification = async (notificationId: string): Promise<void> => {
  expectSuccess(
    await apiPost('/equipment/notifications/{notificationId}/read', {
      path: { notificationId },
    }),
    '标记通知已读失败',
  )
}
