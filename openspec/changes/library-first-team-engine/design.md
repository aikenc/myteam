# Design: library-first-team-engine

## 背景

MyTeam 的核心不是提供一个 CLI 服务进程，而是提供一套稳定的团队执行语义。CLI 只是本地调试和一次性执行入口；生产服务器应通过 import MyTeam library 集成，并自行承担 HTTP、SSE、WebSocket、鉴权、多租户、队列和部署策略。

因此本设计将入口收敛为三类：

```text
Library API        -> 正式集成面，供宿主服务器或其他应用调用
Default CLI        -> 本地一次性执行任务；默认就是 run，不需要 run 子命令
Replay CLI         -> 特殊诊断 / 复盘入口
```

`TeamEngine` 是 MyTeam 的团队执行引擎。它不代表通用任务队列、HTTP server 或平台控制面；它负责把一个 `TaskRequest` 推进成可观察、可取消、可回放、可验收的运行过程。

## 总体结构

```text
Default CLI argv / stdin           Host Server / App Code             Replay CLI
        |                                   |                             |
        v                                   v                             v
+------------------+             +----------------------+      +-------------------+
| CLI Adapter      |             | import myteam library|      | Replay Adapter    |
| myteam <task>    |             | createTeamEngine()   |      | myteam replay     |
+--------+---------+             +----------+-----------+      +---------+---------+
         |                                  |                            |
         | TaskRequest / options            | TaskRequest / options       | ReplayCase / TaskRecord
         +------------------+---------------+----------------------------+
                            v
                     +-------------+
                     | TeamEngine  |
                     | start       |
                     | stream      |
                     | check       |
                     | outcome     |
                     | cancel      |
                     +------+------+ 
                            |
                            v
              Team Workflow / TeamEngine
      PM Driver -> InternalAgent / CLIAgent
                            |
                            v
       TaskEvent / Evidence / TaskRecord / ReplayCase
```

## 工程组织：monorepo

MyTeam 采用 monorepo，而不是单 package 或多仓库。原因是 TeamEngine、公共契约、runtime adapter、workspace loader、tool adapter、CLI 和测试夹具会一起演进；monorepo 更利于统一版本、跨包重构和契约测试。

阶段 1 起步只保留两个物理包，避免在接口仍剧烈变化时冻结过多跨包契约：

```text
packages/
  engine/                    # 含 contracts、workflow、workspace、tools、runtime adapter、records、replay exporter
  cli/                       # 默认 CLI 与 replay，只依赖 engine public API
```

`engine` 内部使用目录表达边界：

```text
packages/engine/src/
  contracts/                 # 公共类型与 schema；不得 import 其他 engine 内部业务目录
  workspace/                 # workspace loader 与插件协议
  tools/                     # tool registry 与 capability adapters
  workflow/                  # PM driver / project state / actions
  runtimes/
    internal-agent/          # PI-backed InternalAgentRuntime adapter
    cli-agent/               # 外部 CLI Agent runtime
  records/                   # TaskRecord / EventLog / Evidence / ReplayCase
  engine.ts                  # TeamEngine 组装层
```

后续只有当接口稳定、出现第二个消费方，或依赖方向无法靠目录与 lint 约束时，才把对应目录提升为独立包。目标态可演进为：

```text
packages/
  contracts/
  engine/
  workflow/
  workspace/
  tools/
  runtime-internal-agent/
  runtime-cli-agent/
  cli/
  testkit/
```

关键约束：

- 起步期 `contracts/` 只是 `engine` 内部目录，但仍不得依赖 CLI、workflow、workspace、tools 或 runtime adapter。
- `cli` 只能依赖 `engine` 的 public API，不能导入 `engine/src/` 内部路径。
- `engine` 负责组装 workflow、workspace、tools 和 runtimes。
- runtime adapter 不能把 PI 或外部 CLI 私有类型泄漏到 public contracts。
- 暂不设置 server 包；宿主服务器通过 library API 自行集成。

## 命名决策

采用 `TeamEngine`，不用 `TaskRuntime`、`WorkSession` 或 `Orchestrator`。

