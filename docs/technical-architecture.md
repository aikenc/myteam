# MyTeam 技术架构

> MyTeam 是一个独立的 AI 工作小团队项目。本文定义它的工程边界、核心对象、运行模式、Agent 协作模型、事件与证据要求，以及"PM + 专业 CLI Agent"如何把用户目标推进成可靠结果。

## 1. 架构目标

MyTeam 要把"用户说目标"转成"工作小团队可执行、可观察、可回放、可验收的推进过程"。它的重点不是模拟一个会聊天的 Coding Agent，而是把偏工程师化的工具体验改造成对人极度友好的协作体验：用户自然表达，PM 负责理解与沟通、推进与验收，专业 CLI Agent 负责执行。

目标：

- 提供统一 `TeamEngine`，承载 PM、专业 Agent 的协作与任务生命周期。
- 以 library-first 方式提供稳定集成面，让宿主服务器通过 import MyTeam library 接入。
- 让用户始终知道事情是否收到、正在做什么、卡在哪里、下一步是什么。
- 让每个任务都有负责人、计划、状态、证据、验收和明确结果。
- 让默认 CLI、宿主服务器和 replay 共享同一工作流核心。
- 通过 workspace 插件层装载项目人格、成员、技能和工具。
- 生成结构化事件、任务记录、证据链和 replay case。

非目标：

- 不做通用项目管理系统。
- 不做大型平台控制面。
- 不做内置 HTTP / SSE / WebSocket 服务入口。
- 不做 artifact hosting、preview、tunnel 或发布平台。
- 不做虚拟机、宿主机权限代理或沙箱管理。
- 不把质量平台、运营平台或监控平台内置进核心。

## 2. 总体结构

```text
Default CLI argv / stdin          Host Server / App Code              Replay CLI
        |                                  |                              |
        v                                  v                              v
+------------------+            +----------------------+       +-------------------+
| CLI Adapter      |            | import myteam library|       | Replay Adapter    |
| myteam <task>    |            | createTeamEngine()   |       | myteam replay     |
+--------+---------+            +----------+-----------+       +---------+---------+
         |                                 |                             |
         | TaskRequest / options           | TaskRequest / options        | ReplayCase / TaskRecord
         +------------------+--------------+-----------------------------+
                            v
+---------------------------------------------------------------------+
|                               MyTeam                                |
|                                                                     |
|                      +----------------------------+                 |
|                      |         TeamEngine          |                 |
|                      | task lifecycle / session    |                 |
|                      | event bus / records         |                 |
|                      | tool registry / errors      |                 |
|                      +-------------+--------------+                 |
|                                    |                                |
|     +-------------------+     +----v----------------------------+   |
|     | Workspace Loader  |     |        Team Orchestration         |   |
|     | SOUL.md           |     | PM -> Agents                      |   |
|     | agents/ skills/   |     +----------------+------------------+   |
|     | tools/ config     |                      |                      |
|     +-------------------+                      |                      |
|                               +----------------v----------------+     |
|                               |     Professional CLI Agents      |     |
|                               | coder / browser / docs / qa      |     |
|                               +----------------+----------------+     |
|                                                |                      |
|                               +----------------v----------------+     |
|                               |      Tool & Capability Adapters   |     |
|                               | shell / file / browser / CLI      |     |
|                               +---------------------------------+     |
+---------------------------------------------------------------------+
                            |
                            | TaskResult / Evidence / TaskRecord / ReplayCase
                            v
                    User-visible Response / Host Response
```

## 3. 内部边界

```text
TeamEngine
  owns: task lifecycle / session view / event bus / tool registry / error model / records
  does not own: concrete business skills, host-server protocols, or product-specific workflows

Workspace Layer
  owns: SOUL.md / agents / skills / tool manifests / workspace config
  does not own: core private state or secrets

Team Orchestration
  owns: PM -> professional agents flow
  does not own: concrete tool implementations

Professional Agent Adapters
  owns: task-specific execution policy and CLI wrapping
  does not own: overall task direction or user-facing commitment

Tool & Capability Adapters
  owns: controlled access to file / shell / browser / external CLI
  does not own: planning, acceptance, or user communication
```

