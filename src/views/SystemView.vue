<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import MainLayout from '../layouts/MainLayout.vue'
import { getApplicationLogs, getErrorLogs, getLogFiles, readLogFile } from '../api/modules/admin'
import type { AdminLogFile } from '../types/admin'

/**
 * 系统日志（REQ-FRONTEND-001 §5，次级入口 /system）：
 * 应用日志 / 错误日志两个文本页（行数选择 + 刷新），以及日志文件浏览
 * （目录下钻 + 查看文件内容，对接 /admin/logs/files 与 /admin/logs/read）。
 * 日志板块自旧 AdminView 迁移（TASK-FRONTEND-005），旧页面已随 ADR-0004 删除。
 */
type LogTab = 'application' | 'error' | 'files'

const activeTab = ref<LogTab>('application')
const logLines = ref(100)
const LINE_OPTIONS = [50, 100, 200, 500]

const appLogs = ref<string[]>([])
const errorLogs = ref<string[]>([])
const logsLoading = ref(false)

const files = ref<AdminLogFile[]>([])
const currentPath = ref('')
const filesLoading = ref(false)

const openedFile = ref('')
const fileContent = ref<string[]>([])
const fileLoading = ref(false)

const formatSize = (size?: number) => {
  if (size == null) return '—'
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  if (size >= 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${size} B`
}

const loadFiles = async (path = currentPath.value) => {
  filesLoading.value = true
  try {
    files.value = await getLogFiles(path)
    currentPath.value = path
    openedFile.value = ''
    fileContent.value = []
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '获取日志文件列表失败')
  } finally {
    filesLoading.value = false
  }
}

const openFile = async (path?: string) => {
  if (!path) return
  fileLoading.value = true
  try {
    openedFile.value = path
    fileContent.value = await readLogFile(path, logLines.value)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '读取日志文件失败')
  } finally {
    fileLoading.value = false
  }
}

/** 刷新当前页签：日志页签只拉自己的日志，文件页签重拉当前目录（已打开文件同步重读） */
const handleRefresh = async () => {
  logsLoading.value = true
  try {
    if (activeTab.value === 'application') {
      appLogs.value = await getApplicationLogs(logLines.value)
    } else if (activeTab.value === 'error') {
      errorLogs.value = await getErrorLogs(logLines.value)
    } else if (openedFile.value) {
      await openFile(openedFile.value)
    } else {
      await loadFiles()
    }
    ElMessage.success('已刷新')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '刷新日志失败')
  } finally {
    logsLoading.value = false
  }
}

// 页签首次进入即取数；行数改变后由「刷新」按钮显式重拉（避免每个刻度都发请求）
watch(activeTab, (tab) => {
  if (tab === 'files' && files.value.length === 0 && !filesLoading.value) {
    void loadFiles('')
  }
})

onMounted(async () => {
  try {
    appLogs.value = await getApplicationLogs(logLines.value)
    errorLogs.value = await getErrorLogs(logLines.value)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '加载日志失败')
  }
})
</script>

<template>
  <MainLayout title="系统日志" subtitle="应用日志、错误日志与日志文件浏览（运维次级入口）。">
    <section class="panel-card p-5">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="应用日志" name="application" />
        <el-tab-pane label="错误日志" name="error" />
        <el-tab-pane label="日志文件" name="files" />
      </el-tabs>

      <div class="flex flex-wrap items-center gap-3">
        <span class="text-sm text-[#606266]">显示行数</span>
        <el-select v-model="logLines" class="!w-[110px]" size="small">
          <el-option v-for="line in LINE_OPTIONS" :key="line" :label="`${line} 行`" :value="line" />
        </el-select>
        <el-button type="primary" size="small" :loading="logsLoading" @click="handleRefresh">
          刷新
        </el-button>
        <template v-if="activeTab === 'files'">
          <el-button
            size="small"
            :disabled="!currentPath"
            @click="loadFiles(currentPath.split('/').filter(Boolean).slice(0, -1).join('/'))"
          >
            上级目录
          </el-button>
          <span class="text-xs text-[#909399]">当前目录：/{{ currentPath }}</span>
        </template>
      </div>

      <!-- 应用日志 -->
      <div v-show="activeTab === 'application'" class="log-container mt-4" v-loading="logsLoading">
        <pre class="log-content">{{ appLogs.length > 0 ? appLogs.join('\n') : '暂无日志' }}</pre>
      </div>

      <!-- 错误日志 -->
      <div v-show="activeTab === 'error'" class="log-container error mt-4" v-loading="logsLoading">
        <pre class="log-content">{{ errorLogs.length > 0 ? errorLogs.join('\n') : '暂无错误日志' }}</pre>
      </div>

      <!-- 日志文件：目录下钻 + 文件查看 -->
      <div v-show="activeTab === 'files'" class="mt-4">
        <el-table
          v-loading="filesLoading"
          :data="files"
          border
          stripe
          size="small"
          empty-text="该目录为空"
        >
          <el-table-column label="名称" min-width="240">
            <template #default="scope">
              <el-link
                v-if="scope.row.directory"
                type="primary"
                @click="scope.row.path && loadFiles(scope.row.path)"
              >
                {{ scope.row.name }}
              </el-link>
              <span v-else>{{ scope.row.name }}</span>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="90">
            <template #default="scope">{{ scope.row.directory ? '目录' : '文件' }}</template>
          </el-table-column>
          <el-table-column label="大小" width="100">
            <template #default="scope">{{ scope.row.directory ? '—' : formatSize(scope.row.size) }}</template>
          </el-table-column>
          <el-table-column label="修改时间" width="180">
            <template #default="scope">{{ scope.row.lastModified || '—' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="90">
            <template #default="scope">
              <el-button
                v-if="!scope.row.directory"
                size="small"
                link
                type="primary"
                @click="openFile(scope.row.path)"
              >
                查看
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <div v-if="openedFile" class="mt-4">
          <div class="mb-2 flex items-center gap-2">
            <span class="text-sm font-600 text-[#303133]">{{ openedFile }}</span>
            <el-tag size="small" type="info" effect="plain">{{ fileContent.length }} 行</el-tag>
          </div>
          <div class="log-container" v-loading="fileLoading">
            <pre class="log-content">{{ fileContent.length > 0 ? fileContent.join('\n') : '暂无内容' }}</pre>
          </div>
        </div>
      </div>
    </section>
  </MainLayout>
</template>

<style scoped>
.log-container {
  background: #1e1e1e;
  border-radius: 8px;
  padding: 16px;
  max-height: 600px;
  overflow: auto;
}

.log-container.error {
  background: #2d1f1f;
}

.log-content {
  margin: 0;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #d4d4d4;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
