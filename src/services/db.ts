import Dexie, { type Table } from 'dexie'
import type { Note, EventItem, SyncQueueItem, SyncState } from '@/types'
import { generateId } from '@/utils/date'

class AppDB extends Dexie {
  notes!: Table<Note, string>
  events!: Table<EventItem, string>
  syncQueue!: Table<SyncQueueItem, string>
  syncState!: Table<SyncState, string>

  constructor() {
    super('NotesCalendarDB')
    this.version(1).stores({
      notes: 'id, user_id, is_deleted, is_pinned, note_date, client_updated_at, synced, *tags',
      events: 'id, user_id, is_deleted, event_date, client_updated_at, synced',
      syncQueue: 'id, table_name, record_id, created_at',
      syncState: 'id',
    })
  }
}

export const db = new AppDB()

// ====== 笔记 CRUD ======

export async function createNote(input: {
  title?: string
  content?: string
  tags?: string[]
  note_date?: string | null
  is_pinned?: boolean
  user_id?: string | null
}): Promise<Note> {
  const now = new Date().toISOString()
  const ts = Date.now()
  const note: Note = {
    id: generateId(),
    user_id: input.user_id ?? null,
    title: input.title ?? '',
    content: input.content ?? '',
    tags: input.tags ?? [],
    note_date: input.note_date ?? null,
    is_pinned: input.is_pinned ?? false,
    is_deleted: false,
    created_at: now,
    updated_at: now,
    client_updated_at: ts,
    synced: false,
  }
  await db.notes.put(note)
  await enqueueSync('notes', note.id, 'upsert', note)
  return note
}

export async function updateNote(id: string, patch: Partial<Note>): Promise<void> {
  const existing = await db.notes.get(id)
  if (!existing) return
  const updated: Note = {
    ...existing,
    ...patch,
    updated_at: new Date().toISOString(),
    client_updated_at: Date.now(),
    synced: false,
  }
  await db.notes.put(updated)
  await enqueueSync('notes', id, 'upsert', updated)
}

export async function softDeleteNote(id: string): Promise<void> {
  await updateNote(id, { is_deleted: true })
}

export async function restoreNote(id: string): Promise<void> {
  await updateNote(id, { is_deleted: false })
}

export async function hardDeleteNote(id: string): Promise<void> {
  await db.notes.delete(id)
  await db.syncQueue.where('record_id').equals(id).delete()
}

export async function listActiveNotes(): Promise<Note[]> {
  const all = await db.notes.toArray()
  return all
    .filter((n) => !n.is_deleted)
    .sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
      return b.client_updated_at - a.client_updated_at
    })
}

export async function listDeletedNotes(): Promise<Note[]> {
  const all = await db.notes.toArray()
  return all
      .filter((n) => n.is_deleted)
      .sort((a, b) => b.client_updated_at - a.client_updated_at)
}

export async function getNote(id: string): Promise<Note | undefined> {
  return db.notes.get(id)
}

export async function listNotesByDate(date: string): Promise<Note[]> {
  const all = await db.notes.where('note_date').equals(date).toArray()
  return all.filter((n) => !n.is_deleted)
}

// ====== 事件 CRUD ======

export async function createEvent(input: {
  title: string
  description?: string
  event_date: string
  event_time?: string | null
  remind_minutes?: number | null
  user_id?: string | null
}): Promise<EventItem> {
  const now = new Date().toISOString()
  const ts = Date.now()
  const event: EventItem = {
    id: generateId(),
    user_id: input.user_id ?? null,
    title: input.title,
    description: input.description ?? '',
    event_date: input.event_date,
    event_time: input.event_time ?? null,
    remind_minutes: input.remind_minutes ?? null,
    is_deleted: false,
    created_at: now,
    updated_at: now,
    client_updated_at: ts,
    synced: false,
  }
  await db.events.put(event)
  await enqueueSync('events', event.id, 'upsert', event)
  return event
}

export async function updateEvent(id: string, patch: Partial<EventItem>): Promise<void> {
  const existing = await db.events.get(id)
  if (!existing) return
  const updated: EventItem = {
    ...existing,
    ...patch,
    updated_at: new Date().toISOString(),
    client_updated_at: Date.now(),
    synced: false,
  }
  await db.events.put(updated)
  await enqueueSync('events', id, 'upsert', updated)
}

export async function softDeleteEvent(id: string): Promise<void> {
  await updateEvent(id, { is_deleted: true })
}

export async function hardDeleteEvent(id: string): Promise<void> {
  await db.events.delete(id)
  await db.syncQueue.where('record_id').equals(id).delete()
}

export async function listActiveEvents(): Promise<EventItem[]> {
  const all = await db.events.toArray()
  return all.filter((e) => !e.is_deleted).sort((a, b) => a.event_date.localeCompare(b.event_date))
}

export async function listEventsByDate(date: string): Promise<EventItem[]> {
  const all = await db.events.where('event_date').equals(date).toArray()
  return all.filter((e) => !e.is_deleted)
}

export async function listEventsByMonth(yearMonth: string): Promise<EventItem[]> {
  const all = await db.events.toArray()
  return all.filter((e) => !e.is_deleted && e.event_date.startsWith(yearMonth))
}

// ====== 同步队列 ======

export async function enqueueSync(
  tableName: 'notes' | 'events',
  recordId: string,
  operation: 'upsert' | 'delete',
  payload: object,
): Promise<void> {
  const item: SyncQueueItem = {
    id: generateId(),
    table_name: tableName,
    record_id: recordId,
    operation,
    payload,
    created_at: Date.now(),
  }
  await db.syncQueue.put(item)
}

export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  return db.syncQueue.orderBy('created_at').toArray()
}

export async function removeSyncItem(id: string): Promise<void> {
  await db.syncQueue.delete(id)
}

export async function markRecordSynced(tableName: 'notes' | 'events', recordId: string): Promise<void> {
  const table = tableName === 'notes' ? db.notes : db.events
  await table.update(recordId, { synced: true })
}

// ====== 同步状态 ======

export async function getSyncState(): Promise<SyncState> {
  const state = await db.syncState.get('default')
  return state ?? { last_pull_at: null, last_push_at: null }
}

export async function setSyncState(patch: Partial<SyncState>): Promise<void> {
  const current = await getSyncState()
  await db.syncState.put({ id: 'default', ...current, ...patch })
}

// ====== 导入导出 ======

export async function exportAllData(): Promise<{ notes: Note[]; events: EventItem[] }> {
  const [notes, events] = await Promise.all([db.notes.toArray(), db.events.toArray()])
  return { notes, events }
}

export async function importAllData(data: { notes: Note[]; events: EventItem[] }): Promise<void> {
  await db.transaction('rw', db.notes, db.events, async () => {
    await db.notes.clear()
    await db.events.clear()
    await db.notes.bulkPut(data.notes)
    await db.events.bulkPut(data.events)
  })
}

export async function clearAllData(): Promise<void> {
  await db.transaction('rw', db.notes, db.events, db.syncQueue, db.syncState, async () => {
    await db.notes.clear()
    await db.events.clear()
    await db.syncQueue.clear()
    await db.syncState.clear()
  })
}

// 获取所有笔记的标签集合（用于标签筛选）
export async function getAllTags(): Promise<string[]> {
  const all = await db.notes.toArray()
  const tagSet = new Set<string>()
  all.forEach((n) => {
    if (!n.is_deleted) n.tags.forEach((t) => tagSet.add(t))
  })
  return Array.from(tagSet).sort()
}
