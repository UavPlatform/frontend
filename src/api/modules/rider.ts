import { apiGet, expectData } from '../contract'
import type { RiderStats } from '../../types/admin'

// 首页「在线飞手」指标的在册飞手数来源：
// 后端暂无管理端飞手列表（TASK-BACKEND-006），/rider/recommended（@RequireRole({0,1,2})，
// 含管理员）返回全量注册飞手（role=1）及完成单统计，是当前唯一可得的飞手全集。

/** GET /rider/recommended：注册飞手列表（按完成任务量降序） */
export const getRegisteredRiders = async (): Promise<RiderStats[]> =>
  expectData(await apiGet('/rider/recommended'), '查询注册飞手失败')
