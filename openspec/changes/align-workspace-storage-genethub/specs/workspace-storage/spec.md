# Spec Delta: workspace-storage

> 属于 change `align-workspace-storage-genethub`。定义 MyTeam workspace 的持久化目录结构、session 存储语义和核心数据类型，对齐 GenetHub `assistant-core` 的成熟持久化方案。

---

## ADDED Requirements

### Requirement: Workspace has a defined persistent directory layout

MyTeam SHALL define a standardized workspace layout that separates user-editable plugin assets from MyTeam runtime data. User-editable assets SHALL live at the workspace root; runtime persistence SHALL live under `.myteam/`.

At minimum, the workspace root MUST contain or allow creation of:

| 目录 | 必要性 | 用途 |
|------|--------|------|
| `SOUL.md` | SHOULD | 用户可编辑的项目人格与工作方式 |
| `myteam.config.json` | SHOULD | 用户可编辑的 workspace 配置，不存 secret |
| `skills/` | SHOULD | 用户可编辑技能定义目录 |
| `agents/` | SHOULD | 用户可编辑 Agent 定义目录 |
| `.myteam/sessions/` | **MUST** | 会话持久化文件目录 |
| `.myteam/sessions/archives/` | SHOULD | 消息归档分离目录 |
| `.myteam/memory/` | MAY | 跨会话持久化记忆（预留） |
| `.myteam/runs/` | **MUST** | 运行记录目录（TaskRecord / EventLog / Evidence / ReplayCase） |

MyTeam MUST NOT create workspace directories outside the resolved workspace root. Missing critical runtime directories on access SHALL trigger a fail-fast error with a clear diagnostic message indicating which path is missing.

#### Scenario: Fresh workspace initialization

- **GIVEN** a directory exists but contains no MyTeam workspace structure
- **WHEN** MyTeam initializes the workspace
- **THEN** `skills/`, `agents/`, `.myteam/sessions/`, `.myteam/sessions/archives/`, `.myteam/memory/`, and `.myteam/runs/` directories SHALL be created
- **AND** no files outside the workspace root SHALL be created

#### Scenario: Corrupted workspace fails fast

- **GIVEN** a workspace that has `.myteam/sessions/` directory missing or corrupted
- **WHEN** MyTeam attempts to access session storage
- **THEN** it SHALL report a structured error identifying the missing path
- **AND** it MUST NOT silently create a new session directory with different naming or location

---

### Requirement: Sessions are stored as single JSON files under .myteam/sessions/

MyTeam SHALL persist each `ChatSession` as a single JSON file at `{workspaceRoot}/.myteam/sessions/{sessionId}.json`. The file format MUST be valid JSON with 2-space indentation and a terminating newline character.

Session files SHALL be readable without additional tools, index files, or external databases. The `sessionId` SHALL be a valid MyTeam public ID with the `session_` prefix.

#### Scenario: Create session writes to file

- **GIVEN** a valid `CreateSessionInput` with a `session_` prefixed `sessionId`
- **WHEN** `SessionStore.createSession(input)` is called
- **THEN** a file at `.myteam/sessions/{sessionId}.json` SHALL be created
- **AND** the file SHALL contain the complete `ChatSession` JSON conforming to the schema
- **AND** the JSON SHALL be formatted with 2-space indentation and a trailing newline

#### Scenario: Load session from existing file

- **GIVEN** a session file exists at `.myteam/sessions/{sessionId}.json`
- **WHEN** `SessionStore.loadSession(sessionId)` is called
- **THEN** the method SHALL return the deserialized `ChatSession` object
- **AND** all fields SHALL match their persisted values
- **AND** `messages`, `participants`, and `archiveIds` SHALL be full arrays, not truncated

#### Scenario: Load non-existent session

- **GIVEN** no session file exists for a given `sessionId`
- **WHEN** `SessionStore.loadSession(sessionId)` is called
- **THEN** the method SHALL return `null`
- **AND** it MUST NOT throw an exception or create an empty session file

---

### Requirement: Session writes use atomic file replacement

MyTeam SHALL implement session writes using atomic write-then-rename semantics. Writing a session MUST write to a temporary file first, then atomically rename to the target path.

The temporary file path SHALL include the process ID and a timestamp to avoid collisions: `{targetPath}.{pid}.{timestamp}.tmp`.

