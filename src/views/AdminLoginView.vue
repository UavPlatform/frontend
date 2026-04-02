<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Key, User } from '@element-plus/icons-vue'
import { adminLogin } from '../api/modules/admin'

const router = useRouter()

const loginLoading = ref(false)
const loginForm = reactive({
  name: '',
  password: ''
})

const handleLogin = async () => {
  if (!loginForm.name.trim()) {
    ElMessage.warning('请输入管理员账号')
    return
  }

  if (!loginForm.password.trim()) {
    ElMessage.warning('请输入管理员密码')
    return
  }

  loginLoading.value = true

  try {
    const result = await adminLogin({
      name: loginForm.name,
      password: loginForm.password
    })

    if (result.success) {
      ElMessage.success('管理员登录成功')
      router.push({ name: 'admin-center' })
    } else {
      ElMessage.error(result.message || '登录失败')
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '登录失败，请稍后重试')
  } finally {
    loginLoading.value = false
  }
}

const goToUserLogin = () => {
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <div class="login-icon">
          <Key :size="32" />
        </div>
        <h1 class="login-title">管理员登录</h1>
        <p class="login-subtitle">无人机管理系统 - 管理中心</p>
      </div>

      <el-form label-position="top" @submit.prevent="handleLogin">
        <el-form-item label="管理员账号">
          <el-input
            v-model="loginForm.name"
            placeholder="请输入管理员账号"
            :prefix-icon="User"
            size="large"
          />
        </el-form-item>

        <el-form-item label="管理员密码">
          <el-input
            v-model="loginForm.password"
            type="password"
            placeholder="请输入管理员密码"
            :prefix-icon="Key"
            size="large"
            show-password
          />
        </el-form-item>

        <div class="mt-8">
          <el-button
            class="!h-12 w-full"
            type="primary"
            :loading="loginLoading"
            @click="handleLogin"
          >
            进入管理中心
          </el-button>
        </div>
      </el-form>

      <div class="login-footer">
        <span class="text-gray-500">普通用户？</span>
        <el-button type="primary" link @click="goToUserLogin">
          用户登录入口
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  padding: 20px;
}

.login-card {
  width: 100%;
  max-width: 420px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.login-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px;
  color: white;
}

.login-title {
  font-size: 24px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0 0 8px;
}

.login-subtitle {
  font-size: 14px;
  color: #6b7280;
  margin: 0;
}

.login-footer {
  margin-top: 24px;
  text-align: center;
  padding-top: 20px;
  border-top: 1px solid #e5e7eb;
}
</style>
