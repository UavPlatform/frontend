<script setup lang="ts">
import MainLayout from '../layouts/MainLayout.vue'
import MapComponent from '../components/MapComponent.vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const djiId = route.query.djiId as string
</script>

<template>
  <MainLayout
    title="航线规划"
    subtitle="在地图上点击添加航点，设置高度和停留时间后保存航线。"
  >
    <div class="flex flex-col gap-4">
      <section class="panel-card p-4 md:p-5">
        <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div class="text-xl font-800 tracking-tight text-[#10233f]">地图航点规划</div>
            <div class="mt-1 text-sm text-[#6b7a90]">
              点击地图上的位置添加航点，可拖动调整位置。
            </div>
          </div>
        </div>

        <div class="mt-5">
          <MapComponent :djiId="djiId" />
        </div>
      </section>

      <section class="panel-card p-5">
        <div class="text-lg font-800 tracking-tight text-[#10233f]">操作提示</div>
        <div class="mt-4 space-y-3 text-sm leading-6 text-[#516178]">
          <div class="rounded-5 bg-[#f8fafc] p-4">
            点击「开始规划航线」按钮后，点击地图即可添加航点。
          </div>
          <div class="rounded-5 bg-[#f8fafc] p-4">
            添加的航点可以通过拖动来调整位置，经纬度信息会实时更新。
          </div>
          <div class="rounded-5 bg-[#f8fafc] p-4">
            填写航线名称、无人机ID、默认速度和高度后，点击「保存航线」完成规划。
          </div>
        </div>
      </section>
    </div>
  </MainLayout>
</template>
