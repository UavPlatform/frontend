/**
 * 手动控制 settle 时机的 promise。
 *
 * 不用 `Promise.withResolvers()`：CI 跑 Node 20（`.github/workflows/ci.yml`），
 * 该 API 是 Node 22+ 才有的，本地 Node 版本更新会掩盖这个差异。
 */
export interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
}

export const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
