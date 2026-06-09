# Design: align-workspace-storage-genethub

> 属于 change `align-workspace-storage-genethub`。本设计对齐 GenetHub `assistant-core` 的 workspace 存储模式，为 MyTeam 提供耐久、可版本化、可追踪的持久化基础。

---

## 1. 设计目标

- 对齐 GenetHub 已沉淀的 session 文件存储模式，不做无必要重设计。
- 为 MyTeam 的 library API、默认 CLI 和 replay 提供统一的 session 读写语义。
- 确保 session 数据耐久、可移植、可归档，支持复盘和回放。
- 通过原子写入保证并发场景下的数据完整性。
- 提供清晰的抽象边界，避免跨层直接操作文件系统。

---

## 2. Workspace 目录结构

对齐 GenetHub 的目录约定：

```text
workspace/
  myteam.config.json                    # 用户可编辑：MyTeam workspace 配置，不存 secret
  SOUL.md                               # 用户可编辑：项目人格与工作方式
  skills/                               # 用户可编辑：技能定义
    {skill-name}/
      SKILL.md
  agents/                               # 用户可编辑：Agent 定义
    {agent-name}.md

  .myteam/                              # MyTeam 运行时数据，不作为插件输入
    sessions/                           # 会话持久化目录（SessionStore 管理）
      {sessionId}.json                  # 单个 session 文件
      archives/                         # 消息归档（长会话的消息分离存储）
        {archiveId}.json
    memory/                             # 预留：跨会话持久化记忆
    runs/                               # 运行记录（TaskRecord / EventLog / Evidence / ReplayCase）
      {runId}/
        record.json
        events.jsonl
        replay.json
        evidence/
```

与 GenetHub 的核心对齐：

| 目录 | 对齐状态 | 说明 |
|------|----------|------|
| `.myteam/sessions/{sessionId}.json` | **语义对齐** | 沿用单文件 session 持久化语义，但放入 `.myteam/` 运行时目录 |
| `.myteam/sessions/archives/` | **语义对齐** | 消息归档分离 |
| `skills/` | **完全对齐** | 用户可编辑技能定义的 SKILL.md |
| `agents/` | **结构对齐** | 用户可编辑 Agent 定义，内容适配 MyTeam schema |
| `.myteam/memory/` | **预留对齐** | 暂不实现，目录结构预留 |
| `.myteam/runs/` | **MyTeam 特有** | TaskRecord / EventLog / Evidence / ReplayCase，与 session transcript 分离 |

与 GenetHub 的差异：
- MyTeam 没有 `extra-home/` 目录（GenetHub 用于 CLI Agent 个性 HOME，MyTeam 通过 runtime adapter 管理）。
- MyTeam 将 `sessions/`、`runs/`、`memory/` 等运行时数据放入 `.myteam/`，避免污染用户项目根目录；用户可编辑的 `SOUL.md`、`skills/`、`agents/` 保持在 workspace 根目录。
- `agents/` 目录内容格式适配 MyTeam 自己的 Agent 定义 schema，不直接复用 GenetHub 的 agent profile。

---

## 3. Session 持久化语义

### 3.1 存储模式

对齐 GenetHub 的文件系统存储：

```text
SessionStore
  - runtimeDir = {workspace}/.myteam
  - sessionsDir = {workspace}/.myteam/sessions
  - archivesDir = {workspace}/.myteam/sessions/archives
  - sessionFilePath = sessionsDir/{sessionId}.json
  - archiveFilePath = archivesDir/{archiveId}.json
```

### 3.2 原子写入

对齐 GenetHub 的原子写入模式：

```ts
async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  await rename(tempPath, filePath);
}
```

关键约束：
- 使用临时文件 + rename 保证原子性。
- 临时文件命名包含 pid 和时间戳，避免冲突。
- JSON 格式化输出（2 空格缩进），末尾换行。
- 依赖文件系统 rename 的原子语义（POSIX 保证），非 POSIX 环境需额外文档化降级策略。

### 3.3 写入时机

- `createSession()`：创建时立即写入。
- `saveSession()`：session 状态变化时写入（全量覆盖）。
- `appendMessages()`：追加消息后写入全量 session。
- 写入策略为全量覆盖而非增量追加，保证一致性。
- 未来可引入 archive 机制将历史消息分离存储，减少主 session 文件体积。

