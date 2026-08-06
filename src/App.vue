<template>
  <div class="app-layout" :class="{ 'is-mobile': isMobile, 'is-pc': !isMobile }">
    <!-- PC 侧边栏 -->
    <aside v-if="!isMobile" class="sidebar">
      <div class="sidebar-header">
        <img src="/icon.svg" alt="logo" class="logo-icon" />
        <span class="app-name">记事本日历</span>
      </div>
      <nav class="sidebar-nav">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ active: isNavActive(item.path) }"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-label">{{ item.label }}</span>
        </router-link>
      </nav>
      <div class="sidebar-footer">
        <div v-if="auth.isLoggedIn" class="user-info">
          <div class="user-avatar">{{ (auth.user?.email || 'U')[0].toUpperCase() }}</div>
          <span class="user-email">{{ auth.user?.email }}</span>
        </div>
        <button v-else class="login-btn" @click="router.push('/auth')">登录云同步</button>
      </div>
    </aside>

    <!-- 主内容区 -->
    <main class="main-content">
      <router-view />
    </main>

    <!-- 移动端底部 Tabbar -->
    <van-tabbar v-if="isMobile && showTabbar" route safe-area-inset-bottom>
      <van-tabbar-item to="/" icon="notes-o">笔记</van-tabbar-item>
      <van-tabbar-item to="/calendar" icon="calendar-o">日历</van-tabbar-item>
      <van-tabbar-item to="/settings" icon="setting-o">设置</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const windowWidth = ref(window.innerWidth)
const isMobile = computed(() => windowWidth.value < 768)

const showTabbar = computed(() => Boolean(route.meta.tab))

const navItems = [
  { path: '/', label: '笔记', icon: '📝' },
  { path: '/calendar', label: '日历', icon: '📅' },
  { path: '/recycle', label: '回收站', icon: '🗑️' },
  { path: '/settings', label: '设置', icon: '⚙️' },
]

function isNavActive(path: string): boolean {
  if (path === '/') return route.path === '/' || route.path.startsWith('/note')
  if (path === '/calendar') return route.path === '/calendar'
  return route.path === path
}

function handleResize(): void {
  windowWidth.value = window.innerWidth
}

onMounted(() => window.addEventListener('resize', handleResize))
onUnmounted(() => window.removeEventListener('resize', handleResize))
</script>

<style scoped>
.app-layout {
  display: flex;
  height: 100%;
  width: 100%;
}

/* PC 布局 */
.is-pc .sidebar {
  width: var(--sidebar-width);
  background: var(--bg-card);
  border-right: 0.5px solid var(--border-color);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 18px 16px;
}

.logo-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
}

.app-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.sidebar-nav {
  flex: 1;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 14px;
  transition: background 0.15s, color 0.15s;
}

.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.nav-item.active {
  background: var(--app-primary-bg);
  color: var(--app-primary);
  font-weight: 500;
}

.nav-icon {
  font-size: 18px;
  width: 22px;
  text-align: center;
}

.sidebar-footer {
  padding: 16px;
  border-top: 0.5px solid var(--border-color);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--app-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 500;
  flex-shrink: 0;
}

.user-email {
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.login-btn {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--app-primary);
  background: transparent;
  color: var(--app-primary);
  border-radius: var(--radius-md);
  font-size: 14px;
  transition: background 0.15s;
}

.login-btn:hover {
  background: var(--app-primary-bg);
}

.main-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--bg-page);
}

/* 移动端布局 */
.is-mobile .main-content {
  padding-bottom: var(--tabbar-height);
}
</style>
