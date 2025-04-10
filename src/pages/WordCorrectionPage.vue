<template>
  <div class="correction-container">
    <!-- 停止处理的提示 -->
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

    <!-- 添加初审/复审的Tab组件 -->
    <div class="review-tabs" v-if="!loading">
      <div class="tabs-wrapper">
        <div 
          class="tab-item" 
          :class="{ 'active': reviewType === 'initial', 'disabled': initialReviewCompleted && !canSwitchToInitial }" 
          @click="handleSwitchTab('initial')"
        >
          初审<span v-if="initialReviewCompleted" class="status-icon">✓</span>
          <a-tooltip 
            placement="bottom"
          >
            <template #title>
              初审主要解决政务性差错、标点符号差错、引用差错等。
            </template>
            <span class="tooltip-icon">?</span>
          </a-tooltip>
        </div>
        <div 
          class="tab-item" 
          :class="{ 'active': reviewType === 'second', 'disabled': !initialReviewCompleted || secondReviewCompleted || hasUnresolvedInitialItems }" 
          @click="handleSwitchTab('second')"
        >
          复审<span v-if="secondReviewCompleted" class="status-icon">✓</span>
          <a-tooltip 
            placement="bottom"
          >
            <template #title>
              复审主要解决事实性差错、知识性差错、逻辑性差错、字词差错等。
            </template>
            <span class="tooltip-icon">?</span>
          </a-tooltip>
        </div>
      </div>
      <div class="tooltip-wrapper">
      </div>
    </div>

    <div v-if="loading" class="overlay-container">
      <div class="progress-container">
        <p class="processing-title">文档处理中</p>
        <div class="progress-bar">
          <div class="progress-inner" :style="{ width: `${progressPercentage}%` }"></div>
        </div>
        <p class="progress-percentage">{{ Math.round(progressPercentage) }}%</p>
        <p v-if="processingStatus" class="processing-status">{{ processingStatus }}</p>
        <!-- 添加停止按钮 -->
        <button class="stop-button" @click="handleStopProcessing">停止</button>
      </div>
    </div>
    
    <div class="results-container" v-show="showResults || (loading && correctionData.length > 0)" ref="resultsContainer">
      <!-- 无纠错结果情况 -->
      <div v-if="filteredData.length === 0 && !loading" class="empty-result">
        <div class="result-card">
          <p>{{ replacedItems.size > 0 ? '所有错误词语已成功修正' : '没有检测到需要纠正的词语' }}</p>
          <div class="empty-actions">
            <span class="retry-link" @click="handleStartProcess()" v-if="canRecheck">
              <span class="icon">↻</span>
              重新检测
            </span>
          </div>
        </div>
      </div>
      
      <!-- 纠错结果列表 -->
      <div v-else class="results-list">
        <div class="section-header" v-if="!loading">
          <h3>检测到的错误词语 <span v-if="loading">{{processingBatchInfo}}</span>({{ filteredData.length }})</h3>
        </div>
        
        <div class="cards-container">
          <div 
            v-for="(item, index) in filteredData" 
            :key="item.id" 
            class="correction-card"
            :class="{ 'active': activeCardId === item.id }"
            @click="handleLocateInDocument(item.id)"
            :ref="el => { if (el) { cardRefs[item.id] = el; if (index === filteredData.length - 1) lastCardRef = el; } }"
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
        <div class="bottom-actions" v-if="!loading">
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
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { 
  isWordDocument, 
  extractParagraphsFromDocument, 
  handleImageLineBreak, 
  replaceParagraphInDocument,
  prepareDataForDeepseek,
  retryStreamWordCorrection
} from '../tool/optimization';
import { message } from 'ant-design-vue';
import { useMainStore } from '../services/store';

