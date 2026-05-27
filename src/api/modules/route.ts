import request from '../request'
import { BizError } from './order'

export interface WaypointDto {
  orderIndex: number
  longitude: number
  latitude: number
  altitude: number
  stayTime: number
}

export interface RouteDto {
  routeName: string
  djiId: string
  userName: string
  defaultSpeed: number
  defaultHeight: number
  description: string
  waypoints: WaypointDto[]
}

interface ApiResponse<T> {
  success: boolean
  code: number
  errorCode: string | null
  message: string | null
  data: T | null
}

function unwrap<T>(response: { data: ApiResponse<T> }, fallbackMsg: string): T {
  const body = response.data
  if (!body.success || !body.data) {
    throw new BizError(body.errorCode || 'UNKNOWN', body.message || fallbackMsg)
  }
  return body.data
}

interface SaveRouteData {
  message?: string
  id?: number
  routeNum?: string
}

interface SaveRouteResponse {
  success: boolean
  message?: string
  routeNum?: string
}

export const saveRoute = async (route: RouteDto): Promise<SaveRouteResponse> => {
  const response = await request.post<ApiResponse<SaveRouteData>>('/route/save', route)
  try {
    const data = unwrap(response, '保存航线失败')
    return { success: true, message: data.message, routeNum: data.routeNum }
  } catch (err) {
    if (err instanceof BizError) throw err
    return { success: false, message: (err as Error).message }
  }
}

interface AssignRouteResponse {
  success: boolean
  message?: string
}

export const assignRoute = async (routeNum: string): Promise<AssignRouteResponse> => {
  const response = await request.post<ApiResponse<{ requestId?: string; timedOut?: boolean }>>(`/route/start?routeNum=${encodeURIComponent(routeNum)}`)
  try {
    unwrap(response, '航线执行失败')
    return { success: true, message: '无人机已确认执行指令' }
  } catch (err) {
    if (err instanceof BizError) throw err
    return { success: false, message: (err as Error).message }
  }
}

export interface RouteItem {
  id: number
  routeNum: string
  routeName: string
  djiId: string
  userName: string
  defaultSpeed: number
  defaultHeight: number
  description: string
  waypoints: { orderIndex: number; longitude: number; latitude: number; altitude: number; stayTime: number }[]
  createTime: string
}

export const listRoutes = async (page = 0, size = 20): Promise<{ routes: RouteItem[]; currentPage: number; totalPages: number; totalElements: number }> => {
  const response = await request.get<ApiResponse<{ routes: RouteItem[]; currentPage: number; totalPages: number; totalElements: number }>>(
    `/route/list?page=${page}&size=${size}`
  )
  return unwrap(response, '查询航线失败')
}
