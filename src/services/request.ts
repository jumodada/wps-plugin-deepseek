import axios from 'axios';
import { useQuery, useMutation } from 'react-query';
import { useAppStore } from './store';
import { message } from 'antd';
import { AxiosResponse } from 'axios';

export interface ApiResponse<T> {
  count: number;
  total: number;
  results: T[];
  data: any;
}

export const apiClient = axios.create({
  baseURL: '/',
  timeout: 1000000,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${import.meta.env.VITE_DEEPSEEK_API_KEY}`
  },
});

apiClient.interceptors.request.use(
  (config) => {
    const { setLoading } = useAppStore.getState();
    setLoading(true);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

apiClient.interceptors.response.use(
  (response) => {
    const { setLoading } = useAppStore.getState();
    setLoading(false);
    return response;
  },
  (error) => {
    const { setLoading } = useAppStore.getState();
    setLoading(false);

    message.error(error.response?.data?.message || '请求失败');
    return Promise.reject(error.response);
  },
);

export const useFetchData = (url: string) => {
  const setData = useAppStore((state) => state.setData);
  return useQuery(
    ['fetchData', url],
    () => apiClient.get<ApiResponse<any>>(url).then((res) => res.data),
    {
      onSuccess: (data) => {
        setData(data);
      },
    },
  );
};

export const usePostData = (url: string) => {
  const setData = useAppStore((state) => state.setData);
  return useMutation(
    (data: any) => apiClient.post<ApiResponse<any>>(url, data).then((res) => res.data),
    {
      onSuccess: (data) => {
        setData(data);
      },
    },
  );
};

export default apiClient;
