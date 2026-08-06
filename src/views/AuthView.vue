<template>
  <div class="auth-view">
    <div class="auth-card">
      <div class="auth-header">
        <img src="/icon.svg" alt="logo" class="auth-logo" />
        <h1 class="auth-title">记事本日历</h1>
        <p class="auth-subtitle">{{ isSupabaseConfigured ? '登录开启多设备云同步' : '云服务未配置' }}</p>
      </div>

      <div v-if="!isSupabaseConfigured" class="not-configured">
        <p>当前为本地模式，数据仅保存在本设备。</p>
        <p>如需云同步，请在项目根目录的 <code>.env</code> 文件中配置 Supabase 参数后重新部署。</p>
        <button class="auth-btn secondary" @click="router.push('/')">返回首页</button>
      </div>

      <template v-else>
        <van-tabs v-model:active="mode" shrink>
          <van-tab title="登录" name="signin" />
          <van-tab title="注册" name="signup" />
        </van-tabs>

        <div class="form-area">
          <van-cell-group inset>
            <van-field
              v-model="email"
              label="邮箱"
              placeholder="请输入邮箱"
              type="email"
              clearable
            />
            <van-field
              v-model="password"
              label="密码"
              placeholder="至少 6 位"
              type="password"
              clearable
            />
          </van-cell-group>

          <div class="form-actions">
            <button
              class="auth-btn primary"
              :disabled="authStore.loading || !canSubmit"
              @click="handleSubmit"
            >
              {{ authStore.loading ? '处理中...' : mode === 'signin' ? '登录' : '注册' }}
            </button>
          </div>

          <div class="divider">
            <span>或</span>
          </div>

          <button
            class="auth-btn secondary"
            :disabled="authStore.loading || !email"
            @click="handleMagicLink"
          >
            魔法链接登录（免密）
          </button>

          <p v-if="errorMessage" class="error-msg">{{ errorMessage }}</p>
          <p v-if="successMessage" class="success-msg">{{ successMessage }}</p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { isSupabaseConfigured } from '@/services/supabase'

const router = useRouter()
const authStore = useAuthStore()

const mode = ref<'signin' | 'signup'>('signin')
const email = ref('')
const password = ref('')
const errorMessage = ref('')
const successMessage = ref('')

const canSubmit = computed(() => email.value.trim() && password.value.length >= 6)

async function handleSubmit(): Promise<void> {
  errorMessage.value = ''
  successMessage.value = ''
  const result =
    mode.value === 'signin'
      ? await authStore.signIn(email.value.trim(), password.value)
      : await authStore.signUp(email.value.trim(), password.value)

  if (result.error) {
    errorMessage.value = result.error
  } else if (mode.value === 'signup' && !authStore.isLoggedIn) {
    successMessage.value = result.error || '注册成功，请查收邮件'
  } else {
    router.push('/')
  }
}

async function handleMagicLink(): Promise<void> {
  errorMessage.value = ''
  successMessage.value = ''
  const result = await authStore.signInWithMagicLink(email.value.trim())
  if (result.error) {
    errorMessage.value = result.error
  } else {
    successMessage.value = '魔法链接已发送到邮箱，请查收'
  }
}
</script>

<style scoped>
.auth-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 20px;
}

.auth-card {
  width: 100%;
  max-width: 420px;
  background: var(--bg-card);
  border-radius: var(--radius-xl);
  padding: 32px 0 24px;
  box-shadow: var(--shadow-md);
}

.auth-header {
  text-align: center;
  margin-bottom: 20px;
  padding: 0 24px;
}

.auth-logo {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  margin-bottom: 12px;
}

.auth-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.auth-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.not-configured {
  padding: 0 24px 24px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.8;
}

.not-configured code {
  background: var(--bg-page);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
}

.form-area {
  padding: 16px 0 0;
}

.form-actions {
  padding: 16px 24px 0;
}

.auth-btn {
  width: 100%;
  padding: 12px;
  border-radius: var(--radius-md);
  border: none;
  font-size: 15px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.auth-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.auth-btn.primary {
  background: var(--app-primary);
  color: #fff;
}

.auth-btn.secondary {
  background: transparent;
  border: 0.5px solid var(--app-primary);
  color: var(--app-primary);
}

.divider {
  display: flex;
  align-items: center;
  text-align: center;
  margin: 20px 24px;
  color: var(--text-tertiary);
  font-size: 12px;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  border-bottom: 0.5px solid var(--border-color);
}

.divider span {
  padding: 0 12px;
}

.error-msg,
.success-msg {
  padding: 8px 24px 0;
  font-size: 13px;
  text-align: center;
}

.error-msg {
  color: var(--app-danger);
}

.success-msg {
  color: var(--app-success);
}
</style>
