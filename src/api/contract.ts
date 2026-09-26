/**
 * OpenAPI 契约的类型门面（前端调用点的唯一契约入口）。
 *
 * 数据流：
 *   backend controller 注解
 *     → /v3/api-docs（springdoc 3.1.1）
 *     → backend/spec/openapi/drone-backend.openapi.json（归一化后的结构 SSOT，整文档漂移门禁）
 *     → openapi/drone-backend.openapi.json（本仓 vendor，sha256 对账）
 *     → src/api/generated/openapi.d.ts（openapi-typescript 生成，禁止手改）
 *     → 本文件（把生成物翻译成调用点可直接用的类型）
 *     → src/api/modules/*.ts（各调用点）
 *
 * 运行时仍是既有的 axios 实例 request.ts：401 单飞刷新、登出跳转等行为不变，
 * 本文件只负责「路径 / 方法 / 路径参数 / 查询参数 / 请求体 / 响应信封」的静态类型。
 */
import request from './request'
import { BizError } from './modules/order'
import type { components, operations, paths } from './generated/openapi'

/** 契约中的全部路径 */
export type ApiPath = keyof paths
/** 契约中的全部 schema（后端 VO/DTO 的唯一类型来源） */
export type Schemas = components['schemas']
/** 契约中的全部 operation */
export type Operations = operations

/** 路径 P 支持的 HTTP 方法（生成物里不支持的方法为 never） */
export type HttpMethod<P extends ApiPath> = {
  [M in keyof paths[P]]: paths[P][M] extends { responses: unknown } ? M : never
}[keyof paths[P]]

/** 具备方法 M 的路径集合（把「该路径没有这个方法」挡在编译期） */
export type PathsWith<M extends string> = {
  [P in ApiPath]: M extends keyof paths[P] ? P : never
}[ApiPath]

/** 200 响应的 JSON 响应体（后端统一信封 Result<T>） */
export type OkBody<P extends ApiPath, M extends keyof paths[P]> =
  paths[P][M] extends { responses: { 200: infer R } }
    ? R extends { content: { 'application/json': infer Body } }
      ? Body
      : never
    : never

/** 200 响应信封里真正的业务数据 data（已去掉 null） */
export type OkData<P extends ApiPath, M extends keyof paths[P]> =
  OkBody<P, M> extends { data?: infer D } ? NonNullable<D> : never

/** 请求体类型（无请求体时为 never） */
export type BodyOf<P extends ApiPath, M extends keyof paths[P]> =
  paths[P][M] extends { requestBody?: infer RB }
    ? RB extends { content: { 'application/json': infer B } }
      ? B
      : never
    : never

/** 查询参数类型（无查询参数时为 never） */
export type QueryOf<P extends ApiPath, M extends keyof paths[P]> =
  paths[P][M] extends { parameters: { query?: infer Q } } ? Q : never

/** 路径参数类型（如 /admin/orders/{orderNum} 的 { orderNum }；无路径参数时为 never） */
export type PathParamsOf<P extends ApiPath, M extends keyof paths[P]> =
  paths[P][M] extends { parameters: { path?: infer PP } } ? PP : never

/** 调用选项：按契约约束 path/query/body，三者在编译期即被钉死 */
export type CallOptions<P extends ApiPath, M extends keyof paths[P]> = {
  path?: PathParamsOf<P, M>
  params?: QueryOf<P, M>
  body?: BodyOf<P, M>
}

type EnvelopeLike = {
  success?: boolean
  data?: unknown
  errorCode?: string | null
  message?: string | null
}

const resolveUrl = (template: string, pathParams: unknown): string => {
  if (!template.includes('{')) {
    return template
  }
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = (pathParams as Record<string, unknown> | undefined)?.[key]
    if (value === undefined || value === null) {
      throw new Error(`调用 ${template} 缺少路径参数 ${key}`)
    }
    return encodeURIComponent(String(value))
  })
}

const toQueryConfig = (params: unknown): { params: Record<string, unknown> } | undefined =>
  params === undefined || params === null ? undefined : { params: params as Record<string, unknown> }

interface RawCallOptions {
  path?: unknown
  params?: unknown
  body?: unknown
}