边界原则：

- PM 面向用户体验和沟通闭环，负责推进和验收，不直接做复杂执行，不绕过工具权限直接操作环境。
- 专业 Agent 只对被委派的任务负责，不直接向用户承诺最终结果。
- 工具适配器只执行受控动作，不参与任务决策。
- workspace 插件只能通过公开扩展点影响成员、技能和工具，不能导入核心私有模块。

## 4. 核心概念

### 4.1 PM Agent

PM 是用户入口和工作群的组织者，职责是把系统变得像"懂人的同事"而不是一个只会输出工程日志的工具，同时让事情高质量推进：

- 识别用户目标、上下文、隐含约束、交付口径和表达中的不确定性。
- 用自然、克制、可靠的方式确认"我收到了、我理解的是不是这样、接下来会怎么推进"。
- 在必要时向用户澄清，但默认先基于上下文做合理假设并推进，避免把执行负担甩回给用户。
- 把工程化状态翻译成人能理解的进度、阻塞、风险和结果说明。
- 把用户目标拆解为计划、里程碑、负责人和验收点。
- 根据 workspace 能力选择专业 Agent，并明确每个委派任务的输入、输出和完成标准。
- 控制并发、依赖、预算、超时和失败重试。
- 跟踪每件事的状态：未开始、进行中、阻塞、待验收、已完成、失败。
- 检查专业 Agent 的产出是否满足交付口径，必要时要求返工或调整方案。
- 汇总证据、风险、剩余问题和最终结论，并向用户交付可用结果、明确失败说明或下一步。

PM 不直接做复杂执行，不绕过 `TeamEngine` 的事件、工具和权限模型。PM 的底线是：事事有 owner，件件有状态，最终有结果或明确交代。

### 4.2 Professional CLI Agent

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

### 4.3 TeamEngine / Agent Core

`TeamEngine` 是团队协作语义核心，不是业务能力全集，也不是 CLI 命令、HTTP server 或平台控制面。

职责：

- `TaskRequest` 到 `TaskResult` 的生命周期。
- 会话上下文、workspace view、短期任务状态。
- Agent catalog、tool registry、capability discovery。
- 事件模型、错误模型、任务记录。
- replay 导入导出。
- library API、默认 CLI 和 replay 的共享执行内核。

不属于 `TeamEngine`：具体调研能力、表格整理能力、网页生成能力、发布托管、用户账号系统、监控运营系统、宿主服务器协议。

### 4.4 PI-backed InternalAgentRuntime

MyTeam 不自研底层单 AgentLoop。内部 Agent 通过 PI-backed `InternalAgentRuntime` 执行单个 Agent 的 LLM 推理与工具调用，MyTeam 在其上保留团队级工作流语义。

```text
PI AgentLoop
  owns: LLM stream / tool call / tool result / turn lifecycle / skills / compaction
  does not own: MyTeam TaskResult / TaskEvent / Evidence / ReplayCase / PM 状态机

MyTeam TeamWorkflowLoop
  owns: PM driver / plan / delegate / verify / finalize / fail / run record / replay
  uses: InternalAgentRuntime 或 CLIAgentRuntime 完成被委派的成员 turn
```

`InternalAgentRuntime` 负责把 `SOUL.md`、Agent profile、capability block 和 MyTeam tool 注册映射到 PI；同时把 PI event、final message、tool result 映射回 MyTeam `TaskEvent`、`AgentTurnResult` 与 `Evidence`。PI 的私有类型只存在于 runtime adapter 内部，不能泄漏到公共 contracts。

## 5. 运行模式

### 5.1 Library API

Library API 是 MyTeam 的正式集成面，供宿主服务器或其他应用调用。

