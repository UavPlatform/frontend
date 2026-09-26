import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import MainLayout from '../../src/layouts/MainLayout.vue'
import router from '../../src/router'
import { clearStoredSession, setStoredSession } from '../../src/api/session'
import type { AuthSession } from '../../src/types/auth'

// TASK-FRONTEND-004：主体详情路由 + 侧栏归属高亮（详情页不丢一级导航态）
const adminSession: AuthSession = {
  token: 'token',
  user: { username: 'admin', displayName: '张监管', role: 'ADMIN', teamName: '平台' },
}

const cleanups: Array<() => void> = []

describe('主体详情路由（TASK-FRONTEND-004）', () => {
  beforeEach(async () => {
    clearStoredSession()
    // 复位到登录页（未登录落点），避免同地推送跳过守卫
    await router.push('/orders')
    expect(router.currentRoute.value.name).toBe('admin-login')
  })

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup()
    }
    clearStoredSession()
  })

  it('用户/飞手的列表与详情路由均可解析', () => {
    expect(router.resolve('/users').name).toBe('users')
    expect(router.resolve('/users/7').name).toBe('user-detail')
    expect(router.resolve('/users/7').params.id).toBe('7')
    expect(router.resolve('/pilots').name).toBe('pilots')
    expect(router.resolve('/pilots/11').name).toBe('pilot-detail')
    expect(router.resolve('/pilots/11').params.id).toBe('11')
  })

  it('未登录访问详情路由跳登录页', async () => {
    await router.push('/users/7')
    expect(router.currentRoute.value.name).toBe('admin-login')
  })

  it('详情页侧栏仍高亮所属一级菜单（用户 / 飞手）', async () => {
    setStoredSession(adminSession)

    const assertActive = async (path: string, label: string) => {
      await router.push(path)
      const wrapper = mount(MainLayout, {
        props: { title: '主体详情' },
        global: { plugins: [router, ElementPlus] },
      })
      cleanups.push(() => wrapper.unmount())
      await flushPromises()

      const sideButtons = wrapper.findAll('aside button')
      expect(sideButtons.find((item) => item.text().includes(label))!.classes()).toContain(
        'menu-item-active',
      )
      const others = sideButtons.filter(
        (item) =>
          !item.text().includes(label) && item.text() !== '系统日志' && item.text() !== '退出登录',
      )
      for (const other of others) {
        expect(other.classes()).not.toContain('menu-item-active')
      }
      wrapper.unmount()
      cleanups.pop()
    }

    await assertActive('/users/7', '用户')
    await assertActive('/pilots/11', '飞手')
  })
})