export default {
  name: 'WordCorrectionPage',
  setup() {
    // 获取Pinia store
    const mainStore = useMainStore();
    
    // 审核相关状态变量
    const reviewType = ref('initial'); // 'initial' 或 'second'
    const initialReviewCompleted = ref(false);
    const secondReviewCompleted = ref(false);
    const canSwitchToInitial = ref(true);
    const canRecheck = computed(() => {
      return (reviewType.value === 'initial' && !initialReviewCompleted.value) || 
             (reviewType.value === 'second' && !secondReviewCompleted.value);
    });

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
    const processComplete = ref(false);
    const processingBatchInfo = ref('');
    const lastCardRef = ref(null);
    const resultsContainer = ref(null);
    
    // 批量处理相关的状态变量
    
    // 进度条相关
    const progress = ref(0);
    const progressInterval = ref(null);
    
    // 计算进度百分比
    const progressPercentage = computed(() => {
      // 直接使用progress值，处理完成时设为100%
      return processComplete.value ? 100 : Math.min(Math.max(progress.value, 0), 100);
    });
    
    // 计算属性 - 过滤需要展示的数据
    const filteredData = computed(() => {
      return correctionData.value.filter(item => {
        return !replacedItems.value.has(item.id) && item.errorWord && item.correctedWord;
      });
    });

    // 检查是否还有未处理的初审项
    const hasUnresolvedInitialItems = computed(() => {
      return reviewType.value === 'initial' && filteredData.value.length > 0;
    });

    // 添加停止处理相关状态变量
    const processingCancelled = ref(false);

    // 添加文档变化检测相关状态
    const documentChangeDetected = ref(false);
    const newDocumentName = ref('');
    const previousProcessedDoc = ref(''); // 存储之前处理过的文档名称，单个字符串
    const isSameAsPreviousDoc = ref(false); // 是否是切回了之前处理过的文档

    // Tab切换处理
    const handleSwitchTab = (type) => {
      // 初审完成后才能切换到复审
      if (type === 'second') {
        if (!initialReviewCompleted.value) {
          message.warning('请先完成初审');
          return;
        }
        if (hasUnresolvedInitialItems.value) {
          message.warning('请先处理完所有初审项');
          return;
        }
      }
      
      // 复审完成后不能再切换
      if (secondReviewCompleted.value) {
        message.warning('当前文档审核已完成');
        return;
      }
      
      // 初审完成后不能再回到初审
      if (type === 'initial' && initialReviewCompleted.value && !canSwitchToInitial.value) {
        message.warning('初审已完成，不能重新初审');
        return;
      }
      
      if (reviewType.value !== type) {
        reviewType.value = type;
        // 切换审核类型后重置纠错数据
        correctionData.value = [];
        replacedItems.value = new Set();
        
        // 如果切换到复审，自动开始处理
        if (type === 'second' && initialReviewCompleted.value) {
          handleStartProcess();
        }
      }
    };
    
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
          const container = resultsContainer.value;
          const containerTop = container.getBoundingClientRect().top;
          const offset = 200; // 顶部预留空间
          window.scrollTo({
            top: window.scrollY + containerTop - offset,
            behavior: 'smooth'
          });
        }
      });
    };
    
    // 启动模拟进度
    const startProgressSimulation = () => {
      // 清除之前的定时器
      if (progressInterval.value) {
        clearInterval(progressInterval.value);
      }
      
      progress.value = 0;
      
      // 设置新的定时器，每100ms增加一点模拟进度，使进度更平滑
      progressInterval.value = setInterval(() => {
        // 进度增量，模拟处理过程
        const maxProgress = 95; // 最大模拟进度到95%，留5%给实际完成
        const slowDownThreshold = 70; // 到70%后放慢速度
        
        let increment = 0.5;
        if (progress.value > slowDownThreshold) {
          increment = 0.2; // 放慢速度
        }
        
        if (progress.value < maxProgress) {
          progress.value += increment;
        } else {
          // 达到最大模拟进度，等待实际处理完成
          clearInterval(progressInterval.value);
          progressInterval.value = null;
        }
      }, 100);
    };
    
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
          // 静默处理定位到段落时出错
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
            content: reviewType.value === 'initial' 
              ? `你是一个专业的初审纠错助手，专注于商务政务类文档的初审。请检查文本中的错误，并提供修正建议。
              
              输入数据中的每个元素包含：
              1. paraID：段落ID
              2. text：完整文本
              
              对于检测到的每一个错误，请返回以下信息：
              1. id: 段落ID
              2. errorWord: 错误的词语
              3. correctedWord: 修正后的词语
              4. context: 包含该词语的上下文
              5. explanation: 错误类型及修正原因的简短解释
              
              初审重点关注以下类型的错误：
              - 政务性差错：不符合政务文件规范的表达
              - 标点符号差错：标点符号使用错误
              - 引用差错：引用格式或内容错误
              - 格式错误：不符合规范的格式
              
              初审要求：
              - 保持政务文件的严肃性和准确性
              - 修正不规范的表达方式
              - 确保标点符号使用符合规范
              - 保证引用内容的准确性和格式正确性
              - 避免对内容进行无意义的修改，尽量结合全文语境
              
              返回格式应为JSON数组，每个元素对应一个错误词语。`
              : `你是一个专业的复审纠错助手，专注于商务政务类文档的复审。请检查文本中的错误，并提供修正建议。
              
              输入数据中的每个元素包含：
              1. paraID：段落ID
              2. text：完整文本
              
              对于检测到的每一个错误，请返回以下信息：
              1. id: 段落ID
              2. errorWord: 错误的词语
              3. correctedWord: 修正后的词语
              4. context: 包含该词语的上下文
              5. explanation: 错误类型及修正原因的简短解释
              
              复审重点关注以下类型的错误：
              - 事实性差错：事实描述不准确
              - 知识性差错：专业知识错误
              - 逻辑性差错：逻辑关系不清或矛盾
              - 字词差错：用词不当、词语搭配不当
              
              复审要求：
              - 确保文档中的事实陈述准确无误
              - 专业术语使用准确、恰当
              - 维护文档的逻辑一致性和连贯性
              - 优化字词使用，提高表达准确性
              - 避免对内容进行无意义的修改，尽量结合全文语境
              
              返回格式应为JSON数组，每个元素对应一个错误词语。`
          },
          {
            role: "user",
            content: `请检查以下JSON格式的文本内容中的错误，根据商务政务文档的标准，找出所有需要纠正的词语，并提供符合政务文书规范的修正建议。返回包含错误信息的JSON数组：\n\n${JSON.stringify(dataForDeepseek)}`
          }
        ];

        // 调用API进行词语纠错 - 使用流式请求
        return new Promise((resolve, reject) => {
          let accumulatedData = '';
          
          retryStreamWordCorrection({
            messages: correctionMessages,
            signal: cancelTokenRef.value?.signal,
            onData: (chunk, accumulated) => {
              accumulatedData = accumulated;
            },
            onError: (error) => {
              console.error('Error fetching correction data:', error);
              reject(error);
            },
            onComplete: (response) => {
              try {
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

                resolve(correctionResults);
              } catch (error) {
                // 静默处理解析错误
                reject(error);
              }
            }
          });
        });
      } catch (error) {
        // 静默处理请求错误
        return [];
      }
    };
    
    // 启动处理流程
    const handleStartProcess = async () => {
      // 先完全重置状态
      restoreOriginalStyle();
      activeCardId.value = null;
      correctionData.value = [];
      originalData.value = []; // 清空原始数据
      replacedItems.value = new Set();
      processComplete.value = false;
      processingCancelled.value = false; // 重置处理取消状态
      documentChangeDetected.value = false; // 重置文档变化检测状态

      // 重置审核状态
      initialReviewCompleted.value = false;
      secondReviewCompleted.value = false;
      reviewType.value = 'initial';
      canSwitchToInitial.value = true;

      // 然后执行原有的处理流程
      cancelTokenRef.value = new AbortController();
      processingRef.value = true;
      loading.value = true;
      showResults.value = true; // 确保显示结果容器
      previousProcessedDoc.value = window.Application?.ActiveDocument?.Name; // 记录当前处理的文档名称

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
      processingStatus.value = `正在检查文档中的${reviewType.value === 'initial' ? '初审' : '复审'}错误...`;

      // 启动进度模拟
      startProgressSimulation();
      
      try {
        // 一次性处理所有段落，不再分批
        // 使用流式处理API
        const batchCorrectionResults = await performWordCorrection(structuredData);
        
        if (!processingRef.value) {
          loading.value = false;
          document.body.style.overflow = '';
          return;
        }
        
        // 更新结果
        correctionData.value = [...correctionData.value, ...batchCorrectionResults];
        
        // 滚动到最新的卡片
        scrollToLastCard();
        
        // 所有处理完成
        processComplete.value = true;
        progress.value = 100; // 确保进度显示100%
        processingBatchInfo.value = '';
        
        // 清除进度模拟
        if (progressInterval.value) {
          clearInterval(progressInterval.value);
          progressInterval.value = null;
        }
        
        // 标记当前审核完成
        if (reviewType.value === 'initial') {
          initialReviewCompleted.value = true;
        } else {
          secondReviewCompleted.value = true;
          canSwitchToInitial.value = false; // 复审完成后不能再回到初审
        }
        
        loading.value = false;
        
        // 恢复页面滚动
        document.body.style.overflow = '';
        
        // 滚动到顶部
        scrollToTop();
      } catch (error) {
        // 静默处理错误
        loading.value = false;
        processingBatchInfo.value = '';
        
        // 恢复页面滚动
        document.body.style.overflow = '';
        
        // 清除进度模拟
        if (progressInterval.value) {
          clearInterval(progressInterval.value);
          progressInterval.value = null;
        }
      }
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
            handleStartProcess();
          } else {
            // 显示文档变化提示
            documentChangeDetected.value = true;
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
      
      // 显示已有的结果
      if (correctionData.value.length === 0) {
        processComplete.value = true;
      }
    };

    // 忽略处理取消提示
    const ignoreProcessingCancelled = () => {
      processingCancelled.value = false;
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

    return {
      // 审核相关状态
      reviewType,
      initialReviewCompleted,
      secondReviewCompleted,
      canSwitchToInitial,
      canRecheck,
      handleSwitchTab,
      
      // 原有状态
      loading,
      processingStatus,
      originalData,
      correctionData,
      showResults,
      replacedItems,
      activeCardId,
      filteredData,
      progressPercentage,
      getOriginalWord,
      getCorrectedWord,
      getContextDisplay,
      handleLocateInDocument,
      handleReplaceItem,
      handleIgnoreItem,
      cardRefs,
      handleStartProcess,
      processingBatchInfo,
      lastCardRef,
      resultsContainer,
      hasUnresolvedInitialItems,
      
      // 添加停止处理相关变量
      processingCancelled,
      handleStopProcessing,
      ignoreProcessingCancelled,
      
      // 添加文档变化检测相关变量
      documentChangeDetected,
      newDocumentName,
      handleReprocessDocument,
      ignoreDocumentChange,
      previousProcessedDoc,
      isSameAsPreviousDoc
    };
  }
};
</script>

