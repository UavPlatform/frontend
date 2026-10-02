import { expect, it } from 'vitest'
import { forEachConcurrent } from '../../src/utils/concurrency'

it('caps concurrent telemetry requests and eventually processes all rows', async () => {
  let active = 0
  let peak = 0
  const completed: number[] = []
  await forEachConcurrent(Array.from({ length: 20 }, (_, i) => i), 4, async (item) => {
    active += 1
    peak = Math.max(active, peak)
    await new Promise<void>((resolve) => setTimeout(resolve, 1))
    completed.push(item)
    active -= 1
  })
  expect(peak).toBe(4)
  expect(completed.sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i))
})
