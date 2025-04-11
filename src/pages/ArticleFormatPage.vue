<template>
  <div class="format-container">
    <div class="format-content">
      <div class="rules-section">
        <h2>规则基础设置</h2>
        
        <div class="form-group">
          <div class="form-label">名称</div>
          <input type="text" v-model="ruleName" placeholder="新建规则" class="form-input" />
        </div>
        
        <div class="form-group">
          <div class="form-label">描述</div>
          <textarea v-model="description" placeholder="无" class="form-textarea"></textarea>
        </div>
        
        <div class="form-group margin-settings">
          <div class="form-label">页边距</div>
          <div class="margin-inputs">
            <div class="margin-input-group">
              <label>上</label>
              <input type="number" v-model="margins.top" class="margin-input" />
            </div>
            <div class="margin-input-group">
              <label>下</label>
              <input type="number" v-model="margins.bottom" class="margin-input" />
            </div>
            <div class="margin-input-group">
              <label>左</label>
              <input type="number" v-model="margins.left" class="margin-input" />
            </div>
            <div class="margin-input-group">
              <label>右</label>
              <input type="number" v-model="margins.right" class="margin-input" />
            </div>
          </div>
        </div>

        <div class="form-group">
          <div class="form-label">奇偶页码</div>
          <div class="switch-container">
            <input type="checkbox" v-model="oddEvenPages" class="switch-input" />
          </div>
        </div>

        <div class="form-group">
          <div class="form-label">22x28</div>
          <div class="switch-container">
            <input type="checkbox" v-model="is22x28" class="switch-input" />
          </div>
        </div>

        <div class="rules-table">
          <h3>排版规则</h3>
          <table>
            <thead>
              <tr>
                <th>名称</th>
                <th>大纲</th>
                <th>匹配规则</th>
                <th>中文字体</th>
                <th>英文和数字字体</th>
                <th>字号</th>
                <th>缩进</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>文件标题</td>
                <td>
                  <select v-model="rules.title.outline" class="rule-select">
                    <option value="正文">正文</option>
                  </select>
                </td>
                <td>正则语法</td>
                <td>
                  <select v-model="rules.title.chineseFont" class="rule-select">
                    <option value="方正小标宋_GBK">方正小标宋_GBK</option>
                  </select>
                </td>
                <td>
                  <select v-model="rules.title.englishFont" class="rule-select">
                    <option value="Times New Roman">Times New Roman</option>
                  </select>
                </td>
                <td>
                  <input type="number" v-model="rules.title.fontSize" class="rule-input" />
                </td>
                <td>
                  <input type="number" v-model="rules.title.indent" class="rule-input" />
                </td>
              </tr>
              <tr>
                <td>副标题</td>
                <td>
                  <select v-model="rules.subtitle.outline" class="rule-select">
                    <option value="正文">正文</option>
                  </select>
                </td>
                <td>正则语法</td>
                <td>
                  <select v-model="rules.subtitle.chineseFont" class="rule-select">
                    <option value="方正楷体_GBK">方正楷体_GBK</option>
                  </select>
                </td>
                <td>
                  <select v-model="rules.subtitle.englishFont" class="rule-select">
                    <option value="Times New Roman">Times New Roman</option>
                  </select>
                </td>
                <td>
                  <input type="number" v-model="rules.subtitle.fontSize" class="rule-input" />
                </td>
                <td>
                  <input type="number" v-model="rules.subtitle.indent" class="rule-input" />
                </td>
              </tr>
              <tr>
                <td>正文</td>
                <td>
                  <select v-model="rules.body.outline" class="rule-select">
                    <option value="正文">正文</option>
                  </select>
                </td>
                <td>正则语法</td>
                <td>
                  <select v-model="rules.body.chineseFont" class="rule-select">
                    <option value="方正仿宋_GBK">方正仿宋_GBK</option>
                  </select>
                </td>
                <td>
                  <select v-model="rules.body.englishFont" class="rule-select">
                    <option value="Times New Roman">Times New Roman</option>
                  </select>
                </td>
                <td>
                  <input type="number" v-model="rules.body.fontSize" class="rule-input" />
                </td>
                <td>
                  <input type="number" v-model="rules.body.indent" class="rule-input" />
                </td>
              </tr>
            </tbody>
          </table>
          <button class="add-rule-btn">添加一条规则</button>
        </div>

        <div class="action-buttons">
          <button class="save-btn">保存本组设置</button>
          <button class="delete-btn">删除本组规则</button>
          <button class="apply-btn" @click="applyFormatting()">应用排版</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref } from 'vue';
