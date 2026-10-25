<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { providerLogin } from '../api/modules/provider'

const router = useRouter()
const loading = ref(false)
const form = reactive({ username: '', password: '' })

const submit = async () => {
  if (loading.value) return
  if (!form.username.trim() || !form.password) {
    ElMessage.warning('请输入服务商账号和密码')
    return
  }
  loading.value = true
  try {
    await providerLogin(form.username.trim(), form.password)
    ElMessage.success('登录成功')
    await router.replace({ name: 'provider-workspace' })
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '登录失败，请稍后重试')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="provider-login" aria-labelledby="provider-login-title">
    <section class="provider-login__card">
      <h1 id="provider-login-title">服务商工作台</h1>
      <p>管理无人机登记、机场资料和借用状态</p>
      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item label="账号">
          <el-input
            v-model="form.username"
            autocomplete="username"
            placeholder="请输入服务商账号"
            aria-label="服务商账号"
          />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            autocomplete="current-password"
            placeholder="请输入密码"
            aria-label="服务商密码"
          />
        </el-form-item>
        <el-button
          class="provider-login__submit"
          type="primary"
          native-type="submit"
          :loading="loading"
          :disabled="loading"
        >
          登录
        </el-button>
      </el-form>
    </section>
  </main>
</template>

<style scoped>
.provider-login { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: var(--bg-body); }
.provider-login__card { width: min(100%, 440px); padding: 32px; border: 1px solid var(--border); border-radius: 16px; background: var(--bg-card); box-shadow: var(--shadow-float); }
h1 { margin: 0; color: var(--text-strong); }
p { margin: 8px 0 24px; color: var(--text-secondary); }
.provider-login__submit { width: 100%; }
</style>
