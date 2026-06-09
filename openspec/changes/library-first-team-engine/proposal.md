# Change Proposal: library-first-team-engine

## 为什么

MyTeam 需要的是一套可被本地 CLI、未来业务服务器和 replay 共同使用的团队执行语义，而不是把 CLI 设计成服务进程或平台控制面。

本变更将 MyTeam 明确为 **library-first** 项目：`TeamEngine` 是公开库 API，负责把 `TaskRequest` 推进成可观察、可取消、可回放、可验收的运行过程。业务服务器后续通过 import MyTeam library 集成，并自行决定 HTTP、SSE、WebSocket、鉴权、多租户、队列和持久化策略。

CLI 只保留两个边界：

- 默认命令：一次性执行任务，等价于“run”，但不需要显式 `run` 子命令。
- `replay`：特殊诊断 / 复盘命令，基于 `TaskRecord` 或 `ReplayCase` 重新执行或解释差异。

因此 MyTeam 不需要 `myteam serve`，也不需要 `myteam run`。需要对齐的是 **library API / 默认 CLI 执行 / replay** 的执行语义，而不是 CLI 与内置服务之间的协议一致性。

## 变更内容

- 新增 `team-engine-entrypoints` 能力规约，定义 library-first 的 TeamEngine 入口语义。
- 将 `TeamEngine` 定义为 MyTeam 的公开库执行核心，而不是 CLI 命令实现、HTTP server、任务队列或平台控制面。
- 明确服务器集成方式：宿主服务器 import MyTeam library，并将自身协议转换为 MyTeam 公共契约。
- 明确 CLI 默认命令就是一次性任务执行：`myteam "..." --workspace . --json` 或 `myteam --task "..." --workspace . --json`。
- 明确不提供 `myteam serve`，不要求显式 `myteam run`。
- 保留 `myteam replay` 作为特殊诊断 / 复盘命令。
- 定义最小接口：`openSession`、`resumeSession`、`forkSession`、`start`、`stream`、`check`、`outcome`、`cancel`。
- 定义 `sessionId`、`turnId`、`taskId` 与 `runId` 的关系，以及会话 transcript、事件流、状态、最终结果、取消、replay 与错误语义。
- 明确生产服务器、高频消息、turn 和 tool-call 不得通过反复启动 CLI 完成。

## 能力范围

### 新增能力

- `team-engine-entrypoints`
  - TeamEngine 公共 library API。
  - library API、默认 CLI 执行、replay 的一致性约束。
  - 宿主服务器通过 library 集成 TeamEngine 的边界。
  - `sessionId`、`turnId`、`runId`、`RunStatus`、`SessionCursor`、`EventCursor`、`ConversationSession`、`ActiveRun` 等运行时对象。
  - 默认 CLI 执行与 replay 的验收标准。

### 修改能力

- `task-lifecycle`：后续实现时应以 TeamEngine 作为 `TaskRequest -> TaskResult` 生命周期入口。
- `task-events-evidence`：事件必须能同时服务 library consumer、默认 CLI 输出和 replay。
- `team-orchestration`：PM / Professional Agent 执行必须由 TeamEngine 驱动，不被 CLI 或宿主服务器入口直接绕过。

## 影响范围

- `README.md`：补充 library-first、默认 CLI 执行和 replay 的说明，不放工程目录结构。
- `docs/technical-architecture.md`：更新运行模式，并沉淀 monorepo 工程目录与包边界。
- `packages/engine/*`：阶段 1 承载 TeamEngine、公共 contracts 目录、workflow、workspace、tools、runtime adapters、records 与 replay exporter。
- `packages/cli/*`：默认命令调用 TeamEngine；`replay` 命令基于 TaskRecord / ReplayCase。
- 后续可在接口稳定、出现第二消费方或目录/lint 约束不足时，再将 `contracts`、`workflow`、`workspace`、`tools`、`runtime-*`、`testkit` 提升为独立包。

## 非目标

- 不在本变更中实现 `myteam serve`、HTTP server、SSE server、WebSocket server 或外部控制面 attach。
- 不在本变更中实现完整平台控制面、用户账号、发布托管、沙箱、质量平台或通用项目管理系统。
- 不把 MyTeam 改写成某个外部平台的子模块；MyTeam 仍是独立 library-first 项目。
- 不要求第一阶段必须实现远程分布式 worker、队列系统或持久化数据库。
- 不让 CLI 成为生产高频消息流、turn 或 tool-call 的实现机制。
- 不把 TeamEngine 命名为通用 `TaskRuntime`、`Orchestrator` 或 `WorkSession`；本变更明确采用 `TeamEngine`。

## 风险

- 如果默认 CLI 与 library API 分别补默认值，可能破坏语义一致性；必须由统一 request normalizer 处理。
- 如果宿主服务器绕过 TeamEngine 直接调用 PM 或 Agent，会形成第二套执行语义；需要通过公开 API 边界避免。
- 如果 `stream` 事件没有稳定序号，宿主服务器的事件传输和 replay 会失真。
- 如果 `outcome` 等待语义没有超时策略，CLI 或宿主服务器可能被长时间阻塞。
- 如果取消只中断外层 promise 而不传递到 PM、Agent 和工具，可能产生悬挂进程或错误 evidence。
- 如果 replay 读取 CLI 专用日志而不是 TaskRecord / EventLog，会造成 library 路径不可复盘。
