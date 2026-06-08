# MyTeam 技术架构

> MyTeam 是一个独立的 AI 工作小团队项目。本文定义它的工程边界、核心对象、运行模式、Agent 协作模型、事件与证据要求，以及“秘书 + PM + 专业 CLI Agent”如何把用户目标推进成可靠结果。

## 1. 架构目标

MyTeam 要把“用户说目标”转成“工作小团队可执行、可观察、可回放、可验收的推进过程”。它的重点不是模拟一个会聊天的 Coding Agent，而是把偏工程师化的工具体验改造成对人极度友好的协作体验：用户自然表达，秘书负责理解与沟通，PM 负责推进与验收，专业 CLI Agent 负责执行。

目标：

- 提供统一 `Agent Core`，承载秘书、PM、专业 Agent 的协作。
- 让用户始终知道事情是否收到、正在做什么、卡在哪里、下一步是什么。
- 让每个任务都有负责人、计划、状态、证据、验收和明确结果。
- 支持 `run`、`serve`、`replay` 三种外壳，但共享同一工作流核心。
- 通过 workspace 插件层装载项目人格、成员、技能和工具。
- 生成结构化事件、任务记录、证据链和 replay case。

非目标：

- 不做通用项目管理系统。
- 不做大型平台控制面。
- 不做 artifact hosting、preview、tunnel 或发布平台。
- 不做虚拟机、宿主机权限代理或沙箱管理。
- 不把质量平台、运营平台或监控平台内置进核心。

## 2. 总体结构

```text
                              User / Client
                                   |
                                   | natural language / feedback / constraints
                                   v
+---------------------------------------------------------------------+
|                               MyTeam                                |
|                                                                     |
|  +-------------------+        +-----------------------------------+  |
|  | CLI / Server API  | -----> |            Agent Core             |  |
|  +-------------------+        | task lifecycle                    |  |
|                               | context / memory view             |  |
|  run / serve / replay         | event bus                         |  |
|                               | tool registry                     |  |
|                               | error model                       |  |
|                               +----------------+------------------+  |
|                                                |                     |
|     +-------------------+     +----------------v------------------+  |
|     | Workspace Loader  |     |        Team Orchestration         |  |
|     | SOUL.md           |     | Secretary -> PM -> Agents         |  |
|     | agents/ skills/   |     +----------------+------------------+  |
|     | tools/ config     |                      |                     |
|     +-------------------+                      |                     |
|                               +----------------v----------------+    |
|                               |     Professional CLI Agents      |    |
|                               | coder / browser / docs / qa      |    |
|                               +----------------+----------------+    |
|                                                |                     |
|                               +----------------v----------------+    |
|                               |      Tool & Capability Adapters   |    |
|                               | shell / file / browser / CLI      |    |
|                               +---------------------------------+    |
+---------------------------------------------------------------------+
                                   |
                                   | result / evidence / task history
                                   v
                           User-visible Response
```

## 3. 内部边界

```text
Agent Core
  owns: task lifecycle / event bus / tool registry / error model
  does not own: concrete business skills or product-specific workflows

Workspace Layer
  owns: SOUL.md / agents / skills / tool manifests / workspace config
  does not own: core private state or secrets

Team Orchestration
  owns: secretary -> PM -> professional agents flow
  does not own: concrete tool implementations

Professional Agent Adapters
  owns: task-specific execution policy and CLI wrapping
  does not own: overall task direction or user-facing commitment

Tool & Capability Adapters
  owns: controlled access to file / shell / browser / external CLI
  does not own: planning, acceptance, or user communication
```

边界原则：

- 秘书只面向用户体验和沟通闭环，不直接做复杂执行。
- PM 只负责推进和验收，不绕过工具权限直接操作环境。
- 专业 Agent 只对被委派的任务负责，不直接向用户承诺最终结果。
- 工具适配器只执行受控动作，不参与任务决策。
- workspace 插件只能通过公开扩展点影响成员、技能和工具，不能导入核心私有模块。

## 4. 核心概念

### 4.1 Secretary Agent

