import { describe, expect, it } from 'vitest'
import { decodeEnvelope, encodeEnvelope } from '../../src/api/ws/ws-codec'

describe('ws-codec', () => {
  it('encodeEnvelope 将信封序列化为 JSON 字符串', () => {
    const raw = encodeEnvelope({ type: 'REQ', name: 'live.start', deviceId: 'DJI-001' })

    expect(typeof raw).toBe('string')
    expect(JSON.parse(raw)).toEqual({
      type: 'REQ',
      name: 'live.start',
      deviceId: 'DJI-001',
    })
  })

  it('decodeEnvelope 解析合法信封并保留 data 载荷', () => {
    const raw = JSON.stringify({
      type: 'UAV_STATUS_UPDATE',
      name: 'uav.status',
      deviceId: 'DJI-001',
      timestamp: 1_700_000_000_000,
      data: { battery: 88, speed: 3.5 },
    })

    const envelope = decodeEnvelope(raw)

    expect(envelope).not.toBeNull()
    expect(envelope?.type).toBe('UAV_STATUS_UPDATE')
    expect(envelope?.deviceId).toBe('DJI-001')
    expect(envelope?.data).toEqual({ battery: 88, speed: 3.5 })
  })

  it('decodeEnvelope 对非法 JSON 返回 null', () => {
    expect(decodeEnvelope('{not-json')).toBeNull()
    expect(decodeEnvelope('')).toBeNull()
  })

  it('decodeEnvelope 对缺少 type/name 的报文返回 null', () => {
    expect(decodeEnvelope(JSON.stringify({ type: 'X' }))).toBeNull()
    expect(decodeEnvelope(JSON.stringify({ name: 'uav.status' }))).toBeNull()
    expect(decodeEnvelope(JSON.stringify([1, 2, 3]))).toBeNull()
  })

  it('encode → decode 往返一致', () => {
    const envelope = { type: 'ACK', name: 'live.ack', success: true }
    expect(decodeEnvelope(encodeEnvelope(envelope))).toEqual(envelope)
  })
})
