<template>
  <div class="format-container">
    <div v-if="loading" class="loading-container">
      <p v-if="processingStatus" class="processing-status">{{ processingStatus }}</p>
      <div class="spinner"></div>
    </div>
    
    <div v-else class="format-content">
      <div class="format-options">
        <h3>格式化选项</h3>
        
        <div class="option-item">
          <label>
            <input type="checkbox" v-model="options.standardizeSpacing" />
            标准化段落间距
          </label>
        </div>
        
        <div class="option-item">
          <label>
            <input type="checkbox" v-model="options.standardizeIndentation" />
            标准化段落缩进
          </label>
        </div>
        
        <div class="option-item">
          <label>
            <input type="checkbox" v-model="options.standardizeFont" />
            统一字体样式
          </label>
          <div v-if="options.standardizeFont" class="sub-option">
            <select v-model="fontOptions.fontFamily">
              <option value="宋体">宋体</option>
              <option value="黑体">黑体</option>
              <option value="微软雅黑">微软雅黑</option>
              <option value="仿宋">仿宋</option>
              <option value="楷体">楷体</option>
              <option value="Arial">Arial</option>
              <option value="Times New Roman">Times New Roman</option>
            </select>
          </div>
        </div>
        
        <div class="option-item">
          <label>
            <input type="checkbox" v-model="options.standardizeFontSize" />
            统一字号大小
          </label>
          <div v-if="options.standardizeFontSize" class="sub-option">
            <select v-model="fontOptions.fontSize">
              <option value="10">10</option>
              <option value="11">11</option>
              <option value="12">12</option>
              <option value="14">14</option>
              <option value="16">16</option>
              <option value="18">18</option>
              <option value="20">20</option>
              <option value="22">22</option>
            </select>
          </div>
        </div>
        
        <div class="option-item">
          <label>
            <input type="checkbox" v-model="options.standardizeAlignment" />
            段落对齐方式
          </label>
          <div v-if="options.standardizeAlignment" class="sub-option">
            <select v-model="alignmentOption">
              <option value="1">左对齐</option>
              <option value="2">居中</option>
              <option value="3">右对齐</option>
              <option value="4">两端对齐</option>
            </select>
          </div>
        </div>
        
        <div class="option-item">
          <label>
            <input type="checkbox" v-model="options.standardizeLineSpacing" />
            标准化行间距
          </label>
          <div v-if="options.standardizeLineSpacing" class="sub-option">
            <select v-model="lineSpacingOption">
              <option value="1">单倍行距</option>
              <option value="1.5">1.5倍行距</option>
              <option value="2">2倍行距</option>
            </select>
          </div>
        </div>
        
        <div class="option-item custom-format">
          <label>额外格式要求</label>
          <textarea v-model="customFormatRequirements" 
                    placeholder="请输入额外的格式要求，如特定标题格式、图表要求等"
                    rows="4"></textarea>
        </div>
        
        <div class="format-buttons">
          <button class="format-button" @click="handleFormatDocument">应用格式化</button>
        </div>
      </div>
      
      <div class="format-preview">
        <h3>格式化预览</h3>
        <div class="preview-content">
          <p :style="previewStyle">这是一个格式化预览示例段落。您可以在左侧选择不同的格式化选项，右侧将显示应用这些选项后的效果预览。</p>
          <p :style="previewStyle">段落之间的间距、缩进、字体、大小等样式将根据您选择的选项进行调整。</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { message } from 'ant-design-vue';
import { submitOptimization } from '../api/deepseek';
import { isWordDocument } from '../tool/optimization';

