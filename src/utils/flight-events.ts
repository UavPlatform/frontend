import type { FlightEvent } from '../api/modules/flight-record'

/**
 * 事件投影 → 前端视图模型。
 *
 * 契约里没有「合成采样」：位置、高度、速度、电量是各自独立的事件，各带采集时间。
 * 因此这里只做两件事：把 POSITION 事件还原成地图点，把各类读数按类型取出并保留各自时间。
 * 缺某个类型就是没有该读数，不补零、不用别的类型推算（ADR-0014）。
 */

/** 地图点：只来自 POSITION 事件，degE7 还原为度。 */
export interface FlightPoint {
  eventId: string
  capturedAt: number
  latitude: number
  longitude: number
  /** 机身身份：换机时轨迹断开，不能把两架飞机的点连成一条线 */
  serialNumber?: string
  serialSource?: string
}

export interface FlightReading {
  type: string
  label: string
  value: string
  capturedAt: number
}

const payloadNumber = (payload: Record<string, unknown> | undefined, key: string): number | undefined => {
  const value = payload?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** 契约单位：degE7 → 度。 */
export const toFlightPoint = (event: FlightEvent): FlightPoint | undefined => {
  const latitude = payloadNumber(event.payload, 'latitudeDegE7')
  const longitude = payloadNumber(event.payload, 'longitudeDegE7')
  if (event.capturedAt == null || latitude == null || longitude == null) return undefined
  return {
    eventId: event.eventId ?? `${event.capturedAt}:${latitude}:${longitude}`,
    capturedAt: event.capturedAt,
    latitude: latitude / 1e7,
    longitude: longitude / 1e7,
    serialNumber: event.serialNumber,
    serialSource: event.serialSource,
  }
}

/** 事件流里能画在地图上的点，按采集时间升序（相同时间按 eventId 稳定排序）。 */
export const toFlightPoints = (events: readonly FlightEvent[]): FlightPoint[] =>
  events
    .map(toFlightPoint)
    .filter((point): point is FlightPoint => point != null)
    .sort((left, right) => left.capturedAt - right.capturedAt || left.eventId.localeCompare(right.eventId))

/**
 * 读数类型、契约单位与显示精度。
 * `divisor` 是契约整数单位到显示单位的换算（mm→m、mmps→m/s、permille→%），不是机型推测。
 */
const READINGS: ReadonlyArray<{
  type: string
  label: string
  unit: string
  field: string
  divisor: number
  digits: number
}> = [
  { type: 'ALTITUDE', label: '高度', unit: 'm', field: 'altitudeMm', divisor: 1_000, digits: 1 },
  { type: 'VELOCITY', label: '速度', unit: 'm/s', field: 'speedMmps', divisor: 1_000, digits: 1 },
  { type: 'BATTERY', label: '电量', unit: '%', field: 'chargePermille', divisor: 10, digits: 1 },
]

/**
 * 每种类型取「采集时间不晚于 at」的最新一条；同一类型更晚的读数不参与，
 * 也绝不把不同类型拼成一个时间点。at 省略时取全部事件的最新值。
 */
export const readingsAt = (events: readonly FlightEvent[], at = Number.POSITIVE_INFINITY): FlightReading[] => {
  const newest = new Map<string, FlightEvent>()
  for (const event of events) {
    if (event.capturedAt == null || event.capturedAt > at || !event.type) continue
    const previous = newest.get(event.type)
    if (!previous || event.capturedAt >= (previous.capturedAt ?? 0)) newest.set(event.type, event)
  }
  return READINGS.flatMap((spec) => {
    const event = newest.get(spec.type)
    const raw = payloadNumber(event?.payload, spec.field)
    if (!event || raw == null || event.capturedAt == null) return []
    const shown = (raw / spec.divisor).toFixed(spec.digits).replace(/\.0+$/, '')
    return [{
      type: spec.type,
      label: spec.label,
      value: `${shown} ${spec.unit}`,
      capturedAt: event.capturedAt,
    }]
  })
}
