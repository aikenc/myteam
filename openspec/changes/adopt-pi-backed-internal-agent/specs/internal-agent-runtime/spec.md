# Spec Delta: internal-agent-runtime

> 属于 change `adopt-pi-backed-internal-agent`。定义 MyTeam 采用 PI 作为 `InternalAgent` 核心 AgentLoop 的运行时契约，以及它与 MyTeam Task Core、PM 工作流、Tool Adapter、CLIAgent 的边界。

---

## ADDED Requirements

### Requirement: PI-backed InternalAgent Runtime

MyTeam SHALL 使用 PI AgentLoop 作为 `InternalAgent` 的标准底层运行时。`InternalAgent` 的单 turn LLM 推理、多轮工具调用、stream event、tool execution hook、prompt/continue 能力 SHALL 由 PI AgentLoop 驱动。

MyTeam MUST NOT 自研另一套与 PI 平行的底层 AgentLoop 作为默认路径。MyTeam Core SHALL 负责任务生命周期、团队工作流、事件、证据、错误与 replay，而不是负责底层 LLM tool loop。

`InternalAgentRuntime` SHALL 位于 MyTeam 与 PI 之间，隔离 PI 类型并提供 MyTeam 自己的 `runTurn()` 契约。

#### Scenario: InternalAgent turn 由 PI AgentLoop 驱动

- **GIVEN** 一个 `InternalAgent` 收到 `AgentRunTurnInput`
- **AND** 该输入包含 message view、new messages、workspace、agent profile 与可用 tools
- **WHEN** `InternalAgent.runTurn()` 被调用
- **THEN** 系统 SHALL 构造 PI Agent 所需上下文并调用 PI AgentLoop
- **AND** PI AgentLoop SHALL 负责 LLM stream、tool call、tool result 注入与终止判断
- **AND** `InternalAgent.runTurn()` SHALL 返回 MyTeam `AgentTurnResult`

#### Scenario: MyTeam Core 不暴露 PI 私有类型

- **GIVEN** PI AgentLoop 返回 PI message、event 或 tool result
- **WHEN** MyTeam 对外输出 `TaskResult`、`TaskEvent`、`Evidence` 或 `ReplayCase`
- **THEN** 输出 MUST 使用 MyTeam 自己的公共类型
- **AND** PI 私有类型 MUST NOT 直接出现在公共协议中
- **AND** 后续替换或升级 PI 版本 MUST NOT 要求修改 MyTeam 公共 Task Contract

---

### Requirement: Prompt / SOUL / Capability Injection

`InternalAgentRuntime` SHALL 在调用 PI AgentLoop 前组装 MyTeam prompt 上下文，至少包含：

- system prompt。
- workspace `SOUL.md`。
- agent-specific prompt，默认路径为 `agents/{agent-name}.md`，或由 agent profile 显式指定的等价 prompt asset。
- capability block，包括 skills、tools、MCP 或其他能力声明。
- 当前任务上下文与必要的 message view。

prompt assets MUST 来源明确、可追踪、可版本化。关键配置缺失时 MUST fail-fast，不得静默 fallback 为默认人格。

#### Scenario: SOUL 与 agent prompt 注入

- **GIVEN** workspace 中存在 `SOUL.md` 且 agent profile 指向 `agents/coder.md`
- **WHEN** `InternalAgentRuntime` 构造 PI Agent context
- **THEN** PI 的 system/context 输入 SHALL 包含 system prompt、SOUL 内容、agent prompt 内容与 capability block
- **AND** TaskRecord SHALL 记录这些 prompt assets 的路径或摘要

#### Scenario: 关键 prompt 配置缺失

- **GIVEN** agent profile 声明必须加载某个 prompt asset
- **WHEN** 对应文件缺失或无法读取
- **THEN** `InternalAgentRuntime` MUST 返回结构化 `workspace_error`
- **AND** MUST NOT 静默改用空 prompt 或隐藏默认 prompt

---

### Requirement: MyTeam Tool Adapter Controls PI Tool Execution

PI AgentLoop MAY 发起 tool call，但每个 tool 的实际执行 SHALL 经过 MyTeam `ToolRegistry` 或 `CapabilityAdapter`。MyTeam Tool Adapter SHALL 负责权限检查、workspace 边界、timeout、审计、输出截断、错误分类和 evidence 生成。

PI tool result SHALL 同时满足两类用途：

- 返回给 PI AgentLoop，用于后续 LLM 轮次。
- 转换为 MyTeam Evidence / toolResults，用于 TaskRecord、ReplayCase 与用户可解释结果。

