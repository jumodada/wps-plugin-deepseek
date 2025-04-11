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
          <div class="table-wrapper">
            <table>
              <colgroup>
                <col style="width: 100px" />
                <col style="width: 100px" />
                <col style="width: 150px" />
                <col style="width: 150px" />
                <col style="width: 150px" />
                <col style="width: 80px" />
                <col style="width: 80px" />
                <col style="width: 100px" />
                <col style="width: 60px" />
                <col style="width: 60px" />
                <col style="width: 60px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="sticky-col">名称</th>
                  <th>大纲</th>
                  <th>匹配规则</th>
                  <th>中文字体</th>
                  <th>英文和数字字体</th>
                  <th>字号</th>
                  <th>缩进</th>
                  <th>颜色</th>
                  <th>加粗</th>
                  <th>斜体</th>
                  <th>波浪线</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="sticky-col">文件标题</td>
                  <td>
                    <select v-model="rules.title.outline" class="rule-select">
                      <option value="正文">正文</option>
                    </select>
                  </td>
                  <td>
                    <input type="text" v-model="rules.title.regex" placeholder="正则表达式" class="rule-input" />
                  </td>
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
                  <td>
                    <input type="color" v-model="rules.title.color" class="color-input" />
                  </td>
                  <td class="checkbox-cell">
                    <input type="checkbox" v-model="rules.title.bold" />
                  </td>
                  <td class="checkbox-cell">
                    <input type="checkbox" v-model="rules.title.italic" />
                  </td>
                  <td class="checkbox-cell">
                    <input type="checkbox" v-model="rules.title.underline" />
                  </td>
                </tr>
                <tr>
                  <td class="sticky-col">副标题</td>
                  <td>
                    <select v-model="rules.subtitle.outline" class="rule-select">
                      <option value="正文">正文</option>
                    </select>
                  </td>
                  <td>
                    <input type="text" v-model="rules.subtitle.regex" placeholder="正则表达式" class="rule-input" />
                  </td>
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
                  <td>
                    <input type="color" v-model="rules.subtitle.color" class="color-input" />
                  </td>
                  <td class="checkbox-cell">
                    <input type="checkbox" v-model="rules.subtitle.bold" />
                  </td>
                  <td class="checkbox-cell">
                    <input type="checkbox" v-model="rules.subtitle.italic" />
                  </td>
                  <td class="checkbox-cell">
                    <input type="checkbox" v-model="rules.subtitle.underline" />
                  </td>
                </tr>
                <tr>
                  <td class="sticky-col">正文</td>
                  <td>
                    <select v-model="rules.body.outline" class="rule-select">
                      <option value="正文">正文</option>
                    </select>
                  </td>
                  <td>
                    <input type="text" v-model="rules.body.regex" placeholder="正则表达式" class="rule-input" />
                  </td>
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
                  <td>
                    <input type="color" v-model="rules.body.color" class="color-input" />
                  </td>
                  <td class="checkbox-cell">
                    <input type="checkbox" v-model="rules.body.bold" />
                  </td>
                  <td class="checkbox-cell">
                    <input type="checkbox" v-model="rules.body.italic" />
                  </td>
                  <td class="checkbox-cell">
                    <input type="checkbox" v-model="rules.body.underline" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <button class="add-rule-btn">添加一条规则</button>
        </div>

        <div class="action-buttons">
          <button class="save-btn" @click="saveRule">保存本组设置</button>
          <button class="delete-btn" @click="deleteRule">删除本组规则</button>
          <button class="apply-btn" @click="applyFormatting()">应用排版</button>
          <button class="close-btn" @click="closeDialog()">完成</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';
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
        regex: '',
        chineseFont: '方正小标宋_GBK',
        englishFont: 'Times New Roman',
        fontSize: 22,
        indent: 0,
        color: '#000000',
        bold: true,
        italic: false,
        underline: false
      },
      subtitle: {
        outline: '正文',
        regex: '',
        chineseFont: '方正楷体_GBK',
        englishFont: 'Times New Roman',
        fontSize: 16,
        indent: 0,
        color: '#000000',
        bold: false,
        italic: false,
        underline: false
      },
      body: {
        outline: '正文',
        regex: '',
        chineseFont: '方正仿宋_GBK',
        englishFont: 'Times New Roman',
        fontSize: 16,
        indent: 2,
        color: '#000000',
        bold: false,
        italic: false,
        underline: false
      }
    });
    
    // 在组件挂载时加载保存的规则
    onMounted(() => {
      loadSavedRule();
    });
    
    // 加载保存的规则
    const loadSavedRule = () => {
      try {
        const savedRules = localStorage.getItem('formattingRules');
        if (savedRules) {
          const rulesArray = JSON.parse(savedRules);
          // 如果有保存的规则，加载第一个
          if (rulesArray.length > 0) {
            const savedRule = rulesArray[0];
            ruleName.value = savedRule.name;
            description.value = savedRule.description || '';
            margins.value = savedRule.margins || {
              top: 37,
              bottom: 35,
              left: 28,
              right: 26
            };
            oddEvenPages.value = savedRule.oddEvenPages || false;
            is22x28.value = savedRule.is22x28 || false;
            // 合并规则，保留默认值
            if (savedRule.rules) {
              Object.keys(savedRule.rules).forEach(key => {
                if (rules.value[key]) {
                  rules.value[key] = { ...rules.value[key], ...savedRule.rules[key] };
                }
              });
            }
          }
        }
      } catch (error) {
        console.error('加载规则失败:', error);
      }
    };
    
    // 保存规则
    const saveRule = () => {
      try {
        if (!ruleName.value.trim()) {
          alert('请输入规则名称');
          return;
        }
        
        const ruleToSave = {
          name: ruleName.value,
          description: description.value,
          margins: margins.value,
          oddEvenPages: oddEvenPages.value,
          is22x28: is22x28.value,
          rules: rules.value
        };
        
        // 获取已保存的规则
        let savedRules = [];
        const savedRulesStr = localStorage.getItem('formattingRules');
        if (savedRulesStr) {
          savedRules = JSON.parse(savedRulesStr);
        }
        
        // 检查是否已存在同名规则
        const existingIndex = savedRules.findIndex(rule => rule.name === ruleName.value);
        if (existingIndex !== -1) {
          // 更新已存在的规则
          savedRules[existingIndex] = ruleToSave;
        } else {
          // 添加新规则
          savedRules.push(ruleToSave);
        }
        
        // 保存规则
        localStorage.setItem('formattingRules', JSON.stringify(savedRules));
        alert('规则保存成功');
      } catch (error) {
        console.error('保存规则失败:', error);
        alert('保存规则失败，请重试');
      }
    };
    
    // 删除规则
    const deleteRule = () => {
      try {
        if (!ruleName.value.trim()) {
          alert('请选择要删除的规则');
          return;
        }
        
        const savedRulesStr = localStorage.getItem('formattingRules');
        if (savedRulesStr) {
          const savedRules = JSON.parse(savedRulesStr);
          const updatedRules = savedRules.filter(rule => rule.name !== ruleName.value);
          
          if (savedRules.length === updatedRules.length) {
            alert('未找到要删除的规则');
            return;
          }
          
          localStorage.setItem('formattingRules', JSON.stringify(updatedRules));
          alert('规则删除成功');
          
          // 清空当前规则或加载其他规则
          if (updatedRules.length > 0) {
            ruleName.value = updatedRules[0].name;
            description.value = updatedRules[0].description || '';
            margins.value = updatedRules[0].margins || {
              top: 37,
              bottom: 35,
              left: 28,
              right: 26
            };
            oddEvenPages.value = updatedRules[0].oddEvenPages || false;
            is22x28.value = updatedRules[0].is22x28 || false;
            
            if (updatedRules[0].rules) {
              Object.keys(updatedRules[0].rules).forEach(key => {
                if (rules.value[key]) {
                  rules.value[key] = { ...rules.value[key], ...updatedRules[0].rules[key] };
                }
              });
            }
          } else {
            // 重置为默认值
            ruleName.value = '新建规则';
            description.value = '';
            margins.value = {
              top: 37,
              bottom: 35,
              left: 28,
              right: 26
            };
            oddEvenPages.value = false;
            is22x28.value = false;
            rules.value = {
              title: {
                outline: '正文',
                regex: '',
                chineseFont: '方正小标宋_GBK',
                englishFont: 'Times New Roman',
                fontSize: 22,
                indent: 0,
                color: '#000000',
                bold: true,
                italic: false,
                underline: false
              },
              subtitle: {
                outline: '正文',
                regex: '',
                chineseFont: '方正楷体_GBK',
                englishFont: 'Times New Roman',
                fontSize: 16,
                indent: 0,
                color: '#000000',
                bold: false,
                italic: false,
                underline: false
              },
              body: {
                outline: '正文',
                regex: '',
                chineseFont: '方正仿宋_GBK',
                englishFont: 'Times New Roman',
                fontSize: 16,
                indent: 2,
                color: '#000000',
                bold: false,
                italic: false,
                underline: false
              }
            };
          }
        } else {
          alert('没有已保存的规则');
        }
      } catch (error) {
        console.error('删除规则失败:', error);
        alert('删除规则失败，请重试');
      }
    };

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
          
          // 应用文本格式设置
          applyTextFormatting();
        }
      } catch (error) {
        console.error('应用排版失败:', error);
        alert('应用排版失败，请重试');
      }
    };
    
    // 应用文本格式设置（加粗、斜体、颜色等）
    const applyTextFormatting = () => {
      try {
        if (window.Application && window.Application.ActiveDocument) {
          const doc = window.Application.ActiveDocument;
          
          // 应用标题格式
          if (rules.value.title.regex) {
            applyFormatToMatches(doc, rules.value.title.regex, {
              bold: rules.value.title.bold,
              italic: rules.value.title.italic,
              underline: rules.value.title.underline,
              color: rules.value.title.color
            });
          }
          
          // 应用副标题格式
          if (rules.value.subtitle.regex) {
            applyFormatToMatches(doc, rules.value.subtitle.regex, {
              bold: rules.value.subtitle.bold,
              italic: rules.value.subtitle.italic,
              underline: rules.value.subtitle.underline,
              color: rules.value.subtitle.color
            });
          }
          
          // 应用正文格式
          if (rules.value.body.regex) {
            applyFormatToMatches(doc, rules.value.body.regex, {
              bold: rules.value.body.bold,
              italic: rules.value.body.italic,
              underline: rules.value.body.underline,
              color: rules.value.body.color
            });
          }
        }
      } catch (error) {
        console.error('应用文本格式设置失败:', error);
      }
    };
    
    // 为匹配正则表达式的文本应用格式
    const applyFormatToMatches = (doc, regex, format) => {
      try {
        // 创建正则表达式对象
        const regexObj = new RegExp(regex, 'g');
        
        // 获取文档内容
        const content = doc.Content.Text;
        
        // 查找所有匹配项
        let match;
        while ((match = regexObj.exec(content)) !== null) {
          // 创建Range对象，设置其位置为匹配项的位置
          const range = doc.Range(match.index, match.index + match[0].length);
          
          // 应用格式
          if (format.bold !== undefined) {
            range.Bold = format.bold;
          }
          
          if (format.italic !== undefined) {
            range.Italic = format.italic;
          }
          
          if (format.underline !== undefined) {
            range.Underline = format.underline ? 1 : 0; // 1表示单下划线，0表示无下划线
          }
          
          if (format.color) {
            // 将十六进制颜色转换为WPS能理解的颜色
            const hexToRgb = (hex) => {
              const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
              return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
              } : null;
            };
            
            const rgb = hexToRgb(format.color);
            if (rgb) {
              // 将RGB转换为WPS颜色值
              const wpsColor = rgb.r + (rgb.g * 256) + (rgb.b * 65536);
              range.Font.Color = wpsColor;
            }
          }
        }
      } catch (error) {
        console.error('应用文本格式设置失败:', error);
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
    
    // 关闭对话框
    const closeDialog = () => {
      if (window.Application && window.Application.ActiveDocument) {
        // 使用WPS API关闭当前对话框
        window.Application.CloseDialog();
      }
    };

    return {
      ruleName,
      description,
      margins,
      oddEvenPages,
      is22x28,
      rules,
      applyFormatting,
      closeDialog,
      saveRule,
      deleteRule
    };
  }
};
</script>

