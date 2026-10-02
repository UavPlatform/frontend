import { describe, expect, it } from 'vitest'
import { filterEntries, levelOf, toEntries } from '../../src/utils/log'

describe('日志级别识别 levelOf', () => {
  it.each([
    ['2026-09-26 10:00:00 | INFO | app started', 'INFO'],
    ['2026-09-26 10:00:01 | WARN | low battery', 'WARN'],
    ['2026-09-26 10:00:02 | ERROR | boom', 'ERROR'],
    ['2026-09-26 10:00:03 | DEBUG | stepping', 'DEBUG'],
    ['2026-09-26 10:00:04 | TRACE | entering', 'DEBUG'],
    ['2026-09-26 10:00:05 | WARNING | legacy token', 'WARN'],
    ['2026-09-26 ERROR boom（非结构化行）', 'ERROR'],
    ['java.lang.Exception: something broke', 'ERROR'],
    ['plain text without any level keyword', 'OTHER'],
  ])('%s -> %s', (line, expected) => {
    expect(levelOf(line)).toBe(expected)
  })

  it('结构化级别优先于消息内关键词（消息含 error 不误判）', () => {
    expect(levelOf('2026-09-26 | INFO | no error here')).toBe('INFO')
  })
})

describe('日志过滤 filterEntries', () => {
  const entries = toEntries([
    '2026-09-26 INFO app started',
    '2026-09-26 ERROR boom',
    '2026-09-26 WARN low battery',
    'plain text',
  ])

  it('ALL 级别不过滤', () => {
    expect(filterEntries(entries, 'ALL', '')).toHaveLength(4)
  })

  it('按级别过滤', () => {
    const errors = filterEntries(entries, 'ERROR', '')
    expect(errors).toHaveLength(1)
    expect(errors[0].line).toContain('boom')
  })

  it('按关键字过滤（大小写不敏感）', () => {
    expect(filterEntries(entries, 'ALL', 'battery')).toHaveLength(1)
    expect(filterEntries(entries, 'ALL', 'BATTERY')).toHaveLength(1)
  })

  it('级别 + 关键字组合过滤', () => {
    expect(filterEntries(entries, 'ERROR', 'boom')).toHaveLength(1)
    expect(filterEntries(entries, 'ERROR', 'battery')).toHaveLength(0)
  })

  it('区分「有日志但无匹配」与「暂无日志」', () => {
    // 有日志但级别不匹配 → 空数组（仍是有数据）
    expect(filterEntries(entries, 'DEBUG', '')).toHaveLength(0)
    // 源日志为空 → 空数组（无数据）
    expect(toEntries([])).toHaveLength(0)
  })
})
