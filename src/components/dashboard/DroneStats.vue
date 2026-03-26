<script setup lang="ts">
import type { DashboardStat } from '../../types/uav'

defineProps<{
  items: DashboardStat[]
}>()

const toneStyleMap: Record<DashboardStat['tone'], { accent: string; surface: string }> = {
  primary: {
    accent: '#2563eb',
    surface: 'linear-gradient(135deg, #eff6ff, #f8fbff)',
  },
  success: {
    accent: '#059669',
    surface: 'linear-gradient(135deg, #ecfdf3, #f0fdf4)',
  },
  warning: {
    accent: '#d97706',
    surface: 'linear-gradient(135deg, #fff7ed, #fffbeb)',
  },
  danger: {
    accent: '#dc2626',
    surface: 'linear-gradient(135deg, #fef2f2, #fff1f2)',
  },
}
</script>

<template>
  <div class="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
    <article
      v-for="item in items"
      :key="item.label"
      class="panel-card stat-card p-5"
      :style="{
        '--accent': toneStyleMap[item.tone].accent,
        '--surface': toneStyleMap[item.tone].surface,
      }"
    >
      <div class="text-sm font-600 text-[#5b6b84]">{{ item.label }}</div>
      <div class="mt-4 flex items-end justify-between gap-4">
        <div class="text-4xl font-800 tracking-tight text-[#10233f]">{{ item.value }}</div>
        <div class="rounded-full bg-white/80 px-3 py-1 text-xs font-700 text-[var(--accent)]">
          {{ item.trend }}
        </div>
      </div>
      <div class="mt-3 text-sm text-[#64748b]">{{ item.hint }}</div>
    </article>
  </div>
</template>

<style scoped>
.stat-card {
  background: var(--surface);
  border-color: color-mix(in srgb, var(--accent) 18%, white);
  position: relative;
  overflow: hidden;
}

.stat-card::after {
  content: '';
  position: absolute;
  inset: auto -48px -48px auto;
  width: 128px;
  height: 128px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 12%, white);
}
</style>
