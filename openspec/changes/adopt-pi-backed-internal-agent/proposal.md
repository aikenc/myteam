# Change Proposal: adopt-pi-backed-internal-agent

## 为什么

MyTeam 的产品定位是"Secretary / PM 驱动工作群"的 AI 工作群引擎。它需要可靠的单 Agent 推理与工具调用循环，也需要团队级任务生命周期、Freeform PM 工作流、工作群成员委派、证据、错误与 replay。

PI Agent 已经提供成熟的行业化 AgentLoop：LLM stream、工具调用、事件流、tool hook、并行/串行工具执行、session、compaction 与 skills 等能力。MyTeam 不应重复自研底层 AgentLoop，而应把 PI 定位为 `InternalAgent` 的标准内核，并在其上构建 MyTeam 自己的业务协议。

本变更明确选型：**PI 负责 `InternalAgent` 的核心 `AgentLoop`；MyTeam 负责 Freeform Team Orchestration、Task Contract、Workspace/SOUL、Tool/Capability、Evidence/Replay；`CLIAgent` 作为专业执行成员继续保留。**

## 变更内容

- 将 MyTeam 架构中的 `InternalAgent` 定义为 PI-backed：通过 PI AgentLoop 完成单个内部 Agent 的 LLM 推理、工具调用与多轮续跑。
- 明确 `MyTeam Core` 不自研底层 AgentLoop，而是拥有任务生命周期、团队工作流、公共事件、证据、错误和 replay 契约。
- 引入 `InternalAgentRuntime` 适配层：负责 prompt/SOUL/AGENT/capability 注入、内置工具注册、PI 事件映射、PI 工具结果映射。
- 保留 `CLIAgent`：Claude Code、Codex、Gemini CLI、browser/data/doc 等外部 CLI 形态仍是专业工作群成员，不降级为普通工具。
- 明确 PM 工作流使用显式状态机 / driver / tool action 推进，而不是只靠 prompt 隐式模拟。
- 明确 PI 类型边界：PI 的 message/event/tool 类型不得直接上冒为 MyTeam 的公共 `TaskResult`、`TaskEvent`、`Evidence`、`ReplayCase`。

## 能力范围

### 新增能力

- `internal-agent-runtime`
  - PI-backed `InternalAgent` 运行时。
  - SOUL / AGENT / system prompt / capability block 注入。
  - PI AgentEvent 到 MyTeam TaskEvent 的映射。
  - PI tool result 到 Evidence / toolResults 的映射。

- `team-orchestration-runtime`
  - Secretary / PM / Workgroup Member 的团队级工作流边界。
  - Freeform PM driver、自由状态机、委派、审批记录、验收、收口。
  - `InternalAgent` 与 `CLIAgent` 的统一调度接口。

### 修改能力

- `agent-core` 叙事调整：不再表示自研底层 AgentLoop，而表示 MyTeam 对任务、团队、事件、证据、错误与 replay 的产品内核。
- `workspace-layer`：SOUL、agents、skills、tools 配置用于构造 MyTeam AgentProfile 与 PI prompt/tool 上下文。

## 影响范围

- `README.md` 与 `docs/technical-architecture.md`：更新架构表述。
- `package.json`：Node engine 固定升级到 `>=22.19.0`，与 PI 直接依赖策略一致。
- `src/agent/internal/*`：新增 PI-backed `InternalAgentRuntime`。
- `src/agent/cli/*`：保留 CLI Agent 抽象。
- `src/workspace/*`：加载 SOUL、agents、skills、tools。
- `src/tools/*`：内置 tool 与 capability adapter。
- `src/core/*`：TaskRequest、TaskResult、TaskEvent、Evidence、ReplayCase、ErrorModel。
- `src/pm/*`：PM driver / workflow loop。

## 非目标

- 不 fork 或复制 PI 全量代码作为 MyTeam 私有框架。
- 不把 MyTeam 降级为 PI coding agent 的 UI 壳。
- 不把 `CLIAgent` 改造成 PI 内部普通 tool。
- 不在本变更内实现完整发布平台、沙箱系统、质量平台或通用项目管理系统。
- 不让 workspace 插件直接修改 PI 或 MyTeam 核心私有状态。

## 风险

- MyTeam 已将 Node engine 策略升级为 `>=22.19.0`；后续风险转为 CI、开发机和宿主环境是否同步满足该版本。
- PI 默认不提供强权限隔离，MyTeam 必须在 capability adapter 层实现权限、审计和 workspace 边界。
- PI 事件粒度与 MyTeam TaskEvent 不完全一致，必须显式映射。
- PM 工作流若只靠 prompt 约束，容易漂移；必须有 Freeform driver、结构化 action、状态持久化和终止安全网。
- Replay 不能直接依赖 PI 内部隐式状态，必须持久化 MyTeam 自己的 TaskRecord/Evidence/ReplayCase。
