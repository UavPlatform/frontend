import { describe, expect, it } from 'vitest'
import { isOutOfChina, wgs84ToGcj02 } from '../../src/utils/coordinate'

describe('wgs84ToGcj02 local conversion (REQ-SUP-MON-007)', () => {
  it('matches the reference GCJ-02 offset for a point in Shanghai', () => {
    // Reference vector from the widely used eviltransform test suite.
    const [lng, lat] = wgs84ToGcj02(121.5272106, 31.1774276)
    expect(lng).toBeCloseTo(121.531541859215, 9)
    expect(lat).toBeCloseTo(31.17530398364597, 9)
  })

  it('shifts mainland coordinates by a few hundred metres at most', () => {
    for (const [wgsLng, wgsLat] of [[116.391, 39.907], [113.264, 23.129], [104.066, 30.572], [87.617, 43.826]]) {
      const [lng, lat] = wgs84ToGcj02(wgsLng, wgsLat)
      const metres = Math.hypot((lng - wgsLng) * 111_320 * Math.cos((wgsLat * Math.PI) / 180), (lat - wgsLat) * 110_540)
      expect(metres).toBeGreaterThan(50)
      expect(metres).toBeLessThan(1_000)
    }
  })

  it('leaves coordinates outside China and invalid values untouched', () => {
    expect(isOutOfChina(-122.4, 37.8)).toBe(true)
    expect(isOutOfChina(120, 30)).toBe(false)
    expect(wgs84ToGcj02(-122.4, 37.8)).toEqual([-122.4, 37.8])
    expect(wgs84ToGcj02(139.69, 60)).toEqual([139.69, 60])
    expect(wgs84ToGcj02(Number.NaN, 30)).toEqual([Number.NaN, 30])
  })
})
