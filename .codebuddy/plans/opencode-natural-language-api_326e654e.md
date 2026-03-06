---
name: opencode-natural-language-api
overview: 将 OpenCode 暴露为接受自然语言指令的智能代码分析服务。外部 LLM 发送自然语言问题，OpenCode AI Agent 自动选择工具并返回分析结果。支持 MCP Server 和 REST API 两种调用方式。
todos:
  - id: create-ask-route
    content: 创建 REST API 端点 POST /ask
    status: completed
  - id: create-mcp-server
    content: 创建 MCP Server 模块，暴露 ask 工具
    status: completed
    dependencies:
      - create-ask-route
  - id: add-transport
    content: 添加 HTTP/SSE 传输层实现
    status: completed
    dependencies:
      - create-mcp-server
  - id: add-cli-command
    content: 添加 CLI 命令 opencode ask
    status: completed
    dependencies:
      - create-ask-route
  - id: register-routes
    content: 注册路由和命令到主入口
    status: completed
    dependencies:
      - create-ask-route
      - create-mcp-server
  - id: regenerate-sdk
    content: 重新生成 SDK（运行 ./script/generate.ts）
    status: completed
    dependencies:
      - register-routes
  - id: test-integration
    content: 测试 MCP 和 REST API 集成
    status: completed
    dependencies:
      - regenerate-sdk
---

## 用户需求（更新）

将 OpenCode 的代码分析能力封装为可被 LLM 调用的子部件，外部 LLM 发送**完整的自然语言指令**（类似 TUI 输入），OpenCode AI 自动分析代码库并返回结构化结果。

## 核心功能

- **调用方式**：单一入口 - "ask" 工具/端点
- **输入**：自然语言问题（如 "分析项目的认证流程"）
- **输出**：结构化 JSON 或纯文本分析报告
- **内部处理**：OpenCode AI 自动选择并调用工具（grep/glob/read 等）

## 使用场景

1. MCP 模式：Claude Desktop 等支持 MCP 的 LLM 直接连接
2. REST API 模式：任何 HTTP 客户端发送分析请求
3. CLI 模式：命令行快速调用

## 技术栈

- **语言**: TypeScript（现有项目标准）
- **运行时**: Bun（现有架构）
- **Web 框架**: Hono（现有 API Server）
- **MCP SDK**: `@modelcontextprotocol/sdk`（已安装）
- **Agent**: 复用 `explore` agent 进行代码分析

## 架构设计

```
┌─────────────────────────────────────────────────────┐
│               外部 LLM (Claude/GPT等)                │
│    "分析项目的认证流程是如何实现的"                    │
└────────────────────┬────────────────────────────────┘
                     │ MCP / HTTP API
                     ▼
┌─────────────────────────────────────────────────────┐
│           OpenCode Ask 接口（新增）                   │
│  ┌───────────────────────────────────────────────┐  │
│  │  ask(query: string, format?: "json"|"text")   │  │
│  └───────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────┘
                     │ 创建 Session + 发送 prompt
                     ▼
┌─────────────────────────────────────────────────────┐
│          OpenCode AI Agent (explore)                │
│  ┌───────────────────────────────────────────────┐  │
│  │  自动选择工具: grep → glob → read → 分析       │  │
│  └───────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────┘
                     │ 结构化输出
                     ▼
┌─────────────────────────────────────────────────────┐
│               返回分析结果                           │
│  { "result": "该项目使用 JWT 认证...", "sessionID": "xxx" } │
└─────────────────────────────────────────────────────┘
```

## 关键技术决策

1. **单一入口设计**

- 只暴露一个 `ask` 工具/端点
- 外部 LLM 无需了解 OpenCode 内部工具
- 降低集成复杂度

2. **复用 Session API**

- 参考 `github/index.ts` 中的 `chat()` 函数模式
- 创建临时 session，发送 prompt，获取结果
- 支持后续追问（通过 sessionID）

3. **使用 explore agent**

- 专门用于代码库探索的 agent
- 自动选择 grep/glob/read 等工具
- 适合分析类任务

4. **输出格式支持**

- `format: "json"` - 结构化输出，适合 LLM 解析
- `format: "text"` - 纯文本分析报告
- 通过 Session API 的 `format` 参数实现

## 实现参考

核心代码模式（来自 `github/index.ts` 第 576-653 行）：

```typescript
async function ask(query: string, format: "json" | "text" = "json") {
// 1. 创建临时 session
const session = await Session.create({})

// 2. 获取模型配置
const { providerID, modelID } = await getConfig()

// 3. 发送自然语言问题给 AI
const result = await client.session.chat({
path: session.id,
body: {
providerID,
modelID,
agent: "explore",  // 使用 explore agent
parts: [{ type: "text", text: query }],
format: format === "json" ? { type: "json" } : undefined
}
})

// 4. 提取并返回结果
const match = result.data