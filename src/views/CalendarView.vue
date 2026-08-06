<template>
  <div class="calendar-view">
    <header class="page-header">
      <h1 class="page-title">日历</h1>
      <button class="header-action" @click="openEventForm(selectedDate)">
        <span>+</span>
        <span v-if="!isMobile">新建事件</span>
      </button>
    </header>

    <div class="page-container content-area">
      <!-- 月份切换 -->
      <div class="month-switcher">
        <button class="month-btn" @click="changeMonth(-1)">‹</button>
        <span class="month-label">{{ currentYear }}年{{ currentMonth }}月</span>
        <button class="month-btn" @click="changeMonth(1)">›</button>
        <button class="today-btn" @click="goToday">今天</button>
      </div>

      <!-- 星期标题 -->
      <div class="weekday-row">
        <div v-for="w in weekdays" :key="w" class="weekday-cell">{{ w }}</div>
      </div>

      <!-- 日期格子 -->
      <div class="days-grid">
        <div
          v-for="day in monthDays"
          :key="day.date"
          class="day-cell"
          :class="{
            'other-month': !day.inMonth,
            'is-today': day.date === todayDate,
            'is-selected': day.date === selectedDate,
            'has-events': dayHasEvents(day.date),
            'has-notes': dayHasNotes(day.date),
          }"
          @click="selectDate(day.date)"
        >
          <span class="day-number">{{ day.day }}</span>
          <span class="day-lunar">{{ getLunarDay(day.date) }}</span>
          <div class="day-dots">
            <span v-if="dayHasEvents(day.date)" class="dot dot-event"></span>
            <span v-if="dayHasNotes(day.date)" class="dot dot-note"></span>
          </div>
        </div>
      </div>

      <!-- 选中日期详情 -->
      <div class="day-detail">
        <div class="detail-header">
          <h2 class="detail-title">{{ selectedDateLabel }}</h2>
          <div class="detail-actions">
            <button class="detail-btn" @click="openEventForm(selectedDate)">+ 事件</button>
            <button class="detail-btn" @click="newNoteOnDate(selectedDate)">+ 笔记</button>
          </div>
        </div>

        <!-- 事件 -->
        <div v-if="dayEvents.length > 0" class="detail-section">
          <h3 class="section-title">事件</h3>
          <div class="event-list">
            <div v-for="e in dayEvents" :key="e.id" class="event-item" @click="openEventForm(selectedDate, e)">
              <div class="event-time">{{ e.event_time || '全天' }}</div>
              <div class="event-info">
                <div class="event-name">{{ e.title }}</div>
                <div v-if="e.description" class="event-desc">{{ e.description }}</div>
                <div v-if="e.remind_minutes != null" class="event-remind">提前{{ e.remind_minutes }}分钟提醒</div>
              </div>
              <button class="event-del" @click.stop="deleteEvent(e.id)">×</button>
            </div>
          </div>
        </div>

        <!-- 笔记 -->
        <div v-if="dayNotes.length > 0" class="detail-section">
          <h3 class="section-title">笔记</h3>
          <div class="note-list">
            <div v-for="n in dayNotes" :key="n.id" class="day-note-item" @click="goEditNote(n.id)">
              <span class="note-pin" v-if="n.is_pinned">📌</span>
              <div class="day-note-info">
                <div class="day-note-title">{{ n.title || '无标题' }}</div>
                <div class="day-note-summary">{{ getSummary(n.content) }}</div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="dayEvents.length === 0 && dayNotes.length === 0" class="empty-state">
          <div class="empty-icon">📅</div>
          <p>这天还没有记录</p>
        </div>
      </div>
    </div>

    <!-- 事件表单弹出层 -->
    <van-popup
      v-model:show="showEventForm"
      position="bottom"
      round
      :style="{ maxHeight: '80%' }"
    >
      <div class="event-form">
        <div class="form-header">
          <h3>{{ editingEvent ? '编辑事件' : '新建事件' }}</h3>
          <button class="form-close" @click="showEventForm = false">×</button>
        </div>
        <van-cell-group inset>
          <van-field v-model="eventForm.title" label="标题" placeholder="事件标题" required />
          <van-field label="日期" readonly>
            <template #input>
              <input type="date" v-model="eventForm.event_date" class="form-date-input" />
            </template>
          </van-field>
          <van-field label="时间" readonly>
            <template #input>
              <input type="time" v-model="eventForm.event_time" class="form-date-input" />
            </template>
          </van-field>
          <van-field label="提醒" readonly>
            <template #input>
              <input
                type="number"
                :value="eventForm.remind_minutes ?? ''"
                placeholder="提前几分钟（留空不提醒）"
                class="form-date-input"
                @input="onRemindInput"
              />
            </template>
          </van-field>
          <van-field
            v-model="eventForm.description"
            label="备注"
            type="textarea"
            placeholder="补充说明"
            rows="2"
            autosize
          />
        </van-cell-group>
        <div class="form-actions">
          <button v-if="editingEvent" class="form-btn danger" @click="deleteCurrentEvent">删除</button>
          <button class="form-btn primary" @click="saveEvent">{{ editingEvent ? '保存' : '创建' }}</button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast, showConfirmDialog } from 'vant'
