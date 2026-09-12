import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ElementPlus from 'element-plus'
import OnlineUavTable from '../../src/components/dashboard/OnlineUavTable.vue'
import type { UavItem } from '../../src/types/uav'

const buildUav = (overrides: Partial<UavItem> = {}): UavItem => ({
  id: 1,
  uavName: '巡检一号',
  deviceId: 'DJI-001',
  isOnline: true,
  controllerModel: 'RC Plus',
  isAvailable: '1',
  ...overrides,
})

const mountTable = (uavs: UavItem[]) =>
  mount(OnlineUavTable, {
    props: {
      uavs,
      loading: false,
      total: uavs.length,
      page: 1,
      pageSize: 6,
    },
    global: {
      plugins: [ElementPlus],
    },
  })

const findRowByDeviceId = async (wrapper: ReturnType<typeof mountTable>, deviceId: string) => {
  await flushPromises()
  const row = wrapper.findAll('.el-table__row').find((node) => node.text().includes(deviceId))
  expect(row, `应能找到设备 ${deviceId} 所在行`).toBeDefined()
  return row!
}

const findButtonByText = (row: ReturnType<typeof mountTable>, text: string) =>
  row.findAll('button').find((button) => button.text().includes(text))

describe('OnlineUavTable 组件冒烟', () => {
  it('渲染设备行：名称与设备 ID 可见', async () => {
    const wrapper = mountTable([buildUav()])
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('巡检一号')
    expect(text).toContain('DJI-001')
  })

  it('在线且可用设备的「启动直播」可点击，离线设备禁用', async () => {
    const wrapper = mountTable([
      buildUav(),
      buildUav({ id: 2, uavName: '巡检二号', deviceId: 'DJI-002', isOnline: false }),
    ])

    const onlineRow = await findRowByDeviceId(wrapper, 'DJI-001')
    const onlineStart = findButtonByText(onlineRow, '启动直播')
    expect(onlineStart, '在线设备应有启动直播按钮').toBeDefined()
    expect(onlineStart!.attributes('disabled')).toBeUndefined()

    const offlineRow = await findRowByDeviceId(wrapper, 'DJI-002')
    const offlineStart = findButtonByText(offlineRow, '启动直播')
    expect(offlineStart, '离线设备应有启动直播按钮').toBeDefined()
    expect(offlineStart!.attributes('disabled')).toBeDefined()
  })

  it('直播中的设备按钮显示「直播中」且禁用', async () => {
    const wrapper = mountTable([buildUav({ liveState: 'RUNNING' })])

    const row = await findRowByDeviceId(wrapper, 'DJI-001')
    const startButton = findButtonByText(row, '直播中')
    expect(startButton, '直播中状态应有对应按钮文案').toBeDefined()
    expect(startButton!.attributes('disabled')).toBeDefined()
  })

  it('点击「选择」发出 select 事件并携带设备数据', async () => {
    const uav = buildUav()
    const wrapper = mountTable([uav])

    const row = await findRowByDeviceId(wrapper, 'DJI-001')
    await findButtonByText(row, '选择')!.trigger('click')

    const emitted = wrapper.emitted('select')
    expect(emitted).toHaveLength(1)
    expect(emitted![0][0]).toEqual(uav)
  })

  it('点击在线设备的「启动直播」发出 start-live 事件并携带 deviceId', async () => {
    const wrapper = mountTable([buildUav()])

    const row = await findRowByDeviceId(wrapper, 'DJI-001')
    await findButtonByText(row, '启动直播')!.trigger('click')

    const emitted = wrapper.emitted('start-live')
    expect(emitted).toHaveLength(1)
    expect(emitted![0][0]).toBe('DJI-001')
  })
})
