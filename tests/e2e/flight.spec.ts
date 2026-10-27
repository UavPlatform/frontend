import { expect, test, type Page } from '@playwright/test'

// Browser integration: real Vue/router/Axios/Element Plus, isolated HTTP responses.
// Never connect mutation tests to a live backend.
async function api(page: Page) {
  const writes: string[] = []
  const token = `test.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test`
  await page.routeWebSocket(/\/ws\/web/, (socket) => { socket.onMessage(() => undefined) })
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/^\/api/, '')
    let data: unknown
    if (route.request().method() === 'POST') writes.push(path)
    if (path === '/admin/login') data = { token, admin: { id: 1, name: '管理员' } }
    else if (path === '/admin/dispatch/orders') data = { content: [], totalElements: 0, totalPages: 0 }
    else if (path.startsWith('/admin/dispatch/orders/')) data = {
      order: {
        orderId: decodeURIComponent(path.split('/').at(-1)!),
        stage: path.endsWith('/LIVE') ? 'IN_TRANSIT' : path.endsWith('/IDLE') ? 'PILOT_ARRIVED' : 'COMPLETED',
        fundsStatus: 'SETTLED',
        depositAmount: 100,
        fields: { weightMax: '12' },
      },
      shipper: { userName: '测试货主' }, pilot: { userName: '测试飞手' },
      timeline: [], assignments: [], connections: path.endsWith('/TRACK')
        ? [{ connectionId: 'c1', serialNumber: 'SN-1', openedAt: new Date().toISOString(), endedAt: new Date().toISOString() }]
        : [],
    }
    else if (path === '/dispatch/orders/LIVE/flight') {
      const capturedAt = Date.now() - 45_000
      data = {
        latest: {
          sampleId: 3, capturedAt, receivedAt: new Date(capturedAt).toISOString(),
          latitude: 30, longitude: 120, altitude: 42, speed: 3, battery: 75,
        },
        lastPosition: {
          sampleId: 3, capturedAt, receivedAt: new Date(capturedAt).toISOString(),
          latitude: 30, longitude: 120, altitude: 42, speed: 3, battery: 75,
        },
        // Realtime follows the aircraft connection (docs#22): an open connection has no endedAt.
        connection: { connectionId: 'c1', serialNumber: 'SN-1', openedAt: new Date(capturedAt - 60_000).toISOString(), endedAt: null },
        stale: true,
      }
    }
    else if (path === '/dispatch/orders/IDLE/flight') {
      const openedAt = new Date(Date.now() - 600_000).toISOString()
      data = {
        connection: { connectionId: 'c0', serialNumber: 'SN-1', openedAt, endedAt: new Date(Date.now() - 300_000).toISOString() },
        stale: true,
        connectionHistory: [],
      }
    }
    else if (['TRACK', 'LIVE', 'IDLE'].some((id) => path === `/dispatch/orders/${id}/flight/history`)) {
      data = {
        items: path.includes('/TRACK/')
          ? [
            { sampleId: 1, capturedAt: Date.now() - 10_000, latitude: 30, longitude: 120, altitude: 25 },
            { sampleId: 2, capturedAt: Date.now(), latitude: 31, longitude: 121, altitude: 35 },
          ]
          : [],
        connections: path.includes('/TRACK/')
          ? [{ connectionId: 'c1', serialNumber: 'SN-1', openedAt: new Date().toISOString(), endedAt: new Date().toISOString() }]
          : [],
        hasNext: false,
      }
    }
    else if (path === '/config/map') data = { key: '', serviceHost: null }
    else if (path === '/webUav/position') data = null
    else if (path === '/webUav/trajectory') data = []
    else if (path === '/live/get') data = { liveState: 'IDLE', ackConfirmed: false }
    else if (path === '/live/leave') data = null
    else throw new Error(`Unmocked API request: ${route.request().method()} ${path}`)
    await route.fulfill({ json: { success: true, data } })
  })
  return writes
}

async function login(page: Page) {
  await page.getByPlaceholder('请输入管理员账号').fill('admin')
  await page.getByPlaceholder('请输入管理员密码').fill('password')
  await page.getByRole('button', { name: '进入管理中心', exact: true }).click()
}

test('地图未配置时仍能查看历史遥测、回放和连机记录', async ({ page }) => {
  await api(page)
  await page.goto('/orders/TRACK?tab=supervise')
  await login(page)
  await expect(page.getByText('地图服务尚未配置', { exact: true })).toBeVisible()
  await expect(page.getByText('遥测中断区间', { exact: true })).toBeVisible()
  await expect(page.getByText('高度 25 m', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '播放轨迹', exact: true }).click()
  await expect(page.getByText('高度 35 m', { exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '设备连接' })).toBeVisible()
})

test('运输中订单载入当前遥测快照、标记中断并显示订单申报重量', async ({ page }) => {
  await api(page)
  await page.goto('/orders/LIVE?tab=supervise')
  await login(page)
  await expect(page.getByText('信号中断', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('高度 42 m', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('下单申报 12 kg', { exact: true }).first()).toBeVisible()
})

test('全屏监管也载入运输中订单快照与申报重量', async ({ page }) => {
  await api(page)
  await page.goto('/orders/LIVE/supervise')
  await login(page)
  await expect(page.getByText('信号中断', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('高度 42 m', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('下单申报 12 kg', { exact: true }).first()).toBeVisible()
})

test('飞手到场但飞机未连机时实时区显示暂无数据', async ({ page }) => {
  await api(page)
  // 订单详情的「任务监管」页签仍按阶段/连机记录显示，这里走全屏监管页。
  await page.goto('/orders/IDLE/supervise')
  await login(page)
  await expect(page.getByTestId('flight-live-empty')).toContainText('暂无数据')
  await expect(page.getByText('信号中断', { exact: false })).toHaveCount(0)
  await expect(page.getByText('高度 42 m', { exact: true })).toHaveCount(0)
})
