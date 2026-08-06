<template>
  <div class="note-edit-view">
    <!-- 顶部栏 -->
    <header class="edit-header">
      <button class="header-btn" @click="goBack">
        <span class="back-icon">‹</span>
        <span v-if="!isMobile">返回</span>
      </button>
      <div class="save-status">
        <span v-if="saving" class="status-text saving">保存中...</span>
        <span v-else-if="saved" class="status-text saved">已保存</span>
        <span v-else-if="unsaved" class="status-text unsaved">未保存</span>
      </div>
      <div class="header-actions">
        <button class="header-btn" :class="{ active: note.is_pinned }" @click="togglePin" title="置顶">
          {{ note.is_pinned ? '📌' : '📍' }}
        </button>
        <button class="header-btn danger" @click="confirmDelete" title="删除">
          🗑️
        </button>
      </div>
    </header>

    <!-- 标题 -->
    <div class="title-row">
      <input
        v-model="note.title"
        class="title-input"
        placeholder="输入标题..."
        @input="markUnsaved"
      />
    </div>

    <!-- 元信息行 -->
    <div class="meta-row">
      <div class="tags-input-area">
        <span v-for="tag in note.tags" :key="tag" class="tag-item">
          #{{ tag }}
          <button class="tag-remove" @click="removeTag(tag)">×</button>
        </span>
        <input
          v-if="showTagInput"
          ref="tagInputRef"
          v-model="newTag"
          class="tag-input"
          placeholder="标签名"
          @keyup.enter="addTag"
          @blur="addTag"
        />
        <button v-else class="add-tag-btn" @click="showTagInput = true">+ 标签</button>
      </div>
      <div class="date-picker">
        <input
          type="date"
          v-model="note.note_date"
          class="date-input"
          @change="markUnsaved"
        />
      </div>
    </div>

    <!-- Markdown 编辑器 -->
    <div class="editor-area">
      <MdEditor
        v-model="note.content"
        :theme="editorTheme"
        :toolbars-exclude="excludeToolbars"
        :preview="!isMobile"
        :show-code-row-number="false"
        :style="{ height: editorHeight }"
        placeholder="开始记录你的想法..."
        @on-change="markUnsaved"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { MdEditor } from 'md-editor-v3'
import { useNotesStore } from '@/stores/notes'
import { useSettingsStore } from '@/stores/settings'
import { getNote } from '@/services/db'
import { extractTitle } from '@/utils/markdown'
import type { Note } from '@/types'

const route = useRoute()
const router = useRouter()
const notesStore = useNotesStore()
const settings = useSettingsStore()

const windowWidth = ref(window.innerWidth)
const isMobile = computed(() => windowWidth.value < 768)

const editorTheme = computed(() => {
  const isDark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  return isDark ? 'dark' : 'light'
})

const editorHeight = computed(() => `calc(100vh - ${isMobile.value ? '180px' : '160px'})`)

const excludeToolbars = ['github', 'htmlPreview', 'save', 'catalog', 'mermaid'] as never[]

const note = reactive<Note>(createEmptyNote())

const isNew = computed(() => route.name === 'note-new')
const saving = ref(false)
const saved = ref(false)
const unsaved = ref(false)

const showTagInput = ref(false)
const newTag = ref('')
const tagInputRef = ref<HTMLInputElement | null>(null)

let saveTimer: ReturnType<typeof setTimeout> | null = null

function createEmptyNote(): Note {
  return {
    id: '',
    user_id: null,
    title: '',
    content: '',
    tags: [],
    note_date: null,
    is_pinned: false,
    is_deleted: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    client_updated_at: Date.now(),
    synced: false,
  }
}

function markUnsaved(): void {
  unsaved.value = true
  saved.value = false
  scheduleSave()
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    await doSave()
  }, 1500)
}

async function doSave(): Promise<void> {
  // 空标题时用内容首行
  const title = note.title || extractTitle(note.content)
  if (!title && !note.content) return // 完全空不保存

  saving.value = true
  try {
    if (isNew.value || !note.id) {
      // 新建
      const created = await notesStore.createNote({
        title,
        content: note.content,
        tags: note.tags,
        note_date: note.note_date,
        is_pinned: note.is_pinned,
      })
      note.id = created.id
      note.created_at = created.created_at
      // 跳转到编辑模式（替换 URL，不留历史）
      router.replace(`/note/${created.id}`)
    } else {
      await notesStore.updateNote(note.id, {
        title,
        content: note.content,
        tags: note.tags,
        note_date: note.note_date,
        is_pinned: note.is_pinned,
      })
    }
    unsaved.value = false
    saved.value = true
    setTimeout(() => {
      saved.value = false
    }, 2000)
  } catch (e) {
    console.error('保存失败', e)
    showToast('保存失败: ' + (e instanceof Error ? e.message : String(e)))
  } finally {
    saving.value = false
  }
}

