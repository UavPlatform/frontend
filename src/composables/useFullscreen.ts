import { ref } from 'vue'

const isFullscreen = ref(false)

export function useFullscreen() {
  const toggle = () => {
    isFullscreen.value = !isFullscreen.value
  }
  return { isFullscreen, toggle }
}
