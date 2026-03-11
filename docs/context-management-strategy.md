# OpenCode 上下文管理策略

本文档总结 OpenCode 项目中关于上下文管理和压缩的核心策略与实现经验。

## 一、架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                    Context Management Pipeline                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Tool Output ──► Truncation (截断) ──► 保存到文件              │
│        │                              │                         │
│        ▼                              ▼                         │
│   ┌─────────┐                   ┌───────────┐                   │
│   │ MAX_    │                   │ 提示 Agent │                   │
│   │ LINES   │                   │ 用 Grep/   │                   │
│   │ 2000    │                   │ Read 分段  │                   │
│   │ MAX_    │                   │ 读取文件   │                   │
│   │ BYTES   │                   └───────────┘                   │
│   │ 50KB    │                                                   │
│   └─────────┘                                                   │
│                                                                  │
│   Token Usage Monitor ──► isOverflow() ──► Compaction 触发      │
│        │                              │                          │
│        ▼                              ▼                          │
│   ┌─────────────┐              ┌──────────────┐                 │
│   │ 计算总token  │              │ AI 摘要生成  │                 │
│   │ vs 可用空间  │              │ 继续提示词   │                 │
│   └─────────────┘              └──────────────┘                 │
│                                                                  │
│   Prune (修剪) ◄── 清理旧工具调用输出                            │
│        │                                                         │
│        ▼                                                         │
│   ┌──────────────┐                                               │
│   │ 保留最近40K  │                                               │
│   │ token 工具输出│                                               │
│   └──────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
```

## 二、核心策略详解

### 1. 工具输出截断 (Truncation)

**源文件:** `packages/opencode/src/tool/truncation.ts`

```typescript
export const MAX_LINES = 2000
export const MAX_BYTES = 50 * 1024
```

**策略要点:**
- 超过 2000 行或 50KB 时自动截断
- 完整输出保存到文件，Agent 可通过 `Read` 工具分段读取或用 `Grep` 搜索
- 提供明确的提示，告知 Agent 如何处理截断的输出

**截断消息示例:**
```
The output has been truncated. Use the Read tool to read the file in sections, 
or the Grep tool to search for specific content.
```

### 2. 上下文溢出检测 (isOverflow)

**源文件:** `packages/opencode/src/session/compaction.ts`

```typescript
const COMPACTION_BUFFER = 20_000

export async function isOverflow(input: { 
  tokens: MessageV2.Assistant["tokens"]
  model: Provider.Model 
}) {
  const config = await Config.get()
  if (config.compaction?.auto === false) return false
  const context = input.model.limit.context
  if (context === 0) return false

  const count =
    input.tokens.total ||
    input.tokens.input + input.tokens.output + 
    input.tokens.cache.read + input.tokens.cache.write

  const reserved =
    config.compaction?.reserved ?? 
    Math.min(COMPACTION_BUFFER, ProviderTransform.maxOutputTokens(input.model))
  
  const usable = input.model.limit.input
    ? input.model.limit.input - reserved
    : context - ProviderTransform.maxOutputTokens(input.model)
  
  return count >= usable
}
```

**关键计算:**
- 总 token = input + output + cache.read + cache.write
- 预留 20,000 token 作为缓冲区 (`COMPACTION_BUFFER`)
- 可用空间 = `model.limit.input - reserved` 或 `context - maxOutputTokens`

### 3. AI 摘要压缩 (Compaction)

**源文件:** `packages/opencode/src/agent/prompt/compaction.txt`

使用专门的 `compaction` agent 生成上下文摘要：

```text
You are a helpful AI assistant tasked with summarizing conversations.

When asked to summarize, provide a detailed but concise summary of the conversation.
Focus on information that would be helpful for continuing the conversation, including:
- What was done
- What is currently being worked on
- Which files are being modified
- What needs to be done next
- Key user requests, constraints, or preferences that should persist
- Important technical decisions and why they were made
```

**摘要模板结构:**

```text
Provide a detailed prompt for continuing our conversation above.
...
---
## Goal
[What goal(s) is the user trying to accomplish?]

## Instructions
- [What important instructions did the user give you that are relevant]

## Discoveries
[What notable things were learned during this conversation]

## Accomplished
[What work has been completed, what work is still in progress]

