import apiClient from '../services/request';

/** temperature参数
   https://api-docs.deepseek.com/zh-cn/quick_start/parameter_settings
   代码生成/数学解题	0.0
   数据抽取/分析	1.0
   通用对话	1.3
   翻译	1.3
   创意类写作/诗歌创作	1.5
**/

// 提交优化请求
export const submitOptimization = (params) => {
  return apiClient.post('/v1/chat/completions', {
      messages: params.messages,
      model: "qwen-plus",
      stream: false,
      max_tokens: 8192,
  }, {
    signal: params.signal 
  });
};

// 流式提交优化请求
export const submitStreamOptimization = (params) => {
  return apiClient.post('/v1/chat/completions', {
      messages: params.messages,
      model: "qwen-plus",
      stream: true,
      max_tokens: 8192,
  }, {
    signal: params.signal,
    responseType: 'stream'
  });
};

// 流式文档格式化请求
export const submitStreamFormatting = (params) => {
  return apiClient.post('/v1/chat/completions', {
      messages: params.messages,
      model: "qwen-plus",
      stream: true,
      max_tokens: 8192,
  }, {
    signal: params.signal,
    responseType: 'stream'
  });
};

// 生成文本差异分析
export const generateDiffAnalysis = (params) => {
  return apiClient.post('/v1/chat/completions', {
      messages: [
        {
          role: "system",
          content: "你是一个专业的文本差异分析工具，你的任务是对比原文和优化后的文本，找出最精确的词语级别修改点，用最简洁的方式表示差异。\n\n必须严格遵循以下规则：\n1. 差异点必须严格限制在单个词语或不超过15个字的短语\n2. 绝对不允许将整句或整段文本作为差异点\n3. 必须精确到单个词语或短语的替换\n4. 相邻的修改必须分别作为独立的差异点返回\n5. 如果找不到明确的词语级别差异，必须返回空数组\n6. 禁止使用整文对比作为差异点"
        },
        {
          role: "user",
          content: `请分析以下原文和优化后文本之间的差异，只标记出精确的词语级别差异点，返回一个JSON格式的diff数组：\n\n原文：${params.original}\n\n优化后：${params.optimized}\n\n请用这样的格式返回差异点数组：\n[{"originText": "原文中的词语", "replacedText": "优化后的词语"}, ...]\n\n要求：\n1. 每个差异点必须是单个词语或不超过15个字的短语\n2. 必须精确到词语级别，不要返回整句或整段文本\n3. 将每个修改的词语或短语单独列为一个差异项\n4. 对于删除的内容，replacedText应为空字符串；对于新增的内容，originText应为空字符串\n5. 如果找不到明确的词语级别差异，返回空数组[]\n6. 直接返回JSON数组格式，无需其他说明`
        }
      ],
      model: "qwen-plus",
      stream: false,
      max_tokens: 2048,
      temperature: 0.2,
  }, {
    signal: params.signal
  });
};

// 获取文档总token估算值
export const getDocumentTokenEstimation = (documentContent) => {
  // 一个粗略的估算：中文约每个字符1token，英文约每4个字符1token
  const chineseCharCount = (documentContent.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherCharCount = documentContent.length - chineseCharCount;
  
  // 估算总token数
  return chineseCharCount + Math.ceil(otherCharCount / 4);
};

// 处理流式响应内容
export const parseStreamContent = (contentChunk) => {
  try {
    // 处理ID和数字格式（例如"4273"）
    if (/^\d+$/.test(contentChunk)) {
      return { type: 'id', content: contentChunk, tokenCount: 1 };
    }
    
    // 处理带有"text"字段的格式
    if (contentChunk.includes('"text":"')) {
      const textMatch = contentChunk.match(/"text":"([^"]*)"/);
      if (textMatch && textMatch[1]) {
        const content = textMatch[1];
        // 计算token数量
        const chineseCharCount = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
        const otherCharCount = content.length - chineseCharCount;
        const tokenCount = chineseCharCount + Math.ceil(otherCharCount / 4);
        return { type: 'text', content, tokenCount };
      }
    }
    
    // 处理普通文本内容
    const chineseCharCount = (contentChunk.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherCharCount = contentChunk.length - chineseCharCount;
    const tokenCount = chineseCharCount + Math.ceil(otherCharCount / 4);
    
    return { type: 'content', content: contentChunk, tokenCount };
  } catch (error) {
    console.error('解析流式内容失败:', error);
    return { type: 'error', content: contentChunk, tokenCount: 1 };
  }
}; 