<style scoped>
.format-container {
  padding: 15px;
  background-color: #fff;
  color: #262626;
  height: 100%;
  width: 100%;
  min-width: 1000px;
  overflow-y: auto;
  box-sizing: border-box;
}

.format-content {
  width: 100%;
  box-sizing: border-box;
}

.rules-section h2 {
  margin-bottom: 15px;
  font-size: 18px;
  font-weight: normal;
  color: #262626;
}

.form-group {
  margin-bottom: 15px;
}

.form-label {
  margin-bottom: 5px;
  color: #262626;
  font-weight: 500;
}

.form-input, .form-textarea {
  width: 100%;
  padding: 6px;
  border: 1px solid #d9d9d9;
  border-radius: 2px;
  color: #262626;
}

.form-textarea {
  height: 60px;
  resize: vertical;
}

.margin-settings {
  margin-top: 15px;
}

.margin-inputs {
  display: flex;
  gap: 15px;
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
  margin-top: 20px;
}

.rules-table h3 {
  margin-bottom: 10px;
  font-size: 16px;
  font-weight: normal;
  color: #262626;
}

.table-wrapper {
  overflow-x: auto;
  margin-bottom: 10px;
  width: 100%;
  position: relative;
}

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.sticky-col {
  position: sticky;
  left: 0;
  background-color: #fff;
  z-index: 1;
  box-shadow: 2px 0 5px rgba(0,0,0,0.1);
}

th.sticky-col {
  background-color: #fafafa;
}

th, td {
  padding: 8px 6px;
  border: 1px solid #e8e8e8;
  text-align: left;
  color: #262626;
  font-size: 14px;
  word-wrap: break-word;
  overflow-wrap: break-word;
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
  font-size: 14px;
}

.add-rule-btn {
  margin-top: 10px;
  padding: 6px 12px;
  color: #1890ff;
  border: 1px solid #1890ff;
  background: transparent;
  border-radius: 2px;
  cursor: pointer;
  font-size: 14px;
}

.action-buttons {
  margin-top: 20px;
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.save-btn, .delete-btn, .apply-btn, .close-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 2px;
  cursor: pointer;
  font-size: 14px;
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

.close-btn {
  background-color: #8c8c8c;
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

.close-btn:hover {
  background-color: #a6a6a6;
}

.color-input {
  width: 100%;
  height: 24px;
  padding: 0;
  border: 1px solid #d9d9d9;
  border-radius: 2px;
  cursor: pointer;
}

.checkbox-cell {
  text-align: center;
}

.checkbox-cell input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}
</style> 