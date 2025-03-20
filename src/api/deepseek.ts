import apiClient from '../services/request';
import { ApiResponse } from '../services/request';

// DeepSeek请求参数类型
interface DeepSeekRequest {
  messages: Array<{
    role: string;
    content: string;
  }>;
  model?: string;
  temperature?: number;
  stream?: boolean;
  signal?: AbortSignal;
}

// DeepSeek响应类型
export interface DeepSeekResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    logprobs: any;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details: {
      cached_tokens: number;
    };
    prompt_cache_hit_tokens: number;
    prompt_cache_miss_tokens: number;
  };
  system_fingerprint: string;
}

export const submitOptimization = (params: DeepSeekRequest) => {
  return apiClient.post<DeepSeekResponse>('/v1/chat/completions', {
    messages: params.messages,
    model: params.model || "deepseek-chat",
    temperature: params.temperature || 0.5,
    stream: false // 明确关闭流式传输
  }, {
    signal: params.signal // 传递中断信号
  });
};
