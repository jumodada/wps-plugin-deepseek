<template>
  <div class="correction-container">
    <div v-if="loading" class="loading-container">
      <p v-if="processingStatus" class="processing-status">{{ processingStatus }}</p>
      <div class="spinner"></div>
    </div>
    
    <div v-else-if="showResults" class="results-container">
      <!-- 无纠错结果情况 -->
      <div v-if="filteredData.length === 0" class="empty-result">
        <div class="result-card">
          <p>{{ replacedItems.size > 0 ? '所有错误词语已成功修正' : '没有检测到需要纠正的词语' }}</p>
          <div class="empty-actions">
            <span class="retry-link" @click="handleStartProcess()">
              <span class="icon">↻</span>
              重新检测
            </span>
          </div>
        </div>
      </div>
      
      <!-- 纠错结果列表 -->
      <div v-else class="results-list">
        <div class="section-header">
          <h3>检测到的错误词语 ({{ filteredData.length }})</h3>
        </div>
        
        <div class="cards-container">
          <div 
            v-for="item in filteredData" 
            :key="item.id" 
            class="correction-card"
            :class="{ 'active': activeCardId === item.id }"
            @click="handleLocateInDocument(item.id)"
            :ref="el => { if (el) cardRefs[item.id] = el }"
          >
            <!-- 错误词语展示 -->
            <div class="error-word-display">
              <span class="wrong-word">{{ getOriginalWord(item) }}</span>
              <span class="arrow">→</span>
              <span class="correct-word">{{ getCorrectedWord(item) }}</span>
            </div>
            
            <!-- 上下文展示 -->
            <div class="context-text" :class="{ 'replaced': replacedItems.has(item.id) }" v-html="getContextDisplay(item)">
            </div>
            
            <!-- 错误类型与解释 -->
            <div class="explanation" v-if="item.explanation">
              <div class="explanation-title">错误解释：</div>
              <div class="explanation-content">{{ item.explanation }}</div>
            </div>
            
            <!-- 操作按钮 -->
            <div class="action-buttons">
              <span class="action-button replace" @click.stop="handleReplaceItem(item)">
                <span class="icon">✓</span>
                修正
              </span>
              <span class="action-button ignore" @click.stop="handleIgnoreItem(item.id)">
                <span class="icon">✕</span>
                忽略
              </span>
            </div>
          </div>
        </div>
        
        <!-- 底部返回按钮 -->
        <div class="bottom-actions">
          <span class="retry-link" @click="handleStartProcess()">
            <span class="icon">↻</span>
            重新检测
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { 
  isWordDocument, 
  extractParagraphsFromDocument, 
  handleImageLineBreak, 
  replaceParagraphInDocument,
  prepareDataForDeepseek,
  retryOptimization
} from '../tool/optimization';
import { message } from 'ant-design-vue';

