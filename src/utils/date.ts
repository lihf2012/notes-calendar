import dayjs from 'dayjs'

export function formatDate(date: string | Date, fmt = 'YYYY-MM-DD'): string {
  return dayjs(date).format(fmt)
}

export function formatDateTime(date: string | Date): string {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

export function formatTime(date: string | Date): string {
  return dayjs(date).format('HH:mm')
}

export function todayStr(): string {
  return dayjs().format('YYYY-MM-DD')
}

export function monthStr(date: string | Date = new Date()): string {
  return dayjs(date).format('YYYY-MM')
}

// 相对时间描述
export function relativeTime(date: string | Date): string {
  const d = dayjs(date)
  const now = dayjs()
  const diffMin = now.diff(d, 'minute')
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHour = now.diff(d, 'hour')
  if (diffHour < 24) return `${diffHour} 小时前`
  const diffDay = now.diff(d, 'day')
  if (diffDay < 7) return `${diffDay} 天前`
  return d.format('YYYY-MM-DD')
}

// 获取某月所有日期的数组
export function getMonthDays(year: number, month: number): { date: string; day: number; inMonth: boolean }[] {
  const first = dayjs(`${year}-${String(month).padStart(2, '0')}-01`)
  const daysInMonth = first.daysInMonth()
  const startWeekday = first.day() // 0=周日
  const result: { date: string; day: number; inMonth: boolean }[] = []
  // 上月填充
  for (let i = 0; i < startWeekday; i++) {
    const d = first.subtract(startWeekday - i, 'day')
    result.push({ date: d.format('YYYY-MM-DD'), day: d.date(), inMonth: false })
  }
  // 本月
  for (let i = 1; i <= daysInMonth; i++) {
    const d = first.date(i)
    result.push({ date: d.format('YYYY-MM-DD'), day: i, inMonth: true })
  }
  // 下月填充到 42 格（6 行）
  while (result.length < 42) {
    const last = dayjs(result[result.length - 1].date).add(1, 'day')
    result.push({ date: last.format('YYYY-MM-DD'), day: last.date(), inMonth: false })
  }
  return result
}

export function isSameDay(a: string, b: string): boolean {
  return a === b
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID()
    } catch {
      // fallback below
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
