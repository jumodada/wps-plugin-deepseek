<template>
  <div class="optimization-container">
    <!-- 停止处理的提示 -->
    <div v-if="processingCancelled && !loading && !textChangeDetected" class="text-change-alert">
      <span>您已停止处理</span>
      <div class="text-change-actions">
        <span class="text-change-action" @click="handleStartProcess">重新开始</span>
        <span class="text-change-action ignore" @click="ignoreProcessingCancelled">忽略</span>
      </div>
    </div>
    
    <!-- 文本变化提示 -->
    <div v-if="textChangeDetected && !loading" class="text-change-alert">
      <span>检测到选中文本已变化</span>
      <div class="text-change-actions">
        <span class="text-change-action" @click="handleReOptimize">重新优化</span>
        <span class="text-change-action ignore" @click="ignoreTextChange">忽略</span>
      </div>
    </div>
    
    <div v-if="loading" class="overlay-container">
      <div class="progress-container">
        <p class="processing-title">处理中</p>
        <div class="progress-bar">
          <div class="progress-inner" :style="{ width: `${progressPercentage}%` }"></div>
        </div>
        <p class="progress-percentage">{{ Math.round(progressPercentage) }}%</p>
        <button class="stop-button" @click="handleStopProcessing">停止</button>
      </div>
    </div>
    
    <div v-else-if="showResults" class="results-container">
      <!-- 错误消息 -->
      <div v-if="errorMessage" class="error-message">
        <div class="result-card error">
          <p>{{ errorMessage }}</p>
          <span class="back-link" @click="goBack">
            <span class="icon">←</span>
            重试
          </span>
        </div>
      </div>
      
      <!-- 无需优化或已替换情况 -->
      <div v-else-if="originalItem && optimizedItem && (originalItem.text.trim() === optimizedItem.text.trim() || optimizedItem.replaced)" class="empty-result">
        <div class="result-card">
          <p>{{ optimizedItem.replaced ? '内容已替换成功' : '优化内容与原内容相同，无需替换' }}</p>
          <span class="back-link" @click="goBack">
            <span class="icon">←</span>
            返回
          </span>
        </div>
      </div>
      
      <!-- 优化结果卡片 -->
      <div v-else-if="originalItem && optimizedItem" class="card-container">
        <div 
          class="optimization-card"
          :class="{ 'active': isActive }"
        >
          <!-- 差异展示区 -->
          <div v-if="diffDisplay" class="diff-display" v-html="diffDisplay"></div>
          
          <!-- 优化后文本 -->
          <div class="optimized-text" :class="{ 'replaced': isReplaced }" v-html="getHighlightedText(optimizedItem)">
          </div>
          
          <!-- 操作按钮 -->
          <div class="action-buttons">
            <span class="action-button replace" @click.stop="handleReplaceItem(originalItem, optimizedItem)">
              <span class="icon">✓</span>
              替换
            </span>
            <span class="action-button ignore" @click.stop="handleIgnoreItem">
              <span class="icon">✕</span>
              忽略
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { generateDiffAnalysis } from '../api/deepseek';
import { 
  isWordDocument, 
  retryOptimization,
  retryStreamOptimization
} from '../tool/optimization';
import axios from 'axios';

