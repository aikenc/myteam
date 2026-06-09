# Spec Delta: user-visible-communication

> 属于 change `define-user-visible-communication`。定义 Secretary / PM 面向用户的最小沟通协议，确保“事事有回音、件件有着落、用户能看懂”可测试、可追踪、可复盘。

---

## ADDED Requirements

### Requirement: PM emits user-visible lifecycle messages

MyTeam SHALL define a user-visible communication layer above `TaskEvent`, `Evidence`, `TaskRecord`, and `ReplayCase`. Secretary / PM SHALL emit safe user-visible messages for key task lifecycle points rather than exposing raw engineering logs as the product experience.

At minimum, user-visible message kinds SHALL include:

- `ack` — request received and understood.
- `progress` — aggregated progress update.
- `blocked` — blocked or waiting state.
- `clarification` — required user input.
- `completion` — successful or partial completion summary.
- `failure` — failed or cancelled task summary.
- `replay-status` — replay / reproducibility status.
- `repair-suggestion` — self-healing or repair replay guidance.

#### Scenario: PM acknowledges a task

- **GIVEN** a user submits a task that can be normalized into a `TaskRequest`
- **WHEN** TeamEngine accepts the task for execution
- **THEN** PM SHALL emit an `ack` user-visible message
- **AND** the message SHALL summarize the understood goal and immediate next step
- **AND** the message SHALL NOT require the user to understand internal workflow phases or raw logs

#### Scenario: PM reports progress without log spam

- **GIVEN** a task emits multiple low-level `TaskEvent` entries during execution
- **WHEN** PM reports progress to the user
- **THEN** PM SHALL aggregate relevant facts into a concise `progress` message
- **AND** MUST NOT emit one user-visible message for every low-level tool event by default
- **AND** the message SHALL reference supporting event or evidence refs when available

---

### Requirement: UserVisibleMessage has a minimum structured schema

MyTeam SHALL define a structured `UserVisibleMessage` contract. The message SHALL contain enough identifiers and refs to be persisted, streamed, rendered, and audited consistently across default CLI, library consumers, host UI, and replay.

At minimum, `UserVisibleMessage` SHALL include:

| 字段 | 类型 | 必要性 | 说明 |
|------|------|--------|------|
| `messageId` | `string` | MUST | `message_` 前缀或等价公共消息 ID |
| `kind` | `string` | MUST | `ack` / `progress` / `blocked` / `clarification` / `completion` / `failure` / `replay-status` / `repair-suggestion` |
| `summary` | `string` | MUST | 用户可读摘要 |
| `createdAt` | `string` | MUST | ISO 8601 时间 |
| `sessionId` | `string` | SHOULD | 会话关联 |
| `turnId` | `string` | SHOULD | 用户轮次关联 |
| `taskId` | `string` | SHOULD | 逻辑任务关联 |
| `runId` | `string` | SHOULD | 执行尝试关联 |
| `detail` | `string` | MAY | 简短补充说明 |
| `completedWork` | `string[]` | MAY | 已完成内容 |
| `currentWork` | `string[]` | MAY | 当前正在推进的事项 |
| `blockers` | `UserVisibleBlocker[]` | MAY | 阻塞原因 |
| `nextActions` | `UserVisibleNextAction[]` | MAY | 下一步建议或可执行动作 |
| `refs` | `UserVisibleRefs` | MUST | event / evidence / replay / workspace / error 引用 |

#### Scenario: User message can be traced to facts

- **GIVEN** PM emits a `completion`, `failure`, `blocked`, or `replay-status` message
- **WHEN** the message is persisted or streamed
- **THEN** the message SHALL include refs to supporting events, evidence, errors, replay case, or workspace unavailable reason when such refs exist
- **AND** MUST NOT claim facts that are absent from TeamEngine-owned records

---

### Requirement: User-visible messages are separate from TaskEvent facts

`TaskEvent` SHALL remain a factual event log for execution, replay, debugging, and audit. `UserVisibleMessage` SHALL be the PM-authored or PM-generated communication artifact for humans.

Default CLI, library stream, and host integrations SHALL consume the same TeamEngine-owned user-visible message stream or persisted messages. Entrypoints MAY render messages differently, but MUST NOT invent contradictory task facts.

#### Scenario: CLI renders the same PM message

