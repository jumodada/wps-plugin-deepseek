<template>
  <div class="optimization-container">
    <!-- 顶部添加停止处理的提示 -->
    <div v-if="processingCancelled && !loading && !documentChangeDetected" class="document-change-alert">
      <span>您已停止处理</span>
      <div class="document-change-actions">
        <span class="document-change-action" @click="handleStartProcess">重新开始</span>
        <span class="document-change-action ignore" @click="ignoreProcessingCancelled">忽略</span>
      </div>
    </div>

    <!-- 文档变化提示 -->
    <div v-if="documentChangeDetected && !loading" class="document-change-alert">
      <span v-if="previousProcessedDoc === newDocumentName">检测到文档切换，依然是源文档"{{ newDocumentName }}"，是否要重新优化</span>
      <span v-else>检测到文档已切换到"{{ newDocumentName }}"</span>
      <div class="document-change-actions">
        <span class="document-change-action" @click="handleReprocessDocument">重新处理</span>
        <span class="document-change-action ignore" @click="ignoreDocumentChange">忽略</span>
      </div>
    </div>

    <div v-if="loading" class="overlay-container">
      <div class="progress-container">
        <p class="processing-title">文章处理中</p>
        <div class="progress-bar">
          <div class="progress-inner" :style="{ width: `${progressPercentage}%` }"></div>
        </div>
        <p class="progress-percentage">{{ Math.round(progressPercentage) }}%</p>
        <!-- 添加停止按钮 -->
        <button class="stop-button" @click="handleStopProcessing">停止</button>
      </div>
    </div>
    
    <div v-if="showResults && (filteredData.length > 0 || replacedItems.size > 0 || processComplete)" class="results-container" ref="resultsContainer">
      <!-- 无优化结果情况 -->
      <div v-if="filteredData.length === 0" class="empty-result">
        <div class="result-card">
          <p>{{ replacedItems.size > 0 ? '所有内容已成功替换' : '没有需要优化的内容或优化内容与原内容相同' }}</p>
          <span class="back-link" @click="goBack">
            <span class="icon">←</span>
            返回
          </span>
        </div>
      </div>
      
      <!-- 优化结果列表 -->
      <div v-else class="results-list">
        <div class="section-header">
          <h3>全部 ({{ filteredData.length }})</h3>
        </div>
        
        <div class="cards-container">
          <div 
            v-for="(item, index) in filteredData" 
            :key="item.id" 
            class="optimization-card"
            :class="{ 'active': activeCardId === item.id }"
            @click="handleLocateInDocument(item.id)"
            :ref="el => { if (el) { cardRefs[item.id] = el; if (index === filteredData.length - 1) lastCardRef = el; } }"
          >
            <!-- 差异展示区 -->
            <div v-if="getDiffDisplay(getOptimizedItem(item.id))" class="diff-display" v-html="getDiffDisplay(getOptimizedItem(item.id))"></div>
            
            <!-- 优化后文本 -->
            <div class="optimized-text" :class="{ 'replaced': replacedItems.has(item.id) }" v-html="getHighlightedText(getOptimizedItem(item.id))">
            </div>
            
            <!-- 操作按钮 -->
            <div class="action-buttons">
              <span class="action-button replace" @click.stop="handleReplaceItem(item, getOptimizedItem(item.id))">
                <span class="icon">✓</span>
                替换
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
          <span class="back-link" @click="goBack">
            <span class="icon">←</span>
            返回
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { generateDiffAnalysis } from '../api/deepseek';
import { 
  isWordDocument, 
  extractParagraphsFromDocument, 
  handleImageLineBreak, 
  retryOptimization,
  retryStreamOptimization,
  prepareDataForDeepseek,
  updateOptimizedData,
  replaceParagraphInDocument,
  buildOptimizationMessages
} from '../tool/optimization';
import { message } from 'ant-design-vue';
import { useMainStore } from '../services/store';