import { submitStreamFormatting } from '../api/deepseek';

export default {
  name: 'ArticleFormatPage',
  setup() {
    const ruleName = ref('新建规则');
    const description = ref('');
    const margins = ref({
      top: 37,
      bottom: 35,
      left: 28,
      right: 26
    });
    const oddEvenPages = ref(false);
    const is22x28 = ref(false);

    const rules = ref({
      title: {
        outline: '正文',
        chineseFont: '方正小标宋_GBK',
        englishFont: 'Times New Roman',
        fontSize: 22,
        indent: 0
      },
      subtitle: {
        outline: '正文',
        chineseFont: '方正楷体_GBK',
        englishFont: 'Times New Roman',
        fontSize: 16,
        indent: 0
      },
      body: {
        outline: '正文',
        chineseFont: '方正仿宋_GBK',
        englishFont: 'Times New Roman',
        fontSize: 16,
        indent: 2
      }
    });

    // 获取当前文档的XML内容
    const getDocumentXML = () => {
      // 假设WPS插件API提供了获取文档XML的方法
      try {
        if (window.Application && window.Application.ActiveDocument) {
          // 这里需要根据实际WPS API调用适当的方法获取XML
          // 这是一个示例，实际实现可能不同
          return window.Application.ActiveDocument.getXML();
        }
        return '';
      } catch (error) {
        console.error('获取文档XML失败:', error);
        return '';
      }
    };

    // 应用格式化
    const applyFormatting = async () => {
      try {
        // 获取当前文档的XML
        const documentXML = getDocumentXML();
        
        // 准备发送到后端的数据
        const formattingData = {
          xml: documentXML,
          ruleName: ruleName.value,
          description: description.value,
          margins: margins.value,
          oddEvenPages: oddEvenPages.value,
          is22x28: is22x28.value,
          rules: rules.value
        };
        
        // 创建消息格式
        const messages = [
          {
            role: "system",
            content: "你是一个专业的文档排版助手。"
          },
          {
            role: "user",
            content: `请根据以下规则对文档进行排版：${JSON.stringify(formattingData)}`
          }
        ];
        
        // 发送请求到后端
        const controller = new AbortController();
        const response = await submitStreamFormatting({
          messages,
          signal: controller.signal
        });
        
        // 处理响应
        if (response && response.data) {
          // 假设后端返回了处理后的XML
          const processedXML = response.data;
          
          // 插入处理后的XML
          insertProcessedXML(processedXML);
          
          // 应用页面设置
          applyPageSetup();
        }
      } catch (error) {
        console.error('应用排版失败:', error);
        alert('应用排版失败，请重试');
      }
    };
    
    // 插入处理后的XML
    const insertProcessedXML = (xml) => {
      try {
        if (window.Application && window.Application.ActiveDocument) {
          // 插入XML到文档
          // 这是一个示例，实际实现可能不同
          window.Application.ActiveDocument.insertXML(xml);
        }
      } catch (error) {
        console.error('插入XML失败:', error);
      }
    };
    
    // 应用页面设置
    const applyPageSetup = () => {
      try {
        if (window.Application && window.Application.ActiveDocument) {
          // 设置页面边距（WPS单位是磅，1厘米约等于28.35磅）
          window.Application.ActiveDocument.PageSetup.TopMargin = margins.value.top * 28.35;
          window.Application.ActiveDocument.PageSetup.BottomMargin = margins.value.bottom * 28.35;
          window.Application.ActiveDocument.PageSetup.LeftMargin = margins.value.left * 28.35;
          window.Application.ActiveDocument.PageSetup.RightMargin = margins.value.right * 28.35;
          
          // 设置奇偶页码
          if (oddEvenPages.value) {
            window.Application.ActiveDocument.PageSetup.OddAndEvenPagesHeaderFooter = true;
          } else {
            window.Application.ActiveDocument.PageSetup.OddAndEvenPagesHeaderFooter = false;
          }
          
          // 设置页面大小
          if (is22x28.value) {
            // 假设22x28指的是页面大小(厘米)
            window.Application.ActiveDocument.PageSetup.PageWidth = 22 * 28.35;
            window.Application.ActiveDocument.PageSetup.PageHeight = 28 * 28.35;
          }
        }
      } catch (error) {
        console.error('应用页面设置失败:', error);
      }
    };

    return {
      ruleName,
      description,
      margins,
      oddEvenPages,
      is22x28,
      rules,
      applyFormatting
    };
  }
};
</script>

