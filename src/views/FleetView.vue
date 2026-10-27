<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MainLayout from '../layouts/MainLayout.vue'
import AircraftModelPanel from '../components/fleet/AircraftModelPanel.vue'
import DronePanel from '../components/fleet/DronePanel.vue'
import type { AdminAircraftModelVo, AdminDroneVo } from '../types/admin'

/**
 * 无人机与机型（REQ-SUP-GOV-005 / REQ-SUP-GOV-006）：主从布局。
 * 左栏机型目录（含「全部机型」），右栏为选中机型下的无人机。URL query.model 记录选中机型。
 */
const route = useRoute()
const router = useRouter()

const models = ref<AdminAircraftModelVo[]>([])
const drones = ref<AdminDroneVo[] | null>(null)
const dronePanel = ref<InstanceType<typeof DronePanel> | null>(null)

const selectedModelId = computed(() => {
  const value = Number(route.query.model)
  return Number.isSafeInteger(value) && value > 0 ? value : null
})

const counts = computed(() => {
  if (!drones.value) return null
  const result: Record<number, number> = {}
  for (const drone of drones.value) {
    const id = drone.model?.aircraftModelId
    if (id != null) result[id] = (result[id] ?? 0) + 1
  }
  return result
})

const selectModel = (id: number | null) => {
  if (id === selectedModelId.value) return
  // 切换机型回到第 1 页，保留机场筛选与每页条数
  const query: Record<string, string> = {}
  if (route.query.airport) query.airport = String(route.query.airport)
  if (route.query.size) query.size = String(route.query.size)
  if (id != null) query.model = String(id)
  void router.replace({ name: 'fleet', query })
}

/** 机型改名/启停后，右栏无人机内嵌的机型信息需要刷新 */
const onModelsChanged = () => {
  void dronePanel.value?.load()
}
</script>

<template>
  <MainLayout
    title="无人机与机型"
    subtitle="左侧维护机型目录，右侧登记与查看该机型下的租借无人机：在库 / 已借出 / 执飞中、最近订单与借还记录。"
  >
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
      <AircraftModelPanel
        class="lg:sticky lg:top-4 lg:self-start"
        :selected-id="selectedModelId"
        :counts="counts"
        :total-drones="drones ? drones.length : null"
        @select="selectModel"
        @loaded="(list) => (models = list)"
        @changed="onModelsChanged"
      />
      <DronePanel
        ref="dronePanel"
        :models="models"
        :model-id="selectedModelId"
        @loaded="(list) => (drones = list)"
      />
    </div>
  </MainLayout>
</template>
