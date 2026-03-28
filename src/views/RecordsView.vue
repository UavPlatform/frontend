<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import MainLayout from '../layouts/MainLayout.vue'
import { getLiveRecords } from '../api/modules/auth'
import type { UserRecord } from '../types/auth'

const router = useRouter()

const query = reactive({
  page: 1,
  pageSize: 6,
})

const loading = ref(false)
const records = ref<UserRecord[]>([])
const total = ref(0)
const totalPages = ref(0)

const loadRecords = async () => {
  loading.value = true

  try {
    const response = await getLiveRecords(query.page - 1, query.pageSize)
    records.value = response.records
    total.value = response.total
    totalPages.value = response.totalPages
  } catch (error) {
    console.error(error)
    ElMessage.error(error instanceof Error ? error.message : '加载历史记录失败')
  } finally {
    loading.value = false
  }
}

const handlePageChange = (page: number) => {
  query.page = page
  loadRecords()
}

const handleSizeChange = (size: number) => {
  query.pageSize = size
  query.page = 1
  loadRecords()
}

const handleRefresh = () => {
  loadRecords()
}

onMounted(() => {
  loadRecords()
})
</script>

<template>
  <MainLayout
    title="历史记录"
    subtitle="查看您的直播观看历史记录，支持分页浏览和筛选。"
  >
    <div class="flex flex-col gap-4">
      <section class="panel-card p-4 md:p-5">
        <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div class="text-xl font-800 tracking-tight text-[#10233f]">直播历史记录</div>
            <div class="mt-1 text-sm text-[#6b7a90]">
              查看您的直播观看历史，包括观看时间和无人机信息。
            </div>
          </div>

          <div class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
            <el-button @click="handleRefresh">刷新记录</el-button>
          </div>
        </div>

        <div class="mt-5">
          <el-table
            :data="records"
            :loading="loading"
            style="width: 100%"
            border
            stripe
          >
            <el-table-column prop="id" label="记录ID" width="100" />
            <el-table-column prop="djiId" label="无人机ID" />
            <el-table-column prop="start_time" label="开始时间" width="200">
              <template #default="scope">
                {{ new Date(scope.row.start_time).toLocaleString() }}
              </template>
            </el-table-column>
            <el-table-column prop="end_time" label="结束时间" width="200">
              <template #default="scope">
                {{ new Date(scope.row.end_time).toLocaleString() }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120">
              <template #default="scope">
                <el-button
                  type="primary"
                  size="small"
                  @click="router.push({ name: 'operate', params: { deviceId: scope.row.djiId } })"
                >
                  查看无人机
                </el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="mt-4 flex justify-center">
            <el-pagination
              :current-page="query.page"
              :page-size="query.pageSize"
              :page-sizes="[6, 12, 24]"
              layout="total, sizes, prev, pager, next, jumper"
              :total="total"
              @size-change="handleSizeChange"
              @current-change="handlePageChange"
            />
          </div>
        </div>
      </section>

      <section class="panel-card p-5">
        <div class="text-lg font-800 tracking-tight text-[#10233f]">操作提示</div>
        <div class="mt-4 space-y-3 text-sm leading-6 text-[#516178]">
          <div class="rounded-5 bg-[#f8fafc] p-4">
            历史记录显示您观看过的直播记录，包括开始时间和结束时间。
          </div>
          <div class="rounded-5 bg-[#f8fafc] p-4">
            点击"查看无人机"按钮可以直接跳转到该无人机的操作界面。
          </div>
          <div class="rounded-5 bg-[#f8fafc] p-4">
            支持分页浏览，每页显示6条记录，可根据需要调整每页显示数量。
          </div>
        </div>
      </section>
    </div>
  </MainLayout>
</template>