原因：

- `TeamEngine` 体现 MyTeam 的产品心智：驱动一个工作小团队完成事情。
- `TaskRuntime` 太像通用任务执行器或队列，弱化 PM / Professional Agent 的团队语义。
- `WorkSession` 容易和 conversation session、PI session、登录 session 混淆。
- `Orchestrator` 只强调编排，不覆盖事件、结果、取消、replay 和 evidence 的完整运行语义。

## Public package entrypoints

`myteam` root package 是用户侧统一入口，而不是只用于开发的 workspace root。实现时必须让两类入口同时成立：

```ts
import { createTeamEngine } from 'myteam';
```

```bash
myteam "整理这个项目并生成 README" --workspace . --json
```

入口设计要求：

- root package 的 public export 只暴露 `packages/engine` 的 public API，不暴露 `engine/src/` 私有路径。
- `packages/cli` 实现默认 CLI 与 replay，但只能依赖 `packages/engine` 的 public API。
- `package.json` 的 `exports`、`types`、`bin` 与 build 输出路径必须一起设计，避免文档示例和真实产物路径不一致。
- 当前 change 先定义入口契约；具体代码实现、构建输出路径和包内脚本在 implementation 阶段落地。

## Public library API

MyTeam 的正式集成面是 library API。

最小导出：

```ts
interface TeamEngine {
  openSession(input: OpenSessionInput): Promise<ConversationSession>;
  resumeSession(sessionId: string, options?: ResumeSessionOptions): Promise<SessionSnapshot>;
  forkSession(sessionId: string, options?: ForkSessionOptions): Promise<ConversationSession>;

  start(request: TaskRequest, options?: StartRunOptions): Promise<ActiveRun>;
  stream(runId: string, cursor?: EventCursor): AsyncIterable<TaskEvent>;
  check(runId: string): Promise<RunStatusSnapshot>;
  outcome(runId: string, options?: OutcomeOptions): Promise<TaskResult>;
  cancel(runId: string, reason?: CancelReason): Promise<void>;
}

function createTeamEngine(options: CreateTeamEngineOptions): TeamEngine;
```

核心分层：

```text
SessionTranscript：恢复用户可见对话与模型可见上下文
RunEventLog：记录一次 run 的事实事件、工具、证据、错误和验收
TaskRecord / ReplayCase：复盘和重放任务执行
```

`resumeSession()` 恢复的是对话上下文，不恢复已经退出的进程、丢失的 stream 或死掉的工具调用。还活着的 run 通过 `stream(runId, cursor)` 和 `check(runId)` 恢复观察；已经中断的 run 必须显式记录为 interrupted / cancelled / failed 或其他非成功状态，再由新 run 重试。

可选 convenience API：

```ts
function executeTask(input: ExecuteTaskInput): Promise<TaskResult>;
function replayTask(input: ReplayTaskInput): Promise<ReplayResult>;
```

`executeTask()` 只是 `createTeamEngine()` + `start()` + `outcome({ wait: true })` 的便捷封装，不拥有独立业务语义。

支撑对象：

```ts
interface ConversationSession {
  sessionId: string;
  workspaceId?: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  transcriptCursor: SessionCursor;
}

interface SessionSnapshot {
  sessionId: string;
  workspaceId?: string;
  title?: string;
  transcriptCursor: SessionCursor;
  visibleContext: SessionContextEntry[];
  linkedTasks: Array<{ taskId: string; runIds: string[] }>;
}

interface SessionCursor {
  sessionId: string;
  seq: number;
}

interface SessionContextEntry {
  type: 'user' | 'assistant' | 'summary' | 'task-ref' | 'run-ref';
  content?: string;
  taskId?: string;
  runId?: string;
  timestamp: string;
}

interface StartRunOptions {
  sessionId?: string;
  turnId?: string;
}

interface ActiveRun {
  runId: string;
  taskId: string;
  sessionId?: string;
  turnId?: string;
  status: RunStatus;
  eventCursor?: EventCursor;
}

type RunStatus =
  | 'queued'
  | 'running'
  | 'blocked'
  | 'cancelling'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'cancelled';

interface EventCursor {
  runId: string;
  seq: number;
}

interface RunStatusSnapshot {
  runId: string;
  taskId: string;
  status: RunStatus;
  startedAt?: string;
  updatedAt: string;
  completedAt?: string;
  lastEventSeq: number;
  currentActor?: string;
  blockingReason?: string;
}

interface OutcomeOptions {
  wait?: boolean;
  timeoutMs?: number;
}

interface CancelReason {
  code: string;
  message?: string;
  requestedBy?: 'user' | 'system' | 'host' | 'test';
}
```

