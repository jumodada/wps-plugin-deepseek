import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    base: '/',
    plugins: [react()],
    server: {
      host:'0.0.0.0',
      cors: true,
      proxy: {
        '/v1': {
          target: env.VITE_DEEPSEEK_API_BASEURL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/v1/, ''),
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
              res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            });
          }
        },
        '/ai': {
          target: env.VITE_API_BASE_URL_AI,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ai/, '/api'),
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
              res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            });
          }
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
