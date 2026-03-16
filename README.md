# OpenCode 基本使用文档

## 目录

- [环境配置](#环境配置)
- [快速开始](#快速开始)
- [基本使用](#基本使用)
- [高级配置](#高级配置)
- [常见问题](#常见问题)

---

## 环境配置

### 系统要求

- **Node.js**: >= 18.x
- **Bun**: >= 1.3.10（必需）
- **操作系统**: macOS / Linux / Windows

### 安装 Bun

如果尚未安装 Bun，请先安装：

```bash
# macOS/Linux
curl -fsSL https://bun.sh/install | bash

# 或使用 npm
npm install -g bun

# Windows
powershell -c "irm bun.sh/install.ps1 | iex"
```

### 克隆项目

```bash
# 克隆仓库
git clone git@git.woa.com:g_WXG_OB_MP_D2/opencode-wxapp-analyzer.git
cd opencode-wxapp-analyzer
```

### 安装依赖

```bash
# 安装所有依赖
bun install
```

> [!TIP]
> 首次安装可能需要几分钟，请耐心等待

---

### 配置司内模型

OpenCode 支持配置企业内部或自定义 AI 模型。以下是配置微信内部模型的示例：

#### 快速配置

```bash
# 创建配置目录
mkdir -p ~/.config/opencode

# 写入配置文件
cat > ~/.config/opencode/opencode.json << 'EOF'
{
  "model": "wxa/your-model-name",
  "provider": {
    "wxa": {
      "name": "WeChat AI",
      "api": "https://your-api-endpoint.com/v1", // INFO 注意 opencode 会自动补充 `/chat/completions` 的后缀
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "apiKey": "your-api-key"
      },
      "models": {
        "your-model-name": {
          "name": "your-model-name"
        }
      }
    }
  }
}
EOF
```

#### 配置说明

| 字段 | 说明 |
|------|------|
| `model` | 默认使用的模型，格式为 `provider/model-name` |
| `provider` | 自定义提供商配置 |
| `api` | API 端点地址 |
| `npm` | 使用的 AI SDK 包（通常为 `@ai-sdk/openai-compatible`） |
| `options.apiKey` | API 密钥 |

> [!NOTE]
> - 配置完成后需重启 OpenCode 服务才能生效
> - API 密钥建议使用环境变量存储：`"apiKey": "$MY_API_KEY"`
> - 支持 OpenAI API 兼容的模型（如 DeepSeek、Moonshot 等）

---

## 基本使用

### 启动服务器模式

OpenCode 支持服务器模式，可以作为一个后台服务运行，提供 API 接口供其他客户端调用。

#### 启动服务器

```bash
npm run serve
```

#### 命令输出说明

```bash
$ bun run --conditions=browser ./src/index.ts serve
INFO 2026-03-16T03:50:50 +108ms service=default version=local args=["serve"] opencode
Warning: OPENCODE_SERVER_PASSWORD is not set; server is unsecured.
INFO 2026-03-16T03:50:50 +1ms service=config path=/Users/havocrao/.config/opencode/config.json loading
INFO 2026-03-16T03:50:50 +1ms service=config path=/Users/havocrao/.config/opencode/opencode.json loading
INFO 2026-03-16T03:50:50 +3ms service=config path=/Users/havocrao/.config/opencode/opencode.jsonc loading
opencode server listening on http://127.0.0.1:4096
```

**关键信息解读：**

1. **服务启动**: 服务器监听在 `http://127.0.0.1:4096`
2. **配置文件加载**: 自动加载以下配置文件（按顺序）：
   - `~/.config/opencode/config.json`
   - `~/.config/opencode/opencode.json`
   - `~/.config/opencode/opencode.jsonc`（支持注释的 JSON）
3. **安全警告**: 如果未设置 `OPENCODE_SERVER_PASSWORD` 环境变量，服务器将以无认证模式运行

#### 服务器端口配置

默认端口为 `4096`，可以通过环境变量修改：

```bash
# 使用自定义端口
export OPENCODE_SERVER_PORT=8080
bun run serve
```

或者：

```bash
OPENCODE_SERVER_PORT=8080 bun run serve
```

#### 访问服务器

服务器启动后，可以通过 HTTP 请求访问：

```bash
# 健康检查
curl http://127.0.0.1:4096/health
```

### API 端点

#### POST /ask - 发送问题

向 OpenCode 发送自然语言问题，AI 会在指定的工作目录中执行搜索、分析和代码操作。

**指定工作目录的三种方式：**

```bash
# 方式一：URL Query 参数（推荐）
curl -X POST "http://localhost:4096/ask?directory=/path/to/project" \
  -H "Content-Type: application/json" \
  -d '{"query": "你的问题"}'

# 方式二：HTTP Header
curl -X POST http://localhost:4096/ask \
  -H "Content-Type: application/json" \
  -H "x-opencode-directory: /path/to/project" \
  -d '{"query": "你的问题"}'

# 方式三：默认使用启动服务器时的 cwd
# 如果不指定 directory，会使用服务器启动时的工作目录
curl -X POST http://localhost:4096/ask \
  -H "Content-Type: application/json" \
  -d '{"query": "你的问题"}'
```

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | ✅ | 自然语言问题或任务描述 |
| `agent` | string | ❌ | 使用的 agent（默认 `explore`） |

**响应格式：**

```json
{
  "result": "AI 的分析结果...",
  "sessionID": "ses_xxx"
}
```

#### POST /ask/:sessionID/follow-up - 追问

在之前的会话基础上继续提问，保持上下文。

```bash
curl -X POST "http://localhost:4096/ask/ses_xxx/follow-up?directory=/path/to/project" \
  -H "Content-Type: application/json" \
  -d '{"query": "追问内容"}'
```

### 使用示例

#### 示例 1：简单问候

```bash
curl -X POST "http://localhost:4096/ask?directory=/path/to/project" \
  -H "Content-Type: application/json" \
  -d '{"query": "你好"}'
```

**响应：**

```json
{
  "result": "你好！👋 我是文件搜索助手，可以帮助你在这个代码库中查找文件、搜索代码内容、阅读和分析文件。",
  "sessionID": "ses_33d8e85d8ffehPr6iW7LfZ2aEs"
}
```

#### 示例 2：分析项目结构

```bash
curl -X POST "http://localhost:4096/ask?directory=/path/to/project" \
  -H "Content-Type: application/json" \
  -d '{"query": "分析这个小程序的项目结构"}'
```

**响应：** 返回详细的项目结构分析报告，包括目录结构、核心文件、页面架构、组件、业务逻辑层等信息。

#### 示例 3：附带文件引用

使用 `@` 符号引用外部文件，AI 会读取并分析该文件内容。

```bash
curl -X POST "http://localhost:4096/ask?directory=/path/to/project" \
  -H "Content-Type: application/json" \
  -d '{"query": "梗概此文档任务 @/path/to/skill-doc.md"}'
```

**响应：** 返回文档的核心要点梗概。

#### 示例 4：复杂任务 + 写文件

让 AI 执行复杂任务并将结果写入文件。这种方式通过 Agent 的 Tool 执行，输出的信息更加规整和完整。

```bash
curl -X POST "http://localhost:4096/ask?directory=/path/to/project" \
  -H "Content-Type: application/json" \
  -d '{"query": "参考此任务文档 @/path/to/skill-doc.md, 最后把分析报告写到 `/path/to/output` 下新建一个md文档，以时间戳为文件名，最终只把文件完整路径返回。你的任务是分析: <组件HTML>..."}'
```

**关键要点：**
- 明确指定输出目录的完整路径
- 指定文件命名规则（如时间戳）
- 明确返回格式要求（如"只返回文件路径"）

> [!NOTE]
> - 外部目录访问需要在 `~/.config/opencode/opencode.json` 中配置权限（参见[外部目录访问权限配置](#外部目录访问权限配置)）
> - 路径支持绝对路径和相对路径
> - 如果遇到权限问题，检查 `permission.external_directory` 配置

---

## 高级配置

### 配置文件位置

OpenCode 配置文件位于：

```
~/.config/opencode/
├── config.json        # 主配置文件
├── opencode.json      # OpenCode 配置
└── opencode.jsonc     # OpenCode 配置（支持注释）
```

### 基础配置示例

```json
{
  "model": "claude-3.5-sonnet",
  "provider": "anthropic",
  "temperature": 0.7,
  "maxTokens": 4096
}
```

### 外部目录访问权限配置

OpenCode 默认情况下访问外部目录会询问用户确认（`"ask"`）。你可以通过配置文件预先授权特定目录的访问权限。

#### 配置方法

在 `~/.config/opencode/opencode.json` 或 `opencode.jsonc` 中添加 `permission.external_directory` 配置：

```jsonc
{
  "permission": {
    "external_directory": {
      // 默认行为：询问用户（可选，默认值）
      "*": "ask",
      
      // 允许访问特定目录（使用通配符 * 表示目录下所有文件）
      "/Users/yourname/projects/myapp/data/*": "allow",
      "/Users/yourname/projects/myapp/skills/*": "allow",
      
      // 也支持相对路径（相对于工作目录）
      "../shared-libs/*": "allow",
      
      // 拒绝访问敏感目录
      "/etc/*": "deny",
      "~/.ssh/*": "deny"
    }
  }
}
```

#### 权限级别说明

| 权限值 | 说明 |
|--------|------|
| `"allow"` | 允许访问，不再询问 |
| `"ask"` | 访问前询问用户（默认） |
| `"deny"` | 拒绝访问 |

#### 实际示例

假设你的项目结构如下，需要让 OpenCode 访问外部数据目录和技能目录：

```
/Users/yourname/
├── projects/
│   └── myapp/           # 当前工作目录
│       ├── src/
│       └── package.json
├── data/                # 外部数据目录
│   └── reports/
└── skills/              # 外部技能目录
    └── custom/
```

配置文件示例：

```jsonc
{
  // ~/.config/opencode/opencode.jsonc
  
  "model": "claude-3.5-sonnet",
  "provider": "anthropic",
  
  "permission": {
    "external_directory": {
      // 允许访问数据目录
      "/Users/yourname/data/*": "allow",
      
      // 允许访问技能目录
      "/Users/yourname/skills/*": "allow",
      
      // 其他所有外部目录仍需询问
      "*": "ask"
    }
  }
}
```

> [!NOTE]
> - 路径支持使用 `*` 通配符，表示匹配目录下的所有文件和子目录
> - 配置更改后需要重启 OpenCode 服务才能生效
> - 建议仅授权可信目录，避免授权敏感路径（如系统目录、密钥文件等）

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `OPENCODE_SERVER_PASSWORD` | 服务器认证密码 | 无（无认证） |
| `OPENCODE_SERVER_PORT` | 服务器端口 | `4096` |
| `OPENCODE_CONFIG_DIR` | 配置文件目录 | `~/.config/opencode` |
| `OPENCODE_DATA_DIR` | 数据存储目录 | `~/.opencode` |

---

## 常见问题

### Q1: bun install 失败？

**A:** 尝试以下解决方案：

```bash
# 清除缓存
bun pm cache rm

# 删除 node_modules 重新安装
rm -rf node_modules bun.lock
bun install
```

### Q2: 服务器启动后无法访问？

**A:** 检查以下项目：
1. 确认服务器已成功启动并显示监听地址
2. 检查防火墙设置，确保端口未被阻止
3. 如果使用自定义端口，确认端口未被占用

```bash
# 检查端口是否被占用
lsof -i :4096

# 或使用 netstat
netstat -an | grep 4096
```

### Q3: 如何更新项目？

**A:**

```bash
# 拉取最新代码
git pull

# 更新依赖
bun install
```

### Q4: 配置文件格式错误怎么办？

**A:** OpenCode 支持 `.jsonc` 格式（带注释的 JSON），如果配置文件格式错误，可以：
1. 检查 JSON 语法是否正确
2. 使用 JSON 验证工具验证配置文件
3. 删除配置文件，让 OpenCode 重新生成默认配置

### Q5: 如何运行测试？

**A:** 测试不能从项目根目录运行，需要进入具体的 package 目录：

```bash
# 进入 opencode package
cd packages/opencode

# 运行测试
bun test
```

### Q6: OpenCode 与 Claude Code 有什么区别？

**A:** 主要区别如下：

- **开源**: OpenCode 100% 开源
- **提供商无关**: 支持 Claude、OpenAI、Google 甚至本地模型，不绑定特定提供商
- **开箱即用的 LSP 支持**: 内置语言服务器协议支持
- **TUI 优先**: 由 neovim 用户构建，专注于终端体验
- **客户端/服务器架构**: 支持 TUI 之外的多种客户端（如移动应用）

---

## 更多资源

- 📖 [完整文档](https://opencode.ai/docs)
- 📄 [官方 README](./README.ori.md)
- 🤝 [贡献指南](./CONTRIBUTING.md)
- 💬 [Discord 社区](https://discord.gg/opencode)
- 🐦 [Twitter/X](https://x.com/opencode)
- 🌐 [官方网站](https://opencode.ai)

---
