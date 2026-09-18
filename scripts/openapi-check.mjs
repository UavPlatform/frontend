#!/usr/bin/env node
/**
 * 校验 vendor 进来的 OpenAPI 契约未被就地篡改（sha256 对账）。
 * 消费侧门禁：契约文件与生成物必须同源同一修订。
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vendorSpec = resolve(root, 'openapi/drone-backend.openapi.json')
const vendorSha = resolve(root, 'openapi/drone-backend.openapi.sha256')

if (!existsSync(vendorSpec) || !existsSync(vendorSha)) {
  console.error('[openapi] vendor 契约缺失，先运行 pnpm api:sync')
  process.exit(1)
}

const actual = createHash('sha256').update(readFileSync(vendorSpec)).digest('hex')
const expected = readFileSync(vendorSha, 'utf8').trim().split(/\s+/)[0]

if (actual !== expected) {
  console.error('[openapi] 契约 sha256 不匹配（vendor 文件被改动或未重新对账）')
  console.error('          expected = ' + expected)
  console.error('          actual   = ' + actual)
  process.exit(1)
}

console.log('[openapi] OK：vendor 契约 sha256 = ' + actual)