/** 统一的运行时调用实现：泛型只出现在返回类型上，路径/参数的类型约束由各 apiX 承担 */
const call = async <B>(
  method: 'get' | 'post' | 'put' | 'delete',
  template: string,
  options: RawCallOptions | undefined,
): Promise<B> => {
  const url = resolveUrl(template, options?.path)
  const config = toQueryConfig(options?.params)

  switch (method) {
    case 'get':
      return (await request.get<B>(url, config)).data
    case 'post':
      return (await request.post<B>(url, options?.body ?? null, config)).data
    case 'put':
      return (await request.put<B>(url, options?.body ?? null, config)).data
    default:
      return (await request.delete<B>(url, config)).data
  }
}

/** GET：路径/路径参数/查询参数/响应信封全部来自契约 */
export const apiGet = <P extends PathsWith<'get'>>(
  template: P,
  options?: CallOptions<P, 'get'>,
): Promise<OkBody<P, 'get'>> => call<OkBody<P, 'get'>>('get', template, options)

/** POST */
export const apiPost = <P extends PathsWith<'post'>>(
  template: P,
  options?: CallOptions<P, 'post'>,
): Promise<OkBody<P, 'post'>> => call<OkBody<P, 'post'>>('post', template, options)

/** PUT */
export const apiPut = <P extends PathsWith<'put'>>(
  template: P,
  options?: CallOptions<P, 'put'>,
): Promise<OkBody<P, 'put'>> => call<OkBody<P, 'put'>>('put', template, options)

/** DELETE */
export const apiDelete = <P extends PathsWith<'delete'>>(
  template: P,
  options?: CallOptions<P, 'delete'>,
): Promise<OkBody<P, 'delete'>> => call<OkBody<P, 'delete'>>('delete', template, options)

/**
 * 待 vendor 同步端点的响应信封（结构与后端 Result<T> 一致）。
 * 契约同步后调用点应改用 `OkBody` 推导并删除此类型。
 */
export type PendingEnvelope<D> = {
  success?: boolean
  data?: D
  errorCode?: string | null
  message?: string | null
}

/**
 * 契约渐进 GET：后端 spec 已提供、本仓 vendor 契约（openapi/）尚未收录的端点专用。
 *
 * 与 `apiGet` 的唯一差别：路径与响应类型由调用点显式给出，不从契约推导——因为该端点
 * 还不在 `src/api/generated/openapi.d.ts` 里，写成字面量路径的 apiGet 调用无法通过类型检查。
 *
 * 迁移要求（TASK-PLATFORM-001 vendor 同步后必须完成）：
 *   1. `pnpm api` 重新 vendor + 生成；
 *   2. 调用点改回字面量路径的 apiGet 调用，并在 tests/unit/openapi-contract.spec.ts 登记 CALLED_OPERATIONS；
 *   3. 把该端点从同文件的 PENDING_OPERATIONS 移除（同步后其「尚未 vendor」断言会失败，强制本迁移）。
 */
export const apiGetPending = async <D = unknown, B = PendingEnvelope<D>>(
  template: string,
  options?: { path?: Record<string, string | number>; params?: Record<string, unknown> },
): Promise<B> => call<B>('get', template, options)

/** 取信封 data：success=false 或 data 为空即抛 BizError（与旧 unwrap 语义一致） */
export const expectData = <E extends EnvelopeLike>(
  envelope: E,
  fallbackMessage: string,
): NonNullable<E['data']> => {
  if (!envelope?.success || envelope.data === undefined || envelope.data === null) {
    throw new BizError(envelope?.errorCode ?? 'UNKNOWN', envelope?.message ?? fallbackMessage)
  }
  return envelope.data as NonNullable<E['data']>
}

/** 只校验 success（用于 Result<Void> 这类无返回值的写接口），返回后端提示文案 */
export const expectSuccess = (envelope: EnvelopeLike, fallbackMessage: string): string => {
  if (!envelope?.success) {
    throw new BizError(envelope?.errorCode ?? 'UNKNOWN', envelope?.message ?? fallbackMessage)
  }
  return envelope.message ?? ''
}
