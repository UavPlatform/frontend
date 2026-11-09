import { apiGet, expectData, type Schemas } from '../contract'

export type FlightEvent = Schemas['FlightEventVO']
export type FlightEventPage = Schemas['FlightEventPageVO']
export type FlightProjection = Schemas['FlightProjectionVO']
export type FlightAircraft = Schemas['Aircraft']
export type FlightPeriod = Schemas['Period']

export interface FlightHistoryQuery {
  /** 机身筛选必须同时传 serialNumber 与 serialSource（契约拒绝只传其一）。 */
  serialNumber?: string
  serialSource?: string
  limit?: number
}

/** 当前事件投影：各机身最新读数、最后位置、起降区间；权限与订单标识由后端校验。 */
export const getFlightProjection = async (orderId: string): Promise<FlightProjection> => {
  const body = await apiGet('/dispatch/orders/{orderId}/flight', { path: { orderId } })
  return expectData(body, '读取飞行投影失败')
}

/** 读取一页事件历史，按 capturedAt,eventId 升序；续页用 (afterCapturedAt, afterEventId) 双游标。 */
export const getFlightHistory = async (
  orderId: string,
  query: FlightHistoryQuery & { afterCapturedAt?: number; afterEventId?: string } = {},
): Promise<FlightEventPage> => {
  const body = await apiGet('/dispatch/orders/{orderId}/flight/history', {
    path: { orderId },
    params: query,
  })
  return expectData(body, '读取事件历史失败')
}

/**
 * 汇总全程事件。服务端用 (nextCapturedAt, nextEventId) 双游标续页，
 * 因此同一采集时间的多个事件不会因游标相同而被跳过。
 */
export const loadFlightHistory = async (
  orderId: string,
  query: FlightHistoryQuery = {},
): Promise<FlightEventPage> => {
  const items: FlightEvent[] = []
  let afterCapturedAt: number | undefined
  let afterEventId: string | undefined
  const seenCursors = new Set<string>()

  for (let page = 0; page < 100; page += 1) {
    const result = await getFlightHistory(orderId, { ...query, afterCapturedAt, afterEventId })
    items.push(...(result.items ?? []))
    if (!result.hasNext) {
      return { ...result, items, hasNext: false }
    }
    const cursor = `${result.nextCapturedAt}:${result.nextEventId}`
    if (!result.items?.length || result.nextCapturedAt == null ||
      result.nextEventId == null || seenCursors.has(cursor)) {
      // 保留已读到的部分，但绝不把断掉的游标当成完整历史。
      return { ...result, items, hasNext: true }
    }
    seenCursors.add(cursor)
    afterCapturedAt = result.nextCapturedAt
    afterEventId = result.nextEventId
  }

  return { items, hasNext: true, nextCapturedAt: afterCapturedAt, nextEventId: afterEventId }
}