MyTeam SHALL document that atomic rename depends on POSIX filesystem semantics. For non-POSIX filesystems, the implementation MAY provide a documented degraded mode that does not guarantee concurrent-write safety.

#### Scenario: Write never produces a partial file

- **GIVEN** a session write is in progress
- **WHEN** a concurrent reader accesses `.myteam/sessions/{sessionId}.json` during the write
- **THEN** the reader SHALL see either the complete old content or the complete new content
- **AND** it MUST NOT see a partial or corrupted JSON file

#### Scenario: Crash during write does not corrupt data

- **GIVEN** a session write has written to the temporary file but not yet renamed
- **WHEN** the process crashes before the rename completes
- **THEN** the original `.myteam/sessions/{sessionId}.json` SHALL remain intact
- **AND** the temporary file MAY be left behind as a cleanup artifact

#### Scenario: Two concurrent writers do not produce data loss

- **GIVEN** two concurrent writers attempt to save the same session
- **WHEN** both writes complete
- **THEN** the final file SHALL contain the complete data from the last write that completed the rename
- **AND** no interleaved or merged partial content SHALL appear

---

### Requirement: Storage IDs and timestamps have explicit boundaries

MyTeam session storage SHALL use MyTeam public IDs rather than PI internal IDs or raw filesystem-derived identifiers. Stored session-related IDs SHALL use the following prefixes where applicable: `session_`, `message_`, `archive_`, `turn_`, `task_`, `run_`, `ws_`, `evidence_`, and `artifact_`.

`ChatSession.createdAt`, `ChatSession.updatedAt`, and `SessionMessage.ts` SHALL remain millisecond timestamps to preserve GenetHub-compatible storage semantics. Public `TaskEvent`, `TaskRecord`, `Evidence`, and `ReplayCase` timestamp fields SHALL use ISO 8601 strings. Conversion between these styles MUST happen at SessionStore, RecordStore, or public contract boundaries and MUST NOT be left to individual callers.

#### Scenario: PI ID is not used as a MyTeam public ID

- **GIVEN** PI returns an internal message, request, or tool call ID
- **WHEN** MyTeam persists session, event, evidence, or replay data
- **THEN** MyTeam SHALL store its own public ID for public linking
- **AND** the PI ID MAY appear only as adapter-private metadata after sanitization

#### Scenario: Storage timestamp differs from public event timestamp

- **GIVEN** a session message and a TaskEvent are created for the same user-visible action
- **WHEN** the records are persisted
- **THEN** the session message SHALL store `ts` as a millisecond timestamp
- **AND** the TaskEvent SHALL expose `timestamp` as an ISO 8601 string
- **AND** both values SHALL represent the same event time within normal clock precision

---

### Requirement: ChatSession has a strict schema aligned with GenetHub

MyTeam SHALL define `ChatSession` with the following minimum fields:

| 字段 | 类型 | 必要性 | 说明 |
|------|------|--------|------|
| `sessionId` | `string` | MUST | `session_` 前缀的 MyTeam session 标识 |
| `title` | `string` | MUST | 会话标题 |
| `chatType` | `'user-chat' \| 'agents-chat'` | MUST | 会话类型 |
| `status` | `'active' \| 'done' \| 'archived'` | MUST | 会话生命周期状态 |
| `createdAt` | `number` | MUST | 创建时间（毫秒时间戳） |
| `updatedAt` | `number` | MUST | 最后更新时间（毫秒时间戳） |
| `participants` | `Participant[]` | MUST | 参与方列表 |
| `archiveIds` | `string[]` | MUST | 归档引用列表 |
| `messages` | `SessionMessage[]` | MUST | 消息列表 |
| `metadata` | `SessionMetadata` | MUST | 会话元数据 |
| `lastSummary` | `string` | MUST | 最后生成的摘要 |

`agents-chat` sessions SHALL additionally include:

| 字段 | 类型 | 必要性 | 说明 |
|------|------|--------|------|
| `ownerSessionId` | `string` | MUST (agents-chat) | 关联的 `user-chat` sessionId |
| `goal` | `string` | MUST (agents-chat) | 项目目标描述 |

`user-chat` sessions MUST NOT include `ownerSessionId` or `goal` fields.

#### Scenario: user-chat session excludes agents-chat fields

- **GIVEN** a session is created with `chatType: 'user-chat'`
- **WHEN** the session is serialized to JSON
- **THEN** `ownerSessionId` and `goal` SHALL be absent from the serialized object
- **AND** `metadata.projectState` SHALL be absent or an empty object