import { Solar } from 'lunar-javascript'
import { useEventsStore } from '@/stores/events'
import { useNotesStore } from '@/stores/notes'
import { listNotesByDate } from '@/services/db'
import { ensureNotificationPermission } from '@/services/notification'
import { todayStr, monthStr, getMonthDays, formatDate } from '@/utils/date'
import { extractSummary } from '@/utils/markdown'
import type { EventItem, Note, EventInput } from '@/types'

const router = useRouter()
const eventsStore = useEventsStore()
const notesStore = useNotesStore()

const windowWidth = ref(window.innerWidth)
const isMobile = computed(() => windowWidth.value < 768)

const todayDate = todayStr()
const currentDate = ref(new Date())
const currentYear = computed(() => currentDate.value.getFullYear())
const currentMonth = computed(() => currentDate.value.getMonth() + 1)
const selectedDate = ref(todayDate)

const weekdays = ['日', '一', '二', '三', '四', '五', '六']

const monthDays = computed(() =>
  getMonthDays(currentYear.value, currentMonth.value),
)

const monthEvents = ref<EventItem[]>([])
const dayNotes = ref<Note[]>([])

const dayEvents = computed(() =>
  monthEvents.value.filter((e) => e.event_date === selectedDate.value),
)

const selectedDateLabel = computed(() => {
  const d = new Date(selectedDate.value)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
})

function dayHasEvents(date: string): boolean {
  return monthEvents.value.some((e) => e.event_date === date)
}

function dayHasNotes(date: string): boolean {
  return dayNotes.value.some((n) => n.note_date === date)
}

// 事件表单
const showEventForm = ref(false)
const editingEvent = ref<EventItem | null>(null)
const eventForm = reactive<EventInput & { remind_minutes: number | null }>({
  title: '',
  event_date: todayDate,
  event_time: null,
  remind_minutes: null,
  description: '',
})

function getLunarDay(dateStr: string): string {
  try {
    const solar = Solar.fromDate(new Date(dateStr))
    const lunar = solar.getLunar()
    const dayInChinese = lunar.getDayInChinese()
    // 每月初一显示月份
    if (dayInChinese === '初一') {
      return lunar.getMonthInChinese() + '月'
    }
    return dayInChinese
  } catch {
    return ''
  }
}

function changeMonth(delta: number): void {
  const d = new Date(currentDate.value)
  d.setMonth(d.getMonth() + delta)
  currentDate.value = d
  loadMonthData()
}

function goToday(): void {
  currentDate.value = new Date()
  selectedDate.value = todayDate
  loadMonthData()
}

function selectDate(date: string): void {
  selectedDate.value = date
  loadDayNotes()
}

async function loadMonthData(): Promise<void> {
  const ym = monthStr(currentDate.value)
  monthEvents.value = await eventsStore.getByMonth(ym)
  loadDayNotes()
}

async function loadDayNotes(): Promise<void> {
  dayNotes.value = await listNotesByDate(selectedDate.value)
}

function openEventForm(date: string, event?: EventItem): void {
  if (event) {
    editingEvent.value = event
    eventForm.title = event.title
    eventForm.event_date = event.event_date
    eventForm.event_time = event.event_time
    eventForm.remind_minutes = event.remind_minutes
    eventForm.description = event.description
  } else {
    editingEvent.value = null
    eventForm.title = ''
    eventForm.event_date = date
    eventForm.event_time = null
    eventForm.remind_minutes = null
    eventForm.description = ''
  }
  showEventForm.value = true
}

function onRemindInput(e: Event): void {
  const val = (e.target as HTMLInputElement).value
  eventForm.remind_minutes = val === '' ? null : Number(val)
}

async function saveEvent(): Promise<void> {
  if (!eventForm.title.trim()) {
    showToast('请填写标题')
    return
  }
  if (eventForm.remind_minutes != null && eventForm.remind_minutes > 0) {
    await ensureNotificationPermission()
  }
  const input: EventInput = {
    title: eventForm.title.trim(),
    event_date: eventForm.event_date,
    event_time: eventForm.event_time || null,
    remind_minutes: eventForm.remind_minutes,
    description: eventForm.description,
  }
  if (editingEvent.value) {
    await eventsStore.updateEvent(editingEvent.value.id, input)
  } else {
    await eventsStore.createEvent(input)
  }
  showEventForm.value = false
  showToast(editingEvent.value ? '已保存' : '已创建')
  await loadMonthData()
}

