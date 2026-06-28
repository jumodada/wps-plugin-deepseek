# WPS AI Copilot 插件（Vue + Vite + DeepSeek）

一个嵌入 WPS Office 的 AI 写作助手插件。在 WPS 右侧任务面板提供微信风格的对话界面，可直接对文档进行**改写、续写、字体/段落格式设置**等操作。基于 DeepSeek 大模型，通过一个轻量 Python 后端中转，API Key 不暴露在前端。

## 功能

- 💬 **对话式 AI Copilot**：右侧任务面板聊天，自动读取你在文档中选中的文字作为上下文
- ✍️ **改写 / 替换**：把选中文字替换为 AI 优化后的内容
- ➕ **插入 / 续写**：在光标处插入 AI 生成的新内容
- 🎨 **格式设置**：用自然语言设置字体、字号、加粗、行距、段距、对齐、缩进等（如"改成宋体小四号，1.5 倍行距"）
- 🧩 **保留原有功能**：全文段落优化、选择段落优化、文章格式化、文章词语纠错

## 目录结构

```
wps-plugin-deepseek/
├── src/                # 前端 Vue 源码（任务面板、页面、WPS JSAPI 调用）
├── public/             # 静态资源 + ribbon.xml（功能区按钮定义）
├── backend/            # Python FastAPI 后端（中转 DeepSeek，存放 API Key）
│   ├── main.py
│   ├── requirements.txt
│   └── .env.example
├── .env.development.example   # 前端环境变量模板
└── README.md
```

## 环境要求

- 已安装 **WPS Office**（带"WPS 加载项"功能）
- **Node.js** 18+（含 npm）
- **Python** 3.10+
- WPS JS 开发工具：`npm install -g wpsjs`

## 快速开始

### 1. 安装前端依赖

```bash
npm install
```

### 2. 配置环境变量

复制环境变量模板并填入你自己的 DeepSeek API Key：

```bash
# 前端
cp .env.development.example .env.development

# 后端
cp backend/.env.example backend/.env
```

- 前端 `.env.development`：填 `VITE_DEEPSEEK_API_KEY`，并确认 `VITE_COPILOT_API_URL` 指向后端地址（本地默认 `http://localhost:8001`）
- 后端 `backend/.env`：填 `DEEPSEEK_API_KEY`

> DeepSeek API Key 在 https://platform.deepseek.com 注册获取。

### 3. 启动后端

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001
```

看到 `Application startup complete` 即为成功。

### 4. 启动前端（开发模式，带热更新）

另开一个终端：

```bash
wpsjs debug
```

该命令会自动注册插件并启动 WPS。在 WPS 顶部"wps加载项示例"选项卡中点击 **AI Copilot** 按钮，右侧即出现聊天面板。

## 使用示例

在 WPS 文档中选中一段文字，然后在 Copilot 输入：

- `帮我把这段润色得更书面一些` → 替换选中内容
- `在后面补一段总结` → 在光标处插入
- `改成宋体小四号` → 设置字体字号
- `设置 1.5 倍行距，段前 6 磅，首行缩进 2 字符` → 设置段落格式
- `加粗并居中` → 设置格式

## 后端说明

后端是一个 FastAPI 服务，唯一职责是把前端的对话请求中转给 DeepSeek，并要求模型返回严格的 JSON：

```json
{ "reply": "回复文字", "action": "replace|insert|format|none", "new_content": "..." }
```

前端根据 `action` 调用 WPS JSAPI 操作文档。把 API Key 放在后端可避免泄露在浏览器/插件里。

### 部署到云端（分发给他人时）

将 `backend/` 部署到任意支持 Python 的平台（如 Render），把 `DEEPSEEK_API_KEY` 设为服务器环境变量，然后把前端 `.env` 中的 `VITE_COPILOT_API_URL` 改为云端地址重新构建。这样所有用户共用同一后端，Key 不会下发到客户端。

## 生产构建与分发

```bash
# 生成可执行安装文件（双击自动加载插件）
wpsjs build --exe

# 或生成离线部署包后发布
wpsjs build
wpsjs publish
```

## 安全提示

⚠️ 请勿将含真实 API Key 的 `.env.development`、`backend/.env` 提交到版本库或随压缩包一同分发。本仓库已通过 `.gitignore` 排除这些文件，分发前请确认压缩包内不含真实密钥。

## 参考资源

- [WPS 开放平台文档](https://qn.cache.wpscdn.cn/)
- [DeepSeek 开放平台](https://platform.deepseek.com)