#### Scenario: agents-chat session includes required linking fields

- **GIVEN** a session is created with `chatType: 'agents-chat'`
- **WHEN** the session is serialized to JSON
- **THEN** `ownerSessionId` SHALL reference a valid `user-chat` sessionId
- **AND** `goal` SHALL be a non-empty string
- **AND** `metadata.projectState` SHALL contain valid projectState fields

#### Scenario: Session status transitions

- **GIVEN** a newly created session
- **WHEN** the session is created
- **THEN** `status` SHALL be `'active'`
- **WHEN** the session is explicitly closed or completed
- **THEN** `status` MAY transition to `'done'`
- **WHEN** the session is archived
- **THEN** `status` MAY transition to `'archived'`

---

### Requirement: SessionMessage captures actor, timing, and metadata

Each `SessionMessage` in the messages array SHALL include:

| 字段 | 类型 | 必要性 | 说明 |
|------|------|--------|------|
| `id` | `string` | MUST | `message_` 前缀的 MyTeam message 标识 |
| `role` | `'system' \| 'user' \| 'assistant' \| 'tool'` | MUST | 发送者角色 |
| `actorId` | `string` | MUST | 对应 participant.id |
| `displayName` | `string` | MUST | 展示名 |
| `content` | `string` | MUST | 消息正文 |
| `ts` | `number` | MUST | 发送时间（毫秒时间戳） |
| `kind` | `string` | MUST | 消息类别（如 'chat', 'status', 'artifact', 'error'） |
| `mentions` | `string[]` | MUST | @提及的 participant ID 列表 |
| `meta` | `Record<string, unknown>` | MUST | 扩展元数据 |
| `llmRequestId` | `string` | MUST | 关联的 LLM 请求 ID（无关联时为空字符串） |

Session messages MUST be appended in chronological order. The `ts` field SHALL reflect the message creation time, not the file write time.

#### Scenario: Message chronology is preserved

- **GIVEN** messages are appended to a session
- **WHEN** the session is loaded from disk
- **THEN** messages SHALL appear in the order they were appended
- **AND** `ts` values SHALL be monotonically non-decreasing

#### Scenario: Message IDs are unique within a session

- **GIVEN** multiple messages are appended to a session
- **WHEN** the session is loaded
- **THEN** each `SessionMessage.id` SHALL be unique within that session's message array

---

### Requirement: Participant models agent identity and role

Each `Participant` SHALL include:

| 字段 | 类型 | 必要性 | 说明 |
|------|------|--------|------|
| `id` | `string` | MUST | 唯一标识 |
| `kind` | `string` | MUST | agent 类型（如 'internal', 'cli'） |
| `role` | `string` | MUST | 角色（如 'pm', 'secretary', 'coder', 'review-manager'） |
| `displayName` | `string` | MUST | 展示名 |
| `description` | `string` | MUST | 描述文本 |

A `user-chat` session SHALL include at minimum the user and one assistant participant. An `agents-chat` session SHALL include at minimum one PM participant.

#### Scenario: Minimum participants for user-chat

- **GIVEN** a `user-chat` session is created
- **WHEN** the session is persisted
- **THEN** `participants` SHALL contain at least the user actor and one assistant actor
- **AND** each participant SHALL have all required fields populated

#### Scenario: PM is required for agents-chat

- **GIVEN** an `agents-chat` session is created
- **WHEN** the session is persisted
- **THEN** `participants` SHALL contain at least one participant with `role: 'pm'`

---

### Requirement: ProjectState captures multi-agent orchestration state

For `agents-chat` sessions, `metadata.projectState` SHALL capture the orchestration state of the Secretary / PM-driven workgroup workflow. The state follows a freeform driver model: it records durable state, next speaker, allowed actions, artifacts, last action, and driver-private data without requiring a fixed linear lifecycle graph.

