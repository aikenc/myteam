# MyTeam

> MyTeam 是一个对人极度友好的 AI 工作小团队。它用"PM + 专业 CLI Agent"的协作方式，把传统 Coding Agent 偏工程师化的体验，变成事事有回音、件件有着落的工作体验。

## 一句话定位

MyTeam 是一个面向真实工作推进的 Team Agent：用户只需要自然表达目标，PM 负责理解人、拆解任务、推进执行、验收结果和面向用户交代，专业 CLI Agent 负责完成代码、文档、浏览器、数据、测试等具体任务。

它是一个全新的独立项目，不绑定任何既有平台架构，也不以某个外部系统的子模块自居。项目的核心目标是：让 AI 不再像一个只会输出工程日志的工具，而像一个可靠、会跟进、能交付的小团队。

```text
User
  |
  | 自然语言目标 / 反馈 / 约束
  v
PM Agent
  |  理解用户、澄清目标、拆解任务、分配 owner、控制节奏、验收结果、翻译状态、面向用户沟通
  v
Professional CLI Agents
  |  coder / browser / doc-writer / data-worker / qa / ...
  v
Tools & Workspace
  |  文件、命令、浏览器、外部 CLI、项目上下文
  v
Result
  |  可用交付物 / 明确失败说明 / 下一步建议 / 过程证据
```

## 为什么需要 MyTeam

传统 Coding Agent 往往默认用户也是工程师：

- 要求用户自己把目标拆成工程任务。
- 用技术日志、命令输出和中间状态与用户沟通。
- 做到一半卡住时，常常只抛出错误而不是继续推进。
- 多步骤任务缺少 owner、状态、验收和收口。

MyTeam 的设计假设相反：用户可以只表达想要的结果，系统要负责理解、组织、推进、检查和交代。

## 核心原则

- **对人友好，而不是工程师化**：用户不需要学习 prompt 工程、任务拆解、日志阅读或工程工作流。
- **PM 理解人并推进事**：PM 负责理解目标、上下文、情绪、约束与交付期望，并用人能理解的方式沟通；同时负责计划、分工、节奏、风险、返工和验收，避免多个 Agent 各自散跑。
- **专业 Agent 干活**：专业 CLI Agent 负责执行具体任务，所有执行过程都要可观察、可检查、可复盘。
- **事事有回音**：每个请求都要有接收确认、当前状态、阻塞说明或结果反馈。
- **件件有着落**：每个任务最终都要有可用结果、明确失败说明或下一步建议。
- **过程可追踪**：关键决策、工具调用、产物、错误和验收结果都要形成结构化记录。

## 角色分工

| 角色 | 负责什么 | 不负责什么 |
|---|---|---|
| `PM Agent` | 用户沟通、目标理解、澄清、状态翻译、最终回复；计划、拆解、委派、状态跟踪、验收、返工、收口 | 不直接做复杂执行，不绕过工具和权限模型直接执行 |
| `Professional CLI Agent` | 代码、文档、浏览器、数据、测试等专业任务 | 不决定整体方向，不直接面向用户承诺结果 |
| `TeamEngine` | 会话、任务生命周期、事件、工具注册、错误模型 | 不内置具体业务能力，不承载宿主服务器协议 |
| `Workspace Layer` | 项目上下文、成员定义、技能、工具声明 | 不保存 secret，不直接修改核心内部状态 |

## 底层 AgentLoop 选型

MyTeam 的架构决策是：不自研单 Agent 的底层 LLM/tool 循环，后续通过 PI-backed `InternalAgentRuntime` 承载内部 Agent 的 AgentLoop。PI 负责单个 Agent 的 stream、tool call、session、compaction 和 skills 等底层能力；MyTeam 负责团队编排、任务契约、workspace 权限、事件、证据、错误和 replay。PI 的私有 message/event/tool 类型不得上冒为 MyTeam 的公共 `TaskResult`、`TaskEvent`、`Evidence` 或 `ReplayCase`。

当前项目仍处于文档与设计阶段，PI 依赖和 runtime adapter 尚未开始实现。运行基线已按该决策对齐 PI：Node.js `>=22.19.0`，TypeScript 使用可擦除语法约束，避免后续接入 PI 时出现运行时与类型系统割裂。

## 运行模式

MyTeam 采用 **library-first** 形态。稳定集成面是 `TeamEngine` library API；CLI 只负责本地一次性执行、调试和 replay，不提供内置服务能力。

```bash
# 默认就是一次性执行任务，不需要 run 子命令
myteam "整理这个项目并生成 README" --workspace . --json
myteam --task "整理这个项目并生成 README" --workspace . --json

# 回放一次历史任务
myteam replay --run-id <run-id> --workspace . --json
```

服务器后续通过 import MyTeam library 集成：

```text
Host Server / App
  -> createTeamEngine()
  -> TeamEngine.start(TaskRequest)
  -> TeamEngine.stream(runId)
  -> TeamEngine.outcome(runId)
```

默认 CLI、宿主服务器和 replay 必须共享同一套 TeamEngine 语义，不能变成多套业务实现。

## 用户链路

```text
用户表达目标
  -> PM Agent 理解意图、上下文、约束、交付口径，确认收到
  -> PM Agent 拆解任务、选择专业 Agent、设定验收点
  -> Professional CLI Agents 执行代码 / 文档 / 浏览器 / 数据 / 测试等任务
  -> PM Agent 跟踪状态、检查结果、必要时要求返工
  -> PM Agent 用用户能理解的方式交付结果或失败说明
  -> TaskRecord / Evidence / Events 进入任务历史，支持复盘和回放
```

## 专业 Agent 形态

专业 Agent 是工作小团队里的能力成员。早期内置方向：

- `pm`：计划、委派、节奏控制、验收和收口。
- `coder`：代码阅读、修改、测试、修复。
- `browser`：网页调研、页面验证、截图和交互任务。
- `doc-writer`：README、架构文档、交付说明、复盘报告。
- `data-worker`：表格、CSV、结构化资料整理。
- `qa`：运行检查、回归、证据整理。

新增专业 Agent 必须满足：职责清晰、输入输出明确、过程可观察、失败有语义、结果可验收。

## 最小可行闭环

第一阶段只追求一条真实闭环：

```text
用户提出一个 workspace 内可执行目标
  -> 默认 CLI 或宿主服务器通过 TeamEngine 接单
  -> PM 明确目标与交付口径
  -> PM 拆解并委派一个专业 Agent
  -> 专业 Agent 完成文件、代码、文档或命令级交付
  -> PM 验收并返回交付结果
  -> 生成 TaskRecord、events、evidence、replay case
```

验收标准：

- library API 能完成一个任务并输出结构化 `TaskResult`。
- 默认 CLI 能复用同一套 TeamEngine 执行任务。
- 同一任务可以导出为 replay case。
- 失败时有结构化错误、证据和下一步建议。
- 用户能看懂当前状态、最终结果和失败原因。

## 技术红线

- 不把 MyTeam 描述成任何既有平台的子模块；它是独立新项目。
- 不让用户承担工程拆解、日志理解和状态追踪的负担。
- 不在 turn、tool-call、消息流粒度反复启动 `myteam` 自身。
- 不把 CLI 作为生产服务、消息流或工具调用的承载方式。
- 不为 library API、默认 CLI、replay 写多套业务实现。
- 不让 workspace 插件直接写核心内部状态。
- 不用健康检查、mock 或纯 API 成功冒充真实任务完成。
- 不静默吞掉失败、权限缺失、浏览器缺失或工具不可用。

## 文档索引

- [技术架构](./docs/technical-architecture.md)