export default {
  name: 'ArticleFormatPage',
  setup() {
    // 状态变量
    const loading = ref(false);
    const processingStatus = ref('');
    const activeDocumentName = ref(null);
    const customFormatRequirements = ref('');
    
    // 格式化选项
    const options = ref({
      standardizeSpacing: true,
      standardizeIndentation: true,
      standardizeFont: false,
      standardizeFontSize: false,
      standardizeAlignment: false,
      standardizeLineSpacing: false
    });
    
    // 字体选项
    const fontOptions = ref({
      fontFamily: '微软雅黑',
      fontSize: '12'
    });
    
    // 对齐方式选项 (1: 左对齐, 2: 居中, 3: 右对齐, 4: 两端对齐)
    const alignmentOption = ref('1');
    
    // 行间距选项
    const lineSpacingOption = ref('1.5');
    
    // 预览样式计算属性
    const previewStyle = computed(() => {
      const style = {};
      
      if (options.value.standardizeFont) {
        style.fontFamily = fontOptions.value.fontFamily;
      }
      
      if (options.value.standardizeFontSize) {
        style.fontSize = `${fontOptions.value.fontSize}pt`;
      }
      
      if (options.value.standardizeAlignment) {
        const alignMap = {
          '1': 'left',
          '2': 'center',
          '3': 'right',
          '4': 'justify'
        };
        style.textAlign = alignMap[alignmentOption.value];
      }
      
      if (options.value.standardizeLineSpacing) {
        style.lineHeight = lineSpacingOption.value;
      }
      
      if (options.value.standardizeIndentation) {
        style.textIndent = '2em';
      }
      
      if (options.value.standardizeSpacing) {
        style.marginBottom = '1em';
      }
      
      return style;
    });
    
    // 获取文档XML内容
    const getDocumentXML = () => {
      try {
        const doc = window.Application.ActiveDocument;
        return doc.WordOpenXML;
      } catch (error) {
        console.error('获取文档XML失败:', error);
        return null;
      }
    };
    
    // 从XML中提取body内容
    const extractBodyContent = (xml) => {
      if (!xml) return null;
      
      const bodyStartTag = '<w:body>';
      const bodyEndTag = '</w:body>';
      
      const bodyStartIndex = xml.indexOf(bodyStartTag);
      const bodyEndIndex = xml.indexOf(bodyEndTag) + bodyEndTag.length;
      
      if (bodyStartIndex === -1 || bodyEndIndex === -1) {
        console.error('无法在XML中找到body标签');
        return null;
      }
      
      return xml.substring(bodyStartIndex, bodyEndIndex);
    };

    // 文档格式化处理函数
    const handleFormatDocument = async () => {
      if (!isWordDocument()) {
        message.warning('请先打开Word文档');
        return;
      }
      
      loading.value = true;
      processingStatus.value = '正在准备文档内容...';
      
      try {
        // 获取当前文档的XML内容
        const docXML = getDocumentXML();
        if (!docXML) {
          message.error('无法获取文档内容');
          loading.value = false;
          return;
        }
        
        // 提取body内容
        const bodyContent = extractBodyContent(docXML);
        if (!bodyContent) {
          message.error('无法提取文档内容');
          loading.value = false;
          return;
        }
        
        // 构建格式化要求内容
        const formatRequirements = [];
        
        if (options.value.standardizeSpacing) {
          formatRequirements.push('段落间距: 段后间距6磅');
        }
        
        if (options.value.standardizeIndentation) {
          formatRequirements.push('段落缩进: 首行缩进2字符');
        }
        
        if (options.value.standardizeFont) {
          formatRequirements.push(`字体: ${fontOptions.value.fontFamily}`);
        }
        
        if (options.value.standardizeFontSize) {
          formatRequirements.push(`字号: ${fontOptions.value.fontSize}磅`);
        }
        
        if (options.value.standardizeAlignment) {
          const alignMap = {
            '1': '左对齐',
            '2': '居中',
            '3': '右对齐',
            '4': '两端对齐'
          };
          formatRequirements.push(`对齐方式: ${alignMap[alignmentOption.value]}`);
        }
        
        if (options.value.standardizeLineSpacing) {
          formatRequirements.push(`行间距: ${lineSpacingOption.value}倍行距`);
        }
        
        // 添加用户自定义格式要求
        if (customFormatRequirements.value.trim()) {
          formatRequirements.push(`自定义要求: ${customFormatRequirements.value.trim()}`);
        }
        
        // 构建消息内容
        processingStatus.value = '正在处理格式化请求...';
        const messages = [
          {
            role: "system",
            content: "你是一个专业的文档格式化助手，负责按照用户的要求对Word文档的XML内容进行格式化处理。"
          },
          {
            role: "user",
            content: `请根据以下格式化要求对Word文档的XML内容进行修改。只需要返回修改后的<w:body>...</w:body>部分(包含body标签)，不要添加任何解释或说明，也不要返回body以外的其他XML内容。
            
格式化要求:
${formatRequirements.join('\n')}

原始XML内容:
${bodyContent}`
          }
        ];
        
        // 调用AI接口处理格式化
        const response = await submitOptimization({
          messages: messages
        });
        
        if (!response.data || !response.data.choices || !response.data.choices.length) {
          throw new Error('API返回结果无效');
        }
        
        // 获取API返回的格式化后的XML内容
        const formattedXML = response.data.choices[0].message.content.trim();
        
        processingStatus.value = '正在应用格式化结果...';
        
        // 将格式化后的内容应用到文档
        const doc = window.Application.ActiveDocument;
        doc.Content.Text = ''; // 清空文档内容
        doc.Content.InsertXML(formattedXML); // 插入格式化后的内容
        
        // 完成格式化
        doc.Sync.PutUpdate();
        message.success('文档格式化完成');
      } catch (error) {
        console.error('格式化文档时出错:', error);
        message.error('格式化文档失败，请重试');
      } finally {
        loading.value = false;
        processingStatus.value = '';
      }
    };
    
    // 监听文档名称变化
    const checkDocumentName = () => {
      if (isWordDocument()) {
        const currentDocName = window.Application.ActiveDocument?.Name;
        if (activeDocumentName.value !== currentDocName) {
          activeDocumentName.value = currentDocName;
        }
      }
    };
    
    let intervalId = null;
    
    onMounted(() => {
      // 初始设置文档名
      if (isWordDocument()) {
        activeDocumentName.value = window.Application.ActiveDocument?.Name;
      }
      
      // 设置定时检查
      intervalId = setInterval(checkDocumentName, 1000);
    });
    
    onBeforeUnmount(() => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    });
    
    return {
      loading,
      processingStatus,
      options,
      fontOptions,
      alignmentOption,
      lineSpacingOption,
      customFormatRequirements,
      previewStyle,
      handleFormatDocument
    };
  }
};
</script>

