# MyTeam

> MyTeam 是一个对人极度友好的 AI 工作小团队。它用“秘书 + PM + 专业 CLI Agent”的协作方式，把传统 Coding Agent 偏工程师化的体验，变成事事有回音、件件有着落的工作体验。

## 一句话定位

MyTeam 是一个面向真实工作推进的 Team Agent：用户只需要自然表达目标，秘书负责理解人和承接沟通，PM 负责拆解、推进、验收和收口，专业 CLI Agent 负责完成代码、文档、浏览器、数据、测试等具体任务。

它是一个全新的独立项目，不绑定任何既有平台架构，也不以某个外部系统的子模块自居。项目的核心目标是：让 AI 不再像一个只会输出工程日志的工具，而像一个可靠、会跟进、能交付的小团队。

```text
User
  |
  | 自然语言目标 / 反馈 / 约束
  v
Secretary Agent
  |  理解用户、澄清目标、翻译状态、维护沟通体验
  v
PM Agent
  |  拆解任务、分配 owner、控制节奏、验收结果
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
- **秘书理解人**：秘书负责理解目标、上下文、情绪、约束与交付期望，并用人能理解的方式沟通。
- **PM 推进事**：PM 负责计划、分工、节奏、风险、返工和验收，避免多个 Agent 各自散跑。
- **专业 Agent 干活**：专业 CLI Agent 负责执行具体任务，所有执行过程都要可观察、可检查、可复盘。
- **事事有回音**：每个请求都要有接收确认、当前状态、阻塞说明或结果反馈。
- **件件有着落**：每个任务最终都要有可用结果、明确失败说明或下一步建议。
- **过程可追踪**：关键决策、工具调用、产物、错误和验收结果都要形成结构化记录。

## 角色分工

| 角色 | 负责什么 | 不负责什么 |
|---|---|---|
| `Secretary Agent` | 用户沟通、目标理解、澄清、状态翻译、最终回复 | 不直接做复杂执行，不管理专业 Agent |
| `PM Agent` | 计划、拆解、委派、状态跟踪、验收、返工、收口 | 不绕过工具和权限模型直接执行 |
| `Professional CLI Agent` | 代码、文档、浏览器、数据、测试等专业任务 | 不决定整体方向，不直接面向用户承诺结果 |
| `Agent Core` | 会话、任务生命周期、事件、工具注册、错误模型 | 不内置具体业务能力 |
| `Workspace Layer` | 项目上下文、成员定义、技能、工具声明 | 不保存 secret，不直接修改核心内部状态 |

## 运行模式

```bash
# 单次任务：用于本地执行、测试、诊断和回放
myteam run --task "整理这个项目并生成 README" --workspace . --json

# 长驻服务：用于持续对话和多轮任务推进
myteam serve --workspace . --port 4317

# 回放一次历史任务
myteam replay --run-id <run-id> --workspace . --json
```

`run`、`serve`、`replay` 共享同一套 Agent Core，不能变成三套业务实现：

```text
TaskRequest
  -> load workspace
  -> load secretary / PM / agent catalog / skills / tools
  -> build task context
  -> execute team workflow
  -> emit task events
  -> produce TaskResult

run:    argv/stdin -> TaskRequest -> stdout TaskResult
serve:  HTTP/WebSocket message -> TaskRequest -> event stream + TaskResult
replay: saved TaskRecord -> TaskRequest -> comparable TaskResult
```

## 用户链路

```text
用户表达目标
  -> Secretary Agent 理解意图、上下文、约束、交付口径
  -> Secretary Agent 确认收到，并说明将如何推进
  -> PM Agent 拆解任务、选择专业 Agent、设定验收点
  -> Professional CLI Agents 执行代码 / 文档 / 浏览器 / 数据 / 测试等任务
  -> PM Agent 跟踪状态、检查结果、必要时要求返工
  -> Secretary Agent 用用户能理解的方式交付结果或失败说明
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

## 建议工程目录

```text
myteam/
  README.md
  docs/
    technical-architecture.md
    task-contracts.md           # 后续：TaskRequest / TaskResult / TaskEvent schema
    workspace-plugin.md         # 后续：SOUL.md / agents / skills 规范
  src/
    cli/                        # run / serve / replay 命令外壳
    core/                       # Agent Core：任务生命周期、事件、状态、错误模型
    secretary/                  # Secretary Agent
    pm/                         # PM loop 与委派策略
    agents/                     # 内置专业 Agent adapter
    workspace/                  # workspace loader 与插件层
    tools/                      # tool registry 与 capability discovery
    events/                     # task event schema 与 emitters
  examples/
    basic-workspace/
      SOUL.md
      agents/
      skills/
  tests/
    fixtures/
    replay/
```

当前阶段先完成文档与边界，代码落地时按上述目录渐进创建。

## 最小可行闭环

第一阶段只追求一条真实闭环：

```text
用户提出一个 workspace 内可执行目标
  -> myteam run/serve 接单
  -> Secretary 明确目标与交付口径
  -> PM 拆解并委派一个专业 Agent
  -> 专业 Agent 完成文件、代码、文档或命令级交付
  -> PM 验收
  -> Secretary 返回交付结果
  -> 生成 TaskRecord、events、evidence、replay case
```

验收标准：

- `run` 能独立完成一个任务并输出 JSON `TaskResult`。
- `serve` 能承载同一类任务，并持续输出任务事件。
- 同一任务可以导出为 replay case。
- 失败时有结构化错误、证据和下一步建议。
- 用户能看懂当前状态、最终结果和失败原因。

## 技术红线

- 不把 MyTeam 描述成任何既有平台的子模块；它是独立新项目。
- 不让用户承担工程拆解、日志理解和状态追踪的负担。
- 不在 turn、tool-call、消息流粒度反复启动 `myteam` 自身。
- 不为 `run`、`serve`、`replay` 写三套业务实现。
- 不让 workspace 插件直接写核心内部状态。
- 不用健康检查、mock 或纯 API 成功冒充真实任务完成。
- 不静默吞掉失败、权限缺失、浏览器缺失或工具不可用。

## 文档索引

- [技术架构](./docs/technical-architecture.md)
