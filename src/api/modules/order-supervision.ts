import { apiGet, apiGetPending, expectData, type Schemas } from '../contract'
import { getAdminComplaints } from './admin-query'
import { getPullCredentials } from './live'
import { getOrderTrajectory } from './uav'
import { summarizeTrajectory, type TelemetrySummary } from '../../utils/telemetry'
import type { AdminComplaint, AdminOrderVo, AdminTaskVo } from '../../types/admin'
import type { LiveCredentials } from '../../types/uav'

/**
 * 订单详情双模式（TASK-FRONTEND-003）的取数与 VO 映射——**撮合渐进字段的唯一消费点**。
 *
 * 契约渐进：TASK-BACKEND-004 在 TaskVo 上新增 matchStatus / quotedAmount / scheduledTime /
 * userConfirmedAt / riderConfirmedAt / cargo* 等字段，本仓 vendor 契约尚未收录（TASK-PLATFORM-001
 * 同步）。因此这些字段一律经 `readMatchFields` 在此读取一次，缺失时上层拿到 undefined 自然降级；
 * 供应商同步后本文件无需改动即生效，调用点不得散落判空。
 */

/** 撮合/货物渐进字段（后端 TaskVo 已返回，vendor 契约未收录 → 类型在此补声明） */
export interface MatchProgressFields {
  matchStatus?: string
  quotedAmount?: number
  scheduledTime?: string
  userConfirmedAt?: string
  riderConfirmedAt?: string
  cargoWeightKg?: number
  cargoCategory?: string
}

/** 任务详情（vendor TaskVo + 待同步的撮合字段），`/task/detail` 的 data */
export type TaskProgressive = Schemas['TaskVo'] & Partial<MatchProgressFields>

/** 应征记录（后端 TaskApplicationVO；vendor 未收录 → 字段以 backend/spec/openapi 为准） */
export interface TaskApplicationVo {
  applicationId?: number
  taskNum?: string
  riderId?: number
  riderName?: string | null
  aircraftModelId?: number
  modelCode?: string | null
  aircraftModelName?: string | null
  maxPayloadKg?: number | null
  /** 平台系统报价（元）；成交价必须与其严格相等（ADR-0003 禁止改价） */
  quotedAmount?: number | null
  status?: string
  matchStatus?: string
  appliedAt?: string | null
}

/** 任务履约证据（后端 `/tasks/{taskNum}/attachments` 的 List<Map> 条目） */
export interface TaskEvidenceVo {
  objectKey?: string
  fileName?: string
  contentType?: string
  sizeBytes?: number
  uploaderId?: number
  createTime?: string
  /** presigned 下载地址（15 分钟有效） */
  downloadUrl?: string
}

export interface TimelineStep {
  key: 'publish' | 'apply' | 'select' | 'pay' | 'confirm' | 'fly' | 'close'
  label: string
  /** 后端未回显该节点时间时为 undefined */
  time?: string
  /** unknown = 数据暂不可用（接口未同步/无权），既非完成也非待办 */
  state: 'done' | 'pending' | 'unknown'
  note?: string
}

export interface PricingView {
  /** 成交金额（=选定应征时锁定的系统报价，ADR-0003 禁止改价） */
  totalAmount?: number
  /** 系统报价：撮合字段优先，其次选定应征记录的 quotedAmount */
  quotedAmount?: number
  /** 任务奖励（服务端按航点距离计价的参考值） */
  reward?: number
  distance?: number
}

/**
 * 撮合渐进字段的**唯一读取点**：从 `/task/detail`（TaskVo）或 `/admin/tasks/{taskNum}`（AdminTaskVo）
 * 任一来源读出新字段；来源没有该字段时保持 undefined。
 */
