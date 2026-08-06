import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase, isSupabaseConfigured } from '@/services/supabase'
import { assignLocalDataToUser, clearSyncState, fullSync, subscribeRealtime } from '@/services/sync'
import type { AppUser } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AppUser | null>(null)
  const loading = ref(false)
  const initialized = ref(false)

  const isLoggedIn = computed(() => user.value !== null)
  const cloudEnabled = computed(() => isSupabaseConfigured && isLoggedIn.value)

  // 初始化：恢复会话 + 监听变化
  async function init(): Promise<void> {
    if (!isSupabaseConfigured || !supabase) {
      initialized.value = true
      return
    }
    const { data } = await supabase.auth.getSession()
    if (data.session?.user) {
      user.value = { id: data.session.user.id, email: data.session.user.email ?? null }
      await onLoggedIn()
    }
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        if (!user.value || user.value.id !== session.user.id) {
          user.value = { id: session.user.id, email: session.user.email ?? null }
          await onLoggedIn()
        }
      } else if (event === 'SIGNED_OUT') {
        user.value = null
        await clearSyncState()
      }
    })
    initialized.value = true
  }

  // 登录成功后的处理
  async function onLoggedIn(): Promise<void> {
    if (!user.value) return
    await assignLocalDataToUser(user.value.id)
    subscribeRealtime(() => {
      // Realtime 变更触发后，由各 store 自行 reload
      window.dispatchEvent(new CustomEvent('sync:remote-change'))
    })
    // 后台全量同步，完成后通知各 store 重新加载
    fullSync()
      .then(() => window.dispatchEvent(new CustomEvent('sync:remote-change')))
      .catch((e) => console.warn('[auth] 首次同步失败', e))
  }

  async function signIn(email: string, password: string): Promise<{ error: string | null }> {
    if (!supabase) return { error: '未配置云服务' }
    loading.value = true
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return { error: error.message }
      if (data.user) {
        user.value = { id: data.user.id, email: data.user.email ?? null }
        await onLoggedIn()
      }
      return { error: null }
    } finally {
      loading.value = false
    }
  }

  async function signUp(email: string, password: string): Promise<{ error: string | null }> {
    if (!supabase) return { error: '未配置云服务' }
    loading.value = true
    try {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) return { error: error.message }
      // 某些情况需要邮箱确认
      if (data.user && !data.session) {
        return { error: '注册成功，请前往邮箱确认后登录' }
      }
      if (data.user) {
        user.value = { id: data.user.id, email: data.user.email ?? null }
        await onLoggedIn()
      }
      return { error: null }
    } finally {
      loading.value = false
    }
  }

  async function signInWithMagicLink(email: string): Promise<{ error: string | null }> {
    if (!supabase) return { error: '未配置云服务' }
    loading.value = true
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) return { error: error.message }
      return { error: null }
    } finally {
      loading.value = false
    }
  }

  async function signOut(): Promise<void> {
    if (supabase) await supabase.auth.signOut()
    await clearSyncState()
    user.value = null
  }

  return {
    user,
    loading,
    initialized,
    isLoggedIn,
    cloudEnabled,
    init,
    signIn,
    signUp,
    signInWithMagicLink,
    signOut,
  }
})