秘书是用户入口，职责是把系统变得像“懂人的同事”，而不是一个只会输出工程日志的工具：

- 识别用户目标、上下文、隐含约束、交付口径和表达中的不确定性。
- 用自然、克制、可靠的方式确认“我收到了、我理解的是不是这样、接下来会怎么推进”。
- 在必要时向用户澄清，但默认先基于上下文做合理假设并推进，避免把执行负担甩回给用户。
- 将用户语言转成 PM 可执行的 `TaskBrief`。
- 把工程化状态翻译成人能理解的进度、阻塞、风险和结果说明。
- 最终返回可用结果、明确失败说明或下一步，而不是只返回日志。

秘书不直接做复杂执行，不直接调度专业 Agent；它负责用户体验、理解质量和沟通闭环。

### 4.2 PM Agent

PM 是工作群的组织者，职责是让事情高质量推进，而不是让多个 Agent 各自散跑：

- 把 `TaskBrief` 拆解为计划、里程碑、负责人和验收点。
- 根据 workspace 能力选择专业 Agent，并明确每个委派任务的输入、输出和完成标准。
- 控制并发、依赖、预算、超时和失败重试。
- 跟踪每件事的状态：未开始、进行中、阻塞、待验收、已完成、失败。
- 检查专业 Agent 的产出是否满足交付口径，必要时要求返工或调整方案。
- 汇总证据、风险、剩余问题和最终结论并交回秘书。

PM 可以委派、追问、要求返工，但不绕过 `Agent Core` 的事件、工具和权限模型。PM 的底线是：事事有 owner，件件有状态，最终有结果或明确交代。

### 4.3 Professional CLI Agent

专业 CLI Agent 是可被 PM 委派的能力成员。它们可以包装开源 CLI、内部工具或模型能力，但必须被统一管理。

基本要求：

- 明确 `capability`、输入 schema、输出 schema。
- 所有外部调用经过 tool registry 或 capability adapter。
- 输出可验证证据，而不仅是自然语言总结。
- 失败必须结构化，包含原因、影响、是否可重试、建议下一步。

早期建议内置：

| Agent | 职责 | 典型工具 |
|---|---|---|
| `coder` | 代码阅读、修改、测试、修复 | shell、git、语言工具链 |
| `doc-writer` | README、架构文档、交付说明 | file、markdown checker |
| `browser` | 调研、页面验证、截图、交互 | browser capability、Playwright |
| `data-worker` | CSV、表格、结构化资料整理 | parser、spreadsheet 工具 |
| `qa` | 回归、检查、证据整理 | test runner、linter |

### 4.4 Agent Core

`Agent Core` 是团队协作语义核心，不是业务能力全集。

职责：

- `TaskRequest` 到 `TaskResult` 的生命周期。
- 会话上下文、workspace view、短期任务状态。
- Agent catalog、tool registry、capability discovery。
- 事件模型、错误模型、任务记录。
- replay 导入导出。
- `run`、`serve`、`replay` 的共享执行内核。

不属于 `Agent Core`：具体调研能力、表格整理能力、网页生成能力、发布托管、用户账号系统、监控运营系统。

## 5. 运行模式

### 5.1 `run`

用于本地执行、测试、诊断和一次性任务。

```bash
myteam run --task "生成项目 README" --workspace /path/to/workspace --json
```

特点：

- 单次启动，单次任务，完成即退出。
- `stdout` 输出 JSON `TaskResult`。
- `stderr` 输出日志和进度。
- 必须生成 `TaskRecord` 与 replay case。

### 5.2 `serve`

用于持续对话和多轮任务推进。

```bash
myteam serve --workspace /path/to/workspace --port 4317
```

特点：

- 长驻进程，暴露 HTTP / WebSocket / SSE 接口。
- 接收 `TaskRequest` 或 conversation message。
- 持续回传事件与最终结果。
- 高频 turn、tool call、消息流都在进程内处理。

### 5.3 `replay`

用于复现历史任务。

```bash
myteam replay --run-id <run-id> --workspace /path/to/workspace --json
```

要求：

