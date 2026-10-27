import { expect, test, type Page } from '@playwright/test'

// Browser integration: real Vue/router/Axios/Element Plus, isolated HTTP responses.
// Never connect mutation tests to a live backend.
async function api(page: Page) {
  const writes: string[] = []
  const token = `test.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test`
  await page.routeWebSocket(/\/ws\/web/, (socket) => { socket.onMessage(() => undefined) })
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '')
    let data: unknown
    if (route.request().method() === 'POST') writes.push(path)
    if (path === '/admin/login') data = { token, admin: { id: 1, name: '管理员' } }
    else if (path === '/admin/aircraft-models') data = { content: [{ id: 1, enabled: true, modelCode: 'FC30', displayName: 'FlyCart' }], totalElements: 1 }
    else if (path === '/admin/drones') data = {
      content: [{
        droneId: 'd1', serialNumber: 'SN-1', airportName: '测试机场', enabled: true,
        borrowStatus: 'IN_STOCK', latitude: 30, longitude: 120,
        model: { aircraftModelId: 1, displayName: 'FlyCart' },
      }], totalElements: 1,
    }
    else if (path === '/admin/drones/d1/borrows') data = {
      content: [{ pilotName: '测试借机飞手', borrowedAt: new Date().toISOString() }], totalElements: 1,
    }
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

test('窄屏机场登记与借还记录可操作，取消不写入', async ({ page }) => {
  const writes = await api(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/drones')
  await login(page)
  await page.getByTestId('drone-create').click()
  const dialog = page.getByRole('dialog', { name: '登记无人机' })
  await expect(dialog).toBeVisible()
  const bounds = await dialog.boundingBox()
  expect(bounds!.width).toBeLessThanOrEqual(390)
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '借还记录', exact: true }).click()
  await expect(page.getByText('测试借机飞手', { exact: true })).toBeVisible()
  expect(writes).not.toContain('/admin/drones')
})
