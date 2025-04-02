<template>
  <div class="optimization-container">
    <div v-if="loading" class="loading-container">
      <p v-if="processingStatus" class="processing-status">{{ processingStatus }}</p>
      <div class="spinner"></div>
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
} from '../tool/optimization';

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
    const selectionChangeTimer = ref(null); // 用于防抖的定时器
    
    // 计算属性 - 是否已替换
    const isReplaced = computed(() => {
      return originalItem.value && replacedItems.value.has(originalItem.value.id);
    });
    
    // 计算差异展示文本
    const diffDisplay = computed(() => {
      if (!optimizedItem.value || !optimizedItem.value.originalText || !optimizedItem.value.text) {
        return '';
      }
      
      // 如果有diff分析结果，使用它们
      if (optimizedItem.value.diff && optimizedItem.value.diff.length > 0) {
        return optimizedItem.value.diff.map((diff, index) => {
          // 处理新的JSON格式: { originText: "原文词", replacedText: "替换词" }
          if (diff.originText !== undefined && diff.replacedText !== undefined) {
            // 处理删除情况 - replacedText为空
            if (diff.originText && diff.replacedText === '') {
              return `<div class="diff-item">${index + 1}. <span class="deleted">${diff.originText}</span> → 删除</div>`;
            }
            // 处理新增情况 - originText为空
            else if (diff.originText === '' && diff.replacedText) {
              return `<div class="diff-item">${index + 1}. 【新增】：<span class="added">${diff.replacedText}</span></div>`;
            }
            // 处理替换情况
            else {
              return `<div class="diff-item">${index + 1}. <span class="deleted">${diff.originText}</span> → <span class="added">${diff.replacedText}</span></div>`;
            }
          }
          // 兼容旧格式 (字符串形式: "A → B")
          else if (typeof diff === 'string') {
            // 处理替换模式: "A → B"
            if (diff.includes('→')) {
              const [original, optimized] = diff.split('→').map(s => s.trim());
              return `<div class="diff-item">${index + 1}. <span class="deleted">${original}</span> → <span class="added">${optimized}</span></div>`;
            }
            // 处理删除模式: "-A" 或 "删除A"
            else if (diff.startsWith('-') || diff.includes('删除')) {
              const deletedText = diff.startsWith('-') ? diff.substring(1).trim() : diff.replace(/删除/g, '').trim();
              return `<div class="diff-item">${index + 1}. <span class="deleted">${deletedText}</span></div>`;
            }
            // 处理添加模式: "+A" 或 "添加A"
            else if (diff.startsWith('+') || diff.includes('添加')) {
              const addedText = diff.startsWith('+') ? diff.substring(1).trim() : diff.replace(/添加/g, '').trim();
              return `<div class="diff-item">${index + 1}. <span class="added">+${addedText}</span></div>`;
            }
            // 其他情况直接显示
            return `<div class="diff-item">${index + 1}. <span>${diff}</span></div>`;
          }
          // 其他意外情况，返回原始内容
          return `<div class="diff-item">${index + 1}. <span>${JSON.stringify(diff)}</span></div>`;
        }).join('');
      }
      
      // 简单显示原文和优化文本的差异
      return `<div class="diff-item"><span class="deleted">${optimizedItem.value.originalText}</span> → <span class="added">${optimizedItem.value.text}</span></div>`;
    });
    
    // 获取高亮后的优化文本
    const getHighlightedText = (optimizedItem) => {
      if (!optimizedItem || !optimizedItem.text || !optimizedItem.diff || optimizedItem.diff.length === 0) {
        return optimizedItem?.text || '';
      }
      
      let text = optimizedItem.text;
      const highlightWords = [];
      
      // 收集所有需要高亮的文本
      optimizedItem.diff.forEach(diff => {
        // 处理新的JSON格式
        if (diff.originText !== undefined && diff.replacedText !== undefined) {
          // 只对替换和新增的文本进行高亮处理
          if (diff.replacedText) {
            highlightWords.push(diff.replacedText);
          }
        }
        // 兼容旧格式
        else if (typeof diff === 'string') {
          if (diff.includes('→')) {
            // 处理替换情况，提取箭头右边的内容
            const parts = diff.split('→');
            if (parts.length === 2) {
              const optimized = parts[1].trim();
              // 检查是否是新增格式
              if (optimized.startsWith('【') && optimized.endsWith('】')) {
                // 提取【】中的内容
                const addedText = optimized.substring(1, optimized.length - 1);
                highlightWords.push(addedText);
              } else if (optimized) {
                highlightWords.push(optimized);
              }
            }
          } else if (diff.startsWith('+') || diff.includes('添加')) {
            // 处理添加模式
            const addedText = diff.startsWith('+') ? diff.substring(1).trim() : diff.replace(/添加/g, '').trim();
            highlightWords.push(addedText);
          } else if (diff.includes('【') && diff.includes('】')) {
            // 提取所有【】括起来的内容
            const regex = /【([^【】]+)】/g;
            let match;
            while ((match = regex.exec(diff)) !== null) {
              highlightWords.push(match[1]);
            }
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
      
      if (optimizedItem.value) {
        optimizedItem.value = { ...optimizedItem.value, replaced: true };
      }
      
      if (originalItem.value) {
        replacedItems.value.add(originalItem.value.id);
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
      
      // 替换文档中的内容
      let replaced = false;
      
      try {
        // 获取当前选中文本
        const selection = window.Application.Selection;
        if (!selection) {
          throw new Error('无法获取选中文本');
        }
        
        // 记录选择的范围信息
        const selectionStart = selection.Range.Start;
        const selectionEnd = selection.Range.End;
        
        // 获取原始XML
        const xml = selection.Range.WordOpenXML;
        
        // 替换XML中的文本
        const newXml = replaceSelectionXml(xml, originalTextItem.text, optimizedTextItem.text);
        
        // 插入修改后的XML
        selection.Range.InsertXML(newXml);
        replaced = true;

        if (replaced) {
          // 更新状态
          if (optimizedItem.value) {
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
            console.warn('无法重新选中原文本区域:', e);
          }
          
          // 替换后延时关闭结果页面
          setTimeout(() => {
            showResults.value = false;
          }, 500);
        } else {
          // 更新状态，不使用alert
          optimizedItem.value = {
            ...optimizedItem.value,
            replaced: true,
            notImprove: true
          };
          setTimeout(() => {
            showResults.value = false;
          }, 500);
        }
      } catch (error) {
        console.error('替换内容时出错:', error);
        // 更新状态，不使用alert
        optimizedItem.value = {
          ...optimizedItem.value,
          replaced: true,
          notImprove: true
        };
        setTimeout(() => {
          showResults.value = false;
        }, 500);
      }
    };
    
    // 替换选中文本的XML
    const replaceSelectionXml = (xml, originalText, optimizedText) => {
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xml, "text/xml");
        
        // 获取所有w:t标签
        const textNodes = xmlDoc.getElementsByTagName("w:t");
        
        // 提取所有文本内容
        let combinedText = '';
        for (let i = 0; i < textNodes.length; i++) {
          combinedText += textNodes[i].textContent;
        }
        
        // 验证提取的文本是否匹配原始文本
        if (combinedText.trim() !== originalText.trim()) {
          console.warn(`提取的文本与预期不符: "${combinedText}" vs "${originalText}"`);
        }
        
        // 根据节点长度比例分配新文本
        let remainingText = optimizedText;
        const totalLength = combinedText.length;
        
        if (totalLength === 0) {
          return xml;
        }
        
        for (let i = 0; i < textNodes.length; i++) {
          const nodeText = textNodes[i].textContent;
          const nodeRatio = nodeText.length / totalLength;
          
          if (i === textNodes.length - 1) {
            // 最后一个节点处理所有剩余文本
            textNodes[i].textContent = remainingText;
          } else {
            // 按原始比例分配文本
            const allocatedLength = Math.floor(optimizedText.length * nodeRatio);
            const nodeTextLength = Math.max(1, allocatedLength);
            textNodes[i].textContent = remainingText.substring(0, nodeTextLength);
            remainingText = remainingText.substring(nodeTextLength);
          }
        }
        
        // 将修改后的XML序列化回字符串
        const serializer = new XMLSerializer();
        return serializer.serializeToString(xmlDoc);
      } catch (error) {
        console.error('替换XML内容时出错:', error);
        return xml;
      }
    };
    
    // 收集选中文本的样式信息
    const collectOriginalStyle = (paragraphId) => {
      try {
        const selection = window.Application.Selection;
        if (selection) {
          const underlineStyle = selection.Font.Underline === 9999999 ? 0 : selection.Font.Underline;
          const colorStyle = selection.Font.Color === 9999999 ? 0 : selection.Font.Color;
          
          // 只记录原始样式，不修改样式
          originalStylesMap.value.set(paragraphId, {
            underline: underlineStyle,
            color: colorStyle
          });
          
          // 不需要对文本高亮处理
          
          return true;
        }
        return false;
      } catch (error) {
        console.error('收集原始样式时出错:', error);
        return false;
      }
    };
    
    // 检查当前选中的文本
    const checkSelectionText = () => {
      try {
        if (!window.Application || !window.Application.Selection) {
          return;
        }
        
        const selection = window.Application.Selection;
        const newText = selection.Text.trim();
        
        // 如果选中的文本发生了变化且不为空
        if (newText && currentSelectionText.value !== newText && !loading.value) {
          // 显示提示信息
          if (showResults.value) {
            // 更新提示信息
            errorMessage.value = '检测到选中文本已变化，将重新优化';
            
            // 2秒后自动开始新的优化流程
            setTimeout(() => {
              currentSelectionText.value = newText;
              goBack();
            }, 2000);
          } else {
            // 直接更新当前文本并开始优化
            currentSelectionText.value = newText;
            handleStartProcess();
          }
        }
      } catch (error) {
        console.error('检查文本选择时出错:', error);
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
      cancelTokenRef.value = new AbortController();
      processingRef.value = true;

      loading.value = true;

      if (!isWordDocument()) {
        // 当没有打开文档时，需要使用alert提示
        alert('无法访问Word文档，请确保文档已打开');
        loading.value = false;
        return;
      }

      processingStatus.value = '正在提取选中内容...';
      const selection = window.Application.Selection;
      
      if (!selection || selection.Text.trim() === '') {
        // 当没有选中段落时，需要使用alert提示
        alert('无法获取选中内容，请确保已选中文本');
        loading.value = false;
        return;
      }
      
      // 直接从选中内容获取文本
      const selectedText = {
        id: selection.Paragraphs.Item(1).ParaID, // 获取第一个段落的ID
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

      try {
        // 准备用于API的数据格式
        const dataForDeepseek = {
          paraID: selectedText.id,
          text: selectedText.text
        };
        
        // 重置错误消息
        errorMessage.value = '';
        
        // 调用API进行优化
        const params = {
          messages: [
            {
              role: "system",
              content: "你是一个专业的文章优化助手。请仅对文本进行词语替换和优化，不要添加大量新文本。如果判断文本不需要优化，请保持原样。"
            },
            {
              role: "user",
              content: `请对以下JSON格式内容进行优化，返回优化后相同格式的JSON：\n\n${JSON.stringify(dataForDeepseek)}`
            }
          ],
          model: "qwen-plus",
          signal: cancelTokenRef.value?.signal
        };
        
        const response = await retryOptimization(params);
        
        if (!processingRef.value) {
          loading.value = false;
          return;
        }
        
        if (response.data && response.data.choices && response.data.choices.length > 0) {
          const result = response.data.choices[0].message.content;
          
          try {
            // 解析API返回的结果
            let jsonData;
            const jsonMatch = result.match(/(\{.*\})/s);
            if (jsonMatch) {
              jsonData = JSON.parse(jsonMatch[1]);
            } else {
              jsonData = JSON.parse(result);
            }
            
            // 检查返回的数据
            if (jsonData && jsonData.paraID && jsonData.text) {
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
              if (hasChanges) {
                try {
                  // 设置超时，确保差异分析不会无限等待
                  const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('差异分析超时')), 10000);
                  });
                  
                  // 创建差异分析请求
                  const diffAnalysisPromise = generateDiffAnalysis({
                    original: selectedText.text,
                    optimized: jsonData.text,
                    signal: cancelTokenRef.value?.signal
                  });
                  
                  // 使用Promise.race确保有超时保护
                  const diffResponse = await Promise.race([
                    diffAnalysisPromise,
                    timeoutPromise
                  ]);
                  
                  if (diffResponse.data && diffResponse.data.choices && diffResponse.data.choices.length > 0) {
                    const diffResult = diffResponse.data.choices[0].message.content;
                    try {
                      // 处理返回的差异分析结果
                      const jsonStart = diffResult.indexOf('[');
                      const jsonEnd = diffResult.lastIndexOf(']') + 1;
                      if (jsonStart !== -1 && jsonEnd !== -1) {
                        const jsonStr = diffResult.substring(jsonStart, jsonEnd);
                        const diffArray = JSON.parse(jsonStr);
                        if (Array.isArray(diffArray)) {
                          optimizedItem.value.diff = diffArray;
                        }
                      } else {
                        // 尝试直接解析全文
                        const diffArray = JSON.parse(diffResult);
                        if (Array.isArray(diffArray)) {
                          optimizedItem.value.diff = diffArray;
                        }
                      }
                    } catch (e) {
                      console.error('解析差异分析失败:', e);
                      
                      // 如果解析失败，尝试手动创建差异标记
                      optimizedItem.value.diff = [
                        `${selectedText.text} → ${jsonData.text}`
                      ];
                    }
                  } else {
                    // 如果没有获取到差异分析结果，手动创建一个简单的差异标记
                    optimizedItem.value.diff = [
                      `${selectedText.text} → ${jsonData.text}`
                    ];
                  }
                } catch (e) {
                  console.error('获取差异分析失败:', e);
                  
                  // 即使差异分析失败，也创建一个简单的差异标记
                  optimizedItem.value.diff = [
                    `${selectedText.text} → ${jsonData.text}`
                  ];
                } finally {
                  // 无论差异分析是否成功，都继续显示结果
                  showResults.value = true;
                  loading.value = false;
                }
              } else {
                // 没有变化，直接显示结果
                showResults.value = true;
                loading.value = false;
              }
            } else {
              console.error('API返回的数据格式不正确');
              loading.value = false;
              showResults.value = true; // 即使格式不正确也显示结果
            }
          } catch (error) {
            console.error('解析优化结果失败:', error);
            loading.value = false;
            showResults.value = true; // 即使解析失败也显示结果
          }
        } else {
          console.error('API返回的数据格式不正确');
          loading.value = false;
          showResults.value = true; // 即使API返回为空也显示结果
        }
      } catch (error) {
        console.error('处理失败:', error);
        loading.value = false;
        errorMessage.value = '处理失败，请重试'; // 设置错误消息
        showResults.value = true; // 即使处理失败也显示结果
      } finally {
        // 确保处理完成后，不论成功失败都关闭加载状态
        processingStatus.value = '';
        processingRef.value = false;
        loading.value = false;
      }
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
      getHighlightedText
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
</style>