import { apiGet, expectData, type Schemas } from '../contract'

export type FlightHistory = Schemas['FlightHistoryVO']
export type FlightTrack = Schemas['FlightTrackVO']
export type FlightView = Schemas['FlightViewVO']
export type FlightSample = Schemas['FlightSampleVO']
export type FlightConnection = Schemas['FlightConnectionVO']

export interface FlightHistoryQuery {
  from?: number
  to?: number
  limit?: number
  afterCapturedAt?: number
  afterSampleId?: number
}

/** 当前实际飞行状态；权限和订单标识均由后端契约负责校验。 */
export const getFlightView = async (orderId: string): Promise<FlightView> => {
  const body = await apiGet('/dispatch/orders/{orderId}/flight', { path: { orderId } })
  return expectData(body, '读取实际飞行状态失败')
}

/** 读取一页历史遥测，按设备采集时间升序返回，并附带本单全部连机记录。 */
export const getFlightHistory = async (
  orderId: string,
  query: FlightHistoryQuery = {},
): Promise<FlightHistory> => {
  const body = await apiGet('/dispatch/orders/{orderId}/flight/history', {
    path: { orderId },
    params: query,
  })
  return expectData(body, '读取历史遥测失败')
}

/** 读取一页实际采样轨迹；服务端保持保存顺序，不插值补点。 */
export const getFlightTrack = async (orderId: string, after?: number): Promise<FlightTrack> => {
  const body = await apiGet('/dispatch/orders/{orderId}/flight/track', {
    path: { orderId },
    params: after === undefined ? undefined : { after },
  })
  return expectData(body, '读取飞行轨迹失败')
}

/**
 * 汇总历史遥测分页。服务端通过 (nextCapturedAt,nextSampleId) 双游标续页，
 * 因此不会因相同采集时间的样本而跳过数据。
 */
export const loadFlightHistory = async (
  orderId: string,
  query: Omit<FlightHistoryQuery, 'afterCapturedAt' | 'afterSampleId'> = {},
): Promise<FlightHistory> => {
  const items: FlightSample[] = []
  let connections: FlightConnection[] = []
  let afterCapturedAt: number | undefined
  let afterSampleId: number | undefined
  const seenCursors = new Set<string>()

  for (let page = 0; page < 100; page += 1) {
    const result = await getFlightHistory(orderId, {
      ...query,
      afterCapturedAt,
      afterSampleId,
    })
    items.push(...(result.items ?? []))
    if (page === 0) connections = result.connections ?? []
    if (!result.hasNext) {
      return { ...result, items, connections, hasNext: false }
    }
    const cursor = `${result.nextCapturedAt}:${result.nextSampleId}`
    if (!result.items?.length || result.nextCapturedAt == null ||
      result.nextSampleId == null || seenCursors.has(cursor)) {
      // Keep partial results visible, but never represent a broken cursor as a complete track.
      return { ...result, items, connections, hasNext: true }
    }
    seenCursors.add(cursor)
    afterCapturedAt = result.nextCapturedAt
    afterSampleId = result.nextSampleId
  }

  return { items, connections, hasNext: true, nextCapturedAt: afterCapturedAt, nextSampleId: afterSampleId }
}
