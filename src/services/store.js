import { defineStore } from 'pinia';

// 定义主应用状态库
export const useMainStore = defineStore('main', {
  state: () => ({
    user: null,
    token: null,
    loading: false,
    data: null,
    wps: null,
    documentChanged: false
  }),
  
  actions: {
    setUser(user) {
      this.user = user;
    },
    setToken(token) {
      this.token = token;
    },
    setLoading(loading) {
      this.loading = loading;
    },
    setData(data) {
      this.data = data;
    },
    setWps(wps) {
      this.wps = wps;
    },
    setDocumentChanged(changed) {
      this.documentChanged = changed;
    }
  },

  // Pinia 持久化插件需要额外安装，如需使用参考：https://github.com/prazdevs/pinia-plugin-persistedstate
  persist: true
}); 