export default {
  name: 'SelectionOptimizationPage',
  setup() {
    // 状态变量
    const loading = ref(false);
    const processingStatus = ref('');
    const originalItem = ref(null);
    const optimizedItem = ref(null);
    const showResults = ref(false);
    const isActive = ref(false); // 默认不激活，只用来控制UI显示
    const replacedItems = ref(new Set());
    const originalStylesMap = ref(new Map());
    const cancelTokenRef = ref(null);
    const processingRef = ref(false);
    const errorMessage = ref(''); // 添加错误消息状态
    const currentSelectionText = ref(''); // 存储当前选中的文本
    const textChangeDetected = ref(false); // 添加文本变化检测状态
    const newSelectionText = ref(''); // 存储新检测到的文本
    const processingCancelled = ref(false); // 添加停止处理状态
    
    // 添加进度条相关变量
    const progress = ref(0);
    const simulatedProgress = ref(0);
    const progressInterval = ref(null);
    
    // 计算进度百分比
    const progressPercentage = computed(() => {
      // 简化计算，因为选择优化只有一个请求，使用模拟进度
      return Math.min(progress.value + simulatedProgress.value, 100);
    });
    
    // 启动模拟进度
    const startProgressSimulation = () => {
      // 清除之前的定时器
      if (progressInterval.value) {
        clearInterval(progressInterval.value);
      }
      
      simulatedProgress.value = 0;
      progress.value = 0;
      
      // 设置新的定时器，每100ms增加一点模拟进度，使进度更平滑
      progressInterval.value = setInterval(() => {
        // 如果正在处理且模拟进度小于95%，继续增加
        if (processingRef.value && simulatedProgress.value < 95) {
          // 模拟进度增量，但确保不会超过真实进度的95%
          const increment = 0.5; // 每次增加的进度更小，使过渡更平滑
          simulatedProgress.value += increment;
        } else {
          // 处理完成或取消，清除定时器
          clearInterval(progressInterval.value);
          progressInterval.value = null;
        }
      }, 100);
    };
    
    // 计算属性 - 是否已替换
    const isReplaced = computed(() => {
      return originalItem.value && replacedItems.value.has(originalItem.value.id);
    });
    // 计算差异展示文本
    const diffDisplay = computed(() => {
      if (!optimizedItem?.value || !optimizedItem?.value?.originalText || !optimizedItem?.value?.text) {
        return '';
      }
      
      // 如果有diff分析结果，使用它们
      if (optimizedItem?.value?.diff && optimizedItem?.value?.diff?.length > 0) {
        return optimizedItem?.value?.diff?.map((diff, index) => {
          // 只处理JSON格式: { originText: "原文词", replacedText: "替换词" }
          if (diff?.originText !== undefined && diff?.replacedText !== undefined) {
            // 直接展示originText和replacedText，保持原有样式和箭头符号
            return `<div class="diff-item">${index + 1}. <span class="deleted">${diff?.originText}</span> → <span class="added">${diff.replacedText}</span></div>`;
          }
          return ''; // 忽略其他格式
        }).filter(Boolean).join('');
      }
      
      return '';
    });
    // 获取高亮后的优化文本
    const getHighlightedText = (optimizedItem) => {
      if (!optimizedItem || !optimizedItem?.text || !optimizedItem?.diff || optimizedItem?.diff?.length === 0) {
        return optimizedItem?.text || '';
      }
      
      let text = optimizedItem?.text;
      const highlightWords = [];
      
      // 收集所有需要高亮的文本
      optimizedItem?.diff?.forEach(diff => {
        // 只处理JSON格式
        if (diff?.originText !== undefined && diff?.replacedText !== undefined) {
          // 只对替换后的文本进行高亮处理
          if (diff?.replacedText) {
            highlightWords.push(diff?.replacedText);
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
      if (originalItem.value) {
        restoreOriginalStyle(originalItem.value.id);
      }
      isActive.value = false;
      showResults.value = false;
      errorMessage.value = ''; // 清除可能的错误消息
      
      // 尝试重新获取选中的文本
      try {
        const selection = window.Application.Selection;
        if (selection && selection.Text.trim() !== '') {
          handleStartProcess();
        } else {
          // 如果没有选中文本，提示用户
          alert('请选中要优化的文本');
        }
      } catch (e) {
        console.error('重新处理选中文本时出错:', e);
        alert('请选中要优化的文本');
      }
    };
    
    // 处理忽略项目
    const handleIgnoreItem = () => {
      if (isActive.value && originalItem.value) {
        restoreOriginalStyle(originalItem.value.id);
        isActive.value = false;
        originalStylesMap.value.delete(originalItem.value.id);
      }
      
      if (optimizedItem?.value) {
        optimizedItem.value = { ...optimizedItem.value, replaced: true };
      }
      
      if (originalItem?.value) {
        replacedItems.value.add(originalItem?.value?.id);
      }
      
      // 延时关闭结果页面
      setTimeout(() => {
        showResults.value = false;
      }, 500);
    };
    
    // 处理替换文本
    const handleReplaceItem = (originalTextItem, optimizedTextItem) => {
      if (isActive.value) {
        restoreOriginalStyle(originalTextItem.id);
        originalStylesMap.value.delete(originalTextItem.id);
      }
      isActive.value = false;
      
      // 获取当前选中文本
      const selection = window.Application.Selection;
      if (!selection) {
        console.error('无法获取选中文本');
        return;
      }
      
      // 记录选择的范围信息
      const selectionStart = selection.Range.Start;
      const selectionEnd = selection.Range.End;
      
      // 获取原始XML
      const xml = selection.Range.WordOpenXML;
      if (!xml) {
        console.error('无法获取XML内容');
        return;
      }
      
      // 替换XML中的文本
      const newXml = replaceSelectionXml(xml, originalTextItem.text, optimizedTextItem.text);
      
      // 插入修改后的XML
      selection.Range.InsertXML(newXml);
      
      // 更新状态
      if (optimizedItem?.value) {
        optimizedItem.value = { ...optimizedItem.value, replaced: true };
      }

      replacedItems.value.add(originalTextItem.id);
      originalStylesMap.value.delete(originalTextItem.id);
      
      // 同步文档
      window.Application.ActiveDocument.Sync.PutUpdate();
      
      // 强制触发UI更新
      window.Application.ActiveDocument.Range(0, 0).Select();
      
      // 尝试重新选中相同的范围区域
      try {
        const doc = window.Application.ActiveDocument;
        doc.Range(selectionStart, selectionEnd).Select();
      } catch (e) {
        console.error('无法重新选中原文本区域:', e);
      }
      
      // 替换后延时关闭结果页面
      setTimeout(() => {
        showResults.value = false;
      }, 500);
    };
    
    // 替换选中文本的XML
    const replaceSelectionXml = (xml, originalText, optimizedText) => {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xml, "text/xml");
      
      // 检查XML解析是否成功
      if (!xmlDoc || xmlDoc.getElementsByTagName("parsererror").length > 0) {
        console.error('XML解析失败');
        return xml;
      }
      
      // 获取所有w:t标签
      const textNodes = xmlDoc.getElementsByTagName("w:t");
      
      if (!textNodes || textNodes.length === 0) {
        console.error('未找到有效的文本节点');
        return xml;
      }
      
      // 提取所有文本内容
      let combinedText = '';
      for (let i = 0; i < textNodes.length; i++) {
        combinedText += textNodes[i].textContent || '';
      }
      
      // 验证提取的文本是否匹配原始文本
      if (combinedText.trim() !== originalText.trim()) {
        console.warn(`提取的文本与预期不符: "${combinedText}" vs "${originalText}"`);
        // 非严格模式，继续执行
      }
      
      // 根据节点长度比例分配新文本
      let remainingText = optimizedText;
      const totalLength = combinedText.length;
      
      if (totalLength === 0) {
        console.error('获取到的文本长度为0');
        return xml;
      }
      
      for (let i = 0; i < textNodes.length; i++) {
        const nodeText = textNodes[i].textContent || '';
        const nodeRatio = nodeText.length / totalLength;
        
        if (i === textNodes.length - 1) {
          // 最后一个节点处理所有剩余文本
          textNodes[i].textContent = remainingText;
        } else {
          // 按原始比例分配文本
          const allocatedLength = Math.floor(optimizedText.length * nodeRatio);
          const nodeTextLength = Math.max(1, allocatedLength);
          
          // 确保不超出剩余文本长度
          if (nodeTextLength <= remainingText.length) {
            textNodes[i].textContent = remainingText.substring(0, nodeTextLength);
            remainingText = remainingText.substring(nodeTextLength);
          } else {
            // 如果剩余文本不足，使用所有剩余文本
            textNodes[i].textContent = remainingText;
            remainingText = '';
          }
        }
      }
      
      // 将修改后的XML序列化回字符串
      const serializer = new XMLSerializer();
      return serializer.serializeToString(xmlDoc);
    };
    
    // 收集选中文本的样式信息
    const collectOriginalStyle = (paragraphId) => {
      if (!window.Application?.Selection) {
        return false;
      }
      
      const selection = window.Application.Selection;
      const underlineStyle = selection.Font.Underline === 9999999 ? 0 : selection.Font.Underline;
      const colorStyle = selection.Font.Color === 9999999 ? 0 : selection.Font.Color;
      
      // 只记录原始样式，不修改样式
      originalStylesMap.value.set(paragraphId, {
        underline: underlineStyle,
        color: colorStyle
      });
      
      return true;
    };
    
    // 检查当前选中的文本
    const checkSelectionText = () => {
      if (!window.Application?.Selection) {
        return;
      }
      
      const selection = window.Application.Selection;
      const newText = selection.Text.trim();
      
      // 如果选中的文本发生了变化且不为空
      if (newText && currentSelectionText.value !== newText && !loading.value) {
        // 记录新文本并显示变化提示
        newSelectionText.value = newText;
        textChangeDetected.value = true;
      }
    };
    
    // 设置定时任务，定期检查选中文本
    const startSelectionWatcher = () => {
      // 每2秒检查一次选中文本
      const selectionWatcher = setInterval(checkSelectionText, 2000);
      return selectionWatcher;
    };
    
    // 存储选中文本的监听定时器引用
    let selectionWatcherRef = null;
    
    // 启动处理流程
    const handleStartProcess = async () => {
      // 取消之前的请求
      if (cancelTokenRef.value) {
        cancelTokenRef.value.abort();
      }
      
      cancelTokenRef.value = new AbortController();
      processingRef.value = true;
      loading.value = true;
      processingCancelled.value = false; // 重置处理取消状态

      if (!isWordDocument()) {
        alert('无法访问Word文档，请确保文档已打开');
        loading.value = false;
        return;
      }

      processingStatus.value = '正在提取选中内容...';
      
      // 启动进度模拟
      startProgressSimulation();
      
      const selection = window.Application.Selection;
      
      if (!selection || !selection.Text || selection.Text.trim() === '') {
        alert('无法获取选中内容，请确保已选中文本');
        loading.value = false;
        return;
      }
      
      // 直接从选中内容获取文本
      const selectedText = {
        id: selection.Paragraphs && selection.Paragraphs.Item(1) ? selection.Paragraphs.Item(1).ParaID : 'selection-' + Date.now(),
        text: selection.Text.trim()
      };
      
      if (!selectedText.text) {
        alert('无法获取选中内容，请确保已选中文本');
        loading.value = false;
        return;
      }

      // 更新当前选中文本
      currentSelectionText.value = selectedText.text;
      
      originalItem.value = selectedText;
      // 收集选中文本的样式信息，但不高亮
      collectOriginalStyle(selectedText.id);
      
      processingStatus.value = '正在优化内容...';

      // 获取整个文档内容作为大纲
      let documentOutline = '';
      try {
        documentOutline = window.Application.ActiveDocument.Content.Text;
      } catch (error) {
        console.error('获取文档大纲失败:', error);
      }

      // 准备用于API的数据格式
      const dataForDeepseek = {
        paraID: selectedText.id,
        text: selectedText.text,
        documentOutline: documentOutline  // 添加文档大纲
      };
      
      // 重置错误消息
      errorMessage.value = '';
      
      // 调用API进行优化 - 使用流式请求
      const params = {
        messages: [
          {
            role: "system",
            content: "你是一个专业的文章优化助手。请仅对文本进行词语级别的精确替换和优化，保持原文结构和主要内容不变。替换时尽量一对一替换词语，不要添加新内容，不要重写整个句子。如果判断文本不需要优化，请保持原样。你的目标是使优化后的文本与原文有最小的差异，但提高表达质量。"
          },
          {
            role: "user",
            content: `请对以下JSON格式内容进行词语级别的优化，返回优化后相同格式的JSON。仅替换需要改进的个别词语，保持整体结构不变。我提供了documentOutline作为整个文档的大纲，请参考它以更精准地理解上下文：\n\n${JSON.stringify(dataForDeepseek)}`
          }
        ],
        model: "qwen-plus",
        signal: cancelTokenRef.value?.signal,
        onData: (data) => {
          // 可以在这里处理流式返回的每一块数据，更新进度
          progress.value = Math.min(progress.value + 2, 95);
        }
      };
      
      try {
        const response = await retryStreamOptimization(params);
        
        if (!processingRef.value) {
          // 清除进度模拟
          if (progressInterval.value) {
            clearInterval(progressInterval.value);
            progressInterval.value = null;
          }
          loading.value = false;
          return;
        }
        
        // 完成处理，设置进度为100%
        progress.value = 100;
        simulatedProgress.value = 0;
        
        if (!response?.data?.choices?.length) {
          errorMessage.value = 'API返回的数据格式不正确或为空';
          loading.value = false;
          showResults.value = true;
          return;
        }
        
        const result = response.data.choices[0].message.content;
        
        // 解析API返回的结果
        let jsonData;
        const jsonMatch = result.match(/(\{.*\})/s);
        
        if (jsonMatch) {
          jsonData = JSON.parse(jsonMatch[1]);
        } else {
          jsonData = JSON.parse(result);
        }
        
        // 检查返回的数据
        if (!jsonData?.paraID || !jsonData?.text) {
          errorMessage.value = 'API返回的数据格式不正确';
          loading.value = false;
          showResults.value = true;
          return;
        }
        
        // 检查文本是否有变化
        const hasChanges = selectedText.text.trim() !== jsonData.text.trim();
        
        // 生成优化结果
        optimizedItem.value = {
          id: selectedText.id,
          originalText: selectedText.text,
          text: jsonData.text,
          notImprove: !hasChanges,
          diff: [],
          replaced: false
        };
        
        // 如果没有变化，不需要获取差异分析
        if (!hasChanges) {
          showResults.value = true;
          loading.value = false;
          return;
        }
        
        // 获取差异分析
        try {
          // 创建差异分析请求
          const diffResponse = await generateDiffAnalysis({
            original: selectedText.text,
            optimized: jsonData.text,
            signal: cancelTokenRef.value?.signal
          });
          localStorage.setItem('diffResponse', JSON.stringify(diffResponse));
          if (diffResponse?.data?.choices?.length) {
            const diffResult = diffResponse.data.choices[0].message.content;
            const diffArray = JSON.parse(diffResult);
            optimizedItem.value.diff = Array.isArray(diffArray) ? diffArray : [];
          }
        } catch (e) {
          console.error('获取差异分析失败:', e);
          optimizedItem.value.diff = [];
        }
        
        showResults.value = true;
      } catch (error) {
        // 判断是否是取消的请求
        if (axios.isCancel(error) || error.name === 'AbortError' || error.name === 'CanceledError') {
          console.log('请求已取消');
          // 不显示错误消息
        } else {
          console.error('处理失败:', error);
          // 只在控制台输出错误，不直接显示给用户
          errorMessage.value = '处理失败，请稍后重试';
        }
      } finally {
        // 清除进度模拟
        if (progressInterval.value) {
          clearInterval(progressInterval.value);
          progressInterval.value = null;
        }
        processingStatus.value = '';
        processingRef.value = false;
        loading.value = false;
        showResults.value = true;
      }
    };
    
    // 忽略文本变化
    const ignoreTextChange = () => {
      textChangeDetected.value = false;
      newSelectionText.value = '';
    };
    
    // 处理重新优化
    const handleReOptimize = () => {
      if (newSelectionText.value) {
        currentSelectionText.value = newSelectionText.value;
        textChangeDetected.value = false;
        showResults.value = false;
        handleStartProcess();
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
      
      // 如果没有结果，至少显示结果容器
      if (!originalItem.value || !optimizedItem.value) {
        showResults.value = true;
      }
    };
    
    // 忽略处理取消提示
    const ignoreProcessingCancelled = () => {
      processingCancelled.value = false;
    };
    
    onMounted(() => {
      // 启动处理
      handleStartProcess();
      
      // 启动选中文本监听，并保存定时器引用
      selectionWatcherRef = startSelectionWatcher();
    });
    
    onBeforeUnmount(() => {
      // 清理文本监听定时器
      if (selectionWatcherRef) {
        clearInterval(selectionWatcherRef);
      }
      
      // 清理API请求
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
    
    return {
      loading,
      processingStatus,
      originalItem,
      optimizedItem,
      showResults,
      isActive,
      isReplaced,
      diffDisplay,
      handleReplaceItem,
      handleIgnoreItem,
      goBack,
      errorMessage,
      getHighlightedText,
      textChangeDetected,
      handleReOptimize,
      ignoreTextChange,
      // 添加停止处理相关变量
      processingCancelled,
      handleStopProcessing,
      ignoreProcessingCancelled,
      // 添加进度相关变量
      progressPercentage
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

/* 文本变化提示样式 */
.text-change-alert {
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

.text-change-actions {
  display: flex;
  gap: 10px;
}

.text-change-action {
  cursor: pointer;
  color: #1890ff;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 2px;
}

.text-change-action:hover {
  background-color: rgba(24, 144, 255, 0.1);
}

.text-change-action.ignore {
  color: #999;
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

.card-container {
  display: flex;
  justify-content: center;
  align-items: center;
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
}

.optimization-card.active {
  box-shadow: 0 0 10px rgba(24, 144, 255, 0.8);
  border-width: 2px;
  border-color: #1890ff;
  background: #f0f8ff;
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

:deep(.highlight-added) {
  color: #52c41a !important;
  font-weight: bold;
  background-color: rgba(82, 196, 26, 0.1);
  padding: 0 2px;
  border-radius: 2px;
}

.optimized-text {
  max-height: none;
  overflow: visible;
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

.error-message {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
}

.result-card.error {
  border-left: 3px solid #ff4d4f;
}

.stop-button {
  background-color: #ff4d4f;
  color: white;
  border: none;
  padding: 8px 16px;
  font-size: 14px;
  cursor: pointer;
  border-radius: 4px;
  margin-top: 20px;
}

.stop-button:hover {
  background-color: #e84d4f;
}

/* 新增样式 */
.overlay-container {
  position: fixed;
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
  max-width: 300px;
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
  height: 10px;
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
</style>