<template>
  <div class="home-view">
    <!-- 顶部栏 -->
    <header class="page-header">
      <h1 class="page-title">我的笔记</h1>
      <button class="header-action" @click="goNew">
        <span class="action-icon">+</span>
        <span v-if="!isMobile">新建</span>
      </button>
    </header>

    <!-- 搜索 -->
    <div class="search-bar">
      <van-search
        v-model="keyword"
        placeholder="搜索笔记标题或内容"
        shape="round"
        @update:model-value="onSearch"
        @clear="onSearch('')"
      />
    </div>

    <!-- 标签筛选 -->
    <div v-if="notesStore.allTags.length > 0" class="tags-bar">
      <div class="tags-scroll">
        <span
          class="tag-chip"
          :class="{ active: !activeTag }"
          @click="selectTag(null)"
        >全部</span>
        <span
          v-for="tag in notesStore.allTags"
          :key="tag"
          class="tag-chip"
          :class="{ active: activeTag === tag }"
          @click="selectTag(tag)"
        >#{{ tag }}</span>
      </div>
    </div>

    <!-- 笔记列表 -->
    <div class="page-container content-area">
      <div v-if="notesStore.loading" class="loading-state">
        <van-loading type="spinner">加载中...</van-loading>
      </div>

      <div v-else-if="filteredNotes.length === 0" class="empty-state">
        <div class="empty-icon">📝</div>
        <p>{{ hasFilter ? '没有匹配的笔记' : '还没有笔记，点击右上角新建' }}</p>
      </div>

      <div v-else class="notes-grid" :class="{ 'is-mobile': isMobile }">
        <article
          v-for="note in filteredNotes"
          :key="note.id"
          class="note-card"
          @click="goEdit(note.id)"
        >
          <div class="note-card-header">
            <h3 class="note-title">{{ note.title || '无标题' }}</h3>
            <span v-if="note.is_pinned" class="pin-badge">置顶</span>
          </div>
          <p class="note-summary">{{ getSummary(note) }}</p>
          <div class="note-card-footer">
            <div class="note-tags">
              <span v-for="tag in note.tags.slice(0, 3)" :key="tag" class="note-tag">#{{ tag }}</span>
            </div>
            <span class="note-time">{{ relativeTime(note.updated_at) }}</span>
          </div>
        </article>
      </div>
    </div>

    <!-- 移动端浮动按钮 -->
    <button v-if="isMobile" class="fab" @click="goNew">
      <span>+</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNotesStore } from '@/stores/notes'
import { extractSummary } from '@/utils/markdown'
import { relativeTime } from '@/utils/date'
import type { Note } from '@/types'

const router = useRouter()
const notesStore = useNotesStore()

const keyword = ref('')
const activeTag = ref<string | null>(null)
const windowWidth = ref(window.innerWidth)
const isMobile = computed(() => windowWidth.value < 768)

const filteredNotes = computed(() => notesStore.filteredNotes)
const hasFilter = computed(() => keyword.value.trim() || activeTag.value)

function onSearch(val: string): void {
  keyword.value = val
  notesStore.setSearch(val)
}

function selectTag(tag: string | null): void {
  activeTag.value = tag
  notesStore.setTag(tag)
}

function getSummary(note: Note): string {
  return extractSummary(note.content, 100)
}

function goNew(): void {
  router.push('/note/new')
}

function goEdit(id: string): void {
  router.push(`/note/${id}`)
}

function handleResize(): void {
  windowWidth.value = window.innerWidth
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  notesStore.loadAll()
})
</script>

<style scoped>
.home-view {
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
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  background: var(--app-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-size: 14px;
  transition: opacity 0.15s;
}

.header-action:hover {
  opacity: 0.9;
}

.action-icon {
  font-size: 18px;
  font-weight: 300;
  line-height: 1;
}

.search-bar {
  flex-shrink: 0;
  padding: 0 8px;
}

.tags-bar {
  flex-shrink: 0;
  padding: 0 12px 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.tags-scroll {
  display: flex;
  gap: 8px;
  width: max-content;
}

.tag-chip {
  padding: 4px 12px;
  border-radius: 14px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 13px;
  white-space: nowrap;
  border: 0.5px solid var(--border-color);
  cursor: pointer;
  transition: all 0.15s;
}

.tag-chip.active {
  background: var(--app-primary);
  color: #fff;
  border-color: var(--app-primary);
}

.content-area {
  flex: 1;
  padding: 8px 16px 16px;
}

.loading-state {
  display: flex;
  justify-content: center;
  padding: 40px;
}

.notes-grid {
  display: grid;
  gap: 12px;
}

.notes-grid:not(.is-mobile) {
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
}

.notes-grid.is-mobile {
  grid-template-columns: 1fr;
}

.note-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 14px 16px;
  cursor: pointer;
  border: 0.5px solid var(--border-color);
  transition: box-shadow 0.15s, transform 0.1s;
}

.note-card:hover {
  box-shadow: var(--shadow-md);
}

.note-card:active {
  transform: scale(0.99);
}

.note-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.note-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.pin-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--app-warning);
  color: #fff;
  flex-shrink: 0;
}

.note-summary {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  margin-bottom: 10px;
  min-height: 20px;
}

.note-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.note-tags {
  display: flex;
  gap: 6px;
  overflow: hidden;
}

.note-tag {
  font-size: 12px;
  color: var(--app-primary);
  white-space: nowrap;
}

.note-time {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
  flex-shrink: 0;
}

.fab {
  position: fixed;
  right: 20px;
  bottom: calc(var(--tabbar-height) + 16px);
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--app-primary);
  color: #fff;
  border: none;
  font-size: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-lg);
  z-index: 100;
  line-height: 1;
}

.fab:active {
  transform: scale(0.95);
}
</style>