## Relevant files / directories
[Construct a structured list of relevant files...]
---
```

### 4. 修剪旧工具调用 (Prune)

**源文件:** `packages/opencode/src/session/compaction.ts`

```typescript
export const PRUNE_MINIMUM = 20_000
export const PRUNE_PROTECT = 40_000

const PRUNE_PROTECTED_TOOLS = ["skill"]

// goes backwards through parts until there are 40_000 tokens worth of tool
// calls. then erases output of previous tool calls. idea is to throw away old
// tool calls that are no longer relevant.
export async function prune(input: { sessionID: string }) {
  // ... 从后向前遍历，保留最近的工具调用输出
}
```

**策略:**
- 保护最近 40,000 token 的工具调用输出
- `skill` 工具始终受保护不修剪
- 修剪超过 20,000 token 时才执行

### 5. 配置选项

用户可在配置文件中自定义压缩行为：

```json
{
  "compaction": {
    "auto": true,      // 自动压缩（默认 true）
    "prune": true,     // 自动修剪（默认 true）
    "reserved": 10000  // 预留的 token 缓冲区
  }
}
```

### 6. 溢出错误检测

**源文件:** `packages/opencode/src/provider/error.ts`

支持多种 Provider 的溢出错误识别：

```typescript
const OVERFLOW_PATTERNS = [
  /prompt is too long/i,                    // Anthropic
  /exceeds the context window/i,            // OpenAI
  /input token count.*exceeds the maximum/i, // Google (Gemini)
  /maximum context length is \d+ tokens/i,  // OpenRouter, DeepSeek
  /exceeds the limit of \d+/i,              // GitHub Copilot
  /context window exceeds limit/i,          // MiniMax
  /exceeded model token limit/i,            // Kimi For Coding, Moonshot
  // ...
]

export function isContextOverflow(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message
  return OVERFLOW_PATTERNS.some(pattern => pattern.test(msg))
}
```

## 三、处理流程

### 消息处理流程 (Processor)

**源文件:** `packages/opencode/src/session/processor.ts`

1. 接收新消息
2. 检查是否溢出 (`isOverflow`)
3. 若溢出，执行压缩或修剪
4. 发送到 Provider

```typescript
// 简化流程示意
async function process(session: Session) {
  if (await isOverflow({ tokens, model })) {
    if (config.compaction?.prune !== false) {
      await prune({ sessionID: session.id })
    }
    await compaction({ sessionID: session.id })
  }
  // 继续处理...
}
```

## 四、关键设计经验

| 经验 | 说明 |
|------|------|
| **提前预警** | 在接近上下文限制前触发压缩，而非等到报错 |
| **分层处理** | 先尝试修剪旧输出，再进行 AI 摘要压缩 |
| **保留关键信息** | `skill` 工具输出、最近的工具调用优先保护 |
| **可扩展性** | 通过 Plugin 系统允许自定义压缩 prompt |
| **优雅降级** | 媒体附件过大时自动移除并提示用户 |

## 五、核心常量总结

```typescript
// 截断限制
MAX_LINES = 2000      // 最大行数
MAX_BYTES = 50 * 1024 // 最大字节数 (50KB)

// 压缩相关
COMPACTION_BUFFER = 20_000  // 压缩缓冲区

// 修剪相关
PRUNE_MINIMUM = 20_000  // 最小修剪阈值
PRUNE_PROTECT = 40_000  // 保护最近 token 数量
```

## 六、已知问题和改进空间

测试文件中标注了一个关于 `limit.input` 的边界情况：

```typescript
// These tests demonstrate that when limit.input is set, isOverflow()
// does not subtract any headroom for the next model response.
// 
// Compare: without limit.input, usable = context - output (reserves space).
// With limit.input, usable = limit.input (reserves nothing).
```

这表明项目团队对边界情况有持续的测试和改进意识。

## 七、相关源文件

| 文件路径 | 功能 |
|---------|------|
| `packages/opencode/src/tool/truncation.ts` | 工具输出截断逻辑 |
| `packages/opencode/src/session/compaction.ts` | 上下文压缩和修剪核心实现 |
| `packages/opencode/src/session/processor.ts` | 消息处理流程，触发压缩 |
| `packages/opencode/src/provider/error.ts` | Provider 错误识别，包括溢出检测 |
| `packages/opencode/src/agent/prompt/compaction.txt` | 压缩 Agent 的提示词模板 |
| `test/session/compaction.test.ts` | 压缩逻辑的单元测试 |
