// 笔记
export interface Note {
  id: string
  user_id: string | null
  title: string
  content: string
  tags: string[]
  note_date: string | null
  is_pinned: boolean
  is_deleted: boolean
  created_at: string
  updated_at: string
  client_updated_at: number
  synced: boolean
}

// 日历事件
export interface EventItem {
  id: string
  user_id: string | null
  title: string
  description: string
  event_date: string
  event_time: string | null
  remind_minutes: number | null
  is_deleted: boolean
  created_at: string
  updated_at: string
  client_updated_at: number
  synced: boolean
}

// 同步队列项
export interface SyncQueueItem {
  id: string
  table_name: 'notes' | 'events'
  record_id: string
  operation: 'upsert' | 'delete'
  payload: object
  created_at: number
}

// 同步状态
export interface SyncState {
  id?: string
  last_pull_at: string | null
  last_push_at: string | null
}

// 用户
export interface AppUser {
  id: string
  email: string | null
}

// 主题
export type ThemeMode = 'light' | 'dark' | 'system'

// 用于创建笔记的输入
export interface NoteInput {
  title?: string
  content?: string
  tags?: string[]
  note_date?: string | null
  is_pinned?: boolean
}

// 用于创建事件的输入
export interface EventInput {
  title: string
  description?: string
  event_date: string
  event_time?: string | null
  remind_minutes?: number | null
}