export const readMatchFields = (
  source: AdminTaskVo | TaskProgressive | undefined,
): MatchProgressFields => {
  if (!source) {
    return {}
  }
  const raw = source as Partial<MatchProgressFields>
  return {
    matchStatus: raw.matchStatus,
    quotedAmount: raw.quotedAmount,
    scheduledTime: raw.scheduledTime,
    userConfirmedAt: raw.userConfirmedAt,
    riderConfirmedAt: raw.riderConfirmedAt,
    cargoWeightKg: raw.cargoWeightKg,
    cargoCategory: raw.cargoCategory,
  }
}

/** GET /task/detail（用户侧任务详情：deviceId + liveState + 撮合字段）；失败/无权 → null 降级 */
export const fetchTaskLiveDetail = async (taskNum: string): Promise<TaskProgressive | null> => {
  try {
    const body = await apiGet('/task/detail', { params: { taskNum } })
    return expectData(body, '查询任务详情失败') as TaskProgressive
  } catch (err) {
    console.warn('[order-supervision] 任务详情（图传上下文）不可用：', err)
    return null
  }
}

/**
 * GET /task/{taskNum}/applications：应征列表（飞手/机型/载重/系统报价/时间）。
 * 契约渐进：端点后端已上线、vendor 未收录 → 走 `apiGetPending`（见 contract.ts 迁移说明）；
 * 端点不可用或无权 → null，区块降级占位。
 */
export const fetchTaskApplications = async (
  taskNum: string,
): Promise<TaskApplicationVo[] | null> => {
  try {
    const envelope = await apiGetPending<TaskApplicationVo[]>(
      '/task/{taskNum}/applications',
      { path: { taskNum } },
    )
    return expectData(envelope, '查询应征列表失败')
  } catch (err) {
    console.warn('[order-supervision] 应征列表不可用：', err)
    return null
  }
}

/** GET /tasks/{taskNum}/attachments：履约证据（presigned 下载地址逐条返回）；失败/无权 → null */
export const fetchTaskEvidence = async (taskNum: string): Promise<TaskEvidenceVo[] | null> => {
  try {
    const body = await apiGet('/tasks/{taskNum}/attachments', { path: { taskNum } })
    // 后端返回 List<Map<String,Object>>；契约类型为索引签名 → 在此一处收敛为证据视图模型
    return expectData(body, '查询证据列表失败') as unknown as TaskEvidenceVo[]
  } catch (err) {
    console.warn('[order-supervision] 证据列表不可用：', err)
    return null
  }
}

/** 争议扫描页数上限（后端投诉列表无 orderNum 过滤；每页 100，最多 500 条） */
const COMPLAINT_SCAN_PAGES = 5

/** GET /admin/complaint/list → 过滤出本订单的投诉；接口失败 → null */
export const fetchOrderComplaints = async (orderNum: string): Promise<AdminComplaint[] | null> => {
  try {
    const matched: AdminComplaint[] = []
    for (let page = 0; page < COMPLAINT_SCAN_PAGES; page += 1) {
      const data = await getAdminComplaints({ page, size: 100 })
      const rows = data.complaints ?? []
      matched.push(...rows.filter((item) => item.orderNum === orderNum))
      if (matched.length > 0 || page + 1 >= (data.totalPages ?? 1)) {
        break
      }
    }
    return matched
  } catch (err) {
    console.warn('[order-supervision] 投诉列表不可用：', err)
    return null
  }
}

/** GET /webUav/trajectory → 遥测摘要（高度/速度/电量/经纬度/最后上报）；失败 → null */
export const fetchOrderTelemetry = async (orderNum: string): Promise<TelemetrySummary | null> => {
  try {
    return summarizeTrajectory(await getOrderTrajectory(orderNum)) ?? null
  } catch (err) {
    console.warn('[order-supervision] 遥测轨迹不可用：', err)
    return null
  }
}

/**
 * 只读拉流凭证（POST /live/get）：仅生成 TRTC 观看凭据，不下发开播/停播命令（ADR-0004 旁听语义）。
 * 设备离线/未开播 → null，图传区降级为提示。
 */
