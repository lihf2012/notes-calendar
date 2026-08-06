import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { title: '笔记', tab: 'notes' },
  },
  {
    path: '/note/new',
    name: 'note-new',
    component: () => import('@/views/NoteEditView.vue'),
    meta: { title: '新建笔记' },
  },
  {
    path: '/note/:id',
    name: 'note-edit',
    component: () => import('@/views/NoteEditView.vue'),
    meta: { title: '编辑笔记' },
  },
  {
    path: '/calendar',
    name: 'calendar',
    component: () => import('@/views/CalendarView.vue'),
    meta: { title: '日历', tab: 'calendar' },
  },
  {
    path: '/recycle',
    name: 'recycle',
    component: () => import('@/views/RecycleView.vue'),
    meta: { title: '回收站' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: '设置', tab: 'settings' },
  },
  {
    path: '/auth',
    name: 'auth',
    component: () => import('@/views/AuthView.vue'),
    meta: { title: '登录' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.afterEach((to) => {
  const title = (to.meta.title as string) || '记事本日历'
  document.title = `${title} · 记事本日历`
})

export default router
