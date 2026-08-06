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
        // upsert：确保 user_id 字段存在
        const payload = { ...item.payload, user_id: userId }
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

  await setSyncState({ last_pull_at: new Date().toISOString() })
  return { pulled }
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

  const handlePayload = async (tableName: TableName, payload: any) => {
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
