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
    model: "qwen-plus",
    stream: false,
    max_tokens: 8192,
  }, {
    signal: params.signal 
  });
};

// 生成文本差异分析
export const generateDiffAnalysis = (params: {
  original: string;
  optimized: string;
  model?: string;
  signal?: AbortSignal;
}) => {
  return apiClient.post<DeepSeekResponse>('/v1/chat/completions', {
    messages: [
      {
        role: "system",
        content: "你是一个专业的文本差异分析工具，你的任务是对比原文和优化后的文本，找出精确的修改点，用简洁明了的方式表示差异。"
      },
      {
        role: "user",
        content: `请分析以下原文和优化后文本之间的差异，返回一个JSON格式的diff数组，每个元素表示一个修改点（如词语替换、删除、添加）：\n\n原文：${params.original}\n\n优化后：${params.optimized}\n\n请用这样的格式表示差异点：\n1. 替换：使用"原词 → 新词"\n2. 删除：使用"-删除的内容"\n3. 添加：使用"+添加的内容"\n\n请直接返回JSON格式：["差异点1", "差异点2", ...]`
      }
    ],
    model: "qwen-plus",
    stream: false,
    max_tokens: 8192,
  }, {
    signal: params.signal
  });
};
