import { describe, expect, it } from 'vitest'
import { escapeCsvCell, toCsv } from '../../src/utils/csv'

describe('CSV 导出纯函数', () => {
  it('含逗号的值加双引号包裹', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"')
  })

  it('含引号的值翻倍引号', () => {
    expect(escapeCsvCell('a"b')).toBe('"a""b"')
  })

  it('含换行的值加双引号包裹', () => {
    expect(escapeCsvCell('a\nb')).toBe('"a\nb"')
    expect(escapeCsvCell('a\r\nb')).toBe('"a\r\nb"')
  })

  it('公式注入防护：= + - @ 开头前置单引号', () => {
    expect(escapeCsvCell('=cmd()')).toBe("'=cmd()")
    expect(escapeCsvCell('+1+2')).toBe("'+1+2")
    expect(escapeCsvCell('-1+2')).toBe("'-1+2")
    expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)")
  })

  it('普通值不加引号', () => {
    expect(escapeCsvCell('ORD-F01')).toBe('ORD-F01')
  })

  it('null / undefined 转空串', () => {
    expect(escapeCsvCell(null)).toBe('')
    expect(escapeCsvCell(undefined)).toBe('')
  })

  it('toCsv 拼接表头与数据行，带 UTF-8 BOM', () => {
    const csv = toCsv(['a', 'b'], [['1', '2'], ['3', '4']])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('a,b\n1,2\n3,4')
  })
})
