import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
export default defineConfig({
  base:'./',
  plugins: [
    react(),
  ],
  server: {
    host: '0.0.0.0'
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
  }
})
