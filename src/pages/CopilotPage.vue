<template>
  <div class="copilot-wrap">
    <!-- Chat messages -->
    <div class="chat-area" ref="chatArea">
      <div v-if="messages.length === 0" class="welcome">
        <div class="welcome-icon">🤖</div>
        <p>你好！我是 AI 写作助手。</p>
        <p>选中文档中的文字，然后告诉我如何修改；<br>或者直接让我插入新内容。</p>
      </div>

      <template v-for="(msg, idx) in messages" :key="idx">
        <div class="msg-row" :class="msg.role">
          <div class="bubble" :class="msg.role">
            <span v-html="renderText(msg.content)"></span>
            <span v-if="msg.action === 'replace'" class="action-tag replace">✅ 已替换到文档</span>
            <span v-else-if="msg.action === 'insert'" class="action-tag insert">✅ 已插入到文档</span>
            <span v-else-if="msg.action === 'format'" class="action-tag format">✅ 已应用格式</span>
          </div>
        </div>
      </template>

      <div v-if="loading" class="msg-row assistant">
        <div class="bubble assistant typing">
          <span class="dot"></span><span class="dot"></span><span class="dot"></span>
        </div>
      </div>
    </div>

    <!-- Selected text indicator -->
    <div v-if="contextText" class="context-bar">
      <span class="ctx-icon">📎</span>
      <span class="ctx-label">已选中：</span>
      <span class="ctx-preview">{{ contextText.length > 45 ? contextText.slice(0, 45) + '…' : contextText }}</span>
      <span class="ctx-clear" @click="contextText = ''" title="清除">✕</span>
    </div>

    <!-- Input area -->
    <div class="input-area">
      <textarea
        v-model="draft"
        ref="inputEl"
        placeholder="输入消息… (Enter 发送，Shift+Enter 换行)"
        :disabled="loading"
        @keydown.enter.exact.prevent="send"
        @keydown.shift.enter.exact="draft += '\n'"
      ></textarea>
      <button class="send-btn" :disabled="loading || !draft.trim()" @click="send">发送</button>
    </div>
  </div>
</template>

<script>
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue';

const API_BASE = import.meta.env.VITE_COPILOT_API_URL || 'http://localhost:8000';

