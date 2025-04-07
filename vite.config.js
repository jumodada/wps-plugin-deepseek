import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { copyFile } from "wpsjs/vite_plugins"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: './',
    plugins: [
      copyFile({
        src: 'manifest.xml',
        dest: 'manifest.xml',
      }),
      vue()
    ],
    server: {
      host:'0.0.0.0',
      cors: true,
      // proxy: {
      //   '/v1': {
      //     target: env.VITE_DEEPSEEK_API_BASEURL,
      //     changeOrigin: true,
      //     rewrite: (path) => path,
      //   },
      // }
    },
    css: {
      preprocessorOptions: {
        less: {
          javascriptEnabled: true,
          modifyVars: {
            '@primary-color': 'var(--ant-primary-color)'
          },
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    }
  }
})
