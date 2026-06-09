# Design: adopt-pi-backed-internal-agent

## 背景

MyTeam 的核心产品价值不是“再造一个 AgentLoop”，而是把用户目标推进成可观察、可验收、可收口的团队协作过程。单个内部 Agent 的 LLM 推理、工具调用、多轮续跑、stream 事件等能力，应采用成熟的 PI AgentLoop；MyTeam 自己掌握团队、任务、workspace、工具权限、证据与 replay。

因此本设计把系统拆成两层 loop：

```text
PI AgentLoop
  - 单个 InternalAgent 的 LLM stream
  - tool call / tool result
  - prompt / continue
  - agent lifecycle events

MyTeam TeamWorkflowLoop
  - PM / Professional Agent 协作
  - Freeform PM Driver 自由状态机
  - delegate / approval / finalize / fail / implementation / verification
  - TaskEvent / Evidence / ReplayCase
```

## 总体架构

```text
User / Client
  |
  v
MyTeam Task Core
  - TaskRequest / TaskResult
  - TaskEvent / Evidence / TaskRecord / ReplayCase
  - ErrorModel / budget / timeout / abort
  |
  v
Team Orchestration
  - Secretary / PM
  - Freeform PM Driver / workflow state
  - AgentCatalog / workgroup member routing
  |
  +--> InternalAgent
  |      - MyTeam profile / SOUL / AGENT / skills / tools
  |      - InternalAgentRuntime adapter
  |      - PI AgentLoop
  |      - PI AgentEvent -> MyTeam TaskEvent
  |
  +--> CLIAgent
         - Claude Code / Codex / Gemini CLI / browser / doc / data / qa
         - stdout/stderr parser
         - progress / heartbeat
         - result normalization
```

## 分层职责

### MyTeam Task Core

负责公共产品契约：

- `TaskRequest`、`TaskResult`、`TaskEvent`。
- `TaskRecord`、`Evidence`、`ReplayCase`。
- 结构化错误、预算、超时、abort。
- library API / 默认 CLI / replay 共享语义。

它不实现底层 LLM tool loop，也不暴露 PI 私有类型作为公共协议。

### InternalAgentRuntime

`InternalAgentRuntime` 是 MyTeam 到 PI 的适配层，负责：

- 读取 `AgentProfile`、SOUL、AGENT、system prompt、capability block。
- 将 MyTeam `MessageView` / task context 转为 PI Agent 所需上下文。
- 将 MyTeam 内置 tool / workspace tool / skill tool 注册为 PI tool。
- 将 PI tool execution 委派回 MyTeam `ToolRegistry` / `CapabilityAdapter`。
- 将 PI `AgentEvent` 映射为 MyTeam `TaskEvent`。
- 将 PI final message / tool result 映射为 MyTeam `AgentTurnResult`、`Evidence`、`toolResults`。
- 隔离 PI 类型，不让其泄漏到公共 Task Contract。

### CLIAgentRuntime

`CLIAgent` 仍是 MyTeam 的专业成员形态。它适合包装外部工程型 agent 或专业 CLI：

- Claude Code、Codex、Gemini CLI。
- browser CLI、doc writer、data worker、qa runner。
- 需要独立进程、独立会话、stdout/stderr、长期工程上下文的工具。

`CLIAgent` 由 PM 委派，不应被降级为 PI 内部普通 tool。PI tool 可以用于“发起委派”或“读取委派结果”，但专业成员的生命周期由 MyTeam TeamWorkflow 管理。

### PM Workflow

PM 工作流使用参考 GenetHub `FreeformDriver` 的显式 driver / 自由状态机，不仅靠 prompt 约束，也不是固定线性阶段图：

```text
ProjectState / TeamRunState
  -> getTurnDirective()       # 决定 speaker 与本轮指令
  -> speaker.runTurn()
  -> extract WorkflowAction
  -> postProcessAction()      # 可选安全网，如 finalize 字段补齐/校验
  -> applyTurn()              # 持久化 state / artifact / nextSpeaker / allowedActions
  -> finalize, fail, or continue
```

自由状态机的关键是：driver 负责可持久化状态、可用 action、下一位 speaker、终止条件和安全网；PM 通过结构化 action 自由决定下一步。它不强制每个任务都经历固定的 `plan -> implement -> verify` 阶段。

PM 的结构化 action 至少包括：

- `delegate`
- `approval`
- `finalize`
- `fail`
- `implementation`
- `verification`
- `note` 或等价的编排记录

PM 可以是 PI-backed `InternalAgent`，但 PM 的推进语义由 MyTeam driver 解析、校验和持久化。

