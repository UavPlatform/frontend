#!/usr/bin/env node
/**
 * 把后端仓的 OpenAPI 结构契约（SSOT）vendor 到本仓，并记录 sha256 供对账。
 *
 * 依据：backend/spec/openapi/drone-backend.openapi.json（结构 SSOT）的 vendored 副本
 *   - D1：后端仓 spec/openapi/drone-backend.openapi.json 是唯一结构事实源；
 *   - T2-R10：跨仓不做自动同步，改为「vendor 规格 + sha256 对账」；
 *   - T2-R11：每端固定一种生成器 + 锁版本 + 生成物入库。
 *
 * 用法：
 *   pnpm api:sync                       # 从 ../backend/spec/openapi 取最新契约
 *   OPENAPI_SOURCE=/path/to/spec.json pnpm api:sync
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vendorDir = resolve(root, 'openapi')
const vendorSpec = resolve(vendorDir, 'drone-backend.openapi.json')
const vendorSha = resolve(vendorDir, 'drone-backend.openapi.sha256')

const candidates = [
  process.env.OPENAPI_SOURCE,
  resolve(root, '../backend/spec/openapi/drone-backend.openapi.json'),
].filter(Boolean)

const source = candidates.find((candidate) => existsSync(candidate))
if (!source) {
  console.error('[openapi] 未找到后端契约文件，尝试过：')
  for (const candidate of candidates) console.error('  - ' + candidate)
  console.error('[openapi] 可先用 OPENAPI_SOURCE=<path> 指定；后端导出命令：bash backend/tools/openapi-export.sh')
  process.exit(1)
}

mkdirSync(vendorDir, { recursive: true })
copyFileSync(source, vendorSpec)

const content = readFileSync(vendorSpec)
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
