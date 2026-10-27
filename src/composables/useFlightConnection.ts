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
  // generation 在切换订单、停用或卸载时递增，旧订单的迟到响应一律丢弃；
  // 同一订单内按请求序号只接受比已应用结果更新的响应（慢请求不会覆盖新结果，也不会饿死）。
  let generation = 0
  let requested = 0
  let applied = 0

  const refresh = async () => {
    const id = orderId.value
    if (!id) return
    const gen = generation
    const seq = ++requested
    try {
      const view = await getFlightView(id)
      if (gen !== generation || seq <= applied) return
      applied = seq
      connected.value = isFlightConnected(view)
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
    generation += 1
    if (!previous || previous[0] !== orderId.value || !isEnabled) connected.value = false
    if (!isEnabled || !orderId.value) return
    void refresh()
    timer = setInterval(() => { void refresh() }, FLIGHT_CONNECTION_POLL_MS)
  }, { immediate: true })

  onBeforeUnmount(() => {
    stop()
    generation += 1
  })

  return { connected, refresh }
}