## 数据流

### 单个 InternalAgent turn

```text
AgentRunTurnInput
  -> load prompt assets: systemPrompt + SOUL + AGENT + capabilityBlock
  -> build PI Agent state/context
  -> PI AgentLoop.prompt() / continue()
  -> PI stream events
  -> PI tool calls
  -> MyTeam ToolRegistry.invoke()
  -> PI receives tool results
  -> PI final assistant message
  -> map to AgentTurnResult + TaskEvent + Evidence
```

### 团队工作流

```text
TaskRequest
  -> Secretary / PM: understand user goal and produce initial TeamRunState
  -> Freeform PM Driver: decide first directive
  -> PM InternalAgent: choose delegate / approval / finalize / fail / note
  -> CLIAgent/InternalAgent members: execute delegated work
  -> Freeform PM Driver: apply action, persist artifacts, choose next speaker
  -> PM: user-friendly final response or failure explanation
  -> TaskResult + TaskRecord + Evidence + ReplayCase
```

## PI 接入策略

架构决策是后续直接依赖 PI 包，而不是复制源码：

- `@earendil-works/pi-agent-core`
- `@earendil-works/pi-ai`

当前项目仍处于文档与设计阶段，尚未引入 PI 依赖，也尚未实现 `InternalAgentRuntime` adapter。实现时应固定版本，记录版本与 license，并在 MyTeam adapter 层屏蔽 PI churn。若后续确实需要修改 PI 内核，再评估 fork，但不作为第一选择。

PI 要求 Node `>=22.19.0`。MyTeam 选择直接对齐 PI，将运行基线固定为 Node `>=22.19.0`，低版本 Node 子进程隔离路线不作为默认方案。后续 CI、开发机、宿主环境和文档都必须按 Node 22.19+ 验证。

## 工具与权限

PI 负责发起 tool call，但工具实际执行必须经过 MyTeam capability adapter：

- 文件、shell、browser、外部 CLI 都必须经过能力发现与权限检查。
- 高风险工具必须有审计事件和 evidence。
- Secret 不进入 workspace 配置、PI message history、TaskEvent、ReplayCase。
- 工具结果需要同时返回给 PI 续轮，并沉淀为 MyTeam Evidence。

## 事件映射

PI event 只作为内部事件源。MyTeam 应定义独立 `TaskEvent`：

| PI event | MyTeam TaskEvent |
|---|---|
| `agent_start` | `agent.turn.started` |
| `message_update` | `agent.message.delta` |
| `tool_execution_start` | `tool.call.started` |
| `tool_execution_update` | `tool.call.progress` |
| `tool_execution_end` | `tool.call.completed` |
| `turn_end` | `agent.turn.completed` |
| `agent_end` | `agent.run.completed` |

映射时必须补充 `runId`、可用时的 `taskId`、`agentId`、`subtaskId`、时间戳、可见性、evidence 引用等 MyTeam 字段。`runId` 是事件归属的强制字段，不能用 PI request/message/tool ID 或 `taskId` 替代。

## Replay 边界

Replay 不应依赖 PI 内部不可控状态。MyTeam replay case 应保存：

- 输入 `TaskRequest`。
- workspace 配置摘要。
- agent profiles 与版本。
- PI 包版本。
- prompt assets 摘要或脱敏快照。
- 工具调用、参数、结果、错误与 evidence。
- PM driver state transitions。

Replay 时可选择真实重放或证据重放，但必须显式标记，不能用 mock 成功冒充真实完成。

## 验证策略

- 单测：InternalAgentRuntime 的 prompt/tool/event/result 映射。
- 契约测试：PI event 到 MyTeam TaskEvent 的字段完整性。
- 工具测试：内置 shell/read_file 等工具权限与 evidence。
- 工作流测试：PM driver 委派 `InternalAgent` 与 `CLIAgent`，完成 plan/delegate/verify/finalize。
- Replay 测试：同一 TaskRecord 可导出 ReplayCase，并能复现或解释差异。
- CLI 验证：`myteam "..." --workspace ... --json` 输出结构化 `TaskResult`。

## 取舍

选择 PI-backed InternalAgent 的收益：

- 少造底层 AgentLoop，快速进入 MyTeam 产品差异。
- 借助 PI 已有 tool loop、stream、session、compaction、skills 能力。
- 符合行业分工：AgentLoop 用成熟内核，产品语义由上层掌握。

代价：

- Node 版本与依赖升级压力。
- 需要维护 adapter 和事件映射。
- 需要在 MyTeam 层补足权限、证据、replay 与 Freeform PM Driver。