<style scoped>
.format-container {
  padding: 20px;
  background-color: #fff;
  color: #262626;
}

.format-content {
  max-width: 1200px;
  margin: 0 auto;
}

.rules-section h2 {
  margin-bottom: 20px;
  font-size: 18px;
  font-weight: normal;
  color: #262626;
}

.form-group {
  margin-bottom: 20px;
}

.form-label {
  margin-bottom: 8px;
  color: #262626;
  font-weight: 500;
}

.form-input, .form-textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid #d9d9d9;
  border-radius: 2px;
  color: #262626;
}

.form-textarea {
  height: 80px;
  resize: vertical;
}

.margin-settings {
  margin-top: 20px;
}

.margin-inputs {
  display: flex;
  gap: 20px;
}

.margin-input-group {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.margin-input-group label {
  color: #262626;
}

.margin-input {
  width: 60px;
  padding: 4px;
  text-align: center;
  border: 1px solid #d9d9d9;
  border-radius: 2px;
  color: #262626;
}

.switch-container {
  display: inline-block;
}

.switch-input {
  position: relative;
  width: 40px;
  height: 20px;
  appearance: none;
  background-color: #bfbfbf;
  border-radius: 10px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.switch-input:checked {
  background-color: #1890ff;
}

.switch-input::before {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background-color: #fff;
  border-radius: 50%;
  transition: left 0.3s;
}

.switch-input:checked::before {
  left: 22px;
}

.rules-table {
  margin-top: 30px;
}

.rules-table h3 {
  margin-bottom: 15px;
  font-size: 16px;
  font-weight: normal;
  color: #262626;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th, td {
  padding: 12px 8px;
  border: 1px solid #e8e8e8;
  text-align: left;
  color: #262626;
}

th {
  background-color: #fafafa;
  font-weight: 500;
  color: #262626;
}

.rule-select, .rule-input {
  width: 100%;
  padding: 4px;
  border: 1px solid #d9d9d9;
  border-radius: 2px;
  color: #262626;
}

.add-rule-btn {
  margin-top: 15px;
  padding: 8px 16px;
  color: #1890ff;
  border: 1px solid #1890ff;
  background: transparent;
  border-radius: 2px;
  cursor: pointer;
}

.action-buttons {
  margin-top: 30px;
  display: flex;
  gap: 15px;
  justify-content: center;
}

.save-btn, .delete-btn, .apply-btn {
  padding: 8px 24px;
  border: none;
  border-radius: 2px;
  cursor: pointer;
}

.save-btn {
  background-color: #1890ff;
  color: white;
}

.delete-btn {
  background-color: #ff4d4f;
  color: white;
}

.apply-btn {
  background-color: #52c41a;
  color: white;
}

.save-btn:hover {
  background-color: #40a9ff;
}

.delete-btn:hover {
  background-color: #ff7875;
}

.apply-btn:hover {
  background-color: #73d13d;
}
</style> 