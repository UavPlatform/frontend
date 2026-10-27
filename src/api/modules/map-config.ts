import { apiGet, expectData } from '../contract'
import type { Schemas } from '../contract'

export type MapConfig = Schemas['MapConfigVO']

export const getMapConfig = async (): Promise<MapConfig> =>
  expectData(await apiGet('/config/map'), '读取地图配置失败')
