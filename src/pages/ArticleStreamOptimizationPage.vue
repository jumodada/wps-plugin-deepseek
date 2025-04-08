<template>
  <div class="optimization-container">
    <div v-if="!isDocumentReady" class="document-status">
      <p>请打开Word文档</p>
    </div>
    
    <div v-else-if="loading" class="loading-container">
      <p v-if="processingStatus" class="processing-status">{{ processingStatus }}</p>
      <div v-if="totalTokens > 0" class="progress-bar">
        <div class="progress-fill" :style="{width: `${progressPercentage}%`}"></div>
      </div>
      <p v-if="totalTokens > 0" class="progress-text">
        <template v-if="processingComplete">
          处理完成 (100%)
        </template>
        <template v-else>
          已处理: {{ processedTokens }} / {{ totalTokens }} ({{ progressPercentage }}%)
          <span v-if="receivedChunks > 0">| 已收到数据: {{ receivedChunks }} 次</span>
        </template>
      </p>
      <div class="spinner" :class="{ 'hidden': processingComplete }"></div>
    </div>
    
    <div v-else-if="showResults" class="results-container">
      <div v-if="optimizedData.length === 0" class="empty-result">
        <div class="result-card">
          <p>没有可优化的内容</p>
          <a class="back-link" @click="resetProcess">
            <span class="icon">←</span> 返回
          </a>
        </div>
      </div>
      
      <div v-else class="results-list">
        <div class="section-header">
          <h3>优化结果 ({{ filteredData.length }} 项)</h3>
        </div>
        
        <div class="cards-container">
          <div v-for="item in filteredData" 
               :key="item.id" 
               class="optimization-card"
               :class="{ 'active': activeCardId === item.id }"
               @click="handleCardClick(item.id)"
               ref="cardRefs">
            <div class="card-content">
              <div class="original-text">
                <h4>原文</h4>
                <p>{{ item.text }}</p>
              </div>
              
              <div class="optimized-text">
                <h4>优化后</h4>
                <p v-html="getHighlightedText(item)"></p>
              </div>
              
              <div v-if="getDiffDisplay(getOptimizedItem(item.id))" 
                   class="diff-display" 
                   v-html="getDiffDisplay(getOptimizedItem(item.id))">
              </div>
              
              <div class="card-actions">
                <button class="action-button replace" 
                        @click.stop="handleReplaceItem(item, getOptimizedItem(item.id))"
                        :disabled="getOptimizedItem(item.id)?.replaced">
                  {{ getOptimizedItem(item.id)?.replaced ? '已替换' : '替换' }}
                </button>
                <button class="action-button locate" 
                        @click.stop="handleLocateItem(item)">
                  定位
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { message } from 'ant-design-vue';
import { submitStreamOptimization, generateDiffAnalysis, getDocumentTokenEstimation, parseStreamContent } from '../api/deepseek';
import { isWordDocument, prepareDataForDeepseek, buildOptimizationMessages, updateOptimizedData, replaceParagraphInDocument } from '../tool/optimization';
import { handleStreamResponse } from '../services/request';