- `serve` 中的一次任务可导出为 replay case。
- `run` 中的一次任务也可导出为 replay case。
- replay 不允许依赖隐藏默认值或不可追踪状态。

## 6. 统一工作流

```text
TaskRequest
  -> validate request
  -> resolve workspace
  -> load SOUL.md / agents / skills / tools
  -> build AgentCatalog
  -> build ToolRegistry
  -> create TaskContext
  -> Secretary understands user goal
  -> Secretary creates TaskBrief
  -> PM creates plan and acceptance criteria
  -> PM delegates to Professional Agents
  -> Agents execute through ToolRegistry
  -> PM verifies results and evidence
  -> Secretary formats final response
  -> emit TaskResult
  -> persist TaskRecord / Evidence / ReplayCase
```

`run`、`serve`、`replay` 的区别只在请求来源和结果通道，不在核心执行语义。

## 7. Workspace 插件层

Workspace 是 MyTeam 的能力扩展边界，对标“项目里定义团队成员和工作方式”的机制。

建议结构：

```text
workspace/
  SOUL.md                  # 项目人格、工作方式、用户偏好、禁区
  agents/
    coder.md               # 专业 Agent 定义
    doc-writer.md
  skills/
    browser-research.md    # 可复用技能
    release-check.md
  tools/
    tools.json             # 工具声明与 capability 要求
  myteam.config.json       # 配置，不存 secret
```

加载规则：

- workspace 配置必须显式、可版本化、可追踪。
- 配置缺失 fail-fast，不静默 fallback。
- secret 与高权限能力由运行环境或受控 adapter 注入，不写入 workspace 文件。
- 插件只能通过公开 extension API 影响 Agent catalog、skills、tools，不能导入核心私有模块。

## 8. 数据与事件

### 8.1 TaskRequest

最小字段：

```json
{
  "taskId": "task_xxx",
  "workspaceId": "ws_xxx",
  "userMessage": "用户目标",
  "mode": "run|serve|replay",
  "constraints": {},
  "contextRefs": [],
  "requestedArtifacts": []
}
```

### 8.2 TaskResult

最小字段：

```json
{
  "taskId": "task_xxx",
  "status": "succeeded|failed|partial",
  "summary": "交付摘要或失败说明",
  "artifacts": [],
  "evidence": [],
  "errors": [],
  "replayRef": "replay_xxx"
}
```

### 8.3 TaskEvent

事件用于驱动 UI 状态、任务历史、调试和复盘。

建议事件类型：

- `task.started`
- `workspace.loaded`
- `secretary.brief.created`
- `pm.plan.created`
- `pm.task.delegated`
- `agent.step.started`
- `tool.call.started`
- `tool.call.completed`
- `artifact.produced`
- `pm.acceptance.checked`
- `task.completed`
- `task.failed`

事件原则：

- 事件是事实日志，不是 UI 文案。
- 事件含时间、taskId、workspaceId、actor、关联 subtaskId。
- 错误事件必须含可分类 code、可重试性、影响范围。
- 不在事件中写入 secret。

## 9. 错误模型

错误分层：

| 层级 | 示例 | 处理 |
|---|---|---|
| `user_input_error` | 目标矛盾、必要信息缺失 | Secretary 澄清或给出假设 |
| `workspace_error` | 配置缺失、插件无效 | fail-fast，指出文件与字段 |
| `capability_error` | 浏览器不可用、shell 权限不足 | 明确能力缺失与替代方案 |
| `agent_error` | 专业 Agent 输出无效 | PM 返工、换 Agent 或失败 |
| `artifact_error` | 产物生成或校验失败 | PM 调整计划或返回明确失败 |
| `system_error` | 进程崩溃、协议异常 | 标记不可恢复并保留 replay 证据 |

失败返回要求：

- 明确失败点。
- 已完成什么。
- 缺什么能力或信息。
- 是否可重试。
- 下一步建议。
- 对应 evidence / event 引用。

## 10. 任务记录与复盘

MyTeam 不只返回一句回答，还要沉淀任务过程，支撑调试、复盘和持续改进。

必须输出：

