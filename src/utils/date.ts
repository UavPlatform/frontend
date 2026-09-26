// 首页看板与订单列表共用的时间格式化（本地时区，格式与后端 yyyy-MM-dd HH:mm:ss 对齐）

const pad = (value: number) => String(value).padStart(2, '0')

const formatDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** 时分秒 → HH:mm:ss（「更新于」时间戳、遥测最后上报时间用） */
export const formatClock = (date: Date = new Date()) =>
  `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`

/** 日期时间 → yyyy-MM-dd HH:mm:ss（与后端 createTime 同形，可直接做字符串上下界比较） */
export const formatDateTime = (date: Date = new Date()) =>
  `${formatDate(date)} ${formatClock(date)}`

/** 毫秒时长 → 「X 小时 Y 分钟」/「X 分钟」（飞行卡已飞时长用） */
export const formatDuration = (ms: number) => {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '—'
  }
  const totalMinutes = Math.floor(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`
}
