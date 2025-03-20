import apiClient from '../services/request';

/** temperature参数
   https://api-docs.deepseek.com/zh-cn/quick_start/parameter_settings
   代码生成/数学解题	0.0
   数据抽取/分析	1.0
   通用对话	1.3
   翻译	1.3
   创意类写作/诗歌创作	1.5
**/
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
    temperature: params.temperature || 1.5,
    stream: false,
    max_tokens: 8192,
  }, {
    signal: params.signal 
  });
};
