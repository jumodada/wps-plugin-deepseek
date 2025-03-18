import apiClient from '../services/request';
import { ApiResponse } from '../services/request';

// DeepSeek请求参数类型
interface DeepSeekRequest {
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  model?: string;
  temperature?: number;
  stream?: boolean;
}

// DeepSeek响应类型
export interface DeepSeekResponse {
  requestId: string;
  status: 'processing' | 'completed' | 'failed';
  result?: string;
  error?: string;
}

export const submitOptimization = (params: DeepSeekRequest) => {
  return apiClient.post<ApiResponse<DeepSeekResponse>>('/v1/chat/completions', {
    messages: params.messages,
    model: params.model || "deepseek-chat",
    temperature: params.temperature || 0.5,
    stream: false // 明确关闭流式传输
  });
};
