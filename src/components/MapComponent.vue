<template>
  <div class="map-container">
    <div ref="mapContainer" class="map"></div>
    <div v-if="loading" class="loading">加载中...</div>
    <div v-if="error" class="error">{{ error }}</div>

    <!-- 右侧控制面板 -->
    <div class="control-panel">
      <!-- 航线信息表单 -->
      <div class="route-info">
        <h4>航线信息</h4>
        <label>航线名称</label>
        <input type="text" v-model="routeForm.routeName" placeholder="例如：巡检航线A" />

        <input type="hidden" v-model="routeForm.djiId" />

        <label>默认速度 (m/s)</label>
        <input type="number" step="0.1" v-model.number="routeForm.defaultSpeed" placeholder="10.0" />

        <label>默认高度 (m)</label>
        <input type="number" step="0.1" v-model.number="routeForm.defaultHeight" placeholder="50.0" />

        <label>描述</label>
        <textarea v-model="routeForm.description" rows="2" placeholder="可选"></textarea>
      </div>

      <!-- 操作按钮 -->
      <div class="action-buttons">
        <button @click="startRoutePlanning" :disabled="planningActive" class="primary">
          {{ planningActive ? '规划中...' : '开始规划航线' }}
        </button>
        <button @click="clearMarkers" :disabled="waypoints.length === 0">清除所有航点</button>
        <button @click="handleSaveRoute" :disabled="waypoints.length === 0 || saving">
          {{ saving ? '保存中...' : '保存航线' }}
        </button>
        <button @click="handleExecuteRoute" :disabled="!routeId || !routeForm.djiId || executing" class="primary" style="background-color: #67c23a;">
          {{ executing ? '执行中...' : '执行航线' }}
        </button>
      </div>

      <!-- 航点列表 -->
      <div class="points-list" v-if="waypoints.length > 0">
        <h4>航点列表</h4>
        <div v-for="wp in waypoints" :key="wp.id" class="point-item">
          <div class="wp-header">
            <div class="wp-index">
              <span>序号:</span>
              <input type="text" v-model="wp.orderIndex" @blur="renumberSerials" size="3" />
            </div>
            <button @click="removeWaypoint(wp)" class="delete-btn">删除</button>
          </div>
          <div class="wp-coord">
            <span>经度: {{ wp.longitude.toFixed(6) }}</span>
            <span>纬度: {{ wp.latitude.toFixed(6) }}</span>
          </div>
          <div class="wp-params">
            <label>高度(m):</label>
            <input type="number" step="0.1" v-model.number="wp.altitude" />
            <label>停留时间(s):</label>
            <input type="number" step="0.1" v-model.number="wp.stayTime" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import request from '../api/request'
import { saveRoute, assignRoute } from '../api/modules/route'
import { getStoredSession } from '../api/session'

const router = useRouter()



declare global {
  interface Window {
    AMap: any
    _AMapSecurityConfig?: { securityJsCode: string }
  }
}

interface Waypoint {
  id: string
  orderIndex: number
  longitude: number
  latitude: number
  altitude: number | null
  stayTime: number | null
  amapMarker: any
}

const routeForm = reactive({
  routeName: '',
  djiId: '',
  defaultSpeed: null as number | null,
  defaultHeight: null as number | null,
  description: ''
})

const props = defineProps<{
  djiId?: string
}>()

watch(() => props.djiId, (newId) => {
  if (newId) {
    routeForm.djiId = newId
  }
}, { immediate: true })

const mapContainer = ref<HTMLElement>()
const loading = ref(true)
const error = ref('')
const planningActive = ref(false)
let map: any = null
const waypoints = ref<Waypoint[]>([])
const saving = ref(false)
const routeId = ref<number | null>(null)
const executing = ref(false)

onMounted(async () => {
  try {
    const config = await getAmapConfig()
    if (config.securityKey) {
      window._AMapSecurityConfig = { securityJsCode: config.securityKey }
    }
    await loadAmapScript(config.key)
    await initMap()
    loading.value = false
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败'
    loading.value = false
    console.error('加载地图失败:', err)
  }
})

async function getAmapConfig(): Promise<{ key: string; securityKey: string }> {
  const response = await request.get<{ success: boolean; data?: { key?: string; securityKey?: string }; message?: string }>('/route/init')
  if (response.data.success && response.data.data?.key) {
    return { key: response.data.data.key, securityKey: response.data.data.securityKey || '' }
  }
  throw new Error(response.data.message || '配置无效')
}