---

## 4. 核心类型 schema

### 4.0 存储字段与公共契约边界

本设计中的 `ChatSession`、`SessionMessage` 等类型是 GenetHub-compatible 的持久化 session schema，可以保留 GenetHub 的毫秒时间戳字段。MyTeam 公共 `TaskEvent`、`TaskRecord`、`Evidence`、`ReplayCase` 对外使用 ISO 8601 字符串时间戳；SessionStore / SessionManager 负责在存储 schema 与公共契约之间做显式转换或标注。

ID 由 contracts 层统一生成和校验。session 存储层不得自行拼接或发明前缀；当前公共 ID 前缀为 `session_`、`message_`、`archive_`、`turn_`、`task_`、`run_`、`ws_`、`evidence_`、`artifact_`。PI 内部 request、message、tool ID 不得当作 MyTeam 公共 ID。

### 4.1 ChatSession（对齐 GenetHub）

```ts
interface ChatSession {
  sessionId: string;         // session_ 前缀的 MyTeam session ID
  title: string;             // 会话标题
  chatType: 'user-chat' | 'agents-chat';
  status: 'active' | 'done' | 'archived';
  createdAt: number;         // 毫秒时间戳
  updatedAt: number;         // 毫秒时间戳
  participants: Participant[];
  archiveIds: string[];      // 归档引用
  messages: SessionMessage[];
  metadata: SessionMetadata;
  lastSummary: string;

  // agents-chat 专有字段
  ownerSessionId?: string;   // 关联的 user-chat sessionId
  goal?: string;             // 项目目标
}
```

### 4.2 Participant

```ts
interface Participant {
  id: string;         // 唯一标识
  kind: string;       // 'internal' | 'cli'
  role: string;       // 角色（如 'pm', 'secretary', 'review-manager'）
  displayName: string;
  description: string;
}
```

### 4.3 SessionMessage

```ts
interface SessionMessage {
  id: string;                // message_ 前缀的 MyTeam message ID
  role: 'system' | 'user' | 'assistant' | 'tool';
  actorId: string;           // 发送者 participant.id
  displayName: string;       // 展示名
  content: string;           // 消息正文
  ts: number;                // 毫秒时间戳
  kind: string;              // 'chat' | 'status' | 'artifact' | 'error'
  mentions: string[];        // @提及的 participant.id 列表
  meta: Record<string, unknown>;
  llmRequestId: string;      // 关联的 LLM 请求 ID
}
```

### 4.4 SessionMetadata（对齐 GenetHub ProjectState）

```ts
interface SessionMetadata {
  projectState?: {           // agents-chat 专有
    title: string;
    goal: string;
    driverId: string;        // 'freeform'
    phase: ProjectPhase;     // 'coordination' | 'done' | 'failed' 等自由编排阶段
    status: ProjectStatus;   // 'created' | 'running' | 'done' | 'failed' | 'cancelled'
    turnCount: number;
    nextSpeakerId: string | null;
    allowedTransitions: TransitionKind[];  // 兼容旧命名，语义等同 allowedActions：'delegate' | 'finalize' | 'fail' | 'approval'
    artifacts: Artifact[];
    plan: Plan | null;                    // 可选 artifact，不代表固定阶段
    verification: Verification | null;    // 可选 artifact，不代表固定阶段
    lastAction: Action | null;
    driverState: Record<string, unknown>;
    outcome: Outcome;
  };
}
```

### 4.5 Outcome

```ts
type Outcome =
  | { kind: 'pending' }
  | { kind: 'done'; summary: string; deliverables?: string[]; previewUrls?: string[] }
  | { kind: 'failed'; error: string; detail?: string; retryable?: boolean }
  | { kind: 'cancelled'; reason?: string };
```

---

## 5. SessionStore 抽象

对齐 GenetHub 的 `SessionStore` 接口：

