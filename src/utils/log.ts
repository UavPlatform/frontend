/** 日志结构化渲染的纯函数：级别识别 + 级别/关键字过滤。 */

export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'OTHER'

/**
 * 识别一行日志的级别。
 * 优先解析结构化格式 `<timestamp> | <LEVEL> | ...`（避免按关键词误判），
 * 非结构化行（如异常堆栈）回落到关键词匹配。
 */
export const levelOf = (line: string): LogLevel => {
  const structured = line.match(/\|\s*(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\s*\|/i)
  if (structured) {
    const token = structured[1].toUpperCase()
    if (token === 'WARNING') return 'WARN'
    if (token === 'TRACE') return 'DEBUG'
    return token as LogLevel
  }
  if (/\b(ERROR|EXCEPTION|FATAL)\b/i.test(line)) return 'ERROR'
  if (/\b(WARN|WARNING)\b/i.test(line)) return 'WARN'
  if (/\bINFO\b/i.test(line)) return 'INFO'
  if (/\b(DEBUG|TRACE)\b/i.test(line)) return 'DEBUG'
  return 'OTHER'
}

export interface LogEntry {
  line: string
  level: LogLevel
}

export const toEntries = (lines: string[]): LogEntry[] =>
  lines.map((line) => ({ line, level: levelOf(line) }))

/** 按级别 + 关键字过滤日志条目（level 为 ALL 表示不过滤级别；keyword 为空表示不过滤关键字） */
export const filterEntries = (
  entries: LogEntry[],
  level: 'ALL' | LogLevel,
  keyword: string,
): LogEntry[] => {
  const kw = keyword.trim().toLowerCase()
  return entries.filter((entry) => {
    if (level !== 'ALL' && entry.level !== level) return false
    if (kw && !entry.line.toLowerCase().includes(kw)) return false
    return true
  })
}
