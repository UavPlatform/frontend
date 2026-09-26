import { clearStoredSession } from '../session'

// 1B-5b（Q7=A）：运营台收敛为管理员单入口——普通用户 /user/login、/user/register 登录注册
// 已随 LoginView 移除；管理员登录见 admin.ts（/admin/login）。
// REQ-FRONTEND-001：用户直播观看历史（/user/records）随 RecordsView 一并移除。

export const logout = () => {
  clearStoredSession()
}