export default {
  name: 'WordCorrectionPage',
  setup() {
    // 状态变量
    const loading = ref(false);
    const processingStatus = ref('');
    const originalData = ref([]);
    const correctionData = ref([]);
    const showResults = ref(false);
    const replacedItems = ref(new Set());
    const activeCardId = ref(null);
    const activeDocumentName = ref(null);
    const originalStylesMap = ref(new Map());
    const cancelTokenRef = ref(null);
    const processingRef = ref(false);
    const previousActiveCardId = ref(null);
    const cardRefs = ref({});
    
    // 计算属性 - 过滤需要展示的数据
    const filteredData = computed(() => {
      return correctionData.value.filter(item => {
        return !replacedItems.value.has(item.id) && item.errorWord && item.correctedWord;
      });
    });
    
    // 获取原始错误词语
    const getOriginalWord = (item) => {
      return item.errorWord || '';
    };
    
    // 获取修正后的词语
    const getCorrectedWord = (item) => {
      return item.correctedWord || '';
    };
    
    // 获取上下文显示内容
    const getContextDisplay = (item) => {
      if (!item.context) return '';
      
      const errorWord = item.errorWord;
      const context = item.context;
      
      // 高亮错误词语
      if (errorWord && context.includes(errorWord)) {
        const parts = context.split(errorWord);
        return parts.join(`<span class="highlight-error">${errorWord}</span>`);
      }
      
      return context;
    };
    
    // 恢复原始样式
    const restoreOriginalStyle = (paragraphId) => {
      if (paragraphId) {
        const originalStyle = originalStylesMap.value.get(paragraphId);
        if (originalStyle) {
          const paragraphCount = window.Application.ActiveDocument?.Paragraphs.Count;
          for (let i = 1; i <= paragraphCount; i++) {
            const paragraph = window.Application.ActiveDocument?.Paragraphs.Item(i);
            if (paragraph.ParaID === paragraphId) {
              const underline = originalStyle.underline === 9999999 ? 0 : originalStyle.underline;
              const color = originalStyle.color === 9999999 ? 0 : originalStyle.color;
              paragraph.Range.Font.Underline = underline;
              paragraph.Range.Font.Color = color;
              break;
            }
          }
        }
      } else {
        // 恢复所有段落样式
        originalStylesMap.value.forEach((_, paragraphId) => {
          restoreOriginalStyle(paragraphId);
        });
      }
    };
    
    // 处理忽略项目
    const handleIgnoreItem = (id) => {
      if (activeCardId.value === id) {
        restoreOriginalStyle(id);
        activeCardId.value = null;
        originalStylesMap.value.delete(id);
      }
      
      replacedItems.value.add(id);
    };
    
    // 处理替换文本
    const handleReplaceItem = (correctionItem) => {
      if (activeCardId.value) {
        restoreOriginalStyle(activeCardId.value);
        originalStylesMap.value.delete(activeCardId.value);
      }
      activeCardId.value = null;
      
      // 检查是否有纠正的内容
      if (!correctionItem || !correctionItem.errorWord || !correctionItem.correctedWord) {
        message.warning('没有需要纠正的词语');
        return;
      }
      
      const originalItem = originalData.value.find(item => item.id === correctionItem.id);
      if (!originalItem) {
        message.warning('未找到原始段落');
        return;
      }
      
      // 替换段落中的错误词语
      const newText = originalItem.text.replace(correctionItem.errorWord, correctionItem.correctedWord);
      
      // 替换文档中的内容
      const result = replaceParagraphInDocument(
        originalItem.id, 
        originalItem,
        newText
      );

      if (result.replaced) {
        replacedItems.value.add(correctionItem.id);
        originalStylesMap.value.delete(correctionItem.id);
        
        // 同步文档状态
        window.Application.ActiveDocument.Sync.PutUpdate();
        
        // 强制触发UI更新，但保持光标在当前段落
        const position = result.position >= 0 ? result.position : 0;
        window.Application.ActiveDocument.Range(position, position).Select();
        
        message.success(`已修正错误词语`);
      } else {
        message.warning(`未找到原文内容相符的段落`);
      }
    };
    
    // 定位到文档中的段落并高亮错误词语
    const handleLocateInDocument = (paragraphId) => {
      if (activeCardId.value && activeCardId.value !== paragraphId) {
        restoreOriginalStyle(activeCardId.value);
        activeCardId.value = null;
      }

      if (activeCardId.value === paragraphId) {
        restoreOriginalStyle(paragraphId);
        activeCardId.value = null;
        return;
      }

      const correctionItem = correctionData.value.find(item => item.id === paragraphId);
      if (!correctionItem || !correctionItem.errorWord) {
        message.warning('未找到错误词语信息');
        return;
      }

      const paragraphCount = window.Application.ActiveDocument?.Paragraphs.Count;
      let found = false;

      for (let i = 1; i <= paragraphCount; i++) {
        const paragraph = window.Application.ActiveDocument?.Paragraphs.Item(i);
        try {
          if (paragraph.ParaID === paragraphId) {
            // 获取段落起始位置
            const paragraphStart = paragraph.Range.Start;
            const text = paragraph.Range.Text;
            const errorWordIndex = text.indexOf(correctionItem.errorWord);

            if (errorWordIndex !== -1) {
              const wordStart = paragraphStart + errorWordIndex;
              const wordEnd = wordStart + correctionItem.errorWord.length;

              // 选中词语
              window.Application.ActiveDocument.Range(wordStart, wordEnd).Select();
              found = true;

              // 保存原始样式
              const selection = window.Application.Selection;
              const underlineStyle = selection.Font.Underline === 9999999 ? 0 : selection.Font.Underline;
              const colorStyle = selection.Font.Color === 9999999 ? 0 : selection.Font.Color;

              originalStylesMap.value.set(paragraphId, {
                underline: underlineStyle,
                color: colorStyle
              });

              // 设置高亮样式
              selection.Font.Underline = 11;  // 波浪线
              selection.Font.Color = 255;     // 红色

              activeCardId.value = paragraphId;

              // 滚动到对应卡片位置
              if (cardRefs.value[paragraphId]) {
                cardRefs.value[paragraphId]?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start'
                });
              }
            } else {
              // 如果找不到具体的词语，至少选中段落
              paragraph.Range.Select();
              message.warning('无法精确定位到错误词语，已选中包含该词语的段落');
              found = true;
            }

            break;
          }
        } catch (error) {
          console.error('定位到段落时出错:', error);
        }
      }

      if (!found) {
        message.warning('未找到对应内容的段落');
      }
    };
    
    // 词语纠错的模拟数据生成函数（实际项目中应替换为API调用）
    const performWordCorrection = async (paragraphs) => {
      // 调用API获取纠错数据
      try {
        // 准备发送给API的数据
        const dataForDeepseek = prepareDataForDeepseek(paragraphs);

        // 构建词语纠错API的消息提示
        const correctionMessages = [
          {
            role: "system",
            content: `你是一个专业的词语纠错助手。请检查文本中的错误词语，并提供修正建议。
            
            输入数据中的每个元素包含：
            1. paraID：段落ID
            2. text：完整文本
            3. textArray：文本节点数组，代表每个段落中的各个文本节点
            
            对于检测到的每一个错误词语，请返回以下信息：
            1. id: 段落ID
            2. errorWord: 错误的词语
            3. correctedWord: 修正后的词语
            4. context: 包含该词语的上下文
            5. explanation: 错误类型及修正原因的简短解释
            
            请只关注以下类型的错误：
            - 错别字
            - 用词不当
            - 词语搭配不当
            - 常见的语法错误
            
            返回格式应为JSON数组，每个元素对应一个错误词语。`
          },
          {
            role: "user",
            content: `请检查以下JSON格式的文本内容中的错误词语，找出所有需要纠正的词语，并提供修正建议。返回包含错误信息的JSON数组：\n\n${JSON.stringify(dataForDeepseek)}`
          }
        ];

        // 调用API进行词语纠错
        const params = {
          messages: correctionMessages,
          model: "deepseek-reasoner",
          signal: cancelTokenRef.value?.signal
        };

        const response = await retryOptimization(params);

        if (!response?.data?.choices?.length) {
          throw new Error('Failed to fetch correction data');
        }

        const result = response.data.choices[0].message.content;
        const jsonMatch = result.match(/(\[.*\])/s);
        const jsonStr = jsonMatch ? jsonMatch[1] : result;
        
        // 解析返回的JSON
        const correctionResults = JSON.parse(jsonStr);
        
        // 确保返回的是数组
        if (!Array.isArray(correctionResults)) {
          throw new Error('Invalid response format');
        }

        return correctionResults;
      } catch (error) {
        console.error('Error fetching correction data:', error);
        message.error('获取纠错数据失败，请重试');
        return [];
      }
    };
    
    // 启动处理流程
    const handleStartProcess = async () => {
      // 先执行返回操作的功能
      restoreOriginalStyle();
      activeCardId.value = null;
      showResults.value = false;

      // 然后执行原有的处理流程
      cancelTokenRef.value = new AbortController();
      processingRef.value = true;
      loading.value = true;

      if (!isWordDocument()) {
        loading.value = false;
        return;
      }

      processingStatus.value = '正在处理文档中的图片...';
      // 先处理图片换行问题
      handleImageLineBreak();

      processingStatus.value = '正在提取文档段落内容...';
      const structuredData = extractParagraphsFromDocument();

      if (structuredData.length === 0) {
        message.warning('无法从文档中提取有效内容');
        loading.value = false;
        return;
      }

      originalData.value = structuredData;
      processingStatus.value = `正在检查文档中的词语错误...`;

      try {
        // 调用词语纠错功能
        // 在实际项目中，这里应该替换为真实的API调用
        const correctionResults = await performWordCorrection(structuredData);
        
        correctionData.value = correctionResults;
        
        // 如果没有错误词语，显示提示
        if (correctionResults.length === 0) {
          message.success('文档中未发现词语错误');
        } else {
          message.success(`检测到 ${correctionResults.length} 处词语错误，请查看结果`);
        }
        
        // 显示结果
        showResults.value = true;
        loading.value = false;
      } catch (error) {
        console.error('处理失败:', error);
        loading.value = false;
        if (error.name !== 'AbortError') {
          message.error('处理失败，请重试');
        }
      }
    };
    
    // 监听文档名称变化
    const checkDocumentName = () => {
      if (isWordDocument()) {
        const currentDocName = window.Application?.ActiveDocument?.Name;
        if (activeDocumentName.value !== currentDocName) {
          activeDocumentName.value = currentDocName;
          if (activeDocumentName.value !== null) { // 不是首次设置才重新处理
            handleStartProcess();
          }
        }
      }
    };
    
    let intervalId = null;
    
    onMounted(() => {
      // 初始设置文档名
      if (isWordDocument()) {
        activeDocumentName.value = window.Application?.ActiveDocument?.Name;
      }
      
      // 设置定时检查
      intervalId = setInterval(checkDocumentName, 1000);
      
      // 启动处理
      handleStartProcess();
    });
    
    onBeforeUnmount(() => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      
      // 清理资源
      if (cancelTokenRef.value) {
        cancelTokenRef.value.abort();
      }
      
      // 恢复所有样式
      restoreOriginalStyle();
    });
    
    // 监听activeCardId变化
    watch(activeCardId, (newVal, oldVal) => {
      if (newVal === null && previousActiveCardId.value) {
        restoreOriginalStyle(previousActiveCardId.value);
      }
      previousActiveCardId.value = newVal;
    });
    
    return {
      loading,
      processingStatus,
      originalData,
      correctionData,
      showResults,
      replacedItems,
      activeCardId,
      filteredData,
      getOriginalWord,
      getCorrectedWord,
      getContextDisplay,
      handleLocateInDocument,
      handleReplaceItem,
      handleIgnoreItem,
      cardRefs,
      handleStartProcess
    };
  }
};
</script>

