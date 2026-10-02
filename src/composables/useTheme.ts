import { ref } from 'vue'

const THEME_KEY = 'uav-console-theme'

export type Theme = 'light' | 'dark'

export function initTheme(): Theme {
  const saved = window.localStorage.getItem(THEME_KEY)
  const dark =
    saved === 'dark' ||
    (saved !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  return dark ? 'dark' : 'light'
}

export function useTheme() {
  const isDark = ref(document.documentElement.classList.contains('dark'))

  const toggle = () => {
    isDark.value = !isDark.value
    document.documentElement.classList.toggle('dark', isDark.value)
    window.localStorage.setItem(THEME_KEY, isDark.value ? 'dark' : 'light')
  }

  return { isDark, toggle }
}
