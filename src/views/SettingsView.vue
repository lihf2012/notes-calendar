<template>
  <div class="settings-view">
    <header class="page-header">
      <h1 class="page-title">设置</h1>
    </header>

    <div class="page-container content-area">
      <!-- 账号 -->
      <div class="settings-section">
        <h2 class="section-title">账号与同步</h2>
        <div class="settings-card">
          <div v-if="auth.isLoggedIn" class="account-info">
            <div class="account-avatar">{{ (auth.user?.email || 'U')[0].toUpperCase() }}</div>
            <div class="account-detail">
              <div class="account-email">{{ auth.user?.email }}</div>
              <div class="account-status">
                <span class="status-dot online"></span>
                云同步已开启
              </div>
            </div>
          </div>
          <div v-else class="account-info">
            <div class="account-avatar offline">U</div>
            <div class="account-detail">
              <div class="account-email">未登录</div>
              <div class="account-status">
                <span class="status-dot offline"></span>
                本地模式，数据仅存本设备
              </div>
            </div>
          </div>
          <div class="account-actions">
            <button v-if="auth.isLoggedIn" class="action-btn danger" @click="handleSignOut">
              退出登录
            </button>
            <button v-else-if="isSupabaseConfigured" class="action-btn primary" @click="router.push('/auth')">
              登录云同步
            </button>
            <button v-else class="action-btn" disabled>云服务未配置</button>
          </div>

          <!-- 同步状态 -->
          <template v-if="auth.isLoggedIn">
            <div class="sync-status">
              <div class="sync-status-row">
                <span class="sync-label">同步状态</span>
                <span class="sync-value" :class="{ syncing: syncing }">
                  {{ syncing ? '同步中...' : pendingCount > 0 ? `待同步 ${pendingCount} 条` : '已同步' }}
                </span>
              </div>
              <div class="sync-status-row">
                <span class="sync-label">最后同步</span>
                <span class="sync-value">{{ lastSyncText }}</span>
              </div>
              <div class="sync-status-row">
                <span class="sync-label">上次拉取</span>
                <span class="sync-value">{{ lastPullText }}</span>
              </div>
              <button class="action-btn small sync-now" :disabled="syncing" @click="handleManualSync">
                {{ syncing ? '同步中...' : '立即同步' }}
              </button>
            </div>
          </template>
        </div>
      </div>

      <!-- 外观 -->
      <div class="settings-section">
        <h2 class="section-title">外观</h2>
        <div class="settings-card">
          <div class="setting-row">
            <span class="setting-label">主题模式</span>
            <div class="theme-options">
              <button
                v-for="opt in themeOptions"
                :key="opt.value"
                class="theme-opt"
                :class="{ active: settings.theme === opt.value }"
                @click="settings.setTheme(opt.value)"
              >{{ opt.label }}</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 数据管理 -->
      <div class="settings-section">
        <h2 class="section-title">数据管理</h2>
        <div class="settings-card">
          <button class="setting-btn" @click="handleExport">
            <span class="btn-icon">📥</span>
            <span class="btn-text">导出全部数据</span>
          </button>
          <button class="setting-btn" @click="triggerImport">
            <span class="btn-icon">📤</span>
            <span class="btn-text">导入数据</span>
          </button>
          <input
            ref="fileInputRef"
            type="file"
            accept="application/json"
            style="display: none"
            @change="handleImport"
          />
          <button class="setting-btn danger" @click="handleClear">
            <span class="btn-icon">⚠️</span>
            <span class="btn-text">清空所有数据</span>
          </button>
        </div>
      </div>

      <!-- 提醒权限 -->
      <div class="settings-section">
        <h2 class="section-title">通知</h2>
        <div class="settings-card">
          <div class="setting-row">
            <span class="setting-label">事件提醒</span>
            <button class="action-btn small" @click="enableNotification">
              {{ notificationStatus }}
            </button>
          </div>
        </div>
      </div>

      <!-- 关于 -->
      <div class="settings-section">
        <h2 class="section-title">关于</h2>
        <div class="settings-card about">
          <p class="about-text">记事本日历 v1.0.0</p>
          <p class="about-text muted">个人记事本 + 日历应用</p>
          <p class="about-text muted">支持 Markdown · 云同步 · 离线使用 · PWA</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import { useNotesStore } from '@/stores/notes'
import { useEventsStore } from '@/stores/events'
import { isSupabaseConfigured } from '@/services/supabase'
import { exportAllData, importAllData, clearAllData, getSyncState, getPendingSyncItems } from '@/services/db'
import { fullSync, getIsSyncing } from '@/services/sync'
import { ensureNotificationPermission, canNotify } from '@/services/notification'
import type { ThemeMode } from '@/types'

const router = useRouter()
const settings = useSettingsStore()
const auth = useAuthStore()
const notesStore = useNotesStore()
const eventsStore = useEventsStore()

const fileInputRef = ref<HTMLInputElement | null>(null)
const notificationEnabled = ref(false)
const syncing = ref(false)
const pendingCount = ref(0)
const lastSyncText = ref('从未同步')
const lastPullText = ref('从未拉取')

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]

const notificationStatus = computed(() =>
  notificationEnabled.value ? '已开启' : '点击开启',
)