export default {
  name: 'ArticleOptimizationPage',
  setup() {
    // 获取Pinia store
    const mainStore = useMainStore();
    
    // 状态变量
    const loading = ref(false);
    const processingStatus = ref('');
    const originalData = ref([]);
    const optimizedData = ref([]);
    const showResults = ref(true); // 始终显示结果容器，通过遮罩层控制交互
    const replacedItems = ref(new Set());
    const activeCardId = ref(null);
    const activeDocumentName = ref(null);
    const originalStylesMap = ref(new Map());
    const cancelTokenRef = ref(null);
    const processingRef = ref(false);
    const previousActiveCardId = ref(null);
    const cardRefs = ref({});
    const processComplete = ref(false);
    const lastCardRef = ref(null);
    const resultsContainer = ref(null);
    
    // 添加文档变化检测相关状态
    const documentChangeDetected = ref(false);
    const newDocumentName = ref('');
    const previousProcessedDoc = ref(''); // 存储之前处理过的文档名称，单个字符串
    const isSameAsPreviousDoc = ref(false); // 是否是切回了之前处理过的文档
    
    // 批量处理相关的状态变量
    const batchSize = ref(3); // 每批处理的段落数量
    const currentBatch = ref(0);
    const totalBatches = ref(0);
    const processedBatches = ref(0);
    
    // 进度条相关
    const progress = ref(0);
    const simulatedProgress = ref(0);
    const progressInterval = ref(null);
    
    // 添加停止处理相关状态变量
    const processingCancelled = ref(false);
    
    // 计算进度百分比
    const progressPercentage = computed(() => {
      if (totalBatches.value === 0) return 0;
      // 真实进度 + 模拟进度
      const realProgress = (processedBatches.value / totalBatches.value) * 100;
      const simulated = simulatedProgress.value / totalBatches.value;
      return Math.min(Math.max(realProgress + simulated, 0), 100);
    });
    
    // 计算属性 - 过滤需要展示的数据
    const filteredData = computed(() => {
      return originalData.value.filter(item => {
        const optimizedItem = optimizedData.value.find(opt => opt.id === item.id);
        return optimizedItem &&
          !optimizedItem.notImprove &&
          !optimizedItem.replaced &&
          optimizedItem.text.trim() !== item.text.trim();
      });
    });
    
    // 滚动到最新的卡片
    const scrollToLastCard = () => {
      nextTick(() => {
        if (lastCardRef.value) {
          lastCardRef.value.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
      });
    };
    
    // 滚动到顶部
    const scrollToTop = () => {
      nextTick(() => {
        if (resultsContainer.value) {
          resultsContainer.value.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    };
    
    // 启动模拟进度
    const startProgressSimulation = () => {
      // 清除之前的定时器
      if (progressInterval.value) {
        clearInterval(progressInterval.value);
      }
      
      simulatedProgress.value = 0;
      
      // 设置新的定时器，每100ms增加一点模拟进度，使进度更平滑
      progressInterval.value = setInterval(() => {
        if (processedBatches.value < totalBatches.value) {
          // 模拟进度增量，但确保不会超过下一个真实批次的进度
          const maxSimulation = 0.95; // 最大模拟到下一批次的95%
          const increment = 0.1; // 每次增加的进度更小，使过渡更平滑
          
          if (simulatedProgress.value < maxSimulation) {
            simulatedProgress.value += increment;
          }
        } else {
          // 处理完成，清除定时器
          clearInterval(progressInterval.value);
          progressInterval.value = null;
        }
      }, 100);
    };
    
    // 根据ID获取优化后的项目
    const getOptimizedItem = (id) => {
      return optimizedData.value.find(item => item.id === id);
    };
    
    // 获取差异展示内容
    const getDiffDisplay = (optimizedItem) => {
      if (!optimizedItem || !optimizedItem.diff || optimizedItem.diff.length === 0) {
        return '';
      }
      
      // 直接使用API返回的差异点数组
      return optimizedItem.diff.map((diff, index) => {
        // 只处理包含originText和replacedText的对象
        if (diff.originText !== undefined && diff.replacedText !== undefined) {
          return `<div class="diff-item">${index + 1}. <span class="deleted">${diff.originText}</span> → <span class="added">${diff.replacedText}</span></div>`;
        }
        return '';
      }).filter(Boolean).join('');
    };
    
    // 获取高亮后的优化文本
    const getHighlightedText = (optimizedItem) => {
      if (!optimizedItem || !optimizedItem.text || !optimizedItem.diff || optimizedItem.diff.length === 0) {
        return optimizedItem?.text || '';
      }
      
      let text = optimizedItem.text;
      const highlightWords = [];
      
      // 收集所有需要高亮的文本
      optimizedItem.diff.forEach(diff => {
        // 只处理JSON格式
        if (diff.originText !== undefined && diff.replacedText !== undefined) {
          // 只对替换后的文本进行高亮处理
          if (diff.replacedText) {
            highlightWords.push(diff.replacedText);
          }
        }
      });
      
      // 对收集到的词语进行排序，优先处理较长的词语以避免部分替换问题
      highlightWords.sort((a, b) => b.length - a.length);
      
      // 对文本中的每个高亮词语进行处理
      highlightWords.forEach(word => {
        if (word && text.includes(word)) {
          // 生成唯一标记，避免替换冲突
          const uniqueMark = `__HIGHLIGHT_${Math.random().toString(36).substring(2, 10)}__`;
          
          // 转义正则表达式中的特殊字符
          const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          
          // 替换文本中的词语为唯一标记
          text = text.replace(new RegExp(escapedWord, 'g'), uniqueMark);
          
          // 记录唯一标记与原词语的映射关系
          text = text.replace(new RegExp(uniqueMark, 'g'), `<span class="highlight-added">${word}</span>`);
        }
      });
      
      return text;
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

    // 处理返回操作
    const goBack = () => {
      restoreOriginalStyle();
      activeCardId.value = null;
      processComplete.value = false;
      handleStartProcess();
    };
    
    // 处理忽略项目
    const handleIgnoreItem = (id) => {
      if (loading.value) return; // 处理中不允许操作
      
      if (activeCardId.value === id) {
        restoreOriginalStyle(id);
        activeCardId.value = null;
        originalStylesMap.value.delete(id);
      }
      
      const newOptimizedData = [...optimizedData.value];
      const itemIndex = newOptimizedData.findIndex(item => item.id === id);
      if (itemIndex !== -1) {
        newOptimizedData[itemIndex] = {...newOptimizedData[itemIndex], replaced: true};
        optimizedData.value = newOptimizedData;
      }
      
      replacedItems.value.add(id);
    };
    
    // 处理替换文本
    const handleReplaceItem = (originalItem, optimizedItem) => {
      if (loading.value) return; // 处理中不允许操作
      
      if (activeCardId.value) {
        restoreOriginalStyle(activeCardId.value);
        originalStylesMap.value.delete(activeCardId.value);
      }
      activeCardId.value = null;
      
      // 检查是否有优化的内容
      if (!optimizedItem || optimizedItem.notImprove) {
        message.warning('没有需要优化的内容');
        return;
      }
      
      // 替换文档中的内容
      const result = replaceParagraphInDocument(
        originalItem.id, 
        originalItem,  // 传递整个originalItem对象
        optimizedItem.text
      );

      if (result.replaced) {
        // 更新状态
        const newOptimizedData = [...optimizedData.value];
        const itemIndex = newOptimizedData.findIndex(item => item.id === optimizedItem.id);
        if (itemIndex !== -1) {
          newOptimizedData[itemIndex] = {...optimizedItem, replaced: true};
          optimizedData.value = newOptimizedData;
        }

        replacedItems.value.add(originalItem.id);
        originalStylesMap.value.delete(originalItem.id);
        
        // 同步文档状态
        window.Application.ActiveDocument.Sync.PutUpdate();
        
        // 强制触发UI更新，但保持光标在当前段落
        const position = result.position >= 0 ? result.position : 0;
        window.Application.ActiveDocument.Range(position, position).Select();
      } else {
        message.warning(`未找到原文内容相符的段落`);
      }
    };
    
    // 定位到文档中的段落
    const handleLocateInDocument = (paragraphId) => {
      if (loading.value) return; // 处理中不允许操作
      
      if (activeCardId.value && activeCardId.value !== paragraphId) {
        restoreOriginalStyle(activeCardId.value);
        activeCardId.value = null;
      }
      
      if (activeCardId.value === paragraphId) {
        restoreOriginalStyle(paragraphId);
        activeCardId.value = null;
        return;
      }
      
      const paragraphCount = window.Application.ActiveDocument?.Paragraphs.Count;
      let found = false;
      let paragraphStart = -1;

      for (let i = 1; i <= paragraphCount; i++) {
        const paragraph = window.Application.ActiveDocument?.Paragraphs.Item(i);
        try {
          if (paragraph.ParaID === paragraphId) {
            // 获取段落起始位置
            paragraphStart = paragraph.Range.Start;
            
            // 选中段落
            paragraph.Range.Select();
            found = true;

            const selection = window.Application.Selection;
            const underlineStyle = selection.Font.Underline === 9999999 ? 0 : selection.Font.Underline;
            const colorStyle = selection.Font.Color === 9999999 ? 0 : selection.Font.Color;
            
            originalStylesMap.value.set(paragraphId, {
              underline: underlineStyle,
              color: colorStyle
            });
            
            selection.Font.Underline = 11;
            selection.Font.Color = 255;
            
            activeCardId.value = paragraphId;
            
            // 滚动到对应卡片位置
            if (cardRefs.value[paragraphId]) {
              cardRefs.value[paragraphId]?.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
              });
            }
            
            break;
          }
        } catch (error) {
          // 静默处理定位到段落时出错
        }
      }

      if (!found) {
        message.warning('未找到对应内容的段落');
      } else {
        // 保存当前光标位置信息，便于后续操作
        localStorage.setItem('currentPosition', paragraphStart);
      }
    };
    
    // 启动处理流程
    const handleStartProcess = async () => {
      // 取消之前的请求
      if (cancelTokenRef.value) {
        cancelTokenRef.value.abort();
      }
      
      // 先完全重置状态
      restoreOriginalStyle();
      activeCardId.value = null;
      originalData.value = []; // 清空原始数据
      optimizedData.value = []; // 清空优化结果
      replacedItems.value = new Set();
      processComplete.value = false;
      processingCancelled.value = false; // 重置处理取消状态
      
      if (isWordDocument() && window.Application?.ActiveDocument?.Name) {
        activeDocumentName.value = previousProcessedDoc.value;
      }
      
      // 重新创建AbortController
      cancelTokenRef.value = new AbortController();
      processingRef.value = true;
      loading.value = true;
      previousProcessedDoc.value = window.Application?.ActiveDocument?.Name;
      // 禁止页面滚动
      document.body.style.overflow = 'hidden';

      if (!isWordDocument()) {
        loading.value = false;
        document.body.style.overflow = '';
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
        document.body.style.overflow = '';
        return;
      }

      originalData.value = structuredData;
      
      // 分批处理段落
      const batches = [];
      for (let i = 0; i < structuredData.length; i += batchSize.value) {
        batches.push(structuredData.slice(i, i + batchSize.value));
      }
      
      totalBatches.value = batches.length;
      currentBatch.value = 0;
      processedBatches.value = 0;
      
      // 启动进度模拟
      startProgressSimulation();
      
      try {
        // 逐批处理段落
        for (let i = 0; i < batches.length; i++) {
          if (!processingRef.value) {
            break; // 如果处理被中断，跳出循环
          }
          
          currentBatch.value = i + 1;
          processingStatus.value = `正在处理段落... (${currentBatch.value}/${totalBatches.value})`;
          
          // 准备发送给API的数据
          const dataForDeepseek = prepareDataForDeepseek(batches[i]);
          
          // 构建优化API的消息提示
          const optimizationMessages = buildOptimizationMessages(dataForDeepseek);
          
          // 调用API进行文本优化 - 使用流式请求
          const params = {
            messages: optimizationMessages,
            model: "deepseek-reasoner",
            signal: cancelTokenRef.value?.signal,
            onData: (data) => {
              // 可以在这里处理流式返回的每一块数据，更新进度或显示部分结果
              // console.log('收到流式数据:', data);
            }
          };
          
          try {
            const response = await retryStreamOptimization(params);
            
            if (!processingRef.value) {
              loading.value = false;
              document.body.style.overflow = '';
              return;
            }
            
            if (!response?.data?.choices?.length) {
              continue; // 跳过这一批次，继续处理下一批次
            }
            
            const result = response.data.choices[0].message.content;
            const jsonMatch = result.match(/(\[.*\])/s);
            const jsonStr = jsonMatch ? jsonMatch[1] : result;
            
            // 解析返回的JSON
            try {
              const resultData = JSON.parse(jsonStr);
              if (Array.isArray(resultData)) {
                // 处理返回的优化数据
                const batchOptimizedData = updateOptimizedData(batches[i], resultData);
                // 将这一批处理结果合并到总结果中
                optimizedData.value = [...optimizedData.value, ...batchOptimizedData];
                
                // 获取每个文本段落的差异分析
                const diffPromises = batchOptimizedData
                  .filter(item => !item.notImprove) // 只处理有变化的项目
                  .map(async (item) => {
                    try {
                      const diffResponse = await generateDiffAnalysis({
                        original: item.originalText,
                        optimized: item.text,
                        signal: cancelTokenRef.value?.signal
                      });
                      
                      if (diffResponse?.data?.choices?.length) {
                        const diffResult = diffResponse.data.choices[0].message.content;
                        try {
                          const diffArray = JSON.parse(diffResult);
                          
                          // 更新对应项的diff属性
                          if (Array.isArray(diffArray)) {
                            const index = optimizedData.value.findIndex(opt => opt.id === item.id);
                            if (index !== -1) {
                              optimizedData.value[index].diff = diffArray;
                            }
                          }
                        } catch (diffError) {
                          console.error('差异分析JSON解析失败:', diffError);
                        }
                      }
                    } catch (e) {
                      // 静默处理差异分析失败
                      console.error('差异分析请求失败:', e.message || '未知错误');
                    }
                  });
                
                // 等待这一批的差异分析完成
                try {
                  await Promise.all(diffPromises);
                } catch (allError) {
                  console.error('一批差异分析过程出错:', allError);
                  // 继续处理，不中断
                }
                
                // 滚动到最新的卡片
                scrollToLastCard();
              }
            } catch (jsonError) {
              // 静默处理API返回结果解析失败
              console.error('API返回结果解析失败:', jsonError);
              // 继续处理下一批数据
            }
            
            // 重置模拟进度，更新实际进度
            simulatedProgress.value = 0;
            processedBatches.value++;
          } catch (batchError) {
            // 检查是否是请求取消错误
            if (batchError.name === 'AbortError' || batchError.name === 'CanceledError') {
              console.log('批处理请求已取消');
              break; // 跳出循环
            }
            
            console.error('批处理失败:', batchError.message || '未知错误');
            // 继续处理下一批数据，不中断整个流程
            
            // 更新进度
            processedBatches.value++;
          }
        }
        
        // 所有批次处理完成
        processComplete.value = true;
        
        if (filteredData.value.length === 0) {
          message.warning('没有可优化的内容');
        } else {
          // 滚动到顶部
          scrollToTop();
        }
        
        // 清除进度模拟
        if (progressInterval.value) {
          clearInterval(progressInterval.value);
          progressInterval.value = null;
        }
        
        loading.value = false;
        
        // 恢复页面滚动
        document.body.style.overflow = '';
      } catch (error) {
        // 静默处理错误
        loading.value = false;
        
        // 恢复页面滚动
        document.body.style.overflow = '';
        
        // 清除进度模拟
        if (progressInterval.value) {
          clearInterval(progressInterval.value);
          progressInterval.value = null;
        }
      }
    };
    
    // 忽略文档变化
    const ignoreDocumentChange = () => {
      documentChangeDetected.value = false;
      newDocumentName.value = '';
      isSameAsPreviousDoc.value = false;
      // 更新当前文档名称，避免再次触发变化
      if (isWordDocument()) {
        activeDocumentName.value = window.Application?.ActiveDocument?.Name;
      }
    };
    
    // 处理文档重新处理
    const handleReprocessDocument = () => {
      documentChangeDetected.value = false;
      isSameAsPreviousDoc.value = false;
      // 重新开始处理流程
      handleStartProcess();
    };
    
    // 监听文档名称变化
    const checkDocumentName = () => {
      if (isWordDocument()) {
        const currentDocName = window.Application?.ActiveDocument?.Name;
        
        // 始终更新newDocumentName为当前文档名称
        newDocumentName.value = currentDocName;
        
        // 检查store中的documentChanged标志
        if (mainStore.documentChanged) {
          // 检查文档名称是否真的变化了
          if (activeDocumentName.value !== currentDocName) {
            // 重置标志
            mainStore.setDocumentChanged(false);
            
            // 检查当前文档是否是原始处理的文档
            // previousProcessedDoc代表与当前卡片关联的原始文档
            isSameAsPreviousDoc.value = previousProcessedDoc.value === currentDocName;
            
            // 如果正在加载，取消当前请求并立即处理
            if (loading.value) {
              if (cancelTokenRef.value) {
                cancelTokenRef.value.abort();
                processingRef.value = false;
              }
              // 更新文档名称
              activeDocumentName.value = currentDocName;
              // 重新开始处理流程
              handleStartProcess();
            } else {
              // 显示文档变化提示
              documentChangeDetected.value = true;
            }
          } else {
            // 文档名称没有变化，只重置标志
            mainStore.setDocumentChanged(false);
          }
          return;
        }
        
        // 原有的文档名称检查逻辑
        if (activeDocumentName.value !== currentDocName) {
          // 检查当前文档是否是原始处理的文档
          isSameAsPreviousDoc.value = previousProcessedDoc.value === currentDocName;
          
          // 如果正在加载，取消当前请求并立即处理
          if (loading.value) {
            if (cancelTokenRef.value) {
              cancelTokenRef.value.abort();
              processingRef.value = false;
            }
            activeDocumentName.value = currentDocName;
            if (activeDocumentName.value !== null) { // 不是首次设置才重新处理
              handleStartProcess();
            }
          } else {
            // 显示文档变化提示
            documentChangeDetected.value = true;
          }
        }
      }
    };
    
    // 添加点击停止处理的处理函数
    const handleStopProcessing = () => {
      // 中断当前请求
      if (cancelTokenRef.value) {
        cancelTokenRef.value.abort();
      }
      
      // 停止进度模拟
      if (progressInterval.value) {
        clearInterval(progressInterval.value);
        progressInterval.value = null;
      }
      
      // 更新状态
      processingRef.value = false;
      loading.value = false;
      processingCancelled.value = true;
      
      // 恢复页面滚动
      document.body.style.overflow = '';
      
      // 如果当前没有可显示的结果，显示空结果
      if (filteredData.value.length === 0 && replacedItems.value.size === 0) {
        processComplete.value = true;
      }
    };
    
    // 忽略处理取消提示
    const ignoreProcessingCancelled = () => {
      processingCancelled.value = false;
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
      
      // 恢复页面滚动
      document.body.style.overflow = '';
      
      // 清理资源
      if (cancelTokenRef.value) {
        cancelTokenRef.value.abort();
      }
      
      // 清除进度模拟
      if (progressInterval.value) {
        clearInterval(progressInterval.value);
        progressInterval.value = null;
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
      optimizedData,
      showResults,
      replacedItems,
      activeCardId,
      filteredData,
      getOptimizedItem,
      getDiffDisplay,
      getHighlightedText,
      handleLocateInDocument,
      handleReplaceItem,
      handleIgnoreItem,
      goBack,
      previousProcessedDoc,
      cardRefs,
      progressPercentage,
      processComplete,
      lastCardRef,
      resultsContainer,
      // 添加文档变化检测相关变量
      documentChangeDetected,
      newDocumentName,
      handleReprocessDocument,
      ignoreDocumentChange,
      isSameAsPreviousDoc,
      // 添加停止处理相关变量
      processingCancelled,
      handleStopProcessing,
      ignoreProcessingCancelled
    };
  }
};
</script>

<style scoped>
.optimization-container {
  padding: 5px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  min-height: 100vh;
  background-color: #f0f2f5;
  color: #333;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  position: relative;
}

/* 文档变化提示样式 */
.document-change-alert {
  position: sticky;
  top: 0;
  width: 100%;
  background-color: #fffbe6;
  border: 1px solid #ffe58f;
  padding: 8px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  margin-bottom: 10px;
  border-radius: 4px;
  z-index: 10;
}

.document-change-actions {
  display: flex;
  gap: 10px;
}

.document-change-action {
  cursor: pointer;
  color: #1890ff;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 2px;
}

.document-change-action:hover {
  background-color: rgba(24, 144, 255, 0.1);
}

.document-change-action.ignore {
  color: #999;
}

.overlay-container {
  position: fixed; /* 改为固定定位，不随滚动偏移 */
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.8);
  z-index: 100;
  display: flex;
  justify-content: center;
  align-items: center;
  backdrop-filter: blur(1px);
}

.progress-container {
  background-color: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  padding: 20px;
  width: 80%;
  max-width: 300px; /* 减小容器宽度 */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  text-align: center;
}

.processing-title {
  margin: 0 0 15px 0;
  color: #333;
  font-size: 18px;
  font-weight: bold;
}

.progress-bar {
  height: 10px; /* 稍微增加高度 */
  background-color: #f0f0f0;
  border-radius: 5px;
  margin-bottom: 10px;
  overflow: hidden;
}

.progress-inner {
  height: 100%;
  background-color: #1890ff;
  border-radius: 5px;
  transition: width 0.3s ease;
}

.progress-percentage {
  margin: 0;
  color: #333;
  font-size: 18px;
  font-weight: bold;
}

/* 添加停止按钮样式 */
.stop-button {
  margin-top: 15px;
  padding: 6px 15px;
  background-color: #ff4d4f;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.3s;
}

.stop-button:hover {
  background-color: #ff7875;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.stop-button:active {
  background-color: #d9363e;
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

.back-link {
  cursor: pointer;
  color: #999;
  font-size: 15px;
  margin-top: 15px;
  display: inline-block;
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
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.optimization-card {
  width: 90%;
  max-width: 480px;
  position: relative;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  border-width: 1px;
  border-left: 3px solid #1890ff;
  border-radius: 4px;
  overflow: hidden;
  background: white;
  padding: 15px;
  display: flex;
  flex-direction: column;
  margin-bottom: 10px;
}

.optimization-card.active {
  box-shadow: 0 0 10px rgba(24, 144, 255, 0.8);
  border-width: 2px;
  border-color: #1890ff;
  background: #f0f8ff;
}

.diff-display {
  font-size: 13px;
  margin-bottom: 12px;
  padding: 8px;
  border-radius: 4px;
  background: #f9f9f9;
  border-left: 3px solid #1890ff;
  overflow: visible;
  white-space: normal;
  line-height: 1.5;
  max-height: none;
}

:deep(.deleted) {
  color: #ff4d4f !important;
  text-decoration: line-through;
  font-weight: bold;
  background-color: rgba(255, 77, 79, 0.1);
  padding: 0 2px;
}

:deep(.added) {
  color: #52c41a !important;
  font-weight: bold;
  background-color: rgba(82, 196, 26, 0.1);
  padding: 0 2px;
}

.optimized-text {
  max-height: none;
  overflow: visible;
  color: #333;
  padding: 10px;
  background: #f0f8ff;
  border-radius: 4px;
  margin-bottom: 16px;
  word-break: break-word;
  display: block;
  line-height: 1.6;
}

.optimized-text.replaced {
  color: #999;
  text-decoration: line-through;
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
  color: #1890ff;
}

.action-button.ignore {
  color: #999;
}

.bottom-actions {
  text-align: center;
  margin-top: 30px;
  margin-bottom: 30px;
}

:deep(.diff-item) {
  margin-bottom: 5px;
  padding: 3px 0;
  border-bottom: 1px dashed #eee;
}

:deep(.diff-item:last-child) {
  border-bottom: none;
  margin-bottom: 0;
}

:deep(.highlight-added) {
  color: #52c41a !important;
  font-weight: bold;
  background-color: rgba(82, 196, 26, 0.1);
  padding: 0 2px;
  border-radius: 2px;
}
</style> 