<style scoped>
.correction-container {
  padding: 5px;
  padding-top: 20px;
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

/* 停止处理提示样式 */
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

/* 添加Tab样式 */
.review-tabs {
  width: 100%;
  max-width: 500px;
  margin-bottom: 20px;
  position: relative;
}

.tabs-wrapper {
  display: flex;
  background-color: #fff;
  border-radius: 4px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.tooltip-wrapper {
  top: 100%;
  padding-top: 8px;
}

.tooltip-icon {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: #f0f0f0;
  color: #666;
  font-size: 12px;
  cursor: help;
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: 10px 0;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
  position: relative;
  color: #666;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.tab-item .tooltip-icon {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: #f0f0f0;
  color: #666;
  font-size: 12px;
  cursor: help;
  margin-left: 4px;
}

.tab-item.active .tooltip-icon {
  background-color: #e6f7ff;
  color: #1890ff;
}

.tab-item.disabled .tooltip-icon {
  background-color: #f5f5f5;
  color: #d9d9d9;
  cursor: not-allowed;
}

.tab-item:hover:not(.disabled) {
  color: #40a9ff;
}

.status-icon {
  font-size: 12px;
  margin-left: 4px;
  color: #52c41a;
}

.overlay-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.8);
  z-index: 1000;
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
  background-color: #ff4d4f;
  border-radius: 5px;
  transition: width 0.3s ease;
}

.progress-percentage {
  margin: 0;
  color: #333;
  font-size: 18px;
  font-weight: bold;
}

.processing-status {
  margin-top: 10px;
  color: #777;
  font-size: 14px;
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

.loading-container {
  width: 100%;
  max-width: 500px;
  text-align: center;
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