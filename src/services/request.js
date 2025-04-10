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
  //baseURL: 'http://47.104.92.121:7001',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode',
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
 * 基于fetch的流式请求函数
 * @param {string} url - 请求URL
 * @param {Object} options - 请求选项
 * @param {Object} options.body - 请求体
 * @param {AbortSignal} options.signal - 中止信号
 * @param {Function} options.onData - 数据回调函数
 * @param {Function} options.onError - 错误回调函数
 * @param {Function} options.onComplete - 完成回调函数
 * @returns {Promise} - 返回处理结果的Promise
 */
export function fetchStreamRequest(url, options = {}) {
  const { body, signal, onData, onError, onComplete } = options;
  const store = useMainStore();
  store.setLoading(true);
  
  const fetchUrl = apiClient.defaults.baseURL + url;
  
  return fetch(fetchUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_DEEPSEEK_API_KEY || ''}`
    },
    body: JSON.stringify(body),
    signal: signal
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`请求失败: ${response.status} ${response.statusText}`);
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      
      function processStream() {
        return reader.read().then(({ done, value }) => {
          if (done) {
            store.setLoading(false);
            if (onComplete) onComplete(accumulated);
            return accumulated;
          }
          
          // 解码二进制数据
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          
          // 处理SSE格式的数据
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // 保留最后一个不完整的行
          
          for (const line of lines) {
            if (line.trim() === '') continue;
            if (line.startsWith('data: ')) {
              const data = line.substring(6);
              if (data === '[DONE]') {
                store.setLoading(false);
                if (onComplete) onComplete(accumulated);
                return accumulated;
              }
              
              try {
                const parsedData = JSON.parse(data);
                accumulated += parsedData.choices?.[0]?.delta?.content || '';
                if (onData) onData(parsedData, accumulated);
              } catch (e) {
                console.error('解析流式数据失败:', e);
              }
            }
          }
          
          // 继续读取流
          return processStream();
        });
      }
      
      return processStream();
    })
    .catch(error => {
      store.setLoading(false);
      // 检查是否是取消请求的错误
      if (error.name === 'AbortError') {
        console.log('请求被取消');
        return Promise.reject(error);
      }
      
      if (onError) onError(error);
      message.error(error.message || '请求失败');
      return Promise.reject(error);
    });
}

/**
 * 处理流式响应
 * @param {Response} response - 流式响应对象
 * @param {Function} onData - 数据回调函数
 * @param {Function} onError - 错误回调函数
 * @param {Function} onComplete - 完成回调函数
 */
export function handleStreamResponse(response, onData, onError, onComplete) {
  const reader = response.data.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  function processStream() {
    reader.read().then(({ done, value }) => {
      if (done) {
        if (onComplete) onComplete();
        return;
      }
      
      // 解码二进制数据
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      
      // 处理SSE格式的数据
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 保留最后一个不完整的行
      
      for (const line of lines) {
        if (line.trim() === '') continue;
        if (line.startsWith('data: ')) {
          const data = line.substring(6);
          if (data === '[DONE]') {
            if (onComplete) onComplete();
            return;
          }
          
          try {
            const parsedData = JSON.parse(data);
            if (onData) onData(parsedData);
          } catch (e) {
            console.error('解析流式数据失败:', e);
          }
        }
      }
      
      // 继续读取流
      processStream();
    }).catch(error => {
      if (onError) onError(error);
    });
  }
  
  processStream();
}

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