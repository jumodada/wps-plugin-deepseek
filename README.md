# WPS Office插件开发模板（Vue + JavaScript + Vite）

专为WPS Office插件开发打造的Vue模板，搭配Vite构建工具，提供丰富的WPS API实操示例。虽然官方提供了TypeScript扩展包，但支持程度有限，因此本项目选择使用JavaScript进行开发。

## 模板特点

- 🚀 **WPS集成**：预配置Office JS API
- 📦 **开箱即用**：包含插件manifest配置示例
- 🧪 **API体验**：20+个WPS API使用示例（文档）
- ⚡ **高效开发**：Vite热更新 + Vue响应式更新
- 🧩 **灵活开发**：使用JavaScript提供更灵活的开发体验

## 快速开始

```bash
# 安装依赖
yarn install

# 开发模式（带热更新）
wpsjs debug

# 生产构建
wpsjs build
```

## 为什么选择JavaScript而非TypeScript

虽然TypeScript提供了类型安全的好处，但在WPS Office插件开发中，官方的TypeScript支持程度有限。即使有扩展包，其支持的完整度依然较为一般。为了避免开发过程中的类型问题和兼容性挑战，本项目选择使用JavaScript进行开发，提供更灵活的开发体验。

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

## 打包部署

项目提供两种打包部署方式，以下操作需在Windows环境下执行：

### 方式一：生成可执行文件

```bash
# 构建可执行文件
wpsjs build --exe
```

构建完成后，将生成一个exe可执行文件。用户只需双击该文件，即可自动打开WPS并加载插件。这种方式适合快速分发和测试使用。

### 方式二：离线部署包

```bash
# 构建离线部署包
wpsjs build
```

选择"离线"选项，将会生成一个7z压缩文件。

然后发布到服务器：

```bash
# 发布插件
wpsjs publish
```

在发布过程中，系统会要求输入URL信息，此处可以随意填写。发布完成后，找到生成的publish.xml文件，将文件中的获取路径修改为：
- 远程服务器上存放7z文件的地址
- 或本地7z文件的路径

这种方式适合正式环境部署和团队内部分发使用。