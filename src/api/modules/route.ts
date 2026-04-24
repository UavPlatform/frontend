import request from '../request'

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

interface SaveRouteResponse {
  success: boolean
  message?: string
}

export const saveRoute = async (route: RouteDto): Promise<SaveRouteResponse> => {
  const response = await request.post<{ success: boolean; data?: { message?: string; id?: number }; message?: string }>('/route/save', route)
  return {
    success: response.data.success,
    message: response.data.data?.message || response.data.message,
  }
}

interface AssignRouteResponse {
  success: boolean
  message?: string
}

export const assignRoute = async (routeId: number, djiId: string): Promise<AssignRouteResponse> => {
  const response = await request.post<{ success: boolean; message?: string }>('/route/assign', { routeId, djiId })
  return {
    success: response.data.success,
    message: response.data.message,
  }
}
