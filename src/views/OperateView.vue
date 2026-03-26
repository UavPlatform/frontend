<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import MainLayout from '../layouts/MainLayout.vue'
import { getStoredSession } from '../api/session'
import { getPullCredentials, requestStartLive } from '../api/modules/live'
import type { LiveCredentials } from '../types/uav'

const route = useRoute()
const router = useRouter()

const deviceId = computed(() => String(route.params.deviceId ?? ''))
const deviceName = computed(() => String(route.query.name ?? `无人机 ${deviceId.value}`))
const onlineState = computed(() => String(route.query.online ?? '0') === '1')
const session = computed(() => getStoredSession())
const webUserId = computed(() => `web_${session.value?.user.username ?? 'guest'}`)

const initializing = ref(false)
const liveState = ref<'idle' | 'booting' | 'ready' | 'error'>('idle')
const liveMessage = ref('进入页面后会自动尝试拉起图传。')
const liveCredentials = ref<LiveCredentials>()

const initializeLive = async () => {
  if (!deviceId.value) {
    liveState.value = 'error'
    liveMessage.value = '未获取到目标无人机设备 ID'
    return
  }

  initializing.value = true
  liveState.value = 'booting'
  liveMessage.value = '正在初始化图传链路，请稍候...'

  try {
    await requestStartLive(deviceId.value)
    liveCredentials.value = await getPullCredentials(deviceId.value, webUserId.value)
    liveState.value = 'ready'
    liveMessage.value = '图传初始化请求已发送，等待画面接入。'
  } catch (error) {
    console.error(error)
    liveState.value = 'error'
    liveMessage.value = error instanceof Error ? error.message : '图传初始化失败'
    ElMessage.error(liveMessage.value)
  } finally {
    initializing.value = false
  }
}

onMounted(() => {
  void initializeLive()
})
</script>

<template>
  <MainLayout
    title="无人机操作界面"
    subtitle="进入操作页后自动尝试拉起图传，左侧为图传画面接入区，右侧为设备操作与状态面板。"
  >
    <div class="grid gap-4 2xl:grid-cols-[minmax(0,1.7fr)_380px]">
      <section class="panel-card flex min-h-[620px] flex-col p-5">
        <div class="flex items-center justify-between gap-4">
          <div>
            <div class="text-2xl font-900 tracking-tight text-[#10233f]">{{ deviceName }}</div>
            <div class="mt-2 text-sm text-[#6b7a90]">设备 ID：{{ deviceId }}</div>
          </div>
          <el-tag :type="onlineState ? 'success' : 'info'" effect="dark">
            {{ onlineState ? '在线' : '离线' }}
          </el-tag>
        </div>

        <div class="operation-video-shell mt-5 flex-1">
          <div class="operation-video-grid"></div>
          <div class="operation-video-content">
            <div class="rounded-full bg-white/10 px-4 py-2 text-xs tracking-[0.24em] text-white/70 uppercase">
              Live View
            </div>
            <div class="mt-6 text-4xl font-900 tracking-tight text-white">图传画面接入区</div>
            <div class="mt-4 max-w-[460px] text-center text-base leading-7 text-white/72">
              这里预留给图传播放组件。当前页面会在进入时自动调用直播相关接口，后续你可以直接把图传逻辑挂到这个区域。
            </div>
          </div>
        </div>
      </section>

      <aside class="flex flex-col gap-4">
        <section class="panel-card p-5">
          <div class="text-lg font-800 tracking-tight text-[#10233f]">图传状态</div>
          <div class="mt-4 rounded-5 bg-[#f8fafc] p-4">
            <div class="flex items-center justify-between gap-4">
              <div class="text-sm text-[#6b7a90]">当前状态</div>
              <el-tag
                :type="
                  liveState === 'ready'
                    ? 'success'
                    : liveState === 'error'
                      ? 'danger'
                      : liveState === 'booting'
                        ? 'warning'
                        : 'info'
                "
              >
                {{
                  liveState === 'ready'
                    ? '已初始化'
                    : liveState === 'error'
                      ? '失败'
                      : liveState === 'booting'
                        ? '初始化中'
                        : '待机'
                }}
              </el-tag>
            </div>
            <div class="mt-3 text-sm leading-6 text-[#516178]">{{ liveMessage }}</div>
          </div>
        </section>

        <section class="panel-card p-5">
          <div class="text-lg font-800 tracking-tight text-[#10233f]">快捷操作</div>
          <div class="mt-4 grid grid-cols-1 gap-3">
            <el-button type="primary" :loading="initializing" @click="initializeLive">
              重新拉起图传
            </el-button>
            <el-button type="success" plain>截图占位</el-button>
            <el-button type="warning" plain>录像占位</el-button>
            <el-button @click="router.push({ name: 'dashboard' })">返回主页</el-button>
          </div>
        </section>

        <section class="panel-card p-5">
          <div class="text-lg font-800 tracking-tight text-[#10233f]">设备信息</div>
          <div class="mt-4 space-y-3">
            <div class="rounded-5 bg-[#f8fafc] p-4">
              <div class="text-sm text-[#6b7a90]">无人机名称</div>
              <div class="mt-1 text-base font-700 text-[#10233f]">{{ deviceName }}</div>
            </div>
            <div class="rounded-5 bg-[#f8fafc] p-4">
              <div class="text-sm text-[#6b7a90]">设备 ID</div>
              <div class="mt-1 text-base font-700 text-[#10233f]">{{ deviceId }}</div>
            </div>
            <div class="rounded-5 bg-[#f8fafc] p-4">
              <div class="text-sm text-[#6b7a90]">凭据状态</div>
              <div class="mt-1 text-base font-700 text-[#10233f]">
                {{ liveCredentials ? '已就绪' : '未获取' }}
              </div>
            </div>
          </div>
        </section>
      </aside>
    </div>
  </MainLayout>
</template>

<style scoped>
.operation-video-shell {
  position: relative;
  overflow: hidden;
  border-radius: 28px;
  background:
    radial-gradient(circle at top left, rgba(14, 165, 233, 0.35), transparent 26%),
    radial-gradient(circle at bottom right, rgba(37, 99, 235, 0.28), transparent 24%),
    linear-gradient(135deg, #0f172a, #10233f);
}

.operation-video-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px);
  background-size: 36px 36px;
  mask-image: radial-gradient(circle at center, black, transparent 90%);
}

.operation-video-content {
  position: relative;
  z-index: 1;
  display: flex;
  height: 100%;
  min-height: 520px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  text-align: center;
}
</style>
