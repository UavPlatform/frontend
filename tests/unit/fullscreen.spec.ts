import { describe, expect, it } from 'vitest'
import { useFullscreen } from '../../src/composables/useFullscreen'

describe('useFullscreen', () => {
  it('toggle 切换全屏状态（模块级共享状态，两次 toggle 回到初始）', () => {
    const { isFullscreen, toggle } = useFullscreen()
    const initial = isFullscreen.value

    toggle()
    expect(isFullscreen.value).toBe(!initial)

    toggle()
    expect(isFullscreen.value).toBe(initial)
  })
})