```ts
import { createTeamEngine } from 'myteam';

const engine = createTeamEngine({ workspace });
const activeRun = await engine.start(taskRequest);
const result = await engine.outcome(activeRun.runId, { wait: true });
```

特点：

- 宿主服务器负责 HTTP、SSE、WebSocket、鉴权、多租户、队列和部署。
- MyTeam 只提供 `TeamEngine` 执行语义、事件、证据和记录。
- 宿主服务器不得导入 MyTeam 私有 workflow 模块绕过 `TeamEngine`。

### 5.2 默认 CLI

CLI 根命令就是本地一次性任务执行，不需要显式 `run` 子命令。

```bash
myteam "生成项目 README" --workspace /path/to/workspace --json
myteam --task "生成项目 README" --workspace /path/to/workspace --json
cat task.md | myteam --workspace /path/to/workspace --json
```

特点：

- 单次启动，单次任务，完成即退出。
- `stdout` 输出 JSON `TaskResult`。
- `stderr` 输出日志和进度。
- 必须复用 `TeamEngine`，不能拥有 CLI 专用业务路径。
- 必须生成 `TaskRecord` 与 replay case。

### 5.3 `replay`

用于复现历史任务或解释差异。

```bash
myteam replay --run-id <run-id> --workspace /path/to/workspace --json
myteam replay --case .myteam/runs/run_xxx/replay.json --json
```

要求：

- replay 基于 `TaskRecord`、`EventLog`、`Evidence` 和 `ReplayCase`。
- replay 可以真实重跑，也可以执行明确标记的 evidence replay。
- replay 不允许依赖隐藏默认值、CLI 私有日志或不可追踪状态。

## 6. 统一工作流

```text
TaskRequest
  -> validate request
  -> resolve workspace
  -> load SOUL.md / agents / skills / tools
  -> build AgentCatalog
  -> build ToolRegistry
  -> create TaskContext
  -> PM understands user goal
  -> PM creates plan and acceptance criteria
  -> PM delegates to Professional Agents
  -> Agents execute through ToolRegistry
  -> PM verifies results and evidence
  -> PM formats final response
  -> emit TaskResult
  -> persist TaskRecord / Evidence / ReplayCase
```

Library API、默认 CLI 和 replay 的区别只在入口来源和结果通道，不在核心执行语义。

## 7. Workspace 插件层

Workspace 是 MyTeam 的能力扩展边界，对标"项目里定义团队成员和工作方式"的机制。

建议结构：

```text
workspace/
  SOUL.md                  # 用户可编辑：项目人格、工作方式、用户偏好、禁区
  agents/                  # 用户可编辑：专业 Agent 定义
    coder.md
    doc-writer.md
  skills/                  # 用户可编辑：可复用技能
    browser-research.md
    release-check.md
  tools/                   # 用户可编辑：工具声明与 capability 要求
    tools.json
  myteam.config.json       # 用户可编辑：配置，不存 secret

  .myteam/                 # MyTeam 运行时数据，不作为插件输入
    sessions/              # 会话持久化文件
      {sessionId}.json
      archives/
        {archiveId}.json
    runs/                  # TaskRecord / EventLog / Evidence / ReplayCase
      {runId}/
        record.json
        events.jsonl
        replay.json
        evidence/
    memory/                # 预留：跨会话持久化记忆
```

加载规则：

- workspace 配置必须显式、可版本化、可追踪。
- 配置缺失 fail-fast，不静默 fallback。
- secret 与高权限能力由运行环境或受控 adapter 注入，不写入 workspace 文件。
- 插件只能通过公开 extension API 影响 Agent catalog、skills、tools，不能导入核心私有模块。

## 8. 数据与事件

### 8.0 公共数据约定

公共 `TaskRequest`、`TaskResult`、`TaskEvent`、`TaskRecord`、`Evidence` 与 `ReplayCase` 使用统一数据约定：