<style scoped>
.correction-container {
  padding: 5px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background-color: #f0f2f5;
  color: #333;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.loading-container {
  width: 100%;
  max-width: 500px;
  text-align: center;
  color: #333;
}

.processing-status {
  margin-bottom: 20px;
  color: #333;
}

.spinner {
  display: inline-block;
  width: 40px;
  height: 40px;
  border: 4px solid rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  border-top-color: #1890ff;
  animation: spin 1s ease-in-out infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.results-container {
  width: 100%;
  margin-top: 20px;
}

.empty-result {
  display: flex;
  justify-content: center;
  align-items: center;
}

.result-card {
  max-width: 500px;
  margin: 0 auto;
  border-left: 3px solid #1890ff;
  background: white;
  border-radius: 4px;
  padding: 20px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.empty-actions {
  display: flex;
  justify-content: center;
  gap: 30px;
  align-items: center;
  margin-top: 15px;
}

.retry-link {
  cursor: pointer;
  color: #1890ff;
  font-size: 15px;
  display: inline-block;
  transition: color 0.3s;
}

.retry-link:hover {
  color: #40a9ff;
}

.icon {
  margin-right: 5px;
}

.results-list {
  max-width: 1200px;
  margin: 0 auto;
}

.section-header {
  background-color: #f0f2f5;
  margin-bottom: 20px;
  padding: 10px 15px;
  text-align: start;
  border-bottom: 1px solid #e8e8e8;
}

.cards-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}

.correction-card {
  width: 480px;
  position: relative;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  border-width: 1px;
  border-left: 3px solid #ff4d4f;
  border-radius: 4px;
  overflow: hidden;
  background: white;
  padding: 15px;
  display: flex;
  flex-direction: column;
  margin-bottom: 10px;
}

.correction-card.active {
  box-shadow: 0 0 10px rgba(255, 77, 79, 0.8);
  border-width: 2px;
  border-color: #ff4d4f;
  background: #fff1f0;
}

.error-word-display {
  display: flex;
  align-items: center;
  padding: 10px;
  background: #fff1f0;
  border-radius: 4px;
  margin-bottom: 12px;
}

.wrong-word {
  color: #ff4d4f;
  font-weight: bold;
  text-decoration: line-through;
  padding: 0 5px;
}

.arrow {
  margin: 0 10px;
  color: #666;
}

.correct-word {
  color: #52c41a;
  font-weight: bold;
  padding: 0 5px;
}

.context-text {
  max-height: none;
  overflow: visible;
  color: #333;
  padding: 10px;
  background: #f9f9f9;
  border-radius: 4px;
  margin-bottom: 12px;
  word-break: break-word;
  display: block;
  line-height: 1.6;
}

.context-text.replaced {
  color: #999;
  text-decoration: line-through;
}

:deep(.highlight-error) {
  background-color: #ffccc7;
  padding: 0 2px;
  border-radius: 2px;
  font-weight: bold;
  text-decoration: wavy underline #ff4d4f;
}

.explanation {
  background: #f6ffed;
  border-radius: 4px;
  padding: 10px;
  margin-bottom: 12px;
  font-size: 13px;
}

.explanation-title {
  font-weight: bold;
  margin-bottom: 5px;
  color: #52c41a;
}

.explanation-content {
  color: #333;
}

.action-buttons {
  display: flex;
  justify-content: flex-start;
  gap: 15px;
  margin-top: auto;
}

.action-button {
  cursor: pointer;
  font-size: 13px;
}

.action-button.replace {
  color: #52c41a;
}

.action-button.ignore {
  color: #999;
}

.bottom-actions {
  text-align: center;
  margin-top: 30px;
  margin-bottom: 30px;
  display: flex;
  justify-content: center;
  gap: 30px;
  align-items: center;
}
</style> 