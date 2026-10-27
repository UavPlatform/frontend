/**
 * WGS84 → GCJ-02 本地坐标转换（高德底图使用 GCJ-02）。
 *
 * 遥测上报的是 GPS 原始坐标（WGS84）。原先每次重绘都调用高德在线接口
 * `AMap.convertFrom`（40 点一批），实时推送时会反复发请求；这里改为纯函数本地计算，
 * 与高德 convertFrom('gps') 的结果误差在米级以内，境外坐标原样返回。
 */
export type LngLat = [lng: number, lat: number]

const A = 6378245.0
const EE = 0.006_693_421_622_965_943_23

/** 粗略的中国境外判断：境外不做偏移（与通行实现一致）。 */
export const isOutOfChina = (lng: number, lat: number) =>
  lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271

const transformLat = (x: number, y: number) => {
  let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  ret += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3
  ret += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3
  ret += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3
  return ret
}

const transformLng = (x: number, y: number) => {
  let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3
  ret += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3
  ret += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3
  return ret
}

export const wgs84ToGcj02 = (lng: number, lat: number): LngLat => {
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || isOutOfChina(lng, lat)) return [lng, lat]
  const radLat = (lat / 180) * Math.PI
  const magic = 1 - EE * Math.sin(radLat) ** 2
  const sqrtMagic = Math.sqrt(magic)
  const dLat = (transformLat(lng - 105, lat - 35) * 180) / (((A * (1 - EE)) / (magic * sqrtMagic)) * Math.PI)
  const dLng = (transformLng(lng - 105, lat - 35) * 180) / ((A / sqrtMagic) * Math.cos(radLat) * Math.PI)
  return [lng + dLng, lat + dLat]
}
