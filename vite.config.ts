import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig({
  plugins: [vue(), UnoCSS(), Components({
    dts: false,
    resolvers: [ElementPlusResolver()],
  })],
  server: {
    proxy: {
      '/api': {
        target: 'http://120.77.170.101:8888/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/ws': {
        // target 不要带 /ws：浏览器请求已是 /ws/web，否则会拼成 /ws/ws/web
        target: 'http://120.77.170.101:8888',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
