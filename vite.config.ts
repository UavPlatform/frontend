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
        target: 'ws://120.77.170.101:8888/ws',
        ws: true,
      },
    },
  },
})