export const fetchWatchCredentials = async (deviceId: string): Promise<LiveCredentials | null> => {
  try {
    return await getPullCredentials(deviceId, '')
  } catch (err) {
    console.warn('[order-supervision] 拉流凭证不可用：', err)
    return null
  }
}

export interface TimelineInput {
  order?: AdminOrderVo
  task?: AdminTaskVo
  match?: MatchProgressFields
  /** null/undefined = 应征数据暂不可用（unknown）；[] = 确实无人应征 */
  applications?: TaskApplicationVo[] | null
}

/**
 * 撮合时间线：发布 → 应征 → 选定 → 支付 → 双确认 → 执飞 → 结案。
 * 每步的完成态与证据全部在此推导（订单状态码 × 任务状态 × 撮合字段），上层只负责渲染。
 */
export const buildMatchTimeline = (input: TimelineInput): TimelineStep[] => {
  const { order, task, match, applications } = input
  const statusCode = order?.orderStatusCode ?? -1
  const hasOrder = Boolean(order)
  const paid = [1, 3, 4, 5, 6].includes(statusCode)
  const cancelled = statusCode === 2
  const closed = statusCode === 4
  const flying = task?.taskStatus === 'IN_PROGRESS'
  const finished = task?.taskStatus === 'COMPLETED'

  const confirmTimes = [match?.userConfirmedAt, match?.riderConfirmedAt].filter(
    (time): time is string => Boolean(time),
  )
  const confirmTime = confirmTimes.sort()[confirmTimes.length - 1]

  const applyTimes = (applications ?? [])
    .map((item) => item.appliedAt)
    .filter((time): time is string => Boolean(time))
    .sort()
  const applyTime = applyTimes[0]

  return [
    {
      key: 'publish',
      label: '发布',
      time: task?.createTime,
      state: task ? 'done' : 'unknown',
    },
    {
      key: 'apply',
      label: '应征',
      time: applyTime,
      state: applications ? (applications.length > 0 ? 'done' : 'pending') : 'unknown',
      note: applications
        ? applications.length > 0
          ? undefined
          : '暂无飞手应征'
        : '应征数据暂不可用',
    },
    {
      key: 'select',
      label: '选定下单',
      time: order?.createTime,
      state: hasOrder ? 'done' : 'pending',
      note: cancelled ? '订单已取消' : undefined,
    },
    {
      key: 'pay',
      label: '支付',
      state: paid ? 'done' : 'pending',
      note: cancelled ? '订单已取消，流程终止' : undefined,
    },
    {
      key: 'confirm',
      label: '双确认',
      time: confirmTime,
      state: confirmTime ? 'done' : flying || finished ? 'done' : 'pending',
      note: confirmTime
        ? undefined
        : flying || finished
          ? '已双确认（确认时间后端未回显）'
          : '待双方确认约定作业时间',
    },
    {
      key: 'fly',
      label: '执飞',
      state: flying || finished ? 'done' : 'pending',
      note: flying ? '执行中' : undefined,
    },
    {
      key: 'close',
      label: '结案',
      state: closed ? 'done' : 'pending',
      note: cancelled ? '订单已取消' : undefined,
    },
  ]
}

export interface PricingInput {
  order?: AdminOrderVo
  task?: AdminTaskVo
  match?: MatchProgressFields
  applications?: TaskApplicationVo[] | null
}

/** 计价视图（金额一律只读展示；ADR-0003：成交价=系统报价，禁止改价） */
export const buildPricing = (input: PricingInput): PricingView => {
  const selected = (input.applications ?? []).find((item) => item.status === 'SELECTED')
  return {
    totalAmount: input.order?.totalAmount ?? undefined,
    quotedAmount: input.match?.quotedAmount ?? selected?.quotedAmount ?? undefined,
    reward: input.task?.reward ?? undefined,
    distance: input.order?.totalDistance ?? undefined,
  }
}