async function refreshSyncStatus(): Promise<void> {
  if (!auth.isLoggedIn) return
  const [state, pending] = await Promise.all([getSyncState(), getPendingSyncItems()])
  pendingCount.value = pending.length
  syncing.value = getIsSyncing()
  lastSyncText.value = state.last_push_at
    ? new Date(state.last_push_at).toLocaleString()
    : '从未同步'
  lastPullText.value = state.last_pull_at
    ? new Date(state.last_pull_at).toLocaleString()
    : '从未拉取'
}

async function handleManualSync(): Promise<void> {
  if (syncing.value) return
  syncing.value = true
  try {
    const result = await fullSync()
    await Promise.all([notesStore.loadAll(), eventsStore.loadAll()])
    await refreshSyncStatus()
    if (result.failed > 0) {
      showToast(`同步完成，${result.failed} 条失败`)
    } else {
      showToast('同步完成')
    }
  } catch (e) {
    console.error(e)
    showToast('同步失败，请检查网络')
  } finally {
    syncing.value = false
    await refreshSyncStatus()
  }
}

async function handleSignOut(): Promise<void> {
  try {
    await showConfirmDialog({ title: '确认', message: '退出登录后本地数据保留，但将停止云同步。' })
    await auth.signOut()
    await Promise.all([notesStore.loadAll(), eventsStore.loadAll()])
    showToast('已退出登录')
  } catch {
    // 取消
  }
}

async function handleExport(): Promise<void> {
  const data = await exportAllData()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `notes-calendar-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  showToast('已导出')
}

function triggerImport(): void {
  fileInputRef.value?.click()
}

async function handleImport(e: Event): Promise<void> {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    if (!data.notes || !data.events) {
      showToast('文件格式不正确')
      return
    }
    await showConfirmDialog({
      title: '确认导入',
      message: `将导入 ${data.notes.length} 条笔记和 ${data.events.length} 条事件，会覆盖当前数据。`,
    })
    await importAllData(data)
    await Promise.all([notesStore.loadAll(), eventsStore.loadAll()])
    showToast('导入成功')
  } catch (err) {
    console.error(err)
    showToast('导入失败')
  } finally {
    if (fileInputRef.value) fileInputRef.value.value = ''
  }
}

async function handleClear(): Promise<void> {
  try {
    await showConfirmDialog({
      title: '危险操作',
      message: '将永久清除所有笔记和事件数据，不可恢复！确认继续？',
    })
    await clearAllData()
    await Promise.all([notesStore.loadAll(), eventsStore.loadAll()])
    showToast('已清空')
  } catch {
    // 取消
  }
}

async function enableNotification(): Promise<void> {
  if (notificationEnabled.value) return
  const ok = await ensureNotificationPermission()
  notificationEnabled.value = ok
  showToast(ok ? '已开启通知' : '通知权限被拒绝')
}

onMounted(() => {
  notificationEnabled.value = canNotify()
  refreshSyncStatus()
})

// 登录状态变化时刷新同步状态
auth.$subscribe(() => refreshSyncStatus())
</script>

<style scoped>
.settings-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.page-header {
  padding: 16px 20px 8px;
  flex-shrink: 0;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.content-area {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px 24px;
  max-width: 640px;
  margin: 0 auto;
  width: 100%;
}

.settings-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
  padding: 0 4px;
  font-weight: 500;
}

.settings-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.account-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
}

.account-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--app-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 500;
  flex-shrink: 0;
}

.account-avatar.offline {
  background: var(--border-strong);
}

.account-detail {
  flex: 1;
}

.account-email {
  font-size: 15px;
  color: var(--text-primary);
  font-weight: 500;
}

.account-status {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.status-dot.online {
  background: var(--app-success);
}

.status-dot.offline {
  background: var(--text-tertiary);
}

.account-actions {
  padding: 0 16px 16px;
}

.sync-status {
  border-top: 0.5px solid var(--border-color);
  padding: 8px 16px 16px;
}

.sync-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 13px;
}

.sync-label {
  color: var(--text-secondary);
}

.sync-value {
  color: var(--text-primary);
}

.sync-value.syncing {
  color: var(--app-primary);
}

.sync-now {
  margin-top: 8px;
}

.action-btn {
  width: 100%;
  padding: 10px;
  border-radius: var(--radius-md);
  border: 0.5px solid var(--border-color);
  background: transparent;
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.primary {
  background: var(--app-primary);
  color: #fff;
  border-color: var(--app-primary);
}

.action-btn.danger {
  color: var(--app-danger);
  border-color: var(--app-danger);
}

.action-btn.small {
  width: auto;
  padding: 4px 12px;
  font-size: 13px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  gap: 12px;
}

.setting-label {
  font-size: 14px;
  color: var(--text-primary);
}

.theme-options {
  display: flex;
  gap: 4px;
  background: var(--bg-page);
  border-radius: var(--radius-md);
  padding: 2px;
}

.theme-opt {
  padding: 4px 12px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.theme-opt.active {
  background: var(--bg-card);
  color: var(--app-primary);
  font-weight: 500;
  box-shadow: var(--shadow-sm);
}

.setting-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  border-bottom: 0.5px solid var(--border-color);
  transition: background 0.15s;
}

.setting-btn:last-child {
  border-bottom: none;
}

.setting-btn:hover {
  background: var(--bg-hover);
}

.setting-btn.danger {
  color: var(--app-danger);
}

.btn-icon {
  font-size: 16px;
}

.about {
  padding: 16px;
  text-align: center;
}

.about-text {
  font-size: 13px;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.about-text.muted {
  color: var(--text-tertiary);
  font-size: 12px;
}
</style>
