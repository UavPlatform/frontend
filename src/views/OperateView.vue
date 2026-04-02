<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import MainLayout from '../layouts/MainLayout.vue'
import { getStoredSession } from '../api/session'
import { getPullCredentials, requestStartLive } from '../api/modules/live'
import type { LiveCredentials } from '../types/uav'

// 动态导入TRTC SDK
let TRTC: any = null
let client: any = null
let remoteStream: any = null

const route = useRoute()
const router = useRouter()

const deviceId = computed(() => String(route.params.deviceId ?? ''))
const deviceName = computed(() => String(route.query.name ?? `无人机 ${deviceId.value}`))
const onlineState = computed(() => String(route.query.online ?? '0') === '1')
const session = computed(() => getStoredSession())
const webUserId = computed(() => `web_${session.value?.user.username ?? 'guest'}`)

const initializing = ref(false)
const liveState = ref<'idle' | 'booting' | 'ready' | 'playing' | 'error'>('idle')
const liveMessage = ref('进入页面后会自动尝试拉起图传。')
const liveCredentials = ref<LiveCredentials & { wsUrl?: string }>()
const ws = ref<WebSocket | null>(null)

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
    // 发送开播请求
    const startResponse = await requestStartLive(deviceId.value)
    console.log('开播请求响应:', startResponse)
    
    // 获取拉流凭证
    liveCredentials.value = await getPullCredentials(deviceId.value, webUserId.value)
    console.log('拉流凭证:', liveCredentials.value)
    
    liveState.value = 'ready'
    liveMessage.value = '图传初始化请求已发送，等待画面接入。'
    
    // 开始播放
    await startPlayback()
  } catch (error) {
    console.error('初始化直播失败:', error)
    liveState.value = 'error'
    liveMessage.value = error instanceof Error ? error.message : '图传初始化失败'
    ElMessage.error(liveMessage.value)
  } finally {
    initializing.value = false
  }
}

const startPlayback = async () => {
  if (!liveCredentials.value) {
    throw new Error('拉流凭证未就绪')
  }

  try {
    console.log('开始播放，房间ID:', liveCredentials.value.roomId)

    if (!TRTC) {
      const trtcModule = await import('trtc-sdk-v5')
      TRTC = trtcModule
    }
    
    // 初始化 TRTC
    client = TRTC.createClient({
      mode: 'live',
      sdkAppId: liveCredentials.value.sdkAppId,
      userId: liveCredentials.value.userId,
      userSig: liveCredentials.value.userSig
    })

    // 监听远程流添加事件
    client.on('remote-stream-added', async (event: any) => {
      const remoteStream = event.stream
      console.log('远程流添加:', remoteStream.streamId)
      await client.subscribe(remoteStream, { audio: true, video: true })
    })

    // 监听远程流订阅成功事件
    client.on('remote-stream-subscribed', (event: any) => {
      remoteStream = event.stream
      console.log('远程流订阅成功:', remoteStream.streamId)
      const videoElement = document.getElementById('remote-video')
      if (videoElement) {
        remoteStream.play(videoElement)
        liveState.value = 'playing'
        liveMessage.value = '图传画面已接入'
      }
    })

    // 监听错误事件
    client.on('error', (error: any) => {
      console.error('TRTC错误:', error)
      liveState.value = 'error'
      liveMessage.value = `图传错误: ${error.message}`
      ElMessage.error(liveMessage.value)
    })

    // 监听连接状态变化
    client.on('connection-state-changed', (event: any) => {
      console.log('连接状态:', event.state)
    })

    // 加入房间
    await client.join({
      roomId: liveCredentials.value.roomId
    })
    console.log('加入房间成功:', liveCredentials.value.roomId)

    // 连接WebSocket，接收无人机实时状态
    if (liveCredentials.value.wsUrl) {
      connectWebSocket(liveCredentials.value.wsUrl)
    }
  } catch (error) {
    console.error('开始播放失败:', error)
    throw error
  }
}

const connectWebSocket = (url: string) => {
  try {
    ws.value = new WebSocket(url)
    
    ws.value.onopen = () => {
      console.log('WebSocket连接成功')
    }
    
    ws.value.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        console.log('WebSocket消息:', data)
        if (data.type === 'event' && data.name === 'UAV_STATUS_UPDATE') {
          // 更新无人机状态
          console.log('无人机状态更新:', data.data)
        }
      } catch (error) {
        console.error('解析WebSocket消息失败:', error)
      }
    }
    
    ws.value.onclose = () => {
      console.log('WebSocket连接关闭')
    }
    
    ws.value.onerror = (error) => {
      console.error('WebSocket错误:', error)
    }
  } catch (error) {
    console.error('连接WebSocket失败:', error)
  }
}

const stopPlayback = async () => {
  // 关闭WebSocket连接
  if (ws.value) {
    try {
      ws.value.close()
      ws.value = null
    } catch (error) {
      console.error('关闭WebSocket失败:', error)
    }
  }

  // 停止TRTC播放
  if (client) {
    try {
      await client.leave()
      if (remoteStream) {
        remoteStream.stop()
        remoteStream = null
      }
      client = null
      liveState.value = 'idle'
      liveMessage.value = '图传已停止'
    } catch (error) {
      console.error('停止播放失败:', error)
    }
  }
}

onMounted(() => {
  void initializeLive()
})

onUnmounted(() => {
  void stopPlayback()
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
          <div class="operation-video-content" v-if="liveState !== 'playing'">
            <div class="rounded-full bg-white/10 px-4 py-2 text-xs tracking-[0.24em] text-white/70 uppercase">
              Live View
            </div>
            <div class="mt-6 text-4xl font-900 tracking-tight text-white">图传画面接入区</div>
            <div class="mt-4 max-w-[460px] text-center text-base leading-7 text-white/72">
              {{ liveMessage }}
            </div>
          </div>
          <div class="operation-video-content flex items-center justify-center" v-else>
            <video id="remote-video" class="w-full max-w-full max-h-[520px] rounded-lg" autoplay playsinline></video>
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