- 对外暴露的时间字段使用 ISO 8601 字符串，便于 API、JSONL、replay 和人工排查直接阅读。
- GenetHub-compatible 的 session 存储 schema 可以保留毫秒时间戳字段，但该细节只存在于 `.myteam/sessions/` 的持久化边界内。
- 公共 ID 使用带语义前缀的不透明字符串，由 contracts 层统一生成和校验：`session_`、`turn_`、`task_`、`run_`、`ws_`、`message_`、`evidence_`、`artifact_`、`archive_`。
- 文件名只允许使用 MyTeam 公共 ID，不能直接使用 PI 内部 request/message/tool ID。
- PI 的 message/event/tool ID 只能作为 runtime adapter 内部关联字段或脱敏 evidence 元数据，不能替代 MyTeam 公共 ID。

### 8.1 TaskRequest

最小字段：

```json
{
  "taskId": "task_xxx",
  "workspaceId": "ws_xxx",
  "userMessage": "用户目标",
  "entrypoint": "library|cli|replay",
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
| `user_input_error` | 目标矛盾、必要信息缺失 | PM 澄清或给出假设 |
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
- 给用户一个清楚的"为什么这样做 / 为什么失败"。

## 11. 性能红线

- 生产服务器必须通过 library API 或自身应用架构接入 `TeamEngine`，不通过反复启动 `myteam` CLI 承载消息流。
- 每次 tool call 在进程内通过 adapter / RPC / SDK 执行，不启动 `myteam` 自身。
- 专业 Agent 可以包装外部 CLI，但必须是任务粒度或工具粒度的受控调用，并记录退出码、stdout、stderr 和 evidence。
- 浏览器、消息流、agent turn 等高频链路不得通过反复启动 CLI 实现。
- 大任务使用宿主服务器的后台 task / actor / queue，或 MyTeam 后续提供的 library-level 执行能力，不用 CLI while loop 硬扛。

## 12. 安全与权限

- MyTeam 默认运行在 workspace 权限边界内。
- 文件、浏览器、网络、shell 等能力必须来自受控 capability adapter。
- 工具调用前必须经过 capability discovery 与权限检查。
- Secret 不进入 workspace 插件文件、事件日志和 replay case。
- 高风险操作必须可审计、可回放、可归因到 taskId / actor / tool call。

## 13. 工程目录与 monorepo

MyTeam 采用 monorepo。原因是核心功能、CLI、workspace loader、tool adapter 会一起演进；用 monorepo 保持版本一致、跨包重构简单、测试集中。

### 13.0 工程基线

MyTeam 的工程基线对齐 PI，避免后续直接依赖 PI 包时出现运行时与类型系统不兼容：

- 包管理器：使用 `npm workspaces`，不引入 `pnpm-workspace.yaml`。
- Node.js：`>=22.19.0`。
- TypeScript：`5.9.x`，模块系统使用 `Node16` / `Node16`，开启 `erasableSyntaxOnly`。
- 代码质量：使用 Biome 作为格式化与 lint 基线，`npm run check` 汇总格式检查与类型检查。
- 依赖策略：直接依赖固定精确版本，`.npmrc` 开启 `save-exact=true`。

### 13.0.1 Root package 与公开入口设计

`myteam` root package 是用户侧统一入口，而不是只用于开发的 workspace root。后续实现必须让文档中的 library 和 CLI 示例真实成立：

- `import { createTeamEngine } from 'myteam'` 只暴露 `packages/engine` 的 public API，不暴露 `engine/src/` 私有路径。
- `myteam` CLI 由 `packages/cli` 实现，但只能通过 `@myteam/engine` 或 root facade 的 public API 调用 TeamEngine。
- `package.json` 的 `exports`、`types`、`bin` 与构建输出路径必须一起设计，不能让 `bin` 指向不存在或与 monorepo 输出不一致的文件。
- 当前阶段只沉淀入口契约，不开始实现 CLI 或 engine 代码。

### 13.1 分包原则

**包边界 = 冻结的接口契约。** 拆一个包的真实成本不是 `package.json` 和 tsconfig，而是在两坨代码之间定义一个公开接口并承诺维护它。接口一旦对外暴露，跨包重构就比包内重构贵一个数量级。

因此，物理分包只满足一个条件：**接口已经稳定到值得冻结，或依赖方向约束已经无法靠目录 + lint 优雅表达。**

启动期把架构图直接落地成若干 `packages/` 是最常见的浪费——那些"架构上看起来不同"的东西，在代码真正长出形态之前，接口还在剧烈变动，分出去等于反复跨包改定义，反而拖慢迭代。

不被以下理由驱动分包：

- "按职责看起来不同"——这是目录结构的理由，不是物理分包的理由。
- "将来可能独立使用"——等将来真出现第二个消费方再提，第一个消费方的使用方式都不准，提出来大概率猜错。
- "架构图长这样"——架构图是目标态，不是起步态。

### 13.2 提包的三个信号

当以下任一信号明确出现时，才把对应目录提升为独立包：

| 信号 | 含义 | 示例 |
|---|---|---|
| 接口稳定 | 公开类型 / API 已多阶段未发生破坏性变更，冻结成本低 | contracts 的 field 不再频繁调整 |
| 第二个消费方 | 不止一处需要依赖它，且两处的依赖方式一致 | workspace loader 被 engine 和 cli 分别调用 |
| lint 守不住 | 依赖方向约束无法靠 `eslint` / `import/no-restricted-paths` 优雅维持 | cli 需要禁止import engine 内部私有模块，但目录 lint 表达能力不够 |

**没有信号，就不提包。目录结构仍然保持清晰分层，但保持在同一个 npm 包内。**

### 13.3 阶段起步结构（阶段 1）

起步期只有两个物理包：

```text
myteam/
  package.json                 # npm workspaces: packages/*
  package-lock.json            # npm 锁文件，提交审查
  tsconfig.base.json
  biome.json
  docs/
  openspec/
  packages/
    engine/                    # 含 contracts、workflow、workspace loader、tools、runtime adapter 等全部核心
    cli/                       # 默认 myteam <task> 与 myteam replay
  tests/
    contract/
    integration/
