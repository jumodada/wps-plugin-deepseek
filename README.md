# WPS Office插件开发模板（React + TypeScript + Vite）

专为WPS Office插件开发打造的React模板，集成TypeScript类型支持与Vite构建工具，提供丰富的WPS API实操示例。

## 模板特点

- 🚀 **WPS集成**：预配置Office JS API类型声明
- 📦 **开箱即用**：包含插件manifest配置示例
- 🧪 **API体验**：20+个WPS API使用示例（文档）
- ⚡ **高效开发**：Vite热更新 + React Fast Refresh
- 🔒 **类型安全**：完整TypeScript类型支持

## 快速开始

```bash
# 安装依赖
yarn install

# 开发模式（带热更新）
wpsjs debug

# 生产构建
wpsjs build
```

## TODO
更新中

## 参考资源

- [WPS开放平台文档](https://qn.cache.wpscdn.cn/)

## 环境配置

项目使用环境变量来管理配置信息。在开始开发之前，你需要设置正确的环境变量。

### 开发环境配置

1. 复制 `env.json` 文件并重命名为 `.env.development`
2. 在 `.env.development` 文件中填入你的 API 密钥：
   - `VITE_DEEPSEEK_API_KEY`: 你的 DeepSeek API 密钥

### 生产环境配置

1. 复制 `env.json` 文件并重命名为 `.env.production`
2. 在 `.env.production` 文件中填入你的生产环境 API 密钥

### 环境变量说明

- `VITE_DEEPSEEK_API_BASEURL`: DeepSeek API 的基础 URL
- `VITE_DEEPSEEK_API_KEY`: DeepSeek API 密钥
- `VITE_API_BASE_URL_AI`: AI API 的基础 URL

注意：请确保不要将包含实际 API 密钥的 `.env` 文件提交到版本控制系统中。