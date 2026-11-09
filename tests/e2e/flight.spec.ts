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
    const event = (eventId: string, type: string, capturedAt: number, payload: Record<string, number>) => ({
      eventId, type, capturedAt, receivedAt: capturedAt,
      serialNumber: 'SN-1', serialSource: 'FLIGHT_CONTROLLER', modelCode: 'FC30', payload,
    })
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
      timeline: [], assignments: [],
      // 管理端连机记录仍由订单详情返回；它只用于「任务监管」页签可见性。
      connections: path.endsWith('/TRACK')
        ? [{ connectionId: 'c1', serialNumber: 'SN-1', openedAt: new Date().toISOString(), endedAt: new Date().toISOString() }]
        : [],
    }
    else if (path === '/dispatch/orders/LIVE/flight') {
      const capturedAt = Date.now() - 45_000
      data = {
        aircraft: [{ serialNumber: 'SN-1', serialSource: 'FLIGHT_CONTROLLER', modelCode: 'FC30', stale: false, latest: {} }],
        lastPosition: event('p3', 'POSITION', capturedAt, { latitudeDegE7: 300_000_000, longitudeDegE7: 1_200_000_000 }),
        flightPeriods: [{ serialNumber: 'SN-1', serialSource: 'FLIGHT_CONTROLLER', takeoffAt: capturedAt - 60_000 }],
        projectionRevision: 4,
        stale: true,
      }
    }
    else if (path === '/dispatch/orders/TRACK/flight') {
      data = {
        aircraft: [],
        flightPeriods: [{ serialNumber: 'SN-1', serialSource: 'FLIGHT_CONTROLLER', takeoffAt: Date.now() - 120_000, landedAt: Date.now() - 60_000 }],
        projectionRevision: 3,
        stale: true,
      }
    }
    else if (path === '/dispatch/orders/IDLE/flight') {
      data = {
        aircraft: [],
        flightPeriods: [{ serialNumber: 'SN-1', serialSource: 'FLIGHT_CONTROLLER', takeoffAt: Date.now() - 900_000, landedAt: Date.now() - 300_000 }],
        projectionRevision: 2,
        stale: true,
      }
    }
    else if (['TRACK', 'LIVE', 'IDLE'].some((id) => path === `/dispatch/orders/${id}/flight/history`)) {
      const now = Date.now()
      data = {
        items: path.endsWith('/TRACK/flight/history')
          ? [
            event('p1', 'POSITION', now - 10_000, { latitudeDegE7: 300_000_000, longitudeDegE7: 1_200_000_000 }),
            event('alt1', 'ALTITUDE', now - 10_000, { altitudeMm: 25_000 }),
            event('p2', 'POSITION', now, { latitudeDegE7: 310_000_000, longitudeDegE7: 1_210_000_000 }),
            event('alt2', 'ALTITUDE', now, { altitudeMm: 35_000 }),
          ]
          : [],
        hasNext: false,
      }
    }
    else if (path === '/config/map') data = { key: '', serviceHost: null }
    else if (path === '/webUav/position') data = null
    else if (path === '/webUav/trajectory') data = []
    else if (path === '/equipment/notifications') data = { content: [], totalElements: 0, totalPages: 0 }
    else if (/^\/dispatch\/orders\/[^/]+\/live$/.test(path)) {
      data = { configured: false, state: 'IDLE', liveId: null }
    }
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

test('地图未配置时仍能查看事件历史、回放和飞行区间', async ({ page }) => {
  await api(page)
  await page.goto('/orders/TRACK?tab=supervise')
  await login(page)
  await expect(page.getByText('地图服务尚未配置', { exact: true })).toBeVisible()
  await expect(page.getByText('遥测中断区间', { exact: true })).toBeVisible()
  await expect(page.getByText('高度 25 m', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '播放轨迹', exact: true }).click()
  await expect(page.getByText('高度 35 m', { exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '飞机' })).toBeVisible()
})

test('运输中订单载入最后位置、标记中断并显示订单申报重量', async ({ page }) => {
  await api(page)
  await page.goto('/orders/LIVE?tab=supervise')
  await login(page)
  await expect(page.getByText('信号中断', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('下单申报 12 kg', { exact: true }).first()).toBeVisible()
})

test('全屏监管也载入运输中订单最后位置与申报重量', async ({ page }) => {
  await api(page)
  await page.goto('/orders/LIVE/supervise')
  await login(page)
  await expect(page.getByText('信号中断', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('下单申报 12 kg', { exact: true }).first()).toBeVisible()
})

test('飞手到场但无事件上报时实时区显示暂无数据', async ({ page }) => {
  await api(page)
  await page.goto('/orders/IDLE/supervise')
  await login(page)
  await expect(page.getByTestId('flight-live-empty')).toContainText('暂无数据')
  await expect(page.getByText('信号中断', { exact: false })).toHaveCount(0)
})
