import { computed, ref, watch, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getAdminOrderDetail, getAdminTaskDetail } from '../api/modules/admin-query'
import {
  fetchTaskLiveDetail,
  readMatchFields,
  type MatchProgressFields,
  type TaskProgressive,
} from '../api/modules/order-supervision'
import type { AdminOrderVo, AdminTaskVo } from '../types/admin'

export interface OrderDetailState {
  order: Ref<AdminOrderVo | undefined>
  task: Ref<AdminTaskVo | undefined>
  /** `/task/detail`（含 deviceId / liveState / 撮合字段）；null = 不可用（无权或未回显） */
  liveDetail: Ref<TaskProgressive | null | undefined>
  /**
   * 作业设备（契约 deviceId 字段，后端解析链 task → task_assignment → rider_uav → 在线设备）：
   * 任务详情 → 管理端任务 → 订单 三级回退。
   * undefined = 上游仍在解析；null = 解析完成但该任务无作业设备（未接单 / 未绑定设备 / 设备离线）。
   */
  deviceId: Ref<string | null | undefined>
  /** 撮合字段（liveDetail 优先，退回管理端任务 VO）——唯一读取点在 order-supervision */
  match: Ref<MatchProgressFields>
  loading: Ref<boolean>
  reload: () => Promise<void>
}

/**
 * 订单详情取数（`/orders/:orderNum` 与全屏 `/supervise` 共用）：
 * 订单 → 关联任务（管理端 VO）→ 任务详情（图传上下文与撮合字段），逐级失败不阻断上层展示。
 */
export const useOrderDetail = (orderNum: Ref<string>): OrderDetailState => {
  const order = ref<AdminOrderVo>()
  const task = ref<AdminTaskVo>()
  const liveDetail = ref<TaskProgressive | null>()
  const loading = ref(false)

  let loadSeq = 0
  const reload = async () => {
    const seq = ++loadSeq
    loading.value = true
    try {
      const detail = await getAdminOrderDetail(orderNum.value)
      if (seq !== loadSeq) return
      order.value = detail

      task.value = undefined
      liveDetail.value = undefined
      if (detail.taskNum) {
        // 任务详情补齐飞手/操作提示，任务详情（用户侧）补齐图传上下文；两者查不到均不阻断摘要
        const [taskDetail, live] = await Promise.all([
          getAdminTaskDetail(detail.taskNum).catch((err: unknown) => {
            ElMessage.warning(err instanceof Error ? err.message : '查询关联任务失败')
            return undefined
          }),
          fetchTaskLiveDetail(detail.taskNum),
        ])
        if (seq !== loadSeq) return
        task.value = taskDetail
        liveDetail.value = live
      }
    } catch (err) {
      if (seq === loadSeq) {
        order.value = undefined
        task.value = undefined
        liveDetail.value = undefined
        ElMessage.error(err instanceof Error ? err.message : '查询订单详情失败')
      }
    } finally {
      if (seq === loadSeq) loading.value = false
    }
  }

  watch(orderNum, reload, { immediate: true })

  const deviceId = computed<string | null | undefined>(() => {
    // 任务详情是图传上下文的第一来源；未回显时退回管理端任务与订单的契约 deviceId
    if (liveDetail.value) {
      return liveDetail.value.deviceId ?? task.value?.deviceId ?? order.value?.deviceId ?? null
    }
    if (liveDetail.value === null) {
      return task.value?.deviceId ?? order.value?.deviceId ?? null
    }
    // 详情仍未回显：订单没有关联任务时不会发起详情查询，直接取订单上的作业设备
    if (order.value && !order.value.taskNum) {
      return order.value.deviceId ?? null
    }
    return undefined
  })

  return {
    order,
    task,
    liveDetail,
    deviceId,
    match: computed(() => readMatchFields(liveDetail.value ?? task.value)),
    loading,
    reload,
  }
}