#### Scenario: PI 工具调用回到 MyTeam ToolRegistry

- **GIVEN** PI AgentLoop 请求调用 `read_file`
- **WHEN** `InternalAgentRuntime` 收到该 tool call
- **THEN** 系统 SHALL 通过 MyTeam `ToolRegistry.invoke("read_file", args)` 执行
- **AND** 执行结果 SHALL 返回给 PI 作为 tool result
- **AND** 执行结果 SHALL 生成 MyTeam Evidence

#### Scenario: 工具越权被阻止

- **GIVEN** PI AgentLoop 请求调用 `shell` 或文件工具访问 workspace 外路径
- **WHEN** MyTeam CapabilityAdapter 检查到越权
- **THEN** 工具调用 MUST 被拒绝
- **AND** PI SHALL 收到结构化错误 tool result
- **AND** MyTeam SHALL 记录 `capability_error` 事件与 evidence
- **AND** secret MUST NOT 被写入事件、evidence 或 replay case

---

### Requirement: PI Event Mapping to MyTeam TaskEvent

`InternalAgentRuntime` SHALL 将 PI AgentLoop 事件映射为 MyTeam `TaskEvent`。映射后的事件 MUST 包含 MyTeam 运行所需字段：`runId`、`taskId`（可用时）、`agentId`、`subtaskId`、timestamp、event type、status、相关 tool call id、evidence ref 或 error code。`runId` 是运行事实归属的强制字段，不能用 PI request/message/tool ID、`sessionId` 或 `taskId` 替代。

PI event SHALL NOT 被原样持久化为 MyTeam 公开事件；它只能作为内部事件源。

#### Scenario: 工具事件映射

- **GIVEN** PI 发出 `tool_execution_start` 与 `tool_execution_end`
- **WHEN** `InternalAgentRuntime` 映射事件
- **THEN** MyTeam SHALL 发出 `tool.call.started` 与 `tool.call.completed`
- **AND** 两个事件 MUST 保留同一 tool call id、tool name、agent id 与 task id
- **AND** `tool.call.completed` SHALL 引用对应 Evidence

#### Scenario: stream 事件映射

- **GIVEN** PI 发出 assistant message delta 或 message update
- **WHEN** MyTeam 通过 library stream 或宿主服务器向客户端推送事件
- **THEN** MyTeam SHALL 发出用户可消费的增量事件
- **AND** 该事件 MUST NOT 包含模型 reasoning、secret 或内部 prompt 私密内容

---

### Requirement: CLIAgent Remains a Professional Agent

MyTeam SHALL 保留 `CLIAgent` 作为 Professional Agent 的一等形态。`CLIAgent` SHALL 与 `InternalAgent` 共享统一的 `Agent.runTurn()` 调度契约，但其执行由外部 CLI 进程、stdout/stderr 解析、progress、heartbeat、timeout 和结果归一化完成。

`CLIAgent` MUST NOT 被降级为 PI 内部普通 tool。PM 可以通过结构化委派 action 调度 `CLIAgent`，但其生命周期、状态、进度与结果归属 SHALL 由 MyTeam TeamWorkflow 管理。

#### Scenario: PM 委派给 CLIAgent

- **GIVEN** PM 选择把编码任务委派给 `coder` CLI agent
- **WHEN** TeamWorkflowLoop 执行该委派
- **THEN** 系统 SHALL 调用目标 `CLIAgent.runTurn()`
- **AND** CLI stdout/stderr SHALL 被解析为进度、结果或错误
- **AND** PM SHALL 收到结构化结果用于验收
- **AND** 该 CLI agent MUST NOT 作为 PI 的普通 tool 在 PM 的单 AgentLoop 内执行

#### Scenario: CLIAgent 执行失败

- **GIVEN** `CLIAgent` 因认证、命令不存在、超时或非零退出失败
- **WHEN** TeamWorkflowLoop 收到失败结果
- **THEN** PM MUST 明确感知该失败
- **AND** PM SHALL 选择重试、换成员、调整方案或 `fail` 收口
- **AND** 系统 MUST NOT 假装成员任务成功

---

### Requirement: PM Workflow Uses Freeform Driver State

MyTeam PM 工作流 SHALL 使用显式 `ProjectDriver` / workflow state 推进任务，而不是只通过 prompt 隐式模拟流程。该 driver SHALL 采用自由状态机语义：定义可持久化状态、可用 action、下一轮 speaker、终止条件和必要安全网，但 MUST NOT 要求每个任务都经过固定线性的 `planning -> working -> reviewing` 阶段图。

