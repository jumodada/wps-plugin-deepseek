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

// 生成文本差异分析
export const generateDiffAnalysis = (params) => {
  return apiClient.post('/v1/chat/completions', {
    messages: [
      {
        role: "system",
        content: "你是一个专业的文本差异分析工具，你的任务是对比原文和优化后的文本，找出精确的修改点，用简洁明了的方式表示差异。"
      },
      {
        role: "user",
        content: `请分析以下原文和优化后文本之间的差异，返回一个JSON格式的diff数组，每个元素包含originText和replacedText两个字段：\n\n原文：${params.original}\n\n优化后：${params.optimized}\n\n请用这样的格式返回差异点数组：\n[{"originText": "原文中的词语", "replacedText": "优化后的词语"}, ...]\n\n仅分析最重要的差异点，不需要分析每一个细微变化。对于删除的内容，replacedText应为空字符串；对于新增的内容，originText应为空字符串。直接返回JSON数组格式，无需其他说明。`
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