| 字段 | 类型 | 必要性 | 说明 |
|------|------|--------|------|
| `title` | `string` | MUST | 项目标题 |
| `goal` | `string` | MUST | 项目目标 |
| `driverId` | `string` | MUST | 驱动模式（如 'freeform'） |
| `phase` | `string` | MUST | 当前自由编排阶段（如 'coordination'、'done'、'failed'；不得假设固定线性阶段图） |
| `status` | `string` | MUST | 当前状态（如 'created', 'running', 'done', 'failed', 'cancelled'） |
| `turnCount` | `number` | MUST | 当前轮次计数 |
| `nextSpeakerId` | `string \| null` | MUST | 下一发言方 participant.id |
| `allowedTransitions` | `string[]` | MUST | 允许的 action 类型，兼容旧命名；语义等同 allowedActions |
| `artifacts` | `Artifact[]` | MUST | 产出物列表 |
| `plan` | `Plan \| null` | SHOULD | 当前计划 |
| `verification` | `Verification \| null` | SHOULD | 验收状态 |
| `lastAction` | `Action \| null` | SHOULD | 上次动作 |
| `driverState` | `Record<string, unknown>` | MUST | 驱动私有状态 |
| `outcome` | `Outcome` | MUST | 结果状态 |

The `Outcome` SHALL be one of:
- `{ kind: 'pending' }` — execution not yet complete
- `{ kind: 'done', summary: string, deliverables?: string[], previewUrls?: string[] }` — completed successfully
- `{ kind: 'failed', error: string, detail?: string, retryable?: boolean }` — completed with failure
- `{ kind: 'cancelled', reason?: string }` — cancelled by user or system

#### Scenario: New agents-chat starts with pending outcome

- **GIVEN** a new `agents-chat` session is created
- **WHEN** the session is persisted
- **THEN** `metadata.projectState.outcome.kind` SHALL be `'pending'`
- **AND** `metadata.projectState.turnCount` SHALL be `0`
- **AND** `metadata.projectState.artifacts` SHALL be an empty array

#### Scenario: ProjectState is absent from user-chat

- **GIVEN** a `user-chat` session
- **WHEN** the session is loaded
- **THEN** `metadata.projectState` SHALL be absent or an empty object
- **AND** no `ownerSessionId` or `goal` field SHALL be present

---

### Requirement: Message archives separate historical messages from the main session file

MyTeam SHALL support archiving historical messages from a session into separate archive files under `.myteam/sessions/archives/{archiveId}.json`. The main session file SHALL track archive references through the `archiveIds` field array.

An archive file SHALL contain at minimum the archived messages and metadata linking back to the source session. Archived messages SHALL be removed from the session's `messages` array after successful archive creation.

#### Scenario: Archive reduces session file size

- **GIVEN** a session with 500 messages
- **WHEN** the first 400 messages are archived
- **THEN** a new archive file SHALL be created at `.myteam/sessions/archives/{archiveId}.json`
- **AND** the session's `archiveIds` SHALL include the new `archiveId`
- **AND** the session's `messages` array SHALL only contain the remaining 100 messages
- **AND** `loadArchive(archiveId)` SHALL return the 400 archived messages

#### Scenario: Archive preserves message integrity

- **GIVEN** messages have been archived from a session
- **WHEN** the archive is loaded
- **THEN** all message fields SHALL match their pre-archive values
- **AND** message order and timestamps SHALL be preserved
- **AND** the archive SHALL reference the source `sessionId`

---

### Requirement: Session and run data are separated

MyTeam SHALL separate user-visible session transcript data from detailed execution facts. `ChatSession` (stored under `.myteam/sessions/`) SHALL contain user-visible messages, summaries, and orchestration state. `TaskRecord`, `EventLog`, `Evidence`, and `ReplayCase` (stored under `.myteam/runs/{runId}/`) SHALL contain complete execution facts including tool calls, agent actions, errors, and artifacts.

Session transcripts SHALL reference run records through `SessionMessage.llmRequestId` and similar linking fields, but SHALL NOT duplicate detailed execution facts, tool outputs, or internal reasoning.

#### Scenario: Session transcript links to run without duplicating facts

- **GIVEN** an agents-chat session has an active project run
- **WHEN** the session is loaded
- **THEN** session messages SHALL include references (e.g., `llmRequestId`) that link to run events
- **AND** the session file SHALL NOT contain complete tool outputs, debug logs, or internal event traces

#### Scenario: Replay uses run records, not session transcript

- **GIVEN** a completed run has persisted TaskRecord, EventLog, and Evidence under `.myteam/runs/{runId}/`
- **AND** the session transcript contains user-facing summaries of the run
- **WHEN** replay is invoked
- **THEN** replay SHALL load from `runs/{runId}/` records
- **AND** MUST NOT depend solely on session-level summaries

