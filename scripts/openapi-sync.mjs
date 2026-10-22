#!/usr/bin/env node
/**
 * 把后端仓的 OpenAPI 结构契约（SSOT）vendor 到本仓，并记录 sha256 供对账。
 *
 * 依据：backend/spec/openapi/drone-backend.openapi.json（结构 SSOT）的 vendored 副本
 *   - D1：后端仓 spec/openapi/drone-backend.openapi.json 是唯一结构事实源；
 *   - T2-R11：每端固定一种生成器 + 锁版本 + 生成物入库。
 *   - 自动同步：后端发布 contract-* Release + repository_dispatch 触发机器人 PR（见 docs 仓库 ADR）。
 *
 * 用法：
 *   pnpm api:sync                       # 从后端 Release/raw 拉取最新契约
 *   OPENAPI_SOURCE=/path/to/spec.json pnpm api:sync
 *   OPENAPI_SOURCE=https://... pnpm api:sync
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vendorDir = resolve(root, 'openapi')
const vendorSpec = resolve(vendorDir, 'drone-backend.openapi.json')
const vendorSha = resolve(vendorDir, 'drone-backend.openapi.sha256')

/**
 * 从 URL 下载内容
 */
async function fetchUrl(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }
  return Buffer.from(await response.text(), 'utf8')
}

/**
 * 获取契约内容（本地文件或 URL）
 */
async function getContent(source) {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    console.log('[openapi] 从 URL 下载：' + source)
    return await fetchUrl(source)
  } else if (existsSync(source)) {
    console.log('[openapi] 从本地文件读取：' + relative(root, source))
    return Buffer.from(readFileSync(source, 'utf8'), 'utf8')
  }
  return null
}

const candidates = [
  process.env.OPENAPI_SOURCE,
  'https://raw.githubusercontent.com/UavPlatform/backend/main/spec/openapi/drone-backend.openapi.json',
  resolve(root, '../backend/spec/openapi/drone-backend.openapi.json'),
].filter(Boolean)

let content
let source
for (const candidate of candidates) {
  try {
    content = await getContent(candidate)
    if (content) {
      source = candidate
      break
    }
  } catch (error) {
    console.warn(`[openapi] 跳过 ${candidate}：${error.message}`)
  }
}

if (!content || !source) {
  console.error('[openapi] 未找到后端契约文件，尝试过：')
  for (const candidate of candidates) console.error('  - ' + candidate)
  console.error('[openapi] 可用 OPENAPI_SOURCE=<path|url> 指定')
  process.exit(1)
}

mkdirSync(vendorDir, { recursive: true })
// Match the repository's LF checkout policy before hashing, including Windows exports.
content = Buffer.from(content.toString('utf8').replace(/\r\n/g, '\n'), 'utf8')
writeFileSync(vendorSpec, content)

const sha256 = createHash('sha256').update(content).digest('hex')
writeFileSync(vendorSha, `${sha256}  drone-backend.openapi.json\n`)

const spec = JSON.parse(content.toString('utf8'))
const operations = Object.values(spec.paths ?? {}).reduce(
  (total, item) => total + Object.keys(item).filter((key) => key !== 'parameters').length,
  0,
)

console.log('[openapi] vendor 完成')
console.log('          source  = ' + relative(root, source))
console.log('          spec    = ' + relative(root, vendorSpec))
console.log('          bytes   = ' + content.length + '  operations = ' + operations)
console.log('          sha256  = ' + sha256)
console.log('[openapi] 下一步：pnpm api:gen（生成 src/api/generated/openapi.d.ts）')
