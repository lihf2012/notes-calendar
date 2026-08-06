import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  listActiveNotes,
  listDeletedNotes,
  createNote as dbCreateNote,
  updateNote as dbUpdateNote,
  softDeleteNote as dbSoftDeleteNote,
  restoreNote as dbRestoreNote,
  hardDeleteNote as dbHardDeleteNote,
  getNote,
  getAllTags,
} from '@/services/db'
import { pushPendingChanges } from '@/services/sync'
import { useAuthStore } from './auth'
import type { Note, NoteInput } from '@/types'
import { extractTitle } from '@/utils/markdown'

export const useNotesStore = defineStore('notes', () => {
  const notes = ref<Note[]>([])
  const deletedNotes = ref<Note[]>([])
  const loading = ref(false)
  const searchKeyword = ref('')
  const activeTag = ref<string | null>(null)

  const filteredNotes = computed(() => {
    let result = notes.value
    if (activeTag.value) {
      result = result.filter((n) => n.tags.includes(activeTag.value!))
    }
    if (searchKeyword.value.trim()) {
      const kw = searchKeyword.value.trim().toLowerCase()
      result = result.filter(
        (n) =>
          n.title.toLowerCase().includes(kw) || n.content.toLowerCase().includes(kw),
      )
    }
    return result
  })

  const allTags = ref<string[]>([])

  async function loadAll(): Promise<void> {
    loading.value = true
    try {
      const [active, deleted, tags] = await Promise.all([
        listActiveNotes(),
        listDeletedNotes(),
        getAllTags(),
      ])
      notes.value = active
      deletedNotes.value = deleted
      allTags.value = tags
    } finally {
      loading.value = false
    }
  }

  async function createNote(input: NoteInput): Promise<Note> {
    const auth = useAuthStore()
    const title = input.title ?? extractTitle(input.content ?? '')
    const note = await dbCreateNote({
      ...input,
      title,
      user_id: auth.user?.id ?? null,
    })
    notes.value.unshift(note)
    allTags.value = Array.from(new Set([...allTags.value, ...note.tags])).sort()
    triggerSync()
    return note
  }

  async function updateNote(id: string, patch: Partial<Note>): Promise<void> {
    await dbUpdateNote(id, patch)
    const idx = notes.value.findIndex((n) => n.id === id)
    if (idx >= 0) {
      const updated = await getNote(id)
      if (updated) notes.value[idx] = updated
    }
    // 标签可能变化
    allTags.value = await getAllTags()
    triggerSync()
  }

  async function softDelete(id: string): Promise<void> {
    await dbSoftDeleteNote(id)
    const note = notes.value.find((n) => n.id === id)
    if (note) {
      note.is_deleted = true
      deletedNotes.value.unshift(note)
      notes.value = notes.value.filter((n) => n.id !== id)
    }
    triggerSync()
  }

  async function restore(id: string): Promise<void> {
    await dbRestoreNote(id)
    const note = deletedNotes.value.find((n) => n.id === id)
    if (note) {
      note.is_deleted = false
      notes.value.unshift(note)
      deletedNotes.value = deletedNotes.value.filter((n) => n.id !== id)
    }
    triggerSync()
  }

  async function hardDelete(id: string): Promise<void> {
    await dbHardDeleteNote(id)
    deletedNotes.value = deletedNotes.value.filter((n) => n.id !== id)
    triggerSync()
  }

  function setSearch(keyword: string): void {
    searchKeyword.value = keyword
  }

  function setTag(tag: string | null): void {
    activeTag.value = tag
  }

  // 后台触发同步（不阻塞）
  function triggerSync(): void {
    const auth = useAuthStore()
    if (auth.cloudEnabled) {
      pushPendingChanges().catch((e) => console.warn('[notes] 同步失败', e))
    }
  }

  // 监听远端变更
  async function reloadFromRemote(): Promise<void> {
    await loadAll()
  }

  return {
    notes,
    deletedNotes,
    loading,
    searchKeyword,
    activeTag,
    allTags,
    filteredNotes,
    loadAll,
    createNote,
    updateNote,
    softDelete,
    restore,
    hardDelete,
    setSearch,
    setTag,
    reloadFromRemote,
  }
})