---

### Requirement: SessionStore provides a clean abstraction over file system persistence

MyTeam SHALL define `SessionStore` as the primary abstraction for session file persistence. It SHALL encapsulate:

- Directory resolution (`runtimeDir`, `sessionsDir`, `archivesDir`) from the workspace path.
- File path computation for session and archive files.
- Atomic file writes using temporary files and rename.
- Error handling for filesystem failures with structured error messages.

SessionStore SHALL NOT expose internal file paths, temporary files, or buffer contents to callers.

#### Scenario: SessionStore resolves paths relative to workspace

- **GIVEN** a SessionStore initialized with workspace path `/home/user/project`
- **WHEN** creating a session with id `session_abc123`
- **THEN** the session file SHALL be written to `/home/user/project/.myteam/sessions/session_abc123.json`
- **AND** no files SHALL be created outside this workspace

#### Scenario: SessionStore abstracts away file system details

- **GIVEN** a SessionStore instance
- **WHEN** callers interact through `createSession`, `loadSession`, `appendMessages`
- **THEN** callers MUST NOT need to know file paths, encoding, or atomic write mechanics
- **AND** the same caller code SHALL work without change if the backend is later swapped to a database

---

### Requirement: SessionManager provides caching and event notification

MyTeam SHALL define `SessionManager` as an optional layer over `SessionStore` that provides:

- In-memory session caching to reduce disk reads.
- Event notifications for session lifecycle changes (`session-created`, `session-updated`, `messages-appended`).
- Dirty write merging to reduce disk I/O frequency.

SessionManager SHALL delegate all persistence to `SessionStore` and MUST NOT implement its own file writing logic. SessionManager MAY not be necessary for all usage scenarios; direct `SessionStore` usage SHALL remain supported.

#### Scenario: Session cache avoids redundant disk reads

- **GIVEN** a session has been loaded through SessionManager
- **WHEN** the same session is loaded again without modifications
- **THEN** SessionManager SHALL return the cached instance
- **AND** it SHALL NOT perform a disk read

#### Scenario: Event notification on session update

- **GIVEN** a listener is registered for `session-updated` events
- **WHEN** a session is modified through SessionManager
- **THEN** the registered handler SHALL be invoked with the updated session

---

### Requirement: Session data must not contain secrets or private reasoning

MyTeam SHALL ensure that `ChatSession` files, `SessionArchive` files, and in-memory session objects do not contain:

- API keys, tokens, passwords, or credentials.
- Private model reasoning or hidden system prompts.
- Adapter-private connection details or runtime environment secrets.
- User private data beyond what is explicitly included in user-visible messages.

Tool call results and agent outputs stored in session messages SHALL be sanitized to remove secret-bearing content before persistence. The `meta` field SHALL NOT be used to bypass this constraint.

#### Scenario: Secret-bearing tool output is sanitized

- **GIVEN** a tool executes with an API key in its environment
- **WHEN** the tool output is captured as a session message
- **THEN** the API key SHALL be redacted or omitted from the persisted content
- **AND** enough non-secret context SHALL remain to understand the action and its outcome

#### Scenario: Private reasoning is excluded from session

- **GIVEN** an agent model generates private reasoning tokens
- **WHEN** the agent produces a user-visible response
- **THEN** only the user-visible response SHALL be persisted in session messages
- **AND** private reasoning tokens MUST NOT appear in `content` or `meta`

---

### Requirement: Skills are defined as Markdown files under skills/

MyTeam SHALL support loading skill definitions from `{workspaceRoot}/skills/{skill-name}/SKILL.md`. A skill definition is a Markdown file that describes the skill's purpose, behavior, constraints, and usage pattern.

Skill loading SHALL fail-fast if the `skills/` directory is configured but the referenced skill file is missing.

#### Scenario: Valid skill is loaded

- **GIVEN** `skills/budget-inference/SKILL.md` exists and is valid
- **WHEN** MyTeam loads workspace skills
- **THEN** the skill definition SHALL be parsed and registered
- **AND** the skill name SHALL be `budget-inference` (derived from directory name)

#### Scenario: Missing skill fails fast

- **GIVEN** a workspace configuration references skill `budget-inference`
- **WHEN** `skills/budget-inference/SKILL.md` does not exist
- **THEN** skill loading SHALL fail with a structured error
- **AND** it MUST specify the missing file path