```ts
interface ISessionStore {
  // 生命周期
  createSession(input: CreateSessionInput): Promise<ChatSession>;
  loadSession(sessionId: string): Promise<ChatSession | null>;
  saveSession(session: ChatSession): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;

  // 消息
  appendMessages(input: AppendMessagesInput): Promise<ChatSession>;

  // 查询
  listSessions(query?: SessionQuery): Promise<ChatSession[]>;

  // 归档
  archiveMessages(sessionId: string, options: ArchiveOptions): Promise<string[]>;
  loadArchive(archiveId: string): Promise<SessionArchive | null>;

  // 运维
  getWorkspacePath(): string;
}
```

---

## 6. SessionManager 抽象

对齐 GenetHub 的观察者模式管理器，在 SessionStore 之上提供：
- 内存缓存与脏写合并。
- 事件通知（session 创建、更新、删除、消息追加）。
- 跨组件 session 状态同步。
- SessionActor 串行化保证（对同一 session 的写操作排队）。

```ts
interface ISessionManager {
  // 委托给 SessionStore，但增加缓存和事件通知
  createSession(input: CreateSessionInput): Promise<ChatSession>;
  loadSession(sessionId: string): Promise<ChatSession | null>;
  appendMessages(input: AppendMessagesInput): Promise<ChatSession>;

  // 事件
  on(event: 'session-created' | 'session-updated' | 'messages-appended', handler: (session: ChatSession) => void): void;
  off(event: string, handler: Function): void;

  // 脏写合并
  flush(): Promise<void>;
}
```

---

## 7. Session 与 Run 的关系

**关键设计决策：session transcript 与 run event log 分离。**

```text
Session                                Run
  |                                      |
  | sessionId                            | runId
  | messages[] (user-visible)            | events[] (全部事实)
  | lastSummary (摘要)                   | TaskRecord
  | metadata.projectState               | Evidence
  |                                      | ReplayCase
  |                                      |
  | 存储: .myteam/sessions/{sessionId}.json | 存储: .myteam/runs/{runId}/
```

- `ChatSession` 存储用户可见的对话内容、摘要和编排状态。
- `TaskRecord`、`EventLog`、`Evidence` 存储完整的执行事实，位于 `.myteam/runs/{runId}/`。
- Session 通过 `llmRequestId` 引用 run 中的具体事件，但不冗余存储详细事实。
- 复盘和回放基于 `.myteam/runs/` 目录，不依赖 session transcript 中的摘要。

---

## 8. 数据流

```text
                        用户 / CLI / Host Server
                               |
                               v
                     +---------------------+
                     |   MyTeam Engine      |
                     |                     |
                     |  openSession()       |
                     |  start()             |
                     |  stream()            |
                     +---------+-----------+
                               |
               +---------------+---------------+
               |                               |
     +---------v---------+          +----------v---------+
     |   SessionManager   |          |     Run Manager     |
     |   (session CRUD)   |          |   (任务执行 & 记录)   |
     +---------+---------+          +----------+---------+
               |                               |
     +---------v---------+          +----------v---------+
     |   SessionStore     |          |   TaskRecordStore   |
     | (文件系统读写)      |          | (文件系统读写)       |
     +---------+---------+          +----------+---------+
               |                               |
               v                               v
     sessions/                          runs/
       {sessionId}.json                  {runId}/
       archives/                           record.json
                                           events.jsonl
                                           evidence/
```

---

## 9. 迁移路径

当前 MyTeam 尚未有持久化实现，本变更为直接建立初始存储层，不涉及数据迁移。

后续阶段考虑：
- 引入 `sqlite` 或 `better-sqlite3` 作为可选的后端存储，替换文件系统 SessionStore 实现。
- 引入 session 增量写入（仅追加新增消息而非全量覆盖）。
- 引入 session 垃圾回收和自动归档策略。

---

## 10. 验证方式

- 契约测试：`createSession` → `loadSession` 往返一致性。
- 原子写入测试：并发写入同一 session 不发生数据损坏。
- 归档测试：消息从主 session 移到 archive 后 session 文件体积缩小。
- 类型导出验证：阶段 1 中 `ChatSession`、`SessionMessage`、`Participant`、`ProjectState` 等类型从 `packages/engine/src/contracts` 正确导出；后续满足提包信号后再迁移到独立 `packages/contracts`。
- 文件系统验证：创建的 session 文件格式化为 2 空格缩进的 JSON，末尾含换行符。
