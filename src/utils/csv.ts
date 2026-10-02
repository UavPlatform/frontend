/**
 * CSV 导出纯函数：单元格转义 + 拼接。
 * 转义规则：含逗号/引号/换行时加双引号包裹，内部引号翻倍；
 * 公式注入防护：以 = + - @ 开头的值前置单引号，避免在 Excel 中被当公式执行。
 */

/** 单单元格转义（含公式注入防护） */
export const escapeCsvCell = (value: unknown): string => {
  const raw = value == null ? '' : String(value)
  const needsQuote = /[",\n\r]/.test(raw)
  let out = raw.replace(/"/g, '""')
  if (/^[=+\-@]/.test(out)) {
    out = `'${out}`
  }
  return needsQuote ? `"${out}"` : out
}

/** 表头 + 数据行 → 完整 CSV 文本（带 UTF-8 BOM，便于 Excel 识别中文） */
export const toCsv = (header: string[], rows: unknown[][]): string => {
  const lines = [header, ...rows].map((row) => row.map(escapeCsvCell).join(','))
  return '﻿' + lines.join('\n')
}