<style scoped>
.format-container {
  padding: 15px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: #f0f2f5;
  color: #333;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.loading-container {
  width: 100%;
  text-align: center;
  color: #333;
  margin-top: 20px;
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

.format-content {
  display: flex;
  flex-direction: row;
  gap: 20px;
  margin-top: 10px;
}

.format-options, .format-preview {
  background: white;
  border-radius: 4px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  flex: 1;
}

.format-options h3, .format-preview h3 {
  margin-top: 0;
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e8e8e8;
  color: #333;
}

.option-item {
  margin-bottom: 15px;
  display: flex;
  flex-direction: column;
}

.option-item label {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.option-item input[type="checkbox"] {
  margin-right: 8px;
}

.sub-option {
  margin-top: 8px;
  margin-left: 25px;
}

.sub-option select {
  width: 100%;
  padding: 6px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background-color: white;
}

.custom-format {
  margin-top: 15px;
}

.custom-format label {
  margin-bottom: 8px;
  display: block;
}

.custom-format textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  resize: vertical;
  font-family: inherit;
}

.format-buttons {
  margin-top: 25px;
  display: flex;
  justify-content: center;
}

.format-button {
  padding: 8px 16px;
  background-color: #1890ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.3s;
}

.format-button:hover {
  background-color: #40a9ff;
}

.preview-content {
  padding: 15px;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  background-color: #fafafa;
  min-height: 200px;
}

@media (max-width: 768px) {
  .format-content {
    flex-direction: column;
  }
}
</style> 