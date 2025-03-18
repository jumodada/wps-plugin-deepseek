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
  timeout: 10000,
  headers: {
    'Content-Type': 'application/xml',
    'Accept': 'application/xml'
  },
});

apiClient.interceptors.request.use(
  (config) => {
    const { token } = useAppStore.getState();
    const { setLoading } = useAppStore.getState();

      setLoading(true);

    if (token) {
      config.headers.Authorization = `${token}`;
    } else {
      delete config.headers.Authorization;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

apiClient.interceptors.response.use(
  (response): AxiosResponse<ApiResponse<any>, any> => {
    const { setLoading } = useAppStore.getState();
    setLoading(false);

    if (response.data.code === 200) {
      return response.data;
    } else {
      message.error(response.data.msg || '请求失败');
      throw new Error(response.data.msg);
    }
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
