import { computed, ref, watch, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getAdminDispatchOrderDetail } from '../api/modules/admin-dispatch'
import type { AdminDispatchOrderDetail } from '../types/admin'

/**
 * 派单订单详情取数（`/orders/:orderNum` 与全屏 `/supervise` 共用）。
 * 路由参数仍叫 orderNum，值改为派单 UUID（orderId）。
 */
export const useDispatchOrderDetail = (orderId: Ref<string>) => {
  const detail = ref<AdminDispatchOrderDetail>()
  const loading = ref(false)
  const error = ref<{ code?: string; message: string } | null>(null)

  let loadSeq = 0
  const reload = async () => {
    const seq = ++loadSeq
    loading.value = true
    detail.value = undefined
    error.value = null
    if (!orderId.value) {
      loading.value = false
      return
    }
    try {
      const next = await getAdminDispatchOrderDetail(orderId.value)
      if (seq !== loadSeq) return
      detail.value = next
    } catch (err) {
      if (seq === loadSeq) {
        detail.value = undefined
        error.value = {
          code: typeof err === 'object' && err !== null && 'errorCode' in err
            ? String(err.errorCode)
            : undefined,
          message: err instanceof Error ? err.message : '查询派单订单详情失败',
        }
        ElMessage.error(err instanceof Error ? err.message : '查询派单订单详情失败')
      }
    } finally {
      if (seq === loadSeq) loading.value = false
    }
  }

  watch(orderId, reload, { immediate: true })

  const order = computed(() => detail.value?.order)
  const shipper = computed(() => detail.value?.shipper)
  const pilot = computed(() => detail.value?.pilot)
  const timeline = computed(() => detail.value?.timeline ?? [])
  const assignments = computed(() => detail.value?.assignments ?? [])
  const connections = computed(() => detail.value?.connections ?? [])

  /** 作业设备：进行中连机优先，其次订单上的实际执行机身号 */
  const deviceId = computed<string | null | undefined>(() => {
    if (!detail.value) return undefined
    const open = [...(detail.value.connections ?? [])]
      .reverse()
      .find((item) => item.openedAt && !item.endedAt)
    return (
      open?.serialNumber ||
      detail.value.order?.executedDrone?.serialNumber ||
      detail.value.connections?.[detail.value.connections.length - 1]?.serialNumber ||
      null
    )
  })

  const isFlying = computed(() => detail.value?.order?.stage === 'IN_TRANSIT')

  return {
    detail,
    order,
    shipper,
    pilot,
    timeline,
    assignments,
    connections,
    deviceId,
    isFlying,
    loading,
    error,
    reload,
  }
}
