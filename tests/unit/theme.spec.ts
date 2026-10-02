import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { initTheme, useTheme } from '../../src/composables/useTheme'

const THEME_KEY = 'uav-console-theme'

const stubMatchMedia = (prefersDark: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: prefersDark,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  })
}

describe('主题 initTheme / useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    document.documentElement.classList.remove('dark')
    localStorage.clear()
  })

  it('无本地存储时跟随系统深色偏好', () => {
    stubMatchMedia(true)
    expect(initTheme()).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('本地存储 light 优先于系统深色偏好', () => {
    localStorage.setItem(THEME_KEY, 'light')
    stubMatchMedia(true)
    expect(initTheme()).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('本地存储 dark 优先于系统亮色偏好', () => {
    localStorage.setItem(THEME_KEY, 'dark')
    stubMatchMedia(false)
    expect(initTheme()).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('toggle 切换并持久化到本地存储', () => {
    stubMatchMedia(false)
    initTheme()
    const { isDark, toggle } = useTheme()
    expect(isDark.value).toBe(false)

    toggle()
    expect(isDark.value).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
  })
})
