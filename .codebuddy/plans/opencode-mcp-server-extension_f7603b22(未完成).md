---
name: opencode-mcp-server-extension
overview: 将 OpenCode 的代码分析能力封装为可被 LLM 调用的服务，支持 MCP Server 和 REST API 两种模式，提供完整的代码搜索、文件操作和 AI 分析能力。
todos:
  - id: create-mcp-server-module
    content: 创建 MCP Server 核心模块和类型定义
    status: pending
  - id: map-tools-to-mcp
    content: 将 OpenCode 工具映射为 MCP tools（grep, glob, read, ls, codesearch）
    status: pending
    dependencies:
      - create-mcp-server-module
  - id: implement-analyze-tool
    content: 实现 AI 分析工具 analyze_codebase（通过 Session API 调用 explore agent）
    status: pending
    dependencies:
      - create-mcp-server-module
  - id: add-transport-layer
    content: 添加 HTTP/SSE 传输层实现
    status: pending
    dependencies:
      - map-tools-to-mcp
      - implement-analyze-tool
  - id: add-api-endpoint
    content: 添加 MCP Server API 端点 (POST /mcp/serve)
    status: pending
    dependencies:
      - add-transport-layer
  - id: add-cli-command
    content: 添加 CLI 命令 opencode mcp-serve
    status: pending
    dependencies:
      - add-api-endpoint
  - id: test-mcp-integration
    content: 测试与 Claude Desktop 或其他 MCP 客户端的集成
    status: pending
    dependencies:
      - add-cli-command
---

## 用户需求

将 OpenCode 的代码分析能力封装成可被 LLM 调用的子部件，像函数一样返回分析结果。

## 核心功能

- **调用方式**：MCP Server 模式（推荐），同时支持 REST API 调用
- **分析能力**：
- 代码搜索（grep 文本搜索）
- 文件/符号查找（glob 文件匹配、ls 目录列表）
- AI Agent 分析（让 AI 理解代码库并回答问题）
- **输出格式**：支持 JSON（适合 LLM 解析）和纯文本分析报告
- **AI 参与**：灵活选择 - 可选择让 AI 总结分析，或直接返回原始数据

## 使用场景

1. LLM 通过 MCP 协议直接调用代码分析工具
2. 通过 REST API 发送分析请求并获取结果
3. 支持结构化输出便于 LLM 后续处理

## 技术栈选择

- **语言**: TypeScript（现有项目标准）
- **运行时**: Bun（现有架构）
- **Web 框架**: Hono（现有 API Server 使用）
- **MCP SDK**: `@modelcontextprotocol/sdk`（已在项目中安装）
- **工具定义**: Zod + Tool.define 模式（现有模式，在 `packages/opencode/src/tool/` 中）

## 实现方案

### 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                    外部 LLM 客户端                        │
│         (支持 MCP 协议，如 Claude Desktop)                │
└────────────────────────┬────────────────────────────────┘
                         │ MCP Protocol (HTTP/SSE)
                         ▼
┌─────────────────────────────────────────────────────────┐
│              MCP Server (新增模块)                        │
│  ┌─────────────────────────────────────────────────┐   │
│  │              工具定义 (Tools)                     │   │
│  │  - grep: 文本搜索                                 │   │
│  │  - glob: 文件匹配                                 │   │
│  │  - read: 读取文件                                 │   │
│  │  - ls: 列出目录                                   │   │
│  │  - codesearch: 语义搜索                           │   │
│  │  - analyze_codebase: AI 分析代码库                │   │
│  └─────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────┘
                         │ 内部调用
                         ▼
