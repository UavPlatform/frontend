<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { EditPen, Lock, User } from '@element-plus/icons-vue'
import { login, register, adminLogin } from '../api/modules/auth'

const router = useRouter()

const activeTab = ref<'login' | 'register'>('login')
const loginLoading = ref(false)
const registerLoading = ref(false)
const loginType = ref<'user' | 'admin'>('user')

const loginForm = reactive({
  userName: '',
  password: '123456',
})

const registerForm = reactive({
  userName: '',
  password: '',
  confirmPassword: '',
})

const handleLogin = async () => {
  const isUser = loginType.value === 'user'
  const userName = isUser ? loginForm.userName.trim() : loginForm.userName.trim()
  const password = isUser ? loginForm.password : loginForm.password

  if (!userName || !password) {
    ElMessage.warning(isUser ? '请输入用户名和密码' : '请输入管理员用户名和密码')
    return
  }

  loginLoading.value = true

  try {
    if (isUser) {
      await login({ userName, password })
      ElMessage.success('登录成功')
    } else {
      await adminLogin({ name: userName, password })
      ElMessage.success('管理员登录成功')
    }
    await router.replace({ name: 'dashboard' })
  } catch (error) {
    console.error(error)
    ElMessage.error(error instanceof Error ? error.message : '登录失败，请检查接口配置')
  } finally {
    loginLoading.value = false
  }
}

const handleRegister = async () => {
  if (!registerForm.userName.trim() || !registerForm.password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }

  if (registerForm.password !== registerForm.confirmPassword) {
    ElMessage.warning('两次输入的密码不一致')
    return
  }

  registerLoading.value = true

  try {
    const result = await register({
      userName: registerForm.userName.trim(),
      password: registerForm.password,
    })

    loginForm.userName = result.userName
    loginForm.password = registerForm.password
    registerForm.userName = ''
    registerForm.password = ''
    registerForm.confirmPassword = ''
    activeTab.value = 'login'
    ElMessage.success(`注册成功，用户名：${result.userName}`)
  } catch (error) {
    console.error(error)
    ElMessage.error(error instanceof Error ? error.message : '注册失败，请检查接口配置')
  } finally {
    registerLoading.value = false
  }
}
</script>

<template>
  <div class="page-shell">
    <div class="mx-auto grid min-h-screen max-w-[1440px] gap-6 px-4 py-6 lg:grid-cols-[1.1fr_520px] lg:px-6">
      <section class="relative overflow-hidden rounded-[32px] bg-[#10233f] p-7 text-white md:p-10">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.45),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.24),transparent_35%)]" />

        <div class="relative z-1 flex h-full flex-col justify-between gap-8">
          <div>
            <div class="inline-flex rounded-full border border-white/20 px-4 py-2 text-xs tracking-[0.28em] text-white/70 uppercase">
              UAV Control Center
            </div>
            <h1 class="mt-6 max-w-[680px] text-4xl font-900 leading-tight tracking-tight md:text-6xl">
              无人机 Web 控制台
              <span class="block text-[#8ec5ff]">在线设备管理与操作控制</span>
            </h1>
            <p class="mt-6 max-w-[720px] text-base leading-8 text-white/72 md:text-lg">
              登录后查看在线无人机和全部无人机数据，选择设备后进入操作界面并拉起图传。
            </p>
          </div>

          <div class="grid gap-4 md:grid-cols-3">
            <div class="rounded-6 bg-white/8 p-5 backdrop-blur">
              <div class="text-sm text-white/60">统一登录</div>
              <div class="mt-3 text-3xl font-800">安全</div>
              <div class="mt-2 text-sm text-white/70">使用用户名和密码完成账号认证</div>
            </div>
            <div class="rounded-6 bg-white/8 p-5 backdrop-blur">
              <div class="text-sm text-white/60">机队管理</div>
              <div class="mt-3 text-3xl font-800">在线</div>
              <div class="mt-2 text-sm text-white/70">查看在线无人机和全部无人机数据</div>
            </div>
            <div class="rounded-6 bg-white/8 p-5 backdrop-blur">
              <div class="text-sm text-white/60">操作界面</div>
              <div class="mt-3 text-2xl font-800">Live</div>
              <div class="mt-2 text-sm text-white/70">进入后自动尝试拉起图传</div>
            </div>
          </div>
        </div>
      </section>

      <section class="flex items-center">
        <div class="panel-card w-full rounded-[32px] p-6 md:p-8">
          <div>
            <div class="text-3xl font-900 tracking-tight text-[#10233f]">用户认证</div>
            <div class="mt-2 text-sm leading-6 text-[#6b7a90]">
              使用用户名登录进入控制台，或先注册新账号。
            </div>
          </div>

          <el-tabs v-model="activeTab" class="mt-8">
            <el-tab-pane label="登录" name="login">
              <div class="mb-4">
                <el-radio-group v-model="loginType" size="large">
                  <el-radio-button value="user">普通用户</el-radio-button>
                  <el-radio-button value="admin">管理员</el-radio-button>
                </el-radio-group>
              </div>

              <el-form label-position="top" @submit.prevent="handleLogin">
                <el-form-item :label="loginType === 'user' ? '用户名' : '管理员用户名'">
                  <el-input v-model="loginForm.userName" :placeholder="loginType === 'user' ? '请输入用户名' : '请输入管理员用户名'">
                    <template #prefix>
                      <el-icon><User /></el-icon>
                    </template>
                  </el-input>
                </el-form-item>

                <el-form-item :label="loginType === 'user' ? '密码' : '管理员密码'">
                  <el-input
                    v-model="loginForm.password"
                    show-password
                    type="password"
                    :placeholder="loginType === 'user' ? '请输入密码' : '请输入管理员密码'"
                    @keyup.enter="handleLogin"
                  >
                    <template #prefix>
                      <el-icon><Lock /></el-icon>
                    </template>
                  </el-input>
                </el-form-item>

                <div class="mt-8">
                  <el-button class="!h-12" type="primary" :loading="loginLoading" @click="handleLogin">
                    {{ loginType === 'user' ? '进入控制台' : '管理员登录' }}
                  </el-button>
                </div>
              </el-form>
            </el-tab-pane>

            <el-tab-pane label="注册" name="register">
              <el-form label-position="top" @submit.prevent="handleRegister">
                <el-form-item label="用户名">
                  <el-input v-model="registerForm.userName" placeholder="请输入用户名">
                    <template #prefix>
                      <el-icon><EditPen /></el-icon>
                    </template>
                  </el-input>
                </el-form-item>

                <el-form-item label="密码">
                  <el-input
                    v-model="registerForm.password"
                    show-password
                    type="password"
                    placeholder="请输入密码"
                  >
                    <template #prefix>
                      <el-icon><Lock /></el-icon>
                    </template>
                  </el-input>
                </el-form-item>

                <el-form-item label="确认密码">
                  <el-input
                    v-model="registerForm.confirmPassword"
                    show-password
                    type="password"
                    placeholder="请再次输入密码"
                    @keyup.enter="handleRegister"
                  >
                    <template #prefix>
                      <el-icon><Lock /></el-icon>
                    </template>
                  </el-input>
                </el-form-item>

                <div class="mt-8">
                  <el-button class="!h-12" type="primary" :loading="registerLoading" @click="handleRegister">
                    注册账号
                  </el-button>
                </div>
              </el-form>
            </el-tab-pane>
          </el-tabs>
        </div>
      </section>
    </div>
  </div>
</template>
