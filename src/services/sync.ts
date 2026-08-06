import { supabase, isSupabaseConfigured } from './supabase'
import {
  db,
  getPendingSyncItems,
  removeSyncItem,
  markRecordSynced,
  getSyncState,
  setSyncState,
} from './db'
import { generateId } from '@/utils/date'
import type { Note, EventItem, SyncQueueItem } from '@/types'

type TableName = 'notes' | 'events'

let isSyncing = false
let realtimeChannels: Array<{ unsubscribe: () => void }> = []

// 本地字段 → 云端字段：剔除本地专用字段（synced），避免云端表无此列报错
function toCloudPayload(tableName: TableName, record: Note | EventItem): Record<string, unknown> {
  if (tableName === 'notes') {
    const n = record as Note
    return {
      id: n.id,
      title: n.title,
      content: n.content,
      tags: n.tags,
      note_date: n.note_date,
      is_pinned: n.is_pinned,
      is_deleted: n.is_deleted,
      created_at: n.created_at,
      updated_at: n.updated_at,
      client_updated_at: n.client_updated_at,
    }
  }
  const e = record as EventItem
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    event_date: e.event_date,
    event_time: e.event_time,
    remind_minutes: e.remind_minutes,
    is_deleted: e.is_deleted,
    created_at: e.created_at,
    updated_at: e.updated_at,
    client_updated_at: e.client_updated_at,
  }
}

export function getIsSyncing(): boolean {
  return isSyncing
}

// ====== 推送本地待同步变更到云端 ======
export async function pushPendingChanges(): Promise<{ pushed: number; failed: number }> {
  if (!isSupabaseConfigured || !supabase) return { pushed: 0, failed: 0 }

  const { data: authData } = await supabase.auth.getUser()
  const userId = authData.user?.id
  if (!userId) return { pushed: 0, failed: 0 }

  const items = await getPendingSyncItems()
  let pushed = 0
  let failed = 0

  for (const item of items) {
    try {
      if (item.operation === 'delete') {
        const { error } = await supabase.from(item.table_name).delete().eq('id', item.record_id)
        if (error) throw error
      } else {
        // upsert：剔除本地专用字段，并确保 user_id 属于当前用户
        const payload = {
          ...toCloudPayload(item.table_name, item.payload as Note | EventItem),
          user_id: userId,
        }
        const { error } = await supabase.from(item.table_name).upsert(payload)
        if (error) throw error
      }
      await removeSyncItem(item.id)
      await markRecordSynced(item.table_name, item.record_id)
      pushed++
    } catch (e) {
      console.warn(`[sync] 推送失败 ${item.table_name}/${item.record_id}:`, e)
      failed++
    }
  }

  if (pushed > 0) {
    await setSyncState({ last_push_at: new Date().toISOString() })
  }
  return { pushed, failed }
}

// ====== 拉取云端增量变更 ======
export async function pullRemoteChanges(): Promise<{ pulled: number }> {
  if (!isSupabaseConfigured || !supabase) return { pulled: 0 }

  const { data: authData } = await supabase.auth.getUser()
  const userId = authData.user?.id
  if (!userId) return { pulled: 0 }

  const state = await getSyncState()
  const since = state.last_pull_at || '1970-01-01T00:00:00Z'
  let pulled = 0

  // 拉取笔记
  const { data: remoteNotes, error: e1 } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .gt('updated_at', since)

  if (!e1 && remoteNotes) {
    for (const rn of remoteNotes) {
      const local = await db.notes.get(rn.id)
      const remoteTs = rn.client_updated_at ?? 0
      if (!local || remoteTs > local.client_updated_at) {
        await db.notes.put({ ...rn, synced: true })
        pulled++
      }
    }
  }

  // 拉取事件
  const { data: remoteEvents, error: e2 } = await supabase
    .from('events')
    .select('*')
    .eq('user_id', userId)
    .gt('updated_at', since)

  if (!e2 && remoteEvents) {
    for (const re of remoteEvents) {
      const local = await db.events.get(re.id)
      const remoteTs = re.client_updated_at ?? 0
      if (!local || remoteTs > local.client_updated_at) {
        await db.events.put({ ...re, synced: true })
        pulled++
      }
    }
  }

  // 对账：云端已不存在（其他设备硬删），且本地无待推送变更的记录，同步移除
  await reconcileDeletedLocally('notes', userId, remoteNotes ?? [])
  await reconcileDeletedLocally('events', userId, remoteEvents ?? [])

  await setSyncState({ last_pull_at: new Date().toISOString() })
  return { pulled }
}