┌─────────────────────────────────────────────────────────┐
│            OpenCode API Server (现有)                    │
│  - ToolRegistry (工具注册表)                             │
│  - Session API (AI 会话)                                │
│  - File API (文件操作)                                  │
└─────────────────────────────────────────────────────────┘
```

### 关键技术决策

1. **复用现有工具定义**

- 直接使用 `ToolRegistry` 中已注册的工具（grep, glob, read, ls 等）
- 避免重复实现，保持代码一致性
- 参考 `packages/opencode/src/tool/registry.ts`

2. **MCP Server 作为独立模块**

- 创建 `packages/opencode/src/mcp-server/` 目录
- 支持 HTTP/SSE 传输协议
- 可与 API Server 并行运行或独立运行

3. **AI 分析功能实现**

- 通过 Session API 创建临时会话
- 调用 `explore` agent 进行代码库分析
- 参考 `github/index.ts` 中的 `chat()` 函数实现模式

4. **输出格式支持**

- 默认返回 JSON 格式（MCP 标准）
- 可选 `format: "text"` 参数返回纯文本
- 工具输出包含 `metadata` 字段便于解析

### 实现要点

1. **权限控制**：复用现有 Permission 系统，确保安全性
2. **错误处理**：统一错误格式，便于 LLM 理解
3. **性能优化**：支持结果截断（复用 Truncate 模块）
4. **日志记录**：复用现有 Log 系统

## 目录结构

```
packages/opencode/src/
├── mcp-server/                    # [NEW] MCP Server 模块
│   ├── index.ts                   # MCP Server 入口，定义 Server 实例
│   ├── tools.ts                   # 将 OpenCode 工具映射为 MCP tools
│   ├── handler.ts                 # 工具调用处理器
│   └── transport.ts               # HTTP/SSE 传输层实现
├── server/routes/
│   └── mcp-serve.ts               # [NEW] MCP Server HTTP 端点 (POST /mcp/serve)
└── cli/cmd/
    └── mcp-serve.ts               # [NEW] CLI 命令: opencode mcp-serve
```

**文件说明**：

- `mcp-server/index.ts`: 创建 MCP Server 实例，注册工具列表，处理初始化请求
- `mcp-server/tools.ts`: 将 `ToolRegistry` 中的工具映射为 MCP tool 格式（使用 zodToJsonSchema）
- `mcp-server/handler.ts`: 处理工具调用，支持 JSON 和纯文本输出格式
- `mcp-server/transport.ts`: 实现 HTTP POST 和 SSE 传输协议
- `server/routes/mcp-serve.ts`: 添加 `/mcp/serve` 端点，处理 MCP 请求
- `cli/cmd/mcp-serve.ts`: 添加 `opencode mcp-serve` 命令，启动独立 MCP Server

## 关键代码结构

```typescript
// mcp-server/index.ts - MCP Server 工具定义示例
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { zodToJsonSchema } from "zod-to-json-schema"
import { ToolRegistry } from "../tool/registry"

export async function createMCPServer() {
  const tools = await ToolRegistry.tools({ providerID: "opencode", modelID: "default" })
  
  const mcpTools = tools.map(tool => ({
    name: tool.id,
    description: tool.description,
    inputSchema: zodToJsonSchema(tool.parameters)
  }))
  
  // 添加 AI 分析工具
  mcpTools.push({
    name: "analyze_codebase",
    description: "Use AI agent to analyze codebase and answer questions",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Question about the codebase" },
        format: { type: "string", enum: ["json", "text"], default: "json" }
      },
      required: ["query"]
    }
  })
  
  return new Server({ name: "opencode", version: "1.0.0" }, { capabilities: { tools: {} } })
}
```

```typescript
// mcp-server/handler.ts - 工具调用处理示例
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js"

export async function handleToolCall(request: { params: { name: string; arguments: any } }) {
  const { name, arguments: args } = request.params
  
  if (name === "analyze_codebase") {
    // 创建 session 并调用 AI
    const session = await Session.create({})
    const result = await SessionPrompt.prompt({
      sessionID: session.id,
      parts: [{ type: "text", text: args.query }],
      agent: "explore"
    })
    return { content: [{ type: "text", text: result.output }] }
  }
  
  // 调用现有工具
  const toolInfo = await ToolRegistry.getTool(name)
  const result = await toolInfo.execute(args, createMockContext())
  
  return { content: [{ type: "text", text: result.output }] }
}
```

## Agent Extensions 使用计划

### SubAgent

- **code-explorer**: 用于探索 MCP 相关代码实现模式
- 目的：理解现有 MCP client 实现如何适配为 server
- 预期结果：找到可复用的代码模式和最佳实践