import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import { useNotesStore } from '@/stores/notes'
import { useEventsStore } from '@/stores/events'
import './styles/main.css'

// Vant 基础样式
import 'vant/lib/index.css'

// md-editor-v3 样式
import 'md-editor-v3/lib/style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)

// 初始化主题与认证后挂载（加容错，确保任何初始化失败时 app 仍会挂载）
async function bootstrap() {
  const settings = useSettingsStore()
  settings.initTheme()

  try {
    const auth = useAuthStore()
    await auth.init()
  } catch (e) {
    console.error('[bootstrap] auth init failed', e)
  }

  let notes: ReturnType<typeof useNotesStore> | null = null
  let events: ReturnType<typeof useEventsStore> | null = null
  try {
    notes = useNotesStore()
    events = useEventsStore()
    await Promise.all([notes.loadAll(), events.loadAll()])
  } catch (e) {
    console.error('[bootstrap] data load failed', e)
  }

  // 监听远端实时变更
  window.addEventListener('sync:remote-change', () => {
    try {
      notes?.reloadFromRemote()
      events?.reloadFromRemote()
    } catch (e) {
      console.error('[sync] reload failed', e)
    }
  })

  app.mount('#app')
}

bootstrap()
