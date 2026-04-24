<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TRTC from 'trtc-sdk-v5'
import type { LiveCredentials } from '../types/uav'

const props = defineProps<{
  credentials: LiveCredentials | null
}>()

const emit = defineEmits<{
  (e: 'error', message: string): void
  (e: 'connected'): void
  (e: 'disconnected'): void
}>()

const videoContainer = ref<HTMLDivElement | null>(null)
const trtcClient = ref<TRTC | null>(null)
const isConnecting = ref(false)
const isConnected = ref(false)
const remoteUserId = ref<string | null>(null)
const errorMessage = ref<string | null>(null)

const initTRTC = async () => {
  if (!props.credentials) {
    return
  }

  const { sdkAppId, userId, userSig, roomId } = props.credentials

  if (!sdkAppId || !userId || !userSig || !roomId) {
    errorMessage.value = '缺少必要的直播参数'
    emit('error', errorMessage.value)
    return
  }

  isConnecting.value = true
  errorMessage.value = null

  try {
    trtcClient.value = TRTC.create()

    trtcClient.value.on(TRTC.EVENT.ERROR, (error: { code: number; message: string }) => {
      console.error('TRTC error:', error)
      errorMessage.value = `TRTC 错误: ${error.message}`
      emit('error', errorMessage.value)
    })

    trtcClient.value.on(TRTC.EVENT.REMOTE_VIDEO_AVAILABLE, (event: { userId: string }) => {
      console.log('Remote video available:', event.userId)
      remoteUserId.value = event.userId
      startRemoteVideo(event.userId)
    })

    trtcClient.value.on(TRTC.EVENT.REMOTE_VIDEO_UNAVAILABLE, (event: { userId: string }) => {
      console.log('Remote video unavailable:', event.userId)
      if (remoteUserId.value === event.userId) {
        remoteUserId.value = null
      }
    })

    trtcClient.value.on(TRTC.EVENT.REMOTE_USER_EXIT, (event: { userId: string }) => {
      console.log('Remote user exit:', event.userId)
      if (remoteUserId.value === event.userId) {
        remoteUserId.value = null
        isConnected.value = false
        emit('disconnected')
      }
    })

    await trtcClient.value.enterRoom({
      sdkAppId,
      userId,
      userSig,
      strRoomId: roomId,
    })

    console.log('Entered TRTC room:', roomId)
    isConnected.value = true
    emit('connected')
  } catch (error) {
    console.error('Failed to init TRTC:', error)
    errorMessage.value = error instanceof Error ? error.message : '初始化直播失败'
    emit('error', errorMessage.value)
  } finally {
    isConnecting.value = false
  }
}

const startRemoteVideo = async (userId: string) => {
  if (!trtcClient.value || !videoContainer.value) {
    return
  }

  try {
    const videoElement = document.createElement('div')
    videoElement.id = `remote-video-${userId}`
    videoElement.style.width = '100%'
    videoElement.style.height = '100%'
    videoElement.style.objectFit = 'contain'
    videoContainer.value.innerHTML = ''
    videoContainer.value.appendChild(videoElement)

    await trtcClient.value.startRemoteVideo({
      userId,
      streamType: TRTC.TYPE.STREAM_TYPE_MAIN,
      view: videoElement,
    })

    console.log('Started remote video for user:', userId)
  } catch (error) {
    console.error('Failed to start remote video:', error)
    errorMessage.value = error instanceof Error ? error.message : '播放视频流失败'
    emit('error', errorMessage.value)
  }
}

const cleanup = async () => {
  if (trtcClient.value) {
    try {
      if (remoteUserId.value) {
        await trtcClient.value.stopRemoteVideo({ userId: remoteUserId.value, streamType: TRTC.TYPE.STREAM_TYPE_MAIN })
      }
      await trtcClient.value.exitRoom()
      trtcClient.value.destroy()
      console.log('TRTC client cleaned up')
    } catch (error) {
      console.error('Failed to cleanup TRTC:', error)
    }
    trtcClient.value = null
  }

  if (videoContainer.value) {
    videoContainer.value.innerHTML = ''
  }

  isConnected.value = false
  remoteUserId.value = null
}

watch(
  () => props.credentials,
  async (newCredentials, oldCredentials) => {
    if (newCredentials?.roomId !== oldCredentials?.roomId) {
      await cleanup()
      if (newCredentials) {
        await initTRTC()
      }
    }
  },
)

onMounted(() => {
  if (props.credentials) {
    initTRTC()
  }
})

onBeforeUnmount(() => {
  cleanup()
})
</script>

<template>
  <div class="trtc-player">
    <div v-if="isConnecting" class="trtc-status connecting">
      <div class="trtc-spinner"></div>
      <span>正在连接直播...</span>
    </div>

    <div v-else-if="errorMessage" class="trtc-status error">
      <span>{{ errorMessage }}</span>
    </div>

    <div v-else-if="!credentials" class="trtc-status idle">
      <span>等待直播凭据...</span>
    </div>

    <div v-else-if="!isConnected" class="trtc-status waiting">
      <span>已加入房间，等待视频流...</span>
    </div>

    <div
      ref="videoContainer"
      class="trtc-video-container"
      :class="{ hidden: !isConnected || !remoteUserId }"
    ></div>
  </div>
</template>

<style scoped>
.trtc-player {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
}

.trtc-video-container {
  width: 100%;
  height: 100%;
}

.trtc-video-container.hidden {
  display: none;
}

.trtc-video-container :deep(video) {
  width: 100% !important;
  height: 100% !important;
  object-fit: contain !important;
}

.trtc-status {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #fff;
  font-size: 14px;
  text-align: center;
  padding: 20px;
}

.trtc-status.connecting {
  color: #409eff;
}

.trtc-status.error {
  color: #f56c6c;
}

.trtc-status.waiting {
  color: #e6a23c;
}

.trtc-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(255, 255, 255, 0.2);
  border-top-color: #409eff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
