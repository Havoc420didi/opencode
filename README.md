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

# API 调用示例（需要认证时）
curl -H "Authorization: Bearer your-token" http://127.0.0.1:4096/api/endpoint
```

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


## 更多资源

- 📖 [完整文档](https://opencode.ai/docs)
- 📄 [官方 README](./README.ori.md)
- 🤝 [贡献指南](./CONTRIBUTING.md)
- 💬 [Discord 社区](https://discord.gg/opencode)
- 🐦 [Twitter/X](https://x.com/opencode)
- 🌐 [官方网站](https://opencode.ai)

---
