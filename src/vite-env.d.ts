/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** axios baseURL；未设时默认 `/api`。生产示例：`https://droneapi.fuwaki.icu/api` */
  readonly VITE_API_BASE_URL?: string
  /** WebSocket 源站（可选）。未设则从绝对 VITE_API_BASE_URL 推导，再否则用页面 host */
  readonly VITE_WS_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