async function deleteEvent(id: string): Promise<void> {
  try {
    await showConfirmDialog({ title: '确认', message: '删除此事件？' })
    await eventsStore.softDelete(id)
    await loadMonthData()
    showToast('已删除')
  } catch {
    // 取消
  }
}

async function deleteCurrentEvent(): Promise<void> {
  if (editingEvent.value) {
    await deleteEvent(editingEvent.value.id)
    showEventForm.value = false
  }
}

function newNoteOnDate(date: string): void {
  router.push({ path: '/note/new', query: { date } })
}

function goEditNote(id: string): void {
  router.push(`/note/${id}`)
}

function getSummary(content: string): string {
  return extractSummary(content, 50)
}

function handleResize(): void {
  windowWidth.value = window.innerWidth
}

onMounted(async () => {
  window.addEventListener('resize', handleResize)
  await eventsStore.loadAll()
  await loadMonthData()
})
</script>

<style scoped>
.calendar-view {
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
}

.content-area {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px 16px;
}

.month-switcher {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: 12px;
  position: relative;
}

.month-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 0.5px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.month-btn:hover {
  background: var(--bg-hover);
}

.month-label {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
  min-width: 120px;
  text-align: center;
}

.today-btn {
  position: absolute;
  right: 0;
  padding: 4px 12px;
  border: 0.5px solid var(--app-primary);
  background: transparent;
  color: var(--app-primary);
  border-radius: var(--radius-sm);
  font-size: 13px;
  cursor: pointer;
}

.weekday-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 4px;
}

.weekday-cell {
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
  padding: 4px 0;
}

.days-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  margin-bottom: 20px;
}

.day-cell {
  aspect-ratio: 1;
  border-radius: var(--radius-sm);
  padding: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  cursor: pointer;
  position: relative;
  transition: background 0.15s;
  min-height: 48px;
}

.day-cell:hover {
  background: var(--bg-hover);
}

.day-cell.other-month {
  opacity: 0.35;
}

.day-cell.is-today .day-number {
  color: var(--app-primary);
  font-weight: 600;
}

.day-cell.is-selected {
  background: var(--app-primary-bg);
}

.day-cell.is-selected .day-number {
  color: var(--app-primary);
}

.day-number {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.2;
}

.day-lunar {
  font-size: 10px;
  color: var(--text-tertiary);
  margin-top: 1px;
}

.day-dots {
  display: flex;
  gap: 3px;
  margin-top: auto;
  height: 4px;
}

.dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
}

.dot-event {
  background: var(--app-danger);
}

.dot-note {
  background: var(--app-primary);
}

.day-detail {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 16px;
  box-shadow: var(--shadow-sm);
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.detail-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
}

.detail-actions {
  display: flex;
  gap: 8px;
}

.detail-btn {
  padding: 4px 10px;
  border: 0.5px solid var(--app-primary);
  background: transparent;
  color: var(--app-primary);
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
}

.detail-section {
  margin-top: 16px;
}

.section-title {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
  font-weight: 500;
}

.event-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.event-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  background: var(--bg-page);
  cursor: pointer;
}

.event-item:hover {
  background: var(--bg-hover);
}

.event-time {
  font-size: 12px;
  color: var(--app-primary);
  font-weight: 500;
  min-width: 36px;
  padding-top: 1px;
}

.event-info {
  flex: 1;
}

.event-name {
  font-size: 14px;
  color: var(--text-primary);
}

.event-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.event-remind {
  font-size: 11px;
  color: var(--app-warning);
  margin-top: 2px;
}

.event-del {
  background: none;
  border: none;
  color: var(--text-tertiary);
  font-size: 18px;
  line-height: 1;
  padding: 0 4px;
  cursor: pointer;
}

.event-del:hover {
  color: var(--app-danger);
}

.note-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.day-note-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  background: var(--bg-page);
  cursor: pointer;
}

.day-note-item:hover {
  background: var(--bg-hover);
}

.note-pin {
  font-size: 14px;
}

.day-note-info {
  flex: 1;
  min-width: 0;
}

.day-note-title {
  font-size: 14px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.day-note-summary {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 事件表单 */
.event-form {
  padding: 16px 0 20px;
}

.form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px 12px;
}

.form-header h3 {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
}

.form-close {
  background: none;
  border: none;
  font-size: 24px;
  color: var(--text-tertiary);
  line-height: 1;
  cursor: pointer;
}

.form-date-input {
  border: none;
  background: transparent;
  font-size: 14px;
  color: var(--text-primary);
  width: 100%;
}

.form-actions {
  display: flex;
  gap: 12px;
  padding: 16px;
}

.form-btn {
  flex: 1;
  padding: 10px;
  border-radius: var(--radius-md);
  border: none;
  font-size: 14px;
  cursor: pointer;
}

.form-btn.primary {
  background: var(--app-primary);
  color: #fff;
}

.form-btn.danger {
  background: transparent;
  border: 0.5px solid var(--app-danger);
  color: var(--app-danger);
}
</style>