async function togglePin(): Promise<void> {
  note.is_pinned = !note.is_pinned
  if (note.id) {
    await notesStore.updateNote(note.id, { is_pinned: note.is_pinned })
  }
}

async function confirmDelete(): Promise<void> {
  try {
    await showConfirmDialog({ title: '确认', message: '删除后可在回收站恢复，确认删除？' })
    if (note.id) {
      await notesStore.softDelete(note.id)
    }
    router.replace('/')
  } catch {
    // 取消
  }
}

function addTag(): void {
  const tag = newTag.value.trim()
  if (tag && !note.tags.includes(tag)) {
    note.tags.push(tag)
    markUnsaved()
  }
  newTag.value = ''
  showTagInput.value = false
}

function removeTag(tag: string): void {
  note.tags = note.tags.filter((t) => t !== tag)
  markUnsaved()
}

function goBack(): void {
  if (unsaved.value) {
    doSave()
  }
  router.back()
}

async function loadNote(): Promise<void> {
  if (isNew.value) return
  const id = route.params.id as string
  const existing = notesStore.notes.find((n) => n.id === id)
  if (existing) {
    Object.assign(note, existing)
  } else {
    const found = await getNote(id)
    if (found) {
      Object.assign(note, found)
    } else {
      showToast('笔记不存在')
      router.replace('/')
    }
  }
}

function handleResize(): void {
  windowWidth.value = window.innerWidth
}

onMounted(async () => {
  window.addEventListener('resize', handleResize)
  await loadNote()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (saveTimer) clearTimeout(saveTimer)
  if (unsaved.value) doSave()
})

watch(() => showTagInput.value, async (val) => {
  if (val) {
    await nextTick()
    tagInputRef.value?.focus()
  }
})
</script>

<style scoped>
.note-edit-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-card);
}

.edit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 0.5px solid var(--border-color);
  flex-shrink: 0;
  gap: 12px;
}

.header-btn {
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: 14px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  gap: 2px;
  transition: background 0.15s;
}

.header-btn:hover {
  background: var(--bg-hover);
}

.header-btn.active {
  color: var(--app-warning);
}

.header-btn.danger:hover {
  background: #fee;
}

.back-icon {
  font-size: 22px;
  line-height: 1;
}

.save-status {
  flex: 1;
  text-align: center;
}

.status-text {
  font-size: 12px;
  color: var(--text-tertiary);
}

.status-text.saving {
  color: var(--app-primary);
}

.status-text.saved {
  color: var(--app-success);
}

.status-text.unsaved {
  color: var(--app-warning);
}

.header-actions {
  display: flex;
  gap: 4px;
}

.title-row {
  padding: 12px 16px 4px;
  flex-shrink: 0;
}

.title-input {
  width: 100%;
  border: none;
  outline: none;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  background: transparent;
}

.title-input::placeholder {
  color: var(--text-tertiary);
}

.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 16px 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.tags-input-area {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  flex: 1;
}

.tag-item {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 8px;
  background: var(--app-primary-bg);
  color: var(--app-primary);
  border-radius: 10px;
  font-size: 12px;
}

.tag-remove {
  background: none;
  border: none;
  color: var(--app-primary);
  font-size: 14px;
  line-height: 1;
  padding: 0;
  cursor: pointer;
  opacity: 0.6;
}

.tag-remove:hover {
  opacity: 1;
}

.tag-input {
  border: none;
  outline: none;
  font-size: 13px;
  width: 80px;
  background: var(--bg-hover);
  padding: 2px 8px;
  border-radius: 10px;
  color: var(--text-primary);
}

.add-tag-btn {
  background: none;
  border: 1px dashed var(--border-strong);
  color: var(--text-secondary);
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  cursor: pointer;
}

.date-picker {
  flex-shrink: 0;
}

.date-input {
  border: 0.5px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-card);
}

.editor-area {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.editor-area :deep(.md-editor) {
  flex: 1;
  border: none;
  --md-bk-color: var(--bg-card);
}
</style>