export default {
  name: 'ArticleStreamOptimizationPage',
  setup() {
    // 状态变量
    const loading = ref(false);
    const processingStatus = ref('');
    const originalData = ref([]);
    const optimizedData = ref([]);
    const showResults = ref(false);
    const replacedItems = ref(new Set());
    const activeCardId = ref(null);
    const activeDocumentName = ref(null);
    const originalStylesMap = ref(new Map());
    const cancelTokenRef = ref(null);
    const processingRef = ref(false);
    const previousActiveCardId = ref(null);
    const cardRefs = ref({});
    const isDocumentReady = ref(false);
    // 添加处理进度相关变量
    const totalTokens = ref(0);
    const processedTokens = ref(0);
    const estimatedTotalTokens = ref(0); // 预估的总令牌数
    const progressUpdateInterval = ref(null); // 进度更新定时器
    const progressAnimationSpeed = 500; // 进度动画更新间隔（毫秒）
    const targetProgress = ref(0); // 目标进度值（用于平滑动画）
    const lastChunkReceiveTime = ref(0); // 上次接收数据的时间
    const noDataTimeoutId = ref(null); // 无数据超时ID
    
    // 添加数据接收次数计数
    const receivedChunks = ref(0);
    const lastProcessedTime = ref(Date.now());
    
    const processingComplete = ref(false);
    
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
    const getHighlightedText = (item) => {
      const optimizedItem = getOptimizedItem(item.id);
      if (!optimizedItem || !optimizedItem.diff || optimizedItem.diff.length === 0) {
        return optimizedItem?.text || item.text;
      }
      
      let text = item.text;
      const diffs = [...optimizedItem.diff].sort((a, b) => {
        // 按照原文中的位置排序，从后向前替换，避免位置偏移
        return text.indexOf(b.originText) - text.indexOf(a.originText);
      });
      
      for (const diff of diffs) {
        if (diff.originText && diff.replacedText) {
          const regex = new RegExp(diff.originText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          text = text.replace(regex, `<span class="highlight">${diff.replacedText}</span>`);
        }
      }
      
      return text;
    };
    
    // 处理卡片点击
    const handleCardClick = (id) => {
      if (activeCardId.value === id) {
        // 如果点击的是当前激活的卡片，取消激活
        activeCardId.value = null;
        return;
      }
      
      // 保存之前的激活卡片ID
      previousActiveCardId.value = activeCardId.value;
      
      // 设置新的激活卡片ID
      activeCardId.value = id;
      
      // 定位到文档中的段落
      handleLocateItem({ id });
    };
    
    // 替换文档中的内容
    const handleReplaceItem = (originalItem, optimizedItem) => {
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
        
        message.success(`已替换内容`);
      } else {
        message.warning(`未找到原文内容相符的段落`);
      }
    };
    
    // 定位到文档中的段落
    const handleLocateItem = (item) => {
      if (!isWordDocument()) {
        message.warning('无法访问Word文档');
        return;
      }
      
      try {
        const doc = window.Application.ActiveDocument;
        const paragraphCount = doc.Paragraphs.Count;
        
        for (let i = 1; i <= paragraphCount; i++) {
          const paragraph = doc.Paragraphs.Item(i);
          if (paragraph.ParaID === item.id) {
            // 选中段落
            paragraph.Range.Select();
            
            // 滚动到可见区域
            paragraph.Range.ScrollIntoView();
            
            // 高亮显示
            highlightParagraph(paragraph);
            
            break;
          }
        }
      } catch (error) {
        console.error('定位段落时出错:', error);
        message.error('定位段落失败');
      }
    };
    
    // 高亮显示段落
    const highlightParagraph = (paragraph) => {
      try {
        // 保存原始样式
        if (!originalStylesMap.value.has(paragraph.ParaID)) {
          originalStylesMap.value.set(paragraph.ParaID, {
            highlight: paragraph.Range.Highlight,
            bold: paragraph.Range.Bold,
            italic: paragraph.Range.Italic
          });
        }
        
        // 应用高亮样式
        paragraph.Range.Highlight = 7; // 黄色高亮
        paragraph.Range.Bold = 1;
        
        // 同步文档状态
        window.Application.ActiveDocument.Sync.PutUpdate();
      } catch (error) {
        console.error('高亮段落时出错:', error);
      }
    };
    
    // 恢复原始样式
    const restoreOriginalStyle = (paragraphId) => {
      try {
        const doc = window.Application.ActiveDocument;
        const paragraphCount = doc.Paragraphs.Count;
        
        for (let i = 1; i <= paragraphCount; i++) {
          const paragraph = doc.Paragraphs.Item(i);
          if (paragraph.ParaID === paragraphId) {
            const originalStyle = originalStylesMap.value.get(paragraphId);
            if (originalStyle) {
              paragraph.Range.Highlight = originalStyle.highlight;
              paragraph.Range.Bold = originalStyle.bold;
              paragraph.Range.Italic = originalStyle.italic;
            }
            break;
          }
        }
        
        // 同步文档状态
        window.Application.ActiveDocument.Sync.PutUpdate();
      } catch (error) {
        console.error('恢复原始样式时出错:', error);
      }
    };
    
    // 收集原始样式
    const collectOriginalStyle = (paragraphId) => {
      try {
        const doc = window.Application.ActiveDocument;
        const paragraphCount = doc.Paragraphs.Count;
        
        for (let i = 1; i <= paragraphCount; i++) {
          const paragraph = doc.Paragraphs.Item(i);
          if (paragraph.ParaID === paragraphId) {
            originalStylesMap.value.set(paragraphId, {
              highlight: paragraph.Range.Highlight,
              bold: paragraph.Range.Bold,
              italic: paragraph.Range.Italic
            });
            break;
          }
        }
      } catch (error) {
        console.error('收集原始样式时出错:', error);
      }
    };
    
    // 修改进度百分比计算逻辑，使用平滑动画
    const progressPercentage = computed(() => {
      if (totalTokens.value === 0) return 0;
      
      // 使用实际计算的进度和估计进度的较大值
      const actualPercentage = Math.min(95, Math.round((processedTokens.value / totalTokens.value) * 100));
      
      // 如果动画目标进度小于实际进度，立即更新
      if (targetProgress.value < actualPercentage) {
        targetProgress.value = actualPercentage;
      }
      
      return targetProgress.value;
    });
    
    // 开始进度平滑动画
    const startProgressAnimation = () => {
      // 清除可能存在的定时器
      if (progressUpdateInterval.value) {
        clearInterval(progressUpdateInterval.value);
      }
      
      // 设置新的定时器，定期更新目标进度
      progressUpdateInterval.value = setInterval(() => {
        // 如果长时间未收到数据，自动小幅度增加进度
        const now = Date.now();
        const timeSinceLastChunk = now - lastChunkReceiveTime.value;
        
        if (timeSinceLastChunk > 3000 && targetProgress.value < 95) {
          // 如果超过3秒未收到数据，小幅增加进度
          targetProgress.value = Math.min(95, targetProgress.value + 0.5);
        }
      }, progressAnimationSpeed);
    };
    
    // 停止进度动画
    const stopProgressAnimation = () => {
      if (progressUpdateInterval.value) {
        clearInterval(progressUpdateInterval.value);
        progressUpdateInterval.value = null;
      }
      
      // 清除无数据超时
      if (noDataTimeoutId.value) {
        clearTimeout(noDataTimeoutId.value);
        noDataTimeoutId.value = null;
      }
    };
    
    // 修改handleStreamData函数以更新lastChunkReceiveTime
    const handleStreamData = (data) => {
      // 更新接收次数和时间
      receivedChunks.value++;
      lastChunkReceiveTime.value = Date.now();
      
      // 重置无数据超时
      if (noDataTimeoutId.value) {
        clearTimeout(noDataTimeoutId.value);
      }
      
      // 设置新的无数据超时
      noDataTimeoutId.value = setTimeout(() => {
        console.log('长时间未收到数据，小幅增加进度');
      }, 5000);
      
      // 记录处理时间间隔
      const now = Date.now();
      const timeElapsed = now - lastProcessedTime.value;
      lastProcessedTime.value = now;
      
      // 调试日志
      console.log(`接收数据 #${receivedChunks.value}, 距离上次: ${timeElapsed}ms`);
      
      if (data.choices && data.choices.length > 0) {
        const content = data.choices[0].delta?.content || '';
        if (content) {
          // 使用新的解析方法处理内容
          const parsedResult = parseStreamContent(content);
          // 累加已处理的token数
          processedTokens.value += parsedResult.tokenCount;
          
          // 调试日志
          console.log(`内容类型: ${parsedResult.type}, Token数: ${parsedResult.tokenCount}, 总进度: ${processedTokens.value}/${totalTokens.value}`);
          
          // 返回处理后的内容
          return parsedResult.content;
        }
      }
      return '';
    };
    
    // 开始处理
    const startProcess = async () => {
      if (!isWordDocument()) {
        message.warning('请先打开Word文档');
        return;
      }
      
      loading.value = true;
      processingStatus.value = '正在提取文档内容...';
      processingRef.value = true;
      
      try {
        // 获取文档内容
        const doc = window.Application.ActiveDocument;
        const paragraphCount = doc.Paragraphs.Count;
        
        if (paragraphCount === 0) {
          message.warning('文档中没有内容');
          loading.value = false;
          return;
        }
        
        // 构建结构化数据
        const structuredData = [];
        let fullDocumentContent = '';
        
        for (let i = 1; i <= paragraphCount; i++) {
          const paragraph = doc.Paragraphs.Item(i);
          const paraID = paragraph.ParaID;
          const text = paragraph.Range.Text.trim();
          
          if (!text) continue;
          
          fullDocumentContent += text + '\n';
          
          // 获取段落XML
          const xml = paragraph.Range.WordOpenXML;
          
          // 提取文本节点
          const textNodes = [];
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(xml, "text/xml");
          const wTextNodes = xmlDoc.getElementsByTagName("w:t");
          
          for (let j = 0; j < wTextNodes.length; j++) {
            textNodes.push(wTextNodes[j].textContent);
          }
          
          // 添加到结构化数据
          structuredData.push({
            id: paraID,
            text: text,
            textArray: textNodes,
            xml: xml
          });
          
          // 更新处理状态
          processingStatus.value = `正在提取文档内容... (${i}/${paragraphCount})`;
        }
        
        if (structuredData.length === 0) {
          message.warning('未找到可处理的段落');
          loading.value = false;
          return;
        }
        
        // 估算总token数
        totalTokens.value = getDocumentTokenEstimation(fullDocumentContent);
        // 增加10%预留空间
        estimatedTotalTokens.value = Math.ceil(totalTokens.value * 1.1);
        processedTokens.value = 0;
        targetProgress.value = 0;
        
        // 重置计数器
        receivedChunks.value = 0;
        lastProcessedTime.value = Date.now();
        lastChunkReceiveTime.value = Date.now();
        
        // 启动进度动画
        startProgressAnimation();
        
        // 准备发送给API的数据
        const dataForDeepseek = prepareDataForDeepseek(structuredData);
        
        // 构建优化API的消息提示
        const optimizationMessages = buildOptimizationMessages(dataForDeepseek);
        
        // 创建取消令牌
        const controller = new AbortController();
        cancelTokenRef.value = controller;
        
        // 调用流式API进行文本优化
        processingStatus.value = '正在优化内容...';
        
        // 用于存储完整的优化结果
        let optimizationResult = '';
        let isProcessing = true;
        
        // 调用流式API
        const response = await submitStreamOptimization({
          messages: optimizationMessages,
          signal: controller.signal
        });
        
        // 处理流式响应
        handleStreamResponse(
          response,
          // 数据回调
          (data) => {
            if (data.choices && data.choices.length > 0) {
              const content = data.choices[0].delta?.content || '';
              if (content) {
                try {
                  // 使用handleStreamData处理内容
                  const parsedContent = handleStreamData(data);
                  if (parsedContent) {
                    optimizationResult += parsedContent;
                  }
                  
                  // 更新处理状态
                  processingStatus.value = `正在优化内容... (${Math.round(progressPercentage.value)}%)`;
                } catch (error) {
                  console.error('处理流式数据出错:', error);
                }
              }
            }
          },
          // 错误回调
          (error) => {
            console.error('流式处理出错:', error);
            isProcessing = false;
            message.error('优化处理出错，请重试');
            loading.value = false;
            processingStatus.value = '';
          },
          // 完成回调
          async () => {
            // 设置处理完成
            completeProcessing();
            
            isProcessing = false;
            if (!optimizationResult) {
              message.error('未获取到有效的优化结果');
              loading.value = false;
              processingStatus.value = '';
              return;
            }
            
            try {
              console.log('完整优化结果:', optimizationResult);
              
              // 处理可能的格式问题，尝试提取有效的JSON部分
              let jsonStr = optimizationResult;
              const jsonMatch = optimizationResult.match(/(\[.*\])/s);
              if (jsonMatch) {
                jsonStr = jsonMatch[1];
              }
              
              // 尝试去除可能的非JSON前缀
              if (!jsonStr.startsWith('[')) {
                const startIndex = jsonStr.indexOf('[');
                if (startIndex >= 0) {
                  jsonStr = jsonStr.substring(startIndex);
                }
              }
              
              // 尝试去除可能的非JSON后缀
              if (!jsonStr.endsWith(']')) {
                const endIndex = jsonStr.lastIndexOf(']');
                if (endIndex >= 0) {
                  jsonStr = jsonStr.substring(0, endIndex + 1);
                }
              }
              
              console.log('处理后的JSON字符串:', jsonStr);
              
              // 解析JSON
              const resultData = JSON.parse(jsonStr);
              
              if (!Array.isArray(resultData)) {
                message.warning('无法解析API返回结果');
                loading.value = false;
                return;
              }
              
              // 处理返回的优化数据
              originalData.value = structuredData;
              optimizedData.value = updateOptimizedData(structuredData, resultData);
              
              // 如果没有有效项目，显示提示
              if (optimizedData.value.length === 0) {
                message.warning('没有可优化的内容');
                showResults.value = true;
                loading.value = false;
                return;
              }
              
              // 获取每个文本段落的差异分析
              processingStatus.value = '正在分析文本差异...';
              
              const diffPromises = optimizedData.value
                .filter(item => !item.notImprove) // 只处理有变化的项目
                .map(async (item, index) => {
                  try {
                    processingStatus.value = `正在分析文本差异... (${index + 1}/${optimizedData.value.filter(i => !i.notImprove).length})`;
                    
                    const diffResponse = await generateDiffAnalysis({
                      original: item.originalText,
                      optimized: item.text,
                      signal: controller.signal
                    });
                    
                    if (diffResponse?.data?.choices?.length) {
                      const diffResult = diffResponse.data.choices[0].message.content;
                      const diffArray = JSON.parse(diffResult);
                      
                      // 更新对应项的diff属性
                      if (Array.isArray(diffArray)) {
                        const index = optimizedData.value.findIndex(opt => opt.id === item.id);
                        if (index !== -1) {
                          optimizedData.value[index].diff = diffArray;
                        }
                      }
                    }
                  } catch (e) {
                    console.error('获取差异分析失败:', e);
                  }
                });
              
              // 等待所有差异分析完成
              await Promise.all(diffPromises);
              
              // 显示结果
              showResults.value = true;
              loading.value = false;
              processingComplete.value = false; // 重置完成状态
              message.success('处理完成！请查看优化结果并选择是否替换。');
            } catch (error) {
              console.error('处理优化结果时出错:', error);
              message.error('处理优化结果失败');
              loading.value = false;
              processingStatus.value = '';
              processingComplete.value = false; // 重置完成状态
            }
          }
        );
        
        // 添加取消按钮处理
        const cancelButton = document.createElement('button');
        cancelButton.textContent = '取消';
        cancelButton.className = 'cancel-button';
        cancelButton.onclick = () => {
          controller.abort();
          isProcessing = false;
          loading.value = false;
          processingStatus.value = '已取消';
          setTimeout(() => {
            processingStatus.value = '';
          }, 2000);
        };
        
        // 将取消按钮添加到处理状态下方
        const statusContainer = document.querySelector('.processing-status');
        if (statusContainer && statusContainer.parentNode) {
          statusContainer.parentNode.appendChild(cancelButton);
        }
        
      } catch (error) {
        // 停止进度动画
        stopProgressAnimation();
        
        console.error('处理失败:', error);
        loading.value = false;
        if (error.name !== 'AbortError') {
          message.error('处理失败，请重试');
        }
      }
    };
    
    // 完成处理的函数
    const completeProcessing = () => {
      // 停止进度动画
      stopProgressAnimation();
      
      // 设置进度为100%
      targetProgress.value = 100;
      processingComplete.value = true;
      
      // 显示完成状态
      processingStatus.value = '处理完成，正在准备结果...';
    };
    
    // 重置处理
    const resetProcess = () => {
      showResults.value = false;
      optimizedData.value = [];
      originalData.value = [];
      replacedItems.value = new Set();
      activeCardId.value = null;
      processingComplete.value = false;
    };
    
    // 检查文档是否就绪
    const checkDocumentReady = () => {
      isDocumentReady.value = isWordDocument();
      return isDocumentReady.value;
    };
    
    // 监听文档名称变化
    const checkDocumentName = () => {
      const documentReady = checkDocumentReady();
      
      if (documentReady) {
        const currentDocName = window.Application.ActiveDocument?.Name;
        if (activeDocumentName.value !== currentDocName) {
          activeDocumentName.value = currentDocName;
          // 文档变化时重置处理
          if (!loading.value && !showResults.value) {
            // 自动开始处理
            setTimeout(() => {
              startProcess();
            }, 500);
          }
        }
      } else {
        // 文档不可用时重置状态
        if (loading.value) {
          loading.value = false;
        }
        if (showResults.value) {
          resetProcess();
        }
      }
    };
    
    let intervalId = null;
    
    onMounted(() => {
      // 检查文档是否就绪
      isDocumentReady.value = checkDocumentReady();
      
      // 初始设置文档名
      if (isDocumentReady.value) {
        activeDocumentName.value = window.Application.ActiveDocument?.Name;
        // 自动开始处理
        setTimeout(() => {
          startProcess();
        }, 500); // 延迟500ms确保组件完全挂载
      }
      
      // 设置定时检查
      intervalId = setInterval(checkDocumentName, 1000);
    });
    
    onBeforeUnmount(() => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      
      // 取消所有未完成的请求
      if (cancelTokenRef.value) {
        cancelTokenRef.value.abort();
      }
      
      // 停止进度动画
      stopProgressAnimation();
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
      handleCardClick,
      handleReplaceItem,
      handleLocateItem,
      handleStartProcess: startProcess,
      resetProcess,
      cardRefs,
      totalTokens,
      processedTokens,
      progressPercentage,
      isDocumentReady,
      receivedChunks,
      lastProcessedTime,
      estimatedTotalTokens,
      processingComplete
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

.spinner.hidden {
  opacity: 0.3;
}

.cancel-button {
  margin-top: 10px;
  padding: 5px 15px;
  background-color: #ff4d4f;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.3s;
}

.cancel-button:hover {
  background-color: #ff7875;
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
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}

.optimization-card {
  width: 480px;
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

.card-content {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.original-text, .optimized-text {
  padding: 10px;
  border-radius: 4px;
  background: #f9f9f9;
}

.original-text h4, .optimized-text h4 {
  margin-top: 0;
  margin-bottom: 8px;
  color: #333;
  font-size: 14px;
}

.original-text p, .optimized-text p {
  margin: 0;
  line-height: 1.6;
  font-size: 14px;
}

.diff-display {
  font-size: 12px;
  margin-bottom: 12px;
  padding: 8px;
  border-radius: 4px;
  background: #f9f9f9;
  border-left: 2px solid #1890ff;
  overflow: visible;
  white-space: normal;
  line-height: 1.5;
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

:deep(.highlight) {
  color: #1890ff;
  font-weight: bold;
  background-color: rgba(24, 144, 255, 0.1);
  padding: 0 2px;
}

.card-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 10px;
}

.action-button {
  padding: 5px 15px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.3s;
}

.action-button.replace {
  background-color: #1890ff;
  color: white;
}

.action-button.replace:hover {
  background-color: #40a9ff;
}

.action-button.replace:disabled {
  background-color: #d9d9d9;
  cursor: not-allowed;
}

.action-button.locate {
  background-color: #52c41a;
  color: white;
}

.action-button.locate:hover {
  background-color: #73d13d;
}

.start-container,
.start-button {
  display: none; /* 隐藏开始按钮 */
}

.document-status {
  width: 100%;
  max-width: 500px;
  text-align: center;
  padding: 20px;
  background-color: #fff;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  margin: 40px auto;
}

.document-status p {
  font-size: 16px;
  color: #666;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background-color: #e9ecef;
  border-radius: 4px;
  margin: 10px 0;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background-color: #1890ff;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 12px;
  color: #666;
  margin-top: 5px;
  margin-bottom: 10px;
}

@media (max-width: 768px) {
  .optimization-card {
    width: 100%;
  }
}
</style> 