function loadAmapScript(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.AMap) return resolve()
    const script = document.createElement('script')
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`
    script.onload = () => (window.AMap ? resolve() : reject(new Error('AMap 未加载')))
    script.onerror = () => reject(new Error('脚本加载失败'))
    document.head.appendChild(script)
  })
}

function initMap(): Promise<void> {
  return new Promise((resolve) => {
    if (!mapContainer.value) throw new Error('容器不存在')
    map = new window.AMap.Map(mapContainer.value, {
      zoom: 15,
      center: [116.397428, 39.90923],
      resizeEnable: true
    })

    window.AMap.plugin(['AMap.Scale', 'AMap.ToolBar', 'AMap.Geolocation'], () => {
      map.addControl(new window.AMap.Scale())
      map.addControl(new window.AMap.ToolBar())
      const geolocation = new window.AMap.Geolocation({ enableHighAccuracy: true, timeout: 10000 })
      map.addControl(geolocation)
      geolocation.getCurrentPosition((status: string, result: any) => {
        if (status === 'complete') map.setCenter(result.position)
      })
    })

    map.on('click', (e: any) => {
      if (planningActive.value) {
        const lnglat = e.lnglat
        addWaypoint(lnglat.getLng(), lnglat.getLat())
      }
    })

    resolve()
  })
}

function startRoutePlanning() {
  planningActive.value = true
  console.log('航线规划已激活，点击地图添加航点')
}

function addWaypoint(lng: number, lat: number) {
  const nextIndex = waypoints.value.length + 1
  const id = Date.now() + '-' + Math.random()

  const marker = new window.AMap.Marker({
    position: [lng, lat],
    map: map,
    label: {
      content: `<div style="background:#1791fc; color:white; padding:2px 6px; border-radius:12px;">${nextIndex}</div>`,
      offset: new window.AMap.Pixel(0, -30)
    },
    draggable: true
  })

  const waypoint: Waypoint = {
    id,
    orderIndex: nextIndex,
    longitude: lng,
    latitude: lat,
    altitude: routeForm.defaultHeight ?? null,
    stayTime: null,
    amapMarker: marker
  }
  waypoints.value.push(waypoint)

  marker.on('dragend', () => {
    const pos = marker.getPosition()
    waypoint.longitude = pos.getLng()
    waypoint.latitude = pos.getLat()
    updateMarkerLabel(waypoint)
  })

  updateMarkerLabel(waypoint)
}

function updateMarkerLabel(wp: Waypoint) {
  wp.amapMarker.setLabel({
    content: `<div style="background:#1791fc; color:white; padding:2px 6px; border-radius:12px;">${wp.orderIndex}</div>`,
    offset: new window.AMap.Pixel(0, -30)
  })
}

function renumberSerials() {
  waypoints.value.sort((a, b) => a.orderIndex - b.orderIndex)
  waypoints.value.forEach((wp, idx) => {
    wp.orderIndex = idx + 1
    updateMarkerLabel(wp)
  })
}

function removeWaypoint(wp: Waypoint) {
  wp.amapMarker.setMap(null)
  const index = waypoints.value.findIndex(w => w.id === wp.id)
  if (index !== -1) waypoints.value.splice(index, 1)
  renumberSerials()
}

function clearMarkers() {
  waypoints.value.forEach(wp => wp.amapMarker.setMap(null))
  waypoints.value = []
  planningActive.value = false
}

async function handleSaveRoute() {
  if (waypoints.value.length === 0) {
    ElMessage.warning('没有航点，请先添加航点')
    return
  }
  if (!routeForm.routeName.trim()) {
    ElMessage.warning('请填写航线名称')
    return
  }
  if (!routeForm.djiId.trim()) {
    ElMessage.warning('请填写无人机ID')
    return
  }
  if (!routeForm.defaultSpeed) {
    ElMessage.warning('请填写默认速度')
    return
  }
  if (!routeForm.defaultHeight) {
    ElMessage.warning('请填写默认高度')
    return
  }

  const session = getStoredSession()
  const userName = session?.user?.username ?? 'unknown'

  const waypointDtos = waypoints.value.map(wp => {
    const altitude: number = wp.altitude ?? routeForm.defaultHeight ?? 0
    const stayTime: number = wp.stayTime ?? 0
    return {
      orderIndex: wp.orderIndex,
      longitude: wp.longitude,
      latitude: wp.latitude,
      altitude,
      stayTime
    }
  })

  const routeDto = {
    routeName: routeForm.routeName,
    djiId: routeForm.djiId,
    userName: userName,
    defaultSpeed: routeForm.defaultSpeed,
    defaultHeight: routeForm.defaultHeight,
    description: routeForm.description || '',
    waypoints: waypointDtos
  }

  saving.value = true

  try {
    const response = await request.post<{ success: boolean; data?: { message?: string; id?: number }; message?: string }>('/route/save', routeDto)
    if (response.data.success) {
      const routeIdValue = response.data.data?.id
      if (routeIdValue) {
        routeId.value = routeIdValue
        ElMessage.success('航线保存成功')
      } else {
        ElMessage.success('航线保存成功，但未获取到航线ID')
      }
      // 保留表单数据，以便执行航线
    } else {
      ElMessage.error(response.data.message || '保存失败')
    }
  } catch (err) {
    console.error(err)
    ElMessage.error(err instanceof Error ? err.message : '网络错误')
  } finally {
    saving.value = false
  }
}

async function handleExecuteRoute() {
  if (!routeId.value) {
    ElMessage.warning('请先保存航线')
    return
  }
  if (!routeForm.djiId) {
    ElMessage.warning('请选择无人机')
    return
  }

  executing.value = true

  try {
    const result = await assignRoute(routeId.value!, routeForm.djiId)
    if (result.success) {
      ElMessage.success('航线执行成功')
      // 跳转到直播界面
      router.push({
        name: 'operate',
        params: { deviceId: routeForm.djiId }
      })
    } else {
      ElMessage.error(result.message || '执行失败')
    }
  } catch (err) {
    console.error(err)
    ElMessage.error(err instanceof Error ? err.message : '网络错误')
  } finally {
    executing.value = false
  }
}

onUnmounted(() => {
  if (map) map.destroy()
})
</script>

<style scoped>
.map-container {
  position: relative;
  width: 100%;
  height: 560px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #ebeef5;
}
.map {
  width: 100%;
  height: 100%;
}
.loading, .error {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0,0,0,0.7);
  color: white;
  padding: 8px 16px;
  border-radius: 4px;
  z-index: 1000;
}

.control-panel {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 340px;
  background: rgba(255,255,255,0.98);
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.12);
  padding: 16px;
  z-index: 1000;
  font-size: 13px;
  max-height: calc(100% - 20px);
  overflow-y: auto;
  border: 1px solid #ebeef5;
}

.route-info h4 {
  margin: 0 0 12px 0;
  font-size: 15px;
  font-weight: 700;
  color: #303133;
}
.route-info label {
  display: block;
  margin-top: 10px;
  margin-bottom: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #606266;
}
.route-info input, .route-info textarea {
  width: 100%;
  padding: 8px 10px;
  margin-top: 2px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  box-sizing: border-box;
  font-size: 13px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.route-info input:focus, .route-info textarea:focus {
  outline: none;
  border-color: #1791fc;
  box-shadow: 0 0 0 2px rgba(23,145,252,0.15);
}
.action-buttons {
  display: flex;
  gap: 8px;
  margin: 16px 0;
}
.action-buttons button {
  flex: 1;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s;
  background: #f5f7fa;
  color: #606266;
}
.action-buttons button.primary {
  background: #1791fc;
  color: white;
}
.action-buttons button.primary:hover {
  background: #4091fc;
}
.action-buttons button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.action-buttons button:not(:disabled):hover {
  background: #ebeef5;
}
.points-list {
  margin-top: 12px;
  border-top: 1px solid #ebeef5;
  padding-top: 12px;
  max-height: 400px;
  overflow-y: auto;
}
.points-list h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 700;
  color: #303133;
}
.point-item {
  background: #fafafa;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 10px;
  border: 1px solid #ebeef5;
  transition: box-shadow 0.2s, border-color 0.2s;
}
.point-item:hover {
  border-color: #d9ecff;
  box-shadow: 0 1px 8px rgba(0,0,0,0.08);
}
.wp-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.wp-index {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  color: #303133;
  font-size: 13px;
}
.wp-index input {
  width: 60px;
  padding: 5px 8px;
  text-align: center;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  font-size: 13px;
}
.wp-index input:focus {
  outline: none;
  border-color: #1791fc;
  box-shadow: 0 0 0 2px rgba(23,145,252,0.15);
}
.delete-btn {
  background: #fef0f0;
  color: #f56c6c;
  border: 1px solid #fde2e2;
  border-radius: 6px;
  cursor: pointer;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s;
}
.delete-btn:hover {
  background: #f56c6c;
  color: white;
  border-color: #f56c6c;
}
.wp-coord {
  display: flex;
  gap: 16px;
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  margin-bottom: 10px;
  background: #fff;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #ebeef5;
  color: #606266;
}
.wp-params {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.wp-params label {
  font-size: 12px;
  font-weight: 600;
  color: #909399;
}
.wp-params input {
  width: 85px;
  padding: 6px 8px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  font-size: 12px;
}
.wp-params input:focus {
  outline: none;
  border-color: #1791fc;
  box-shadow: 0 0 0 2px rgba(23,145,252,0.15);
}
</style>