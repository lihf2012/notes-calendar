// 浏览器通知服务，用于事件提醒
import type { EventItem } from '@/types'
import { formatTime } from '@/utils/date'

let permission: NotificationPermission = 'default'

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  permission = Notification.permission
  if (permission === 'granted') return true
  if (permission === 'denied') return false
  permission = await Notification.requestPermission()
  return permission === 'granted'
}

export function canNotify(): boolean {
  return 'Notification' in window && Notification.permission === 'granted'
}

export function showNotification(title: string, body: string): void {
  if (!canNotify()) return
  try {
    new Notification(title, {
      body,
      icon: '/icon.svg',
      tag: title + body,
    })
  } catch {
    // Service Worker 通知作为兜底
    navigator.serviceWorker?.ready.then((reg) => {
      reg.showNotification(title, { body, icon: '/icon.svg' })
    })
  }
}

// 检查事件提醒：返回需要触发提醒的事件
export function checkEventReminders(events: EventItem[]): EventItem[] {
  const now = new Date()
  const triggered: EventItem[] = []
  for (const e of events) {
    if (e.is_deleted || e.remind_minutes == null) continue
    const eventDateTime = e.event_time
      ? new Date(`${e.event_date}T${e.event_time}:00`)
      : new Date(`${e.event_date}T09:00:00`)
    const remindAt = new Date(eventDateTime.getTime() - e.remind_minutes * 60000)
    // 在提醒时间后 5 分钟内且事件还未结束
    if (remindAt <= now && eventDateTime >= new Date(now.getTime() - 30 * 60000)) {
      triggered.push(e)
    }
  }
  return triggered
}

export function buildReminderText(e: EventItem): { title: string; body: string } {
  const timeStr = e.event_time ? formatTime(`${e.event_date}T${e.event_time}`) : '全天'
  return {
    title: `提醒：${e.title}`,
    body: `时间 ${e.event_date} ${timeStr}${e.description ? ' · ' + e.description : ''}`,
  }
}

// 提醒轮询：每分钟检查一次
let reminderTimer: ReturnType<typeof setInterval> | null = null
let lastTriggeredIds = new Set<string>()

export function startReminderPoller(getEvents: () => EventItem[]): void {
  stopReminderPoller()
  const poll = () => {
    const triggered = checkEventReminders(getEvents())
    for (const e of triggered) {
      if (lastTriggeredIds.has(e.id)) continue
      lastTriggeredIds.add(e.id)
      const { title, body } = buildReminderText(e)
      showNotification(title, body)
    }
    // 清理过期记录（超过 1 小时的）
    if (lastTriggeredIds.size > 100) lastTriggeredIds = new Set()
  }
  poll()
  reminderTimer = setInterval(poll, 60000)
}

export function stopReminderPoller(): void {
  if (reminderTimer) {
    clearInterval(reminderTimer)
    reminderTimer = null
  }
}
