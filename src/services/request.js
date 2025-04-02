import axios from 'axios';
import { useMainStore } from './store';
import { message } from 'ant-design-vue';

// API 响应结构
/**
 * @typedef {Object} ApiResponse
 * @property {number} count - 数量
 * @property {number} total - 总数
 * @property {Array} results - 结果数组
 * @property {any} data - 数据
 */

// 创建axios实例
const apiClient = axios.create({
  baseURL: '/', // 接口基础路径
  timeout: 1000000, // 请求超时时间
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${import.meta.env.VITE_DEEPSEEK_API_KEY || ''}`
  }
});

// 请求拦截器
apiClient.interceptors.request.use(
  config => {
    // 在发送请求之前设置加载状态
    const store = useMainStore();
    store.setLoading(true);
    return config;
  },
  error => {
    // 对请求错误做些什么
    console.error('请求错误:', error);
    return Promise.reject(error);
  }
);

// 响应拦截器
apiClient.interceptors.response.use(
  response => {
    // 请求成功，关闭加载状态
    const store = useMainStore();
    store.setLoading(false);
    return response;
  },
  error => {
    // 关闭加载状态
    const store = useMainStore();
    store.setLoading(false);

    // 检查是否是请求取消的错误
    if (axios.isCancel(error) || error.name === 'AbortError' || error.name === 'CanceledError') {
      // 请求被取消，不显示错误消息
      return Promise.reject(error);
    }

    // 显示错误消息
    message.error(error.response?.data?.message || '请求失败');
    return Promise.reject(error.response);
  }
);

/**
 * 获取数据的组合式函数
 * @param {string} url - 请求URL
 * @returns {Promise} - 返回请求Promise
 */
export function fetchData(url) {
  return new Promise((resolve, reject) => {
    const store = useMainStore();
    
    apiClient.get(url)
      .then(res => {
        store.setData(res.data);
        resolve(res.data);
      })
      .catch(error => {
        reject(error);
      });
  });
}

/**
 * 提交数据的组合式函数
 * @param {string} url - 请求URL
 * @param {Object} data - 提交的数据
 * @returns {Promise} - 返回请求Promise
 */
export function postData(url, data) {
  return new Promise((resolve, reject) => {
    const store = useMainStore();
    
    apiClient.post(url, data)
      .then(res => {
        store.setData(res.data);
        resolve(res.data);
      })
      .catch(error => {
        reject(error);
      });
  });
}

export default apiClient; 