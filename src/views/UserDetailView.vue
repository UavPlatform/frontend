<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import MainLayout from '../layouts/MainLayout.vue'
import RelatedOrdersTable from '../components/subject/RelatedOrdersTable.vue'
import { getAdminUserDetail } from '../api/modules/admin-query'
import type { AdminUserDetailVo } from '../types/admin'

/**
 * 用户详情（REQ-FRONTEND-001 §3.2）：基本信息 + 关联订单摘要。
 * 订单行点击 → 订单详情（双模式）；顶栏可返回用户列表。
 */
const route = useRoute()
const router = useRouter()

const userId = computed(() => String(route.params.id ?? ''))

const detail = ref<AdminUserDetailVo>()
const loading = ref(false)

const ROLE_LABEL: Record<number, string> = {
  0: '普通用户',
  1: '飞手',
  2: '管理员',
}

let loadSeq = 0
const reload = async () => {
  const seq = ++loadSeq
  detail.value = undefined
  if (!/^\d+$/.test(userId.value)) {
    ElMessage.warning('用户 ID 无效')
    loading.value = false
    return
  }
  loading.value = true
  try {
    const data = await getAdminUserDetail(userId.value)
    if (seq !== loadSeq) return
    detail.value = data
  } catch (err) {
    if (seq === loadSeq) {
      ElMessage.error(err instanceof Error ? err.message : '查询用户详情失败')
    }
  } finally {
    if (seq === loadSeq) {
      loading.value = false
    }
  }
}

watch(userId, reload, { immediate: true })

const backToList = () => {
  void router.push({ name: 'users' }).catch(() => undefined)
}
</script>

<template>
  <MainLayout title="用户详情" subtitle="注册主体信息与名下订单（行点击进入订单详情）。">
    <div class="flex flex-col gap-4">
      <section class="panel-card p-5" v-loading="loading">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <span class="text-xl font-700 text-[#303133]">
              {{ detail?.userName || '用户' }}
            </span>
            <span v-if="detail" class="text-sm text-[#909399]">ID {{ detail.userId }}</span>
            <el-tag
              v-if="detail"
              :type="detail.status === 0 ? 'danger' : 'success'"
              effect="plain"
            >
              {{ detail.status === 0 ? '停用' : '正常' }}
            </el-tag>
          </div>
          <el-button @click="backToList">返回用户列表</el-button>
        </div>

        <el-descriptions v-if="detail" class="mt-4" :column="2" border>
          <el-descriptions-item label="用户ID">{{ detail.userId ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="昵称">{{ detail.userName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="账号状态">
            {{ detail.status === 0 ? '停用' : '正常' }}
          </el-descriptions-item>
          <el-descriptions-item label="角色">
            {{ ROLE_LABEL[detail.role ?? 0] ?? detail.role ?? '—' }}
          </el-descriptions-item>
        </el-descriptions>
      </section>

      <RelatedOrdersTable
        v-if="detail"
        :orders="detail.orders ?? []"
        :loading="loading"
        :hint="`名下订单 ${(detail.orders ?? []).length} 单`"
      />

      <section v-if="!detail && !loading" class="panel-card p-5">
        <el-empty description="未查询到该用户（可能用户 ID 不存在或为飞手账号）">
          <el-button type="primary" @click="backToList">返回用户列表</el-button>
        </el-empty>
      </section>
    </div>
  </MainLayout>
</template>
