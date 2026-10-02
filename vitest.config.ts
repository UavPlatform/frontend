import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// 独立于 vite.config.ts 的测试配置：
// 应用构建走 vite.config.ts，测试只挂 vue SFC 插件 + happy-dom 环境。
export default defineConfig({
  plugins: [vue()],
  test: {
    maxWorkers: process.env.CI ? 2 : 4,
    // Real Element Plus mounts can be slower on shared CI runners; keep a bounded timeout.
    testTimeout: 10_000,
    environment: 'happy-dom',
    include: ['tests/unit/**/*.spec.ts', 'tests/component/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/api/generated/**', 'src/main.ts'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: { statements: 75, branches: 60, functions: 70, lines: 75 },
    },
  },
})