PM 可由 PI-backed `InternalAgent` 执行思考和工具调用，但 PM 的结构化输出 MUST 被 driver 解析、校验和持久化。

#### Scenario: PM 工作流推进一轮

- **GIVEN** 一个正在运行的 `ProjectState` 或 `TeamRunState`
- **WHEN** TeamWorkflowLoop 执行一轮
- **THEN** driver SHALL 通过 `getTurnDirective()` 决定 speaker 与本轮指令
- **AND** 系统 SHALL 调用对应 agent 的 `runTurn()`
- **AND** PM turn 的结构化 tool result SHALL 被解析为 `ProjectAction` 或 `WorkflowAction`
- **AND** driver MAY 通过 `postProcessAction()` 执行安全网处理
- **AND** driver SHALL 通过 `applyTurn()` 持久化状态、artifact、lastAction、nextSpeaker 和 allowedActions
- **AND** 新状态 SHALL 被持久化到 TaskRecord 或 session state

#### Scenario: 成员 turn 回到 PM 协调

- **GIVEN** PM 通过 `delegate` action 委派了一个工作群成员
- **WHEN** 该成员 turn 完成并返回 implementation、verification 或等价结果
- **THEN** driver SHALL 将成员产出沉淀为 artifact 或 evidence
- **AND** SHALL 将 `nextSpeaker` 设置回 PM 或等价 orchestrator
- **AND** PM SHALL 决定继续委派、记录审批、finalize、fail 或其他允许 action

#### Scenario: PM 成功收口

- **GIVEN** PM 判断任务已经可以交付
- **WHEN** PM 调用 finalize action
- **THEN** driver SHALL 校验 summary、deliverables、evidence 或无预览哨兵值
- **AND** TaskResult SHALL 标记为 `succeeded`
- **AND** PM SHALL 基于 TaskResult 输出用户友好的最终回复

---

### Requirement: TaskRecord / Evidence / Replay Owned by MyTeam

MyTeam SHALL 自己持久化 `TaskRecord`、`Evidence` 与 `ReplayCase`。PI session 或 PI transcript MAY 作为内部调试材料引用，但 MUST NOT 替代 MyTeam replay 契约。

ReplayCase SHALL 至少记录：TaskRequest、workspace 摘要、`WorkspaceSnapshotRef` 或 workspace-unavailable reason、agent profile 摘要、PI 版本、prompt assets 摘要、TaskEvent、Evidence、工具调用与结果、PM state transitions。

#### Scenario: 导出 replay case

- **GIVEN** 一个任务完成或失败
- **WHEN** MyTeam 生成 TaskResult
- **THEN** 系统 SHALL 同时生成 TaskRecord
- **AND** TaskRecord SHALL 引用 Evidence 与 ReplayCase
- **AND** ReplayCase SHALL 记录足以复盘任务路径的结构化材料
- **AND** ReplayCase MUST NOT 包含 secret

#### Scenario: replay 不依赖 PI 隐式状态

- **GIVEN** 一个由 PI-backed InternalAgent 执行过的任务
- **WHEN** 使用 MyTeam replay 机制复盘
- **THEN** replay SHALL 基于 MyTeam TaskRecord、Evidence、prompt 摘要与工具结果
- **AND** MUST NOT 要求读取 PI 运行时内存中的不可持久化状态
- **AND** 如果只能做证据重放而非真实重放，系统 MUST 明确标记

---

### Requirement: Node Runtime Compatibility

MyTeam 直接依赖 `@earendil-works/pi-agent-core` 或 `@earendil-works/pi-ai` 时，运行时要求 SHALL 与 PI 包要求兼容。当前默认策略是将 `package.json` 的 `engines.node` 固定为 `>=22.19.0`，不保留低版本 Node 子进程隔离路线作为默认实现。

#### Scenario: 直接依赖 PI 时 Node 版本兼容

- **GIVEN** MyTeam 以普通 npm dependency 方式引入 PI 包
- **WHEN** 用户运行 `npm install` 或默认 CLI
- **THEN** `package.json` 的 `engines.node` SHALL 满足 PI 包的最低 Node 要求
- **AND** 文档 SHALL 说明该要求

#### Scenario: 宿主环境版本不足

- **GIVEN** 宿主环境的 Node 版本低于 `>=22.19.0`
- **WHEN** 安装或运行 MyTeam
- **THEN** 系统 MUST fail fast 并说明需要升级 Node
- **AND** 系统 MUST NOT 静默退回到不完整的 PI runtime 或 mock 成功路径
