<template>
  <div class="recycle-view">
    <header class="page-header">
      <h1 class="page-title">回收站</h1>
      <button v-if="notesStore.deletedNotes.length > 0" class="header-action danger" @click="clearAll">
        清空
      </button>
    </header>

    <div class="page-container content-area">
      <div v-if="notesStore.deletedNotes.length === 0" class="empty-state">
        <div class="empty-icon">🗑️</div>
        <p>回收站为空</p>
      </div>

      <div v-else class="notes-list">
        <article
          v-for="note in notesStore.deletedNotes"
          :key="note.id"
          class="note-card"
        >
          <div class="note-info" @click="goPreview(note.id)">
            <h3 class="note-title">{{ note.title || '无标题' }}</h3>
            <p class="note-summary">{{ getSummary(note.content) }}</p>
            <span class="note-time">删除于 {{ relativeTime(note.updated_at) }}</span>
          </div>
          <div class="note-actions">
            <button class="action-btn restore" @click="handleRestore(note.id)">恢复</button>
            <button class="action-btn del" @click="handleHardDelete(note.id)">彻底删除</button>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { useNotesStore } from '@/stores/notes'
import { extractSummary } from '@/utils/markdown'
import { relativeTime } from '@/utils/date'
import type { Note } from '@/types'

const router = useRouter()
const notesStore = useNotesStore()

function getSummary(content: string): string {
  return extractSummary(content, 80)
}

function goPreview(id: string): void {
  router.push(`/note/${id}`)
}

async function handleRestore(id: string): Promise<void> {
  await notesStore.restore(id)
  showToast('已恢复')
}

async function handleHardDelete(id: string): Promise<void> {
  try {
    await showConfirmDialog({
      title: '彻底删除',
      message: '此操作不可恢复，确认永久删除？',
    })
    await notesStore.hardDelete(id)
    showToast('已永久删除')
  } catch {
    // 取消
  }
}

async function clearAll(): Promise<void> {
  try {
    await showConfirmDialog({
      title: '清空回收站',
      message: `将永久删除 ${notesStore.deletedNotes.length} 条笔记，不可恢复！`,
    })
    for (const note of [...notesStore.deletedNotes]) {
      await notesStore.hardDelete(note.id)
    }
    showToast('已清空')
  } catch {
    // 取消
  }
}

onMounted(() => {
  notesStore.loadAll()
})
</script>

<style scoped>
.recycle-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 8px;
  flex-shrink: 0;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.header-action {
  padding: 6px 14px;
  border: 0.5px solid var(--app-danger);
  background: transparent;
  color: var(--app-danger);
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
}

.content-area {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px 16px;
  max-width: 720px;
  margin: 0 auto;
  width: 100%;
}

.notes-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.note-card {
  display: flex;
  align-items: stretch;
  gap: 12px;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 14px 16px;
  border: 0.5px solid var(--border-color);
}

.note-info {
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.note-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-summary {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 4px 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.note-time {
  font-size: 12px;
  color: var(--text-tertiary);
}

.note-actions {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}

.action-btn {
  padding: 5px 12px;
  border-radius: var(--radius-sm);
  border: 0.5px solid var(--border-color);
  background: transparent;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.action-btn.restore {
  color: var(--app-primary);
  border-color: var(--app-primary);
}

.action-btn.del {
  color: var(--app-danger);
  border-color: var(--app-danger);
}

.action-btn:hover {
  opacity: 0.8;
}
</style>
