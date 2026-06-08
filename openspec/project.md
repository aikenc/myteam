# MyTeam — OpenSpec 项目上下文

> 本目录遵循 OpenSpec 规范，用于管理 MyTeam 的能力规约与变更。

## 项目定位

MyTeam 是一个**独立的 AI 工作小团队项目**。

它不是任何既有平台架构的子模块，也不以外部系统的 Execution Runtime 自居。它的目标是把传统 Coding Agent 偏工程师化、偏日志化、偏一次性执行的体验，改造成对人极度友好的协作体验：

```text
用户自然表达目标
  -> Secretary Agent 理解人、澄清目标、翻译状态、维护沟通体验
  -> PM Agent 拆解任务、分配 owner、控制节奏、验收结果
  -> Professional CLI Agents 完成代码 / 文档 / 浏览器 / 数据 / 测试等具体任务
  -> Secretary Agent 返回可用交付物、明确失败说明、下一步建议和过程证据
```

核心产品原则：

- **对人友好，而不是工程师化**：用户不需要学习 prompt 工程、任务拆解、日志阅读或工程工作流。
- **秘书理解人**：秘书负责理解目标、上下文、情绪、约束与交付期望，并用人能理解的方式沟通。
- **PM 推进事**：PM 负责计划、分工、节奏、风险、返工和验收，避免多个 Agent 各自散跑。
- **专业 Agent 干活**：专业 CLI Agent 负责执行具体任务，所有执行过程都要可观察、可检查、可复盘。
- **事事有回音**：每个请求都要有接收确认、当前状态、阻塞说明或结果反馈。
- **件件有着落**：每个任务最终都要有可用结果、明确失败说明或下一步建议。
- **过程可追踪**：关键决策、工具调用、产物、错误和验收结果都要形成结构化记录。

## 核心对象

| 对象 | 职责 |
|---|---|
| `Secretary Agent` | 用户沟通、目标理解、澄清、状态翻译、最终回复 |
| `PM Agent` | 计划、拆解、委派、状态跟踪、验收、返工、收口 |
| `Professional CLI Agent` | 代码、文档、浏览器、数据、测试等专业任务 |
| `Agent Core` | `TaskRequest` 到 `TaskResult` 的生命周期、上下文、事件、工具注册、错误模型、任务记录、replay |
| `Workspace Layer` | `SOUL.md`、`agents/`、`skills/`、`tools/`、`myteam.config.json` 等项目插件层 |
| `Tool & Capability Adapter` | 受控访问 file / shell / browser / external CLI 等能力 |

## OpenSpec 目录约定

```text
openspec/
  config.yaml
  project.md
  specs/<capability>/spec.md
  changes/<change-id>/
    proposal.md
    design.md
    tasks.md
    specs/<capability>/spec.md
```

## 初始 capability 规划

第一阶段建议从以下 capability 渐进建立规约：

| Capability | 职责 |
|---|---|
| `task-lifecycle` | `TaskRequest`、`TaskResult`、任务状态、run / serve / replay 生命周期 |
| `task-events-evidence` | `TaskEvent`、Evidence、TaskRecord、ReplayCase、FailureFingerprint |
| `workspace-layer` | `SOUL.md`、`agents/`、`skills/`、`tools/`、`myteam.config.json` 加载规则 |
| `team-orchestration` | Secretary → PM → Professional Agents 的委派、状态跟踪、验收与收口语义 |
| `tool-capability-adapters` | 文件、shell、浏览器、外部 CLI 等能力的受控访问与错误语义 |
| `cli-server-parity` | `run`、`serve`、`replay` 共享 Agent Core 的一致性要求 |

## 规约写作约定

- OpenSpec 文档正文优先使用中文。
- `Requirement` 必须使用 **SHALL** 或 **MUST**。
- `Scenario` 必须使用 GIVEN / WHEN / THEN。
- 新功能、接口、事件、错误模型、workspace 插件协议或架构变更必须先创建 `openspec/changes/<change-id>/`。
- 纯文档编辑或不改变行为的小 bug 修复可以跳过 OpenSpec。
- 所有设计必须以 `README.md` 与 `docs/technical-architecture.md` 的最新版本为准。
- 禁止把 MyTeam 写成既有平台的子模块；它是独立新项目。

## 与工作流的关系

MyTeam 当前采用轻量工作流：

```text
brainstorming
  -> OpenSpec propose / explore
  -> implementation
  -> validation / replay / evidence
  -> OpenSpec archive
```

`brainstorming` 用于澄清需求和探索方案；OpenSpec 用于正式变更沉淀；后续自迭代流程用于验证闭环和修复收敛。

## 技术红线

- 不把 MyTeam 描述成任何既有平台的子模块。
- 不让用户承担工程拆解、日志理解和状态追踪负担。
- 不在 turn、tool-call、消息流粒度反复启动 `myteam` 自身。
- 不为 `run`、`serve`、`replay` 写多套业务实现。
- 不让 workspace 插件直接写核心内部状态。
- 不用健康检查、mock 或纯 API 成功冒充真实任务完成。
- 不静默吞掉失败、权限缺失、浏览器缺失或工具不可用。
