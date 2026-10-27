import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { getFlightView, type FlightView } from '../api/modules/flight-record'

/** 飞手到场后（含运输中、送达确认中）才可能连机，此时轮询连机状态。 */
export const LIVE_CAPABLE_STAGES = new Set(['PILOT_ARRIVED', 'IN_TRANSIT', 'DELIVERY_CONFIRMATION'])
export const isLiveCapableStage = (stage?: string | null) => LIVE_CAPABLE_STAGES.has(stage ?? '')
export const FLIGHT_CONNECTION_POLL_MS = 5_000

/**
 * 连机即实时（REQ-SUP-MON-007，docs#22）：实时数据是否显示取决于飞机是否连上，而不是订单阶段。
 * 契约 FlightViewVO.connection 是本单最近一次连机记录；未结束（无 endedAt）即视为已连机。
 */
export const isFlightConnected = (view?: FlightView | null) =>
  Boolean(view?.connection && !view.connection.endedAt)

export function useFlightConnection(orderId: Ref<string>, enabled: Ref<boolean>) {
  const connected = ref(false)
  let timer: ReturnType<typeof setInterval> | undefined
  let sequence = 0

  const refresh = async () => {
    const current = ++sequence
    const id = orderId.value
    if (!id) return
    try {
      const view = await getFlightView(id)
      if (current === sequence) connected.value = isFlightConnected(view)
    } catch {
      // 读取失败时保留上一次的连机状态，避免实时区来回闪烁。
    }
  }

  const stop = () => {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
  }

  watch([orderId, enabled], ([, isEnabled], previous) => {
    stop()
    sequence += 1
    if (!previous || previous[0] !== orderId.value || !isEnabled) connected.value = false
    if (!isEnabled || !orderId.value) return
    void refresh()
    timer = setInterval(() => { void refresh() }, FLIGHT_CONNECTION_POLL_MS)
  }, { immediate: true })

  onBeforeUnmount(() => {
    stop()
    sequence += 1
  })

  return { connected, refresh }
}