```

`engine` 内部用目录维持边界：

```text
packages/engine/src/
  contracts/            # TaskRequest / TaskResult / TaskEvent / Evidence — 靠 lint 禁止 import 其他目录
  workspace/            # SOUL.md / agents / skills / tools 加载器
  tools/                # tool registry、capability discovery、内置 adapters
  workflow/             # PM driver / project state / actions
  engine.ts             # TeamEngine 核心：run store、event log、records、replay exporter
```

核心约束：

- `contracts/` 不 import engine 内其他业务目录（lint 强制）。
- `cli/` 只能依赖 `engine` 的 public API（包边界强制），不能 import `engine/src/` 内部路径。
- 其余目录间允许互相引用，它们在同一个包里、一起高频重构。

### 13.4 目标态展望（供后续提包参考）

当三个信号陆续触发后，终态可能收敛为：

```text
myteam/
  packages/
    contracts/                 # 从 engine/src/contracts/ 提包（信号：接口稳定）
    engine/                    # TeamEngine 核心（收缩到组装层）
    workflow/                  # 从 engine/src/workflow/ 提包（信号：多 Agent 编排稳定）
    workspace/                 # 从 engine/src/workspace/ 提包（信号：出现第二个消费方）
    tools/                     # 从 engine/src/tools/ 提包（信号：接口稳定）
    runtime-internal-agent/    # InternalAgentRuntime adapter（信号：runtime 接口稳定）
    runtime-cli-agent/         # 外部 CLI Agent runtime（信号：runtime 接口稳定）
    cli/                       # 默认入口
    testkit/                   # fixtures、contract test helpers（信号：跨包共享测试工具刚需出现）
  tests/
    contract/
    integration/
    replay/