// ====== 云端删除对账：删除本地已同步但云端不存在的记录 ======
async function reconcileDeletedLocally(
  tableName: TableName,
  userId: string,
  remoteRows: Array<{ id: string }>,
): Promise<void> {
  const table = tableName === 'notes' ? db.notes : db.events
  const locals = await table.toArray()
  const remoteIds = new Set(remoteRows.map((r) => r.id))
  for (const local of locals) {
    if (local.user_id !== userId || !local.synced) continue
    if (remoteIds.has(local.id)) continue
    const pending = await db.syncQueue.where('record_id').equals(local.id).count()
    if (pending > 0) continue
    await table.delete(local.id)
  }
}

// ====== 完整同步 ======
export async function fullSync(): Promise<{ pushed: number; pulled: number; failed: number }> {
  if (!isSupabaseConfigured || !supabase) return { pushed: 0, pulled: 0, failed: 0 }
  if (isSyncing) return { pushed: 0, pulled: 0, failed: 0 }
  isSyncing = true
  try {
    const pushResult = await pushPendingChanges()
    const pullResult = await pullRemoteChanges()
    return { pushed: pushResult.pushed, pulled: pullResult.pulled, failed: pushResult.failed }
  } finally {
    isSyncing = false
  }
}

// ====== Realtime 订阅 ======
export function subscribeRealtime(onChange: () => void): () => void {
  if (!isSupabaseConfigured || !supabase) return () => {}

  // 避免重复订阅（重复登录会叠加 channel）
  unsubscribeAllRealtime()

  const handlePayload = async (tableName: TableName, payload: any) => {
    // 其他设备硬删除：本地无待推送变更时同步移除
    if (payload.eventType === 'DELETE') {
      const recordId = payload.old?.id
      if (!recordId) return
      const pending = await db.syncQueue.where('record_id').equals(recordId).count()
      if (pending > 0) return // 本地还有未推送的变更，保留
      const table = tableName === 'notes' ? db.notes : db.events
      await table.delete(recordId)
      onChange()
      return
    }
    const record = payload.new
    if (!record || !record.id) return
    const table = tableName === 'notes' ? db.notes : db.events
    const local = await table.get(record.id)
    const remoteTs = record.client_updated_at ?? 0
    if (!local || remoteTs > local.client_updated_at) {
      await table.put({ ...record, synced: true })
      onChange()
    }
  }

  const notesChannel = supabase
    .channel('notes-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, (payload) =>
      handlePayload('notes', payload),
    )
    .subscribe()

  const eventsChannel = supabase
    .channel('events-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, (payload) =>
      handlePayload('events', payload),
    )
    .subscribe()

  const unsub = () => {
    notesChannel.unsubscribe()
    eventsChannel.unsubscribe()
  }
  realtimeChannels.push({ unsubscribe: unsub })
  return unsub
}

export function unsubscribeAllRealtime(): void {
  realtimeChannels.forEach((c) => c.unsubscribe())
  realtimeChannels = []
}

// ====== 登录后首次全量同步 + 把本地未绑定 user_id 的数据归到当前用户 ======
export async function assignLocalDataToUser(userId: string): Promise<void> {
  const notes = await db.notes.toArray()
  for (const n of notes) {
    if (!n.user_id) {
      await db.notes.update(n.id, { user_id: userId, synced: false })
      await db.syncQueue.put({
        id: generateId(),
        table_name: 'notes',
        record_id: n.id,
        operation: 'upsert',
        payload: { ...n, user_id: userId },
        created_at: Date.now(),
      })
    }
  }
  const events = await db.events.toArray()
  for (const e of events) {
    if (!e.user_id) {
      await db.events.update(e.id, { user_id: userId, synced: false })
      await db.syncQueue.put({
        id: generateId(),
        table_name: 'events',
        record_id: e.id,
        operation: 'upsert',
        payload: { ...e, user_id: userId },
        created_at: Date.now(),
      })
    }
  }
}

// ====== 登出后清理：清除云端同步状态，本地数据保留 ======
export async function clearSyncState(): Promise<void> {
  await db.syncState.clear()
  await db.syncQueue.clear()
  // 标记所有记录为未同步
  const notes = await db.notes.toArray()
  for (const n of notes) await db.notes.update(n.id, { synced: false, user_id: null })
  const events = await db.events.toArray()
  for (const e of events) await db.events.update(e.id, { synced: false, user_id: null })
  unsubscribeAllRealtime()
}

export type { Note, EventItem, SyncQueueItem }