## 默认 CLI 行为

CLI 根命令就是一次性任务执行，不需要显式 `run` 子命令。

推荐形态：

```bash
myteam "整理这个项目并生成 README" --workspace . --json
myteam --task "整理这个项目并生成 README" --workspace . --json
cat task.md | myteam --workspace . --json
myteam --continue "继续刚才的方案" --workspace . --json
myteam --resume <session-id-or-name> "按刚才讨论执行" --workspace . --json
```

执行流：

```text
argv / stdin / --continue / --resume
  -> resolve or open ConversationSession when requested
  -> normalize into TaskRequest + StartRunOptions
  -> createTeamEngine(options)
  -> TeamEngine.start(request, { sessionId, turnId })
  -> optionally render TeamEngine.stream(runId) to stderr or JSON event stream
  -> TeamEngine.outcome(runId, { wait: true })
  -> append safe final response / task refs to SessionTranscript
  -> stdout outputs TaskResult
```

要求：

- `--json` 模式下，stdout 只输出最终 `TaskResult` JSON 或明确的 JSON event stream 模式，不能混入日志。
- 人类可读进度走 stderr。
- 默认 CLI 不得拥有 CLI 专用业务 fallback、默认人格、默认工具或默认权限。
- 默认 CLI 在使用会话能力时必须更新 SessionTranscript；每次执行仍必须生成 TaskRecord、Evidence 和 ReplayCase。

## Replay CLI 行为

`replay` 是特殊诊断 / 复盘命令：

```bash
myteam replay --run-id <run-id> --workspace . --json
myteam replay --case .myteam/runs/run_xxx/replay.json --json
```

执行流：

```text
ReplayCase / TaskRecord / run-id
  -> reconstruct replay input
  -> TeamEngine.start(replayRequest) 或 explicit evidence replay
  -> stream / outcome
  -> 输出可比较结果或差异说明
```

replay 不能依赖 CLI 私有日志，必须基于 MyTeam 的 TaskRecord、TaskEvent、Evidence 和 ReplayCase。

## 宿主服务器集成

MyTeam 不内置 `myteam serve`。未来服务器应通过 library API 集成：

```ts
import { createTeamEngine } from 'myteam';

const engine = createTeamEngine({ workspace });

const activeRun = await engine.start(taskRequest);
for await (const event of engine.stream(activeRun.runId)) {
  // Host server decides whether to forward by SSE, WebSocket, queue, logs, etc.
}
const result = await engine.outcome(activeRun.runId, { wait: true });
```

宿主服务器可以提供 HTTP / SSE / WebSocket / RPC / queue 等协议，但这些协议属于宿主应用，不属于 MyTeam CLI 的一等能力。宿主服务器不得通过反复启动 `myteam` CLI 来实现消息流、agent turn 或 tool call。

## `sessionId`、`turnId`、`taskId` 与 `runId`

- `sessionId`：一次用户可见会话，用于恢复对话连续性和模型可见上下文。
- `turnId`：会话中的一次用户交互轮次，负责把用户输入、PM 理解、任务引用和最终回复串起来。
- `taskId`：用户任务或宿主系统传入的逻辑任务 ID。
- `runId`：TeamEngine 为一次执行尝试生成的运行 ID。

关系：

```text
sessionId
  -> turnId
    -> taskId
      -> runId
```

一个 session 可以包含多个 turn；一个 turn 可以产生零个、一个或多个 task；同一个 `taskId` 可以因为 retry、replay、resume 或诊断重跑产生多个 `runId`。

