import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import App from './App.vue'
import router from './router'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css';
import { useMainStore } from './services/store'

const app = createApp(App)
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

app.use(router)
app.use(pinia)
app.use(Antd)

app.mount('#app')

// 在应用挂载后监听文档变化事件
setTimeout(() => {
  const store = useMainStore()
  
  // 确保 WPS API 可用
  if (window.Application && window.Application.ApiEvent) {
    window.Application.ApiEvent.AddApiEventListener('DocumentChange', () => {
      console.log('文档已切换')
      // 通过 Pinia store 设置文档变化标志
      store.setDocumentChanged(true)
    })
  }
}, 1000)

