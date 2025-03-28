import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  console.log(env.VITE_DEEPSEEK_API_BASEURL)
  return {
    base: '/',
    plugins: [react()],
    server: {
      host:'0.0.0.0',
      proxy: {
        '/v1': {
          target: env.VITE_DEEPSEEK_API_BASEURL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/v1/, '')
        },
        '/ai': {
          target: env.VITE_API_BASE_URL_AI,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ai/, '/api')
        },
      }
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
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: mode !== 'production',
      minify: mode === 'production' ? 'terser' : false,
    }
  }
})
