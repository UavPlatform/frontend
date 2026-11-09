import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { getFlightProjection, type FlightProjection } from '../api/modules/flight-record'

/** 飞手到场后（含运输中、送达确认中）才可能有数据上报。 */
export const LIVE_CAPABLE_STAGES = new Set(['PILOT_ARRIVED', 'IN_TRANSIT', 'DELIVERY_CONFIRMATION'])
export const isLiveCapableStage = (stage?: string | null) => LIVE_CAPABLE_STAGES.has(stage ?? '')
export const FLIGHT_PROJECTION_POLL_MS = 5_000

/**
 * 事件 v2 没有「连机记录」：实时与否由投影自己说明。
 * 只要任一机身的最新事件未过时（`aircraft[].stale === false`），就说明数据正在进来；
 * 全部过时即视为没有实时数据（ADR-0014：不合成采样、不用订单阶段冒充在线）。
 */
export const isFlightReporting = (projection?: FlightProjection | null) =>
  Boolean(projection?.aircraft?.some((aircraft) => aircraft.stale === false))

export function useFlightReporting(orderId: Ref<string>, enabled: Ref<boolean>) {
  const reporting = ref(false)
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
      const projection = await getFlightProjection(id)
      if (gen !== generation || seq <= applied) return
      applied = seq
      reporting.value = isFlightReporting(projection)
    } catch {
      // 读取失败时保留上一次状态，避免实时区来回闪烁。
    }
  }

  const stop = () => {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
  }

  watch([orderId, enabled], ([, isEnabled], previous) => {
    stop()
    generation += 1
    if (!previous || previous[0] !== orderId.value || !isEnabled) reporting.value = false
    if (!isEnabled || !orderId.value) return
    void refresh()
    timer = setInterval(() => { void refresh() }, FLIGHT_PROJECTION_POLL_MS)
  }, { immediate: true })

  onBeforeUnmount(() => {
    stop()
    generation += 1
  })

  return { reporting, refresh }
}
