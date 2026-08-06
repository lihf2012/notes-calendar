import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  listActiveEvents,
  createEvent as dbCreateEvent,
  updateEvent as dbUpdateEvent,
  softDeleteEvent as dbSoftDeleteEvent,
  hardDeleteEvent as dbHardDeleteEvent,
  listEventsByDate,
  listEventsByMonth,
} from '@/services/db'
import { pushPendingChanges } from '@/services/sync'
import { useAuthStore } from './auth'
import { startReminderPoller } from '@/services/notification'
import type { EventItem, EventInput } from '@/types'

export const useEventsStore = defineStore('events', () => {
  const events = ref<EventItem[]>([])
  const loading = ref(false)

  async function loadAll(): Promise<void> {
    loading.value = true
    try {
      events.value = await listActiveEvents()
      startReminderPoller(() => events.value)
    } finally {
      loading.value = false
    }
  }

  async function getByDate(date: string): Promise<EventItem[]> {
    return listEventsByDate(date)
  }

  async function getByMonth(yearMonth: string): Promise<EventItem[]> {
    return listEventsByMonth(yearMonth)
  }

  async function createEvent(input: EventInput): Promise<EventItem> {
    const auth = useAuthStore()
    const event = await dbCreateEvent({
      ...input,
      user_id: auth.user?.id ?? null,
    })
    events.value.push(event)
    events.value.sort((a, b) => a.event_date.localeCompare(b.event_date))
    triggerSync()
    return event
  }

  async function updateEvent(id: string, patch: Partial<EventItem>): Promise<void> {
    await dbUpdateEvent(id, patch)
    const idx = events.value.findIndex((e) => e.id === id)
    if (idx >= 0) {
      events.value[idx] = { ...events.value[idx], ...patch }
    }
    triggerSync()
  }

  async function softDelete(id: string): Promise<void> {
    await dbSoftDeleteEvent(id)
    events.value = events.value.filter((e) => e.id !== id)
    triggerSync()
  }

  async function hardDelete(id: string): Promise<void> {
    await dbHardDeleteEvent(id)
    events.value = events.value.filter((e) => e.id !== id)
    triggerSync()
  }

  function triggerSync(): void {
    const auth = useAuthStore()
    if (auth.cloudEnabled) {
      pushPendingChanges().catch((e) => console.warn('[events] 同步失败', e))
    }
  }

  async function reloadFromRemote(): Promise<void> {
    await loadAll()
  }

  return {
    events,
    loading,
    loadAll,
    getByDate,
    getByMonth,
    createEvent,
    updateEvent,
    softDelete,
    hardDelete,
    reloadFromRemote,
  }
})
