import { expect, test, type Page } from '@playwright/test'

// Browser integration: real Vue/router/Axios/Element Plus, isolated HTTP responses.
// Never connect the refund tests to a live payment backend.
async function api(page: Page) {
  const writes: string[] = []
  let approved = false
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/^\/api/, '')
    let data: unknown
    if (route.request().method() === 'POST') writes.push(path)
    const order = (num: string) => ({
      orderNum: num, taskNum: 'T1', taskName: '吊运任务', userId: 1, ownerName: '测试用户',
      totalAmount: 100, orderStatusCode: approved ? 3 : 6,
      orderStatus: approved ? 'REFUNDED' : 'DISPUTED', orderStatusDesc: approved ? '已退款' : '争议中',
    })
    if (path === '/admin/login') data = { token: 'admin-access-token', admin: { id: 1, name: '管理员' } }
    else if (path === '/admin/orders') data = { content: [order('ORD-A')], totalElements: 1, totalPages: 1 }
    else if (path.startsWith('/admin/orders/')) data = order(decodeURIComponent(path.split('/').at(-1)!))
    else if (path === '/admin/tasks') data = { content: [], totalElements: 0, totalPages: 0 }
    else if (path === '/admin/tasks/T1' || path === '/task/detail') data = { taskNum: 'T1', taskStatus: 'COMPLETED', riderName: '测试飞手' }
    else if (path === '/admin/complaint/list') data = { complaints: [{
      id: 301, orderNum: 'ORD-A', status: approved ? 'APPROVED' : 'PENDING', reason: 'QUALITY_ISSUE', description: '测试投诉', refundAmount: 100,
    }], totalElements: 1, totalPages: 1 }
    else if (path === '/admin/complaint/301/approve') { approved = true; data = null }
    else if (path === '/admin/pilots') data = { content: [], totalElements: 2, totalPages: 1 }
    else if (path === '/admin/pilots/11') data = { userId: 11, userName: '测试飞手', drones: [{ djiId: 'DRONE-A', available: true, online: true }], orders: [] }
    else if (path === '/admin/uav/available') data = null
    else if (path.includes('/applications') || path.includes('/attachments')) data = []
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

test('管理员登录进入可用首页，隐藏未完成入口', async ({ page }) => {
  await api(page)
  await page.goto('/admin/login')
  await login(page)
  await expect(page).toHaveURL('http://127.0.0.1:4173/')
  await expect(page.getByTestId('metric-pilot')).toContainText('在册飞手')
  await expect(page.getByTestId('metric-pilot')).toContainText('2')
  await expect(page.getByTestId('menu-showcase')).toBeVisible()
  await expect(page.getByRole('button', { name: '通知', exact: true })).toHaveCount(0)
})

test('订单直达链接登录后恢复，取消退款不提交，确认后刷新状态', async ({ page }) => {
  const writes = await api(page)
  await page.goto('/orders/ORD-A')
  await expect(page).toHaveURL(/\/admin\/login\?redirect=/)
  await login(page)
  await expect(page).toHaveURL(/\/orders\/ORD-A$/)
  await page.getByPlaceholder('处理备注（驳回时必填驳回理由，批准时可选）').fill('同意退款')
  await page.getByRole('button', { name: '批准（退款）' }).click()
  const dialog = page.getByRole('dialog', { name: '确认投诉处置' })
  await expect(dialog).toContainText('ORD-A')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  expect(writes).not.toContain('/admin/complaint/301/approve')
  await page.getByRole('button', { name: '批准（退款）' }).click()
  await dialog.getByRole('button', { name: '确认提交', exact: true }).click()
  await expect(page.getByRole('button', { name: '批准（退款）' })).toHaveCount(0)
  await expect(page.locator('.el-descriptions').first()).toContainText('已退款')
  expect(writes.filter((path) => path === '/admin/complaint/301/approve')).toHaveLength(1)
})

test('设备状态变更取消后保持原状态', async ({ page }) => {
  const writes = await api(page)
  await page.goto('/pilots/11')
  await login(page)
  const toggle = page.getByRole('switch')
  await expect(toggle).toBeChecked()
  await page.locator('.el-switch').click()
  const dialog = page.getByRole('dialog', { name: '确认设备状态变更' })
  await expect(dialog).toContainText('DRONE-A')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(toggle).toBeChecked()
  expect(writes).not.toContain('/admin/uav/available')
})

test('管理员令牌过期明确提示重新登录并保留目标地址', async ({ page }) => {
  await api(page)
  await page.goto('/admin/login')
  await login(page)
  await page.route('**/api/admin/users?**', (route) => route.fulfill({ status: 401, json: { success: false, message: '登录已过期' } }))
  await page.goto('/users')
  await expect(page).toHaveURL(/\/admin\/login\?reason=expired&redirect=/)
  await expect(page.getByRole('alert').filter({ hasText: '登录已过期，请重新登录后继续操作。' })).toBeVisible()
})

test('多个订单详情独立保留页签并支持键盘切换', async ({ page }) => {
  await api(page)
  await page.goto('/orders/ORD-A')
  await login(page)
  await expect(page.locator('.tab').filter({ hasText: '订单详情 · ORD-A' })).toBeVisible()
  await page.goto('/orders/ORD-B')
  const tab = page.locator('.tab').filter({ hasText: '订单详情 · ORD-A' })
  await expect(tab).toBeVisible()
  await tab.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/orders\/ORD-A$/)
  await expect(page.locator('.tab').filter({ hasText: '订单详情 · ORD-B' })).toBeVisible()
})