- **GIVEN** PM emits a `progress` user-visible message
- **WHEN** the default CLI renders progress
- **THEN** the CLI SHALL render that message or a presentation-equivalent form
- **AND** MUST NOT invent a separate progress fact that is absent from TeamEngine records

#### Scenario: Host UI renders the same PM message

- **GIVEN** a host server consumes TeamEngine stream events
- **WHEN** a user-visible message is available
- **THEN** the host MAY render it as chat, notification, or timeline item
- **AND** MUST preserve the underlying task/run/evidence/replay refs

---

### Requirement: Blocking and clarification messages reduce user burden

PM SHALL ask the user for clarification only when the missing information is required to continue safely or correctly. If a reasonable assumption can be made without risking user intent, PM SHALL state the assumption and continue.

A `blocked` message SHALL include the blocking reason, impact, retryability, and next action when known.

#### Scenario: Missing optional detail is handled by assumption

- **GIVEN** a user task omits a non-critical preference
- **WHEN** PM can make a safe assumption
- **THEN** PM SHALL proceed using the assumption
- **AND** MAY include the assumption in an `ack` or `progress` message
- **AND** MUST NOT stop the task solely to ask a low-value question

#### Scenario: Required input blocks execution

- **GIVEN** a task cannot continue without a required decision or credential-free user input
- **WHEN** PM cannot safely infer the answer
- **THEN** PM SHALL emit a `clarification` or `blocked` message
- **AND** SHALL ask the minimum necessary question
- **AND** SHALL preserve the current task/run state for later continuation

---

### Requirement: Failure messages include recovery and replay context

When a task fails, is cancelled, or completes partially, PM SHALL emit a user-visible terminal message. The message MUST explain:

- where the task failed or stopped;
- what was completed;
- what capability, workspace state, input, or dependency was missing;
- whether retry, repair replay, or manual action is possible;
- which evidence, error, replay case, or workspace unavailable reason supports the explanation.

#### Scenario: Capability failure is explained to the user

- **GIVEN** a task fails because browser, shell, file, external CLI, workspace provider, or permission capability is unavailable
- **WHEN** PM emits the terminal failure message
- **THEN** the message SHALL identify the missing capability in user-readable language
- **AND** SHALL include a next action or workaround when known
- **AND** SHALL reference the structured error or evidence

#### Scenario: Replay is unavailable

- **GIVEN** deterministic replay is requested
- **AND** WorkspaceProvider reports snapshot incomplete, ignored file missing, provider unavailable, or isolation unavailable
- **WHEN** PM reports replay status
- **THEN** PM SHALL emit a `replay-status` message explaining why deterministic replay is unavailable
- **AND** SHALL distinguish evidence replay from deterministic replay
- **AND** SHALL suggest an action such as initializing Git, configuring a provider, allowlisting non-secret files, or using evidence replay

---

### Requirement: User-visible messages are sanitized

User-visible messages SHALL NOT contain secrets, credentials, hidden system prompts, private model reasoning, adapter-private connection details, or unredacted raw logs.

If a raw tool output is required for explanation, PM SHALL summarize or reference sanitized evidence rather than embedding the raw output directly.

#### Scenario: Secret-bearing evidence is summarized safely

- **GIVEN** a tool output contains a token, password, credential, private prompt, or secret-bearing environment value
- **WHEN** PM creates a user-visible message from that output
- **THEN** the message MUST redact or omit the secret value
- **AND** SHALL reference sanitized evidence when available
- **AND** MUST NOT place the secret in `summary`, `detail`, `blockers`, `nextActions`, or `refs`

---

### Requirement: Session transcript stores safe user-visible communication

MyTeam SHALL persist safe user-visible PM messages in the durable session transcript when a task is linked to a session. The session transcript SHALL store user-facing messages, summaries, and public task/run/event/evidence/replay references; detailed execution facts SHALL remain in run records. Persisted user-visible messages SHALL follow the `UserVisibleMessage` to `SessionMessage` mapping defined above.

#### Scenario: Final PM message is stored in session

- **GIVEN** a task linked to a conversation session reaches a terminal state
- **WHEN** PM emits a `completion` or `failure` message
- **THEN** MyTeam SHALL append the safe user-visible message to the session transcript
- **AND** SHALL link it to task/run/replay refs
- **AND** MUST NOT duplicate full EventLog, raw tool output, or private reasoning into the session message