`SessionTranscript` 至少包含 `sessionId` 与 `turnId`，并通过引用关联 `taskId` / `runId`。`TaskEvent`、`Evidence`、`TaskRecord` 必须至少包含 `runId`；需要关联用户任务和会话时同时包含 `taskId`、`sessionId`、`turnId`。

这个区分能避免把“用户对话连续性”和“同一个用户任务的多次执行尝试”混成一条不可复盘的记录。

## 事件流与状态

TeamEngine 必须先把事件写入内部 EventLog，再暴露给 library consumer、默认 CLI 或 replay 消费。事件至少要满足：

- 同一 `runId` 内 `seq` 单调递增。
- `EventCursor` 可用于断点续传。
- 事件包含 `taskId`、`runId`、`actor`、`timestamp`、`type`、可选 `subtaskId`、`toolCallId`、`evidenceRef`、`errorCode`。
- 事件不包含 secret、隐藏 system prompt 或模型私密 reasoning。
- CLI 和宿主服务器消费的是同一份事件，不各自生成事实日志。

## 取消语义

`cancel(runId)` 必须向团队工作流传播取消信号：

```text
TeamEngine.cancel
  -> mark run cancelling
  -> notify PM driver
  -> abort active InternalAgent / CLIAgent turn when possible
  -> cancel or timeout active tool call
  -> emit task.cancelled 或 task.failed
  -> persist final TaskResult
```

取消不是简单丢弃外层 promise。无法立即中止的外部 CLI 或工具必须有超时、进程清理和 evidence。

## 一致性规则

- Library API、默认 CLI 和 replay 必须共用同一个 request normalizer。
- 默认 CLI 与 replay adapter 不得直接调用 PM、InternalAgent、CLIAgent 或 ToolAdapter。
- 宿主服务器应通过 TeamEngine 公共 API 集成，而不是导入 MyTeam 私有模块。
- 默认 CLI 与宿主服务器对同类 `TaskRequest` 应产生可比较的 TaskEvent 和 TaskResult。
- adapter 可以影响传输通道和展示方式，不得影响团队执行决策。
- 配置缺失必须 fail-fast，不能由某个入口静默补默认人格、默认工具或默认权限。

## 分阶段落地

### Phase 1：类型与接口

定义 TeamEngine、createTeamEngine、ConversationSession、SessionSnapshot、SessionCursor、StartRunOptions、ActiveRun、RunStatus、EventCursor、RunStatusSnapshot、OutcomeOptions、CancelReason。现阶段可使用内存 session store、run store 与 event log，但接口必须稳定。

### Phase 2：Library API 走 TeamEngine

从 `packages/engine` 导出 TeamEngine 公共类型、createTeamEngine 和必要 convenience API，并通过根 package public API 暴露。

### Phase 3：默认 CLI 走 TeamEngine

让 CLI 根命令通过 TeamEngine 执行最小任务，输出 TaskResult，并生成 TaskRecord / ReplayCase。不实现 `run` 子命令。

### Phase 4：Replay 走 TeamEngine records

实现 `myteam replay`，基于 TaskRecord / ReplayCase 重建输入并调用 TeamEngine 或执行明确标记的 evidence replay。

### Phase 5：入口一致性验证

同一个 fixture `TaskRequest` 分别通过 library API 与默认 CLI 执行，比较关键事件类型、最终状态、错误语义、evidence 和 replay 引用。

## 验证策略

- 类型检查：TeamEngine 公共类型不依赖 CLI、HTTP 或宿主服务器私有类型。
- 单测：request normalizer、SessionTranscript resume/fork、RunStatus 状态转换、EventCursor 断点续传、cancel 传播。
- 契约测试：library API 与默认 CLI 对同一 `TaskRequest` 产生可比较结果。
- 手动验证：`myteam "读取 README 并总结项目定位" --workspace /data/workspace/myteam --json`。
- Replay 验证：`myteam replay --run-id <runId> --workspace /data/workspace/myteam --json`。