```

依赖方向保持不变：

```text
contracts
  <- workspace
  <- tools
  <- runtime-internal-agent
  <- runtime-cli-agent
  <- workflow
  <- engine
  <- cli
```

### 13.5 硬约束（贯穿所有阶段）

- `contracts` 不依赖任何业务实现、CLI 或 runtime adapter。
- `cli` 只能依赖 `engine` 的 public API，不能 import engine 私有模块。
- 不设置 `apps/server` 或 `packages/server`；服务器由宿主项目通过 library API 自行集成。
- 不为了"看起来架构完整"拆出空包；每个包提出来时必须有清晰 owner、稳定的接口和真实调用方。
- 不把 PI 或外部 CLI 的私有类型泄漏到 contracts。
- workspace 配置不存 secret。

## 14. 渐进落地计划

### 阶段 0：文档与边界

- 完成 README 与技术架构。
- 固化 MyTeam 是独立新项目，不挂靠任何既有平台叙事。
- 明确 PM、专业 Agent、TeamEngine、workspace 插件层。
- 明确 monorepo 包边界和依赖方向。

### 阶段 1：最小 TeamEngine

- 定义 `TaskRequest`、`TaskResult`、`TaskEvent`。
- 实现 library API：`createTeamEngine()`、`start()`、`stream()`、`check()`、`outcome()`、`cancel()`。
- 加载最小 workspace：`SOUL.md` + 内置 `pm` + 一个 `doc-writer` 或 `coder`。
- 定义 PI-backed `InternalAgentRuntime` 的接口与映射契约；实际 PI 依赖和 adapter 实现进入后续实现阶段。
- 生成 `TaskRecord` 与 replay case。

### 阶段 2：默认 CLI

- 实现 `myteam "..." --workspace ... --json`。
- 实现 `myteam --task "..." --workspace ... --json`。
- 实现 stdin 输入。
- 确认 CLI 只调用 TeamEngine public API，不包含 CLI 专用业务 fallback。

### 阶段 3：Team Orchestration

- 引入 PM -> Professional Agent 的真实委派链路。
- 支持多 Agent 顺序协作和简单返工。
- 引入 tool registry 与 capability adapter。

### 阶段 4：Replay 与改进闭环

- 实现 `myteam replay`。
- 支持基于历史任务回放验证修复。
- 输出 failure fingerprint 候选和 evidence bundle。
- 形成"发现问题 -> 调整 Agent / skill / tool -> replay 验证"的改进循环。

## 15. 最小验收标准

MyTeam 第一版可认为成立，当且仅当：

- 一个 workspace 任务可以通过 library API 完成并输出结构化 `TaskResult`。
- 默认 CLI 可以复用同一 TeamEngine 执行任务。
- PM、至少一个专业 Agent 形成真实协作，而不是单 prompt 假装团队。
- 每次运行都有事件、证据、错误语义和 replay case。
- 用户能看到"已收到、正在做、卡住了、完成了、为什么失败"。
- 失败不会静默吞掉，也不会只返回日志。

## 16. 技术红线

- 不把 MyTeam 描述成任何既有平台的子模块；它是独立新项目。
- 不把具体业务能力堆进 `TeamEngine`。
- 不按一堆空泛 contract 拆出没有真实闭环的碎片。
- 不让 CLI 进入 turn / tool-call / 消息流高频路径。
- 不内置 `myteam serve` 作为生产服务入口。
- 不要求 `myteam run` 作为一次性执行入口；默认 CLI 即执行任务。
- 不为 library API、默认 CLI、replay 维护多套业务实现。
- 不跨边界直接写核心私有状态。
- 不用健康检查、mock、纯 API 成功替代真实任务完成。
- 不静默降级关键能力，尤其是浏览器、shell、文件和权限能力。
