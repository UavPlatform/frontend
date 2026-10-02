/** Process a snapshot with a fixed number of workers instead of one request per row at once. */
export async function forEachConcurrent<T>(items: readonly T[], limit: number, action: (item: T) => Promise<void>) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(items.length, Math.max(1, limit)) }, async () => {
    while (next < items.length) {
      const item = items[next++]!
      await action(item)
    }
  }))
}