- `TaskRecord`：输入、配置版本、workspace、耗时、状态、退出语义。
- `EventLog`：结构化事件流。
- `Evidence`：文件 diff、命令结果、截图、URL、测试结果等。
- `ReplayCase`：可复现输入、环境摘要、依赖版本、脱敏上下文。
- `FailureFingerprint` 候选：不包含用户私密信息，便于识别共性问题。

这些材料用于：

- 复现历史任务。
- 分析失败原因。
- 验证修复是否有效。
- 改进 Agent、技能和工具适配器。
- 给用户一个清楚的“为什么这样做 / 为什么失败”。

## 11. 性能红线

- 持续对话必须使用 `serve` 长驻进程，不允许每条消息启动一次 `myteam`。
- 每次 tool call 在进程内通过 adapter / RPC / SDK 执行，不启动 `myteam` 自身。
- 专业 Agent 可以包装外部 CLI，但必须是任务粒度或工具粒度的受控调用，并记录退出码、stdout、stderr 和 evidence。
- 浏览器、消息流等高频链路不得通过反复启动 CLI 实现。
- 大任务使用后台 task / actor，不用 CLI while loop 硬扛。

## 12. 安全与权限

- MyTeam 默认运行在 workspace 权限边界内。
- 文件、浏览器、网络、shell 等能力必须来自受控 capability adapter。
- 工具调用前必须经过 capability discovery 与权限检查。
- Secret 不进入 workspace 插件文件、事件日志和 replay case。
- 高风险操作必须可审计、可回放、可归因到 taskId / actor / tool call。

## 13. 渐进落地计划

### 阶段 0：文档与边界

- 完成 README 与技术架构。
- 固化 MyTeam 是独立新项目，不挂靠任何既有平台叙事。
- 明确秘书、PM、专业 Agent、Agent Core、workspace 插件层。

### 阶段 1：最小 Agent Core

- 实现 `myteam run --task ... --workspace ... --json`。
- 定义 `TaskRequest`、`TaskResult`、`TaskEvent`。
- 加载最小 workspace：`SOUL.md` + 内置 `pm` + 一个 `doc-writer` 或 `coder`。
- 生成 `TaskRecord` 与 replay case。

### 阶段 2：Team Orchestration

- 引入 Secretary -> PM -> Professional Agent 的真实委派链路。
- 支持多 Agent 顺序协作和简单返工。
- 引入 tool registry 与 capability adapter。

### 阶段 3：Serve 长驻

- 实现 `myteam serve --port <port>`。
- 支持 HTTP / WebSocket / SSE 的任务输入与事件输出。
- 保证 `run`、`serve`、`replay` 共享执行核心。

### 阶段 4：复盘与改进闭环

- 导出 replay case。
- 支持基于历史任务回放验证修复。
- 输出 failure fingerprint 候选和 evidence bundle。
- 形成“发现问题 -> 调整 Agent / skill / tool -> replay 验证”的改进循环。

## 14. 最小验收标准

MyTeam 第一版可认为成立，当且仅当：

- 一个 workspace 任务可以通过 `run` 完成并输出结构化 `TaskResult`。
- 同一任务可以进入 `serve` 路径，且行为语义一致。
- Secretary、PM、至少一个专业 Agent 形成真实协作，而不是单 prompt 假装团队。
- 每次运行都有事件、证据、错误语义和 replay case。
- 用户能看到“已收到、正在做、卡住了、完成了、为什么失败”。
- 失败不会静默吞掉，也不会只返回日志。

## 15. 技术红线

- 不把 MyTeam 描述成任何既有平台的子模块；它是独立新项目。
- 不把具体业务能力堆进 `Agent Core`。
- 不按一堆空泛 contract 拆出没有真实闭环的碎片。
- 不让 CLI 进入 turn / tool-call / 消息流高频路径。
- 不为 `run`、`serve`、`replay` 维护多套业务实现。
- 不跨边界直接写核心私有状态。
- 不用健康检查、mock、纯 API 成功替代真实任务完成。
- 不静默降级关键能力，尤其是浏览器、shell、文件和权限能力。