export default {
  name: 'CopilotPage',
  setup() {
    const messages = ref([]);
    const draft = ref('');
    const loading = ref(false);
    const contextText = ref('');
    const chatArea = ref(null);
    const inputEl = ref(null);
    let ctxTimer = null;

    const scrollBottom = () => {
      nextTick(() => {
        if (chatArea.value) chatArea.value.scrollTop = chatArea.value.scrollHeight;
      });
    };

    const renderText = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

    const getSelectionText = () => {
      try {
        const s = window.Application?.Selection;
        const t = s?.Text?.trim?.();
        return t || '';
      } catch { return ''; }
    };

    // Silently poll WPS selection every 1.5s
    const pollContext = () => {
      const t = getSelectionText();
      if (t) contextText.value = t;
    };

    const executeAction = (action, newContent) => {
      if (!newContent) return;
      try {
        const sel = window.Application.Selection;

        if (action === 'replace') {
          sel.TypeText(newContent);

        } else if (action === 'insert') {
          sel.InsertAfter(newContent);

        } else if (action === 'format') {
          const params = JSON.parse(newContent);

          // 字符格式
          if (params.fontName  !== undefined) sel.Font.Name      = params.fontName;
          if (params.fontSize  !== undefined) sel.Font.Size      = params.fontSize;
          if (params.bold      !== undefined) sel.Font.Bold      = params.bold;
          if (params.italic    !== undefined) sel.Font.Italic    = params.italic;
          if (params.underline !== undefined) sel.Font.Underline = params.underline ? 1 : 0;

          // 段落格式（数字硬编码，不用 WPS 枚举名）
          const pf = sel.ParagraphFormat;
          if (params.spaceBefore     !== undefined) pf.SpaceBefore     = params.spaceBefore;
          if (params.spaceAfter      !== undefined) pf.SpaceAfter      = params.spaceAfter;
          // lineSpacingRule: 0=单倍 1=1.5倍 2=双倍 3=最小值 4=固定值 5=多倍
          if (params.lineSpacingRule !== undefined) pf.LineSpacingRule = params.lineSpacingRule;
          if (params.lineSpacing     !== undefined) pf.LineSpacing     = params.lineSpacing;
          // alignment: 0=左 1=居中 2=右 3=两端
          if (params.alignment       !== undefined) pf.Alignment       = params.alignment;
          if (params.firstLineIndent !== undefined) pf.FirstLineIndent = params.firstLineIndent;
          if (params.leftIndent      !== undefined) pf.LeftIndent      = params.leftIndent;
          if (params.rightIndent     !== undefined) pf.RightIndent     = params.rightIndent;
        }
      } catch (e) {
        console.error('WPS JSAPI error:', e);
      }
    };

    const send = async () => {
      const text = draft.value.trim();
      if (!text || loading.value) return;

      // Snapshot context at send time (latest selection or manually cleared)
      const snapshotCtx = contextText.value || getSelectionText();

      messages.value.push({ role: 'user', content: text });
      draft.value = '';
      loading.value = true;
      scrollBottom();

      // Build history payload (role + content only, no internal fields)
      const payload = {
        messages: messages.value
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role, content: m.content })),
        context_text: snapshotCtx,
      };

      try {
        const resp = await fetch(`${API_BASE}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          const err = await resp.text();
          throw new Error(`服务器错误 ${resp.status}：${err}`);
        }

        const data = await resp.json();
        const { reply, action, new_content } = data;

        // Execute WPS document action before showing reply
        if (action && action !== 'none') {
          executeAction(action, new_content);
          if (action === 'replace') contextText.value = '';
        }

        messages.value.push({ role: 'assistant', content: reply, action });
      } catch (e) {
        messages.value.push({
          role: 'assistant',
          content: `⚠️ 出错了：${e.message}`,
          action: 'none',
        });
      } finally {
        loading.value = false;
        scrollBottom();
        nextTick(() => inputEl.value?.focus());
      }
    };

    onMounted(() => {
      ctxTimer = setInterval(pollContext, 1500);
      nextTick(() => inputEl.value?.focus());
    });

    onBeforeUnmount(() => {
      if (ctxTimer) clearInterval(ctxTimer);
    });

    return { messages, draft, loading, contextText, chatArea, inputEl, send, renderText };
  },
};
</script>

<style scoped>
* { box-sizing: border-box; }

.copilot-wrap {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f0f2f5;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
}

/* ── Chat area ── */
.chat-area {
  flex: 1;
  overflow-y: auto;
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 30px;
  color: #aaa;
  text-align: center;
  line-height: 1.8;
  gap: 4px;
}
.welcome-icon { font-size: 32px; margin-bottom: 6px; }

/* ── Message rows ── */
.msg-row { display: flex; }
.msg-row.user      { justify-content: flex-end; }
.msg-row.assistant { justify-content: flex-start; }

.bubble {
  max-width: 82%;
  padding: 8px 12px;
  border-radius: 14px;
  line-height: 1.65;
  word-break: break-word;
}

.bubble.user {
  background: #1890ff;
  color: #fff;
  border-bottom-right-radius: 4px;
}

.bubble.assistant {
  background: #fff;
  color: #333;
  border-bottom-left-radius: 4px;
  box-shadow: 0 1px 3px rgba(0,0,0,.12);
}

.action-tag {
  display: block;
  margin-top: 5px;
  font-size: 11px;
  font-weight: 600;
}
.action-tag.replace { color: #52c41a; }
.action-tag.insert  { color: #1890ff; }
.action-tag.format  { color: #722ed1; }

/* ── Typing dots ── */
.bubble.typing { padding: 10px 14px; }
.dot {
  display: inline-block;
  width: 7px; height: 7px;
  background: #c0c0c0;
  border-radius: 50%;
  margin: 0 2px;
  animation: blink 1.2s infinite ease-in-out;
}
.dot:nth-child(2) { animation-delay: .2s; }
.dot:nth-child(3) { animation-delay: .4s; }
@keyframes blink {
  0%, 80%, 100% { transform: translateY(0); opacity: .6; }
  40%           { transform: translateY(-5px); opacity: 1; }
}

/* ── Context bar ── */
.context-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  background: #e6f7ff;
  border-top: 1px solid #91d5ff;
  font-size: 12px;
  color: #1890ff;
  flex-shrink: 0;
}
.ctx-icon  { font-size: 13px; }
.ctx-label { font-weight: 600; white-space: nowrap; }
.ctx-preview { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #555; }
.ctx-clear { cursor: pointer; color: #999; padding: 0 3px; flex-shrink: 0; }
.ctx-clear:hover { color: #f00; }

/* ── Input area ── */
.input-area {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 10px;
  background: #fff;
  border-top: 1px solid #e8e8e8;
  flex-shrink: 0;
}

.input-area textarea {
  flex: 1;
  border: 1px solid #d9d9d9;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  resize: none;
  outline: none;
  line-height: 1.5;
  max-height: 100px;
  overflow-y: auto;
  transition: border-color .2s;
}
.input-area textarea:focus { border-color: #1890ff; }
.input-area textarea:disabled { background: #f5f5f5; }

.send-btn {
  padding: 8px 14px;
  background: #1890ff;
  color: #fff;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background .2s;
}
.send-btn:not(:disabled):hover { background: #40a9ff; }
.send-btn:disabled { background: #d9d9d9; cursor: not-allowed; }
</style>
