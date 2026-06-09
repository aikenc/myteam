# Spec Delta: team-engine-entrypoints

> 属于 change `library-first-team-engine`。定义 MyTeam 的 library-first TeamEngine 入口语义，确保 library API、默认 CLI 执行和 replay 共享同一执行语义。

---

## ADDED Requirements

### Requirement: TeamEngine is the public library execution core

MyTeam SHALL define `TeamEngine` as the public library execution core. Library consumers, the default CLI adapter, and the replay adapter MUST convert their entrypoint-specific input into MyTeam public contracts, then call `TeamEngine`; they MUST NOT directly invoke PM, InternalAgent, CLIAgent, Team Workflow, or ToolAdapter.

`TeamEngine` SHALL support concurrent active runs. `sessionId` MUST NOT be treated as a global execution lock; resource conflicts SHALL be handled through explicit resource coordination and conflict policy.

`TeamEngine` SHALL expose at least the following session and run operations:

- `openSession(input: OpenSessionInput): Promise<ConversationSession>`
- `resumeSession(sessionId: string, options?: ResumeSessionOptions): Promise<SessionSnapshot>`
- `forkSession(sessionId: string, options?: ForkSessionOptions): Promise<ConversationSession>`
- `start(request: TaskRequest, options?: StartRunOptions): Promise<ActiveRun>`
- `stream(runId: string, cursor?: EventCursor): AsyncIterable<TaskEvent>`
- `check(runId: string): Promise<RunStatusSnapshot>`
- `outcome(runId: string, options?: OutcomeOptions): Promise<TaskResult>`
- `cancel(runId: string, reason?: CancelReason): Promise<void>`

MyTeam SHALL export a `createTeamEngine(options)` function from its public library API. Convenience APIs such as `executeTask()` or `replayTask()` MAY exist, but they MUST delegate to the same TeamEngine semantics and MUST NOT own a separate business workflow.

#### Scenario: Host server uses TeamEngine as a library

- **GIVEN** a host server wants to execute a MyTeam task
- **WHEN** the host server imports MyTeam and calls `createTeamEngine(options)`
- **THEN** the host server SHALL submit work through `TeamEngine.start(request)`
- **AND** SHALL consume progress, status, outcome, and cancellation through TeamEngine operations
- **AND** MUST NOT import MyTeam private workflow modules or spawn the MyTeam CLI as the task execution mechanism

#### Scenario: Default CLI uses TeamEngine

- **GIVEN** a user runs `myteam "..." --workspace ... --json`
- **WHEN** the CLI command receives argv or stdin
- **THEN** the CLI adapter SHALL build a `TaskRequest`
- **AND** SHALL call `TeamEngine.start(request)`
- **AND** SHALL consume `TeamEngine.stream(runId)` for progress or event output
- **AND** SHALL call `TeamEngine.outcome(runId, { wait: true })` for the final `TaskResult`
- **AND** MUST NOT execute a CLI-only PM / Agent path

---

### Requirement: Root package exposes the public library facade

MyTeam SHALL treat the root `myteam` package as the user-facing library facade. The root package public API SHALL expose TeamEngine entrypoints such as `createTeamEngine()` and public contract types, while private implementation modules under `packages/engine/src/*` SHALL remain non-public.

The CLI package MAY implement the executable adapter, but the root package `bin` contract and build output path MUST be designed together so that the documented `myteam` command resolves to a real CLI entrypoint after implementation.

#### Scenario: Importing from root package exposes only public API

- **GIVEN** a library consumer imports from `myteam`
- **WHEN** the consumer accesses exported symbols
- **THEN** `createTeamEngine` and public contract types SHALL be available
- **AND** private `engine/src/*`, workflow, runtime adapter, and tool implementation modules MUST NOT be exported as public API

#### Scenario: CLI package uses Engine public API only

- **GIVEN** the default CLI adapter needs to execute a task
- **WHEN** it imports engine functionality
- **THEN** it SHALL import through the engine public API or root facade
- **AND** it MUST NOT import `packages/engine/src/*` private paths

---

### Requirement: The root CLI command is the default one-shot execution entrypoint

MyTeam SHALL treat the root CLI command as the default one-shot task execution entrypoint. The CLI MUST support task input through a positional task string, an explicit `--task` option, or stdin. MyTeam MUST NOT require a `run` subcommand for ordinary one-shot execution.

The default CLI execution SHALL be a thin adapter over TeamEngine. Adapter-specific behavior MAY affect terminal rendering and JSON formatting, but MUST NOT affect task execution decisions.

#### Scenario: User executes a positional task

- **GIVEN** a user wants to execute a one-shot task locally
- **WHEN** the user runs `myteam "整理这个项目并生成 README" --workspace . --json`
- **THEN** MyTeam SHALL normalize the positional task into a `TaskRequest`
- **AND** SHALL execute it through TeamEngine
- **AND** SHALL write the final `TaskResult` to stdout in JSON mode
- **AND** SHALL write human-readable progress or logs to stderr when needed

#### Scenario: User executes a task from stdin

- **GIVEN** a user has a task description in stdin
- **WHEN** the user runs `cat task.md | myteam --workspace . --json`
- **THEN** MyTeam SHALL normalize stdin content into a `TaskRequest`
- **AND** SHALL execute it through TeamEngine
- **AND** MUST NOT require the user to specify `myteam run`

---

### Requirement: Replay is an explicit diagnostic command

MyTeam SHALL provide `myteam replay` as an explicit diagnostic, replay, and repair-verification command. Replay MUST reconstruct replay input from `ReplayCase`, `TaskRecord`, or `runId`, then execute through TeamEngine or perform an explicitly marked evidence replay.

Replay modes SHALL be explicit: `evidence` replay replays records without rerunning model/tool effects; `deterministic` replay attempts to reproduce the original run with equivalent input/config/workspace snapshot; `repair` replay reruns historical cases against updated agent / skill / tool / workflow assets to verify self-healing.

Replay MUST NOT rely on CLI-only logs, terminal rendering, host-server connection state, or adapter-private transient state.

#### Scenario: Replay by run id

- **GIVEN** a completed run has persisted a `TaskRecord` and `ReplayCase`
- **WHEN** a user invokes `myteam replay --run-id <runId> --workspace ... --json`
- **THEN** the replay command SHALL load TeamEngine-owned records
- **AND** SHALL reconstruct replay input
- **AND** SHALL produce a comparable result or an explicit difference report
- **AND** MUST NOT require original terminal output or host-server connection state

#### Scenario: Replay by case file

- **GIVEN** a user has a replay case file
- **WHEN** the user invokes `myteam replay --case <path> --json`
- **THEN** MyTeam SHALL load the replay case
- **AND** SHALL execute through TeamEngine or perform an explicitly marked evidence replay
- **AND** SHALL preserve the original run record without overwriting it

#### Scenario: Deterministic replay requires snapshot capability

- **GIVEN** a replay case requests deterministic replay
- **AND** the case references a workspace snapshot
- **WHEN** MyTeam starts replay
- **THEN** MyTeam SHALL ask the host/runtime or configured adapter to restore or validate the workspace snapshot
- **AND** if snapshot/isolation capability is unavailable, MyTeam SHALL return an explicit replay-unavailable result
- **AND** MUST NOT pretend the replay was deterministic

#### Scenario: Repair replay verifies a fix

- **GIVEN** a historical failure has a `FailureFingerprint` and replay case
- **WHEN** a user or host invokes repair replay with updated agent, skill, tool, or workflow assets
- **THEN** MyTeam SHALL create a new replay run identity
- **AND** SHALL compare the new outcome against the original failure
- **AND** SHALL report whether the fix resolved, changed, or failed to reproduce the issue

---

### Requirement: Entrypoints preserve shared execution semantics

MyTeam SHALL ensure library API, default CLI execution, and replay share the same request normalization, workspace loading, team workflow, event model, error model, evidence generation, and replay generation. Entrypoint-specific behavior MAY affect transport and presentation, but MUST NOT affect task execution decisions.

#### Scenario: Same task has comparable library and CLI results

- **GIVEN** a fixture `TaskRequest` for a workspace task
- **WHEN** the request is executed once through the public library API
- **AND** executed once through the default CLI adapter
- **THEN** both runs SHALL use the same TeamEngine workflow
- **AND** both runs SHALL produce comparable `TaskEvent` type sequences
- **AND** both runs SHALL produce a final `TaskResult` with compatible status, error code, evidence references, and replay reference

#### Scenario: Entrypoint-specific defaults are forbidden

- **GIVEN** a required workspace configuration, prompt asset, tool capability, or permission is missing
- **WHEN** the task is submitted through library API or default CLI
- **THEN** both entrypoints MUST fail through the same structured error path
- **AND** neither entrypoint MAY silently add a default personality, default tool, default permission, or fallback workflow that the other entrypoint does not use

---

### Requirement: Conversation session identity is separate from task and run identity

MyTeam SHALL distinguish user-facing conversation continuity from task execution identity. `sessionId` SHALL identify one durable conversation within a workspace or host-defined scope. `turnId` SHALL identify one user-facing interaction turn within that session. `taskId` SHALL identify the logical user or host-system task created from a turn. `runId` SHALL identify one concrete execution attempt created by `TeamEngine.start()`.

A session MAY contain many turns. A turn MAY create zero, one, or multiple tasks. A task MAY have multiple runs due to retry, replay, resume, or diagnostic rerun. MyTeam MUST NOT use `sessionId`, `taskId`, or `runId` interchangeably.

#### Scenario: Follow-up message keeps conversation continuity

- **GIVEN** a user has an existing conversation session
- **WHEN** the user submits a follow-up task that depends on earlier visible context
- **THEN** MyTeam SHALL attach the new turn to the same `sessionId`
- **AND** SHALL create or reference the appropriate `taskId`
- **AND** SHALL create a new `runId` for the execution attempt
- **AND** SHALL preserve links from session turn to task and run records

#### Scenario: Retry keeps task identity but creates a new run

- **GIVEN** a turn created `taskId = task_123`
- **AND** the first attempt failed with `runId = run_a`
- **WHEN** the task is retried
- **THEN** MyTeam SHALL preserve `sessionId`, `turnId`, and `taskId`
- **AND** SHALL create a distinct `runId`
- **AND** SHALL keep both run records associated with the same logical task

---

### Requirement: TeamEngine manages session lifecycle through the public API

TeamEngine SHALL provide public session lifecycle operations for opening, resuming, and forking durable conversations. `openSession(input)` SHALL create a new `ConversationSession`. `resumeSession(sessionId, options?)` SHALL rebuild a `SessionSnapshot` from persisted transcript data. `forkSession(sessionId, options?)` SHALL create a new session derived from an existing transcript point without mutating the original session.

`start(request, options?)` SHALL accept session linkage through `StartRunOptions` or normalized `TaskRequest` metadata. At minimum, run creation MUST be able to reference `sessionId` and `turnId` when the task originates from a conversation session.

#### Scenario: Host resumes a conversation before submitting a task

- **GIVEN** a host application stores or receives a `sessionId`
- **WHEN** it calls `TeamEngine.resumeSession(sessionId)`
- **THEN** TeamEngine SHALL return a `SessionSnapshot` containing session metadata, latest transcript cursor, visible context summary, and linked task/run references
- **AND** the host MAY submit a follow-up task through `TeamEngine.start(request, { sessionId, turnId })`
- **AND** TeamEngine MUST NOT require the original CLI process, terminal UI, or host connection to exist

#### Scenario: Session fork preserves the original transcript

- **GIVEN** a session contains multiple turns
- **WHEN** a host or CLI calls `TeamEngine.forkSession(sessionId, { fromCursor })`
- **THEN** TeamEngine SHALL create a new `sessionId`
- **AND** SHALL copy or reference transcript entries up to the fork point
- **AND** MUST NOT mutate or truncate the original session
- **AND** future turns in the fork SHALL write to the new session transcript

---

### Requirement: Session transcript is durable, append-only, and separate from run event logs

MyTeam SHALL persist a durable `SessionTranscript` for conversation continuity. Session transcript entries MUST be append-only within a `sessionId` and cursor-addressable by a `SessionCursor` containing at least `sessionId` and `seq`.

The session transcript SHALL store user-visible conversation entries, compacted summaries, task/run linkage entries, and safe metadata required to rebuild model-visible context. It MUST NOT be the source of truth for PM, agent, tool, artifact, or error facts for a run; those facts belong in `EventLog` keyed by `runId`.

#### Scenario: Resume rebuilds model-visible context from transcript

- **GIVEN** a session has persisted user messages, assistant-visible responses, summaries, and task/run references
- **WHEN** TeamEngine resumes the session
- **THEN** it SHALL rebuild the model-visible conversation context from `SessionTranscript`
- **AND** MAY dereference linked `TaskRecord`, `Evidence`, or summarized run outcomes as needed
- **AND** MUST NOT rely on terminal scrollback, CLI-only logs, or adapter-private memory

#### Scenario: Run facts are not duplicated into transcript

- **GIVEN** a run emits tool, artifact, PM, agent, or error events
- **WHEN** TeamEngine records session history
- **THEN** the session transcript SHALL store only safe user-facing summaries or references to `taskId` / `runId`
- **AND** detailed factual events SHALL remain in the run `EventLog`
- **AND** replay SHALL use `TaskRecord`, `EventLog`, `Evidence`, and `ReplayCase`, not transcript-only summaries

---

### Requirement: CLI session resume restores conversation, not dead process state

The default CLI SHALL support session continuation flags including `--continue` and `--resume <sessionId-or-name>`. It MAY also support `--fork-session`. When used, these flags SHALL resolve a durable `sessionId`, rebuild conversation context through TeamEngine session operations, and submit any new task as a new turn and run.

CLI session resume MUST NOT imply that an already exited process, terminated tool call, lost stream, or dead child process is still running. If a previous run was active when the owning process exited, MyTeam SHALL persist an explicit interrupted, cancelled, failed, or otherwise non-success terminal/diagnostic state before allowing retry or follow-up execution.

#### Scenario: Continue recent conversation from CLI

- **GIVEN** the user has a previous local session for the workspace
- **WHEN** the user runs `myteam --continue "继续刚才的方案" --workspace . --json`
- **THEN** the CLI adapter SHALL resolve the recent `sessionId`
- **AND** SHALL call TeamEngine session resume behavior
- **AND** SHALL create a new turn and execution run for the new task
- **AND** MUST NOT depend on the original CLI process still being alive

#### Scenario: Exited CLI does not fake active run continuation

- **GIVEN** a one-shot CLI process exited while a run was not cleanly completed
- **WHEN** the user later resumes the conversation
- **THEN** MyTeam SHALL expose the previous run as interrupted, cancelled, failed, or otherwise explicitly unresolved
- **AND** SHALL allow a new retry run when requested
- **AND** MUST NOT report the old run as succeeded merely because conversation context was restored

---

### Requirement: Run identity separates task from execution attempt

MyTeam SHALL distinguish logical user task identity from execution attempt identity. `taskId` SHALL identify the user task or host-system task. `runId` SHALL identify one concrete execution attempt created by `TeamEngine.start()`.

A single `taskId` MAY have multiple `runId` values due to retry, replay, resume, or diagnostic rerun. `TaskEvent`, `Evidence`, `TaskRecord`, and `ReplayCase` MUST include `runId`; when available, they SHALL also include `taskId`.

#### Scenario: Retry creates a new run

- **GIVEN** a task with `taskId = task_123` failed during execution
- **WHEN** the task is retried through TeamEngine
- **THEN** the new execution attempt SHALL receive a new `runId`
- **AND** generated events and evidence SHALL reference the new `runId`
- **AND** the system SHALL preserve the relationship to `task_123`

#### Scenario: Replay does not overwrite original run

- **GIVEN** a completed run has `runId = run_original`
- **WHEN** a user invokes replay for that run
- **THEN** TeamEngine SHALL create or use a distinct replay run identity
- **AND** replay output MUST NOT overwrite the original TaskRecord, EventLog, Evidence, or TaskResult

---

### Requirement: TeamEngine supports concurrent runs with explicit resource coordination

TeamEngine SHALL support multiple active runs concurrently, including multiple runs linked to the same `sessionId`. TeamEngine MUST NOT serialize all work by session as a hidden global lock.

Each `runId` SHALL have independent `EventLog`, `Evidence`, `TaskRecord`, and `ReplayCase` storage. Shared workspace resources SHALL be coordinated through explicit resource hints, locks, and conflict policy.

`StartRunOptions` SHOULD support `concurrencyKey`, `resourceHints`, and `conflictPolicy`. At minimum, `conflictPolicy` SHALL support `wait`, `fail`, and `fork` semantics.

#### Scenario: Same session has concurrent runs

- **GIVEN** a conversation session has one active run
- **WHEN** the host submits another task linked to the same `sessionId`
- **THEN** TeamEngine MAY start another run concurrently
- **AND** each run SHALL maintain independent event sequence, evidence directory, task record, and replay case
- **AND** session transcript updates SHALL remain append-only and cursor-addressable

#### Scenario: Resource conflict waits explicitly

- **GIVEN** two runs both request exclusive write access to the same file path
- **WHEN** the second run starts with `conflictPolicy = "wait"`
- **THEN** TeamEngine SHALL place the second run in `waiting_resource`
- **AND** SHALL emit a resource waiting event
- **AND** SHALL resume the run when the resource is released or fail with a structured timeout/cancellation error

#### Scenario: Resource conflict fails explicitly

- **GIVEN** two runs conflict on an exclusive workspace resource
- **WHEN** the second run starts with `conflictPolicy = "fail"`
- **THEN** TeamEngine SHALL fail or reject the start request with a structured conflict error
- **AND** MUST NOT silently serialize the run without reporting the conflict policy outcome

---

### Requirement: Event stream is durable, ordered, and cursor-addressable

TeamEngine SHALL expose task progress through `stream(runId, cursor?)`. Events MUST be ordered per `runId` using a monotonically increasing `seq`. `EventCursor` SHALL include at least `runId` and `seq` so library consumers, host transports, CLI output, and replay consumers can resume from a known point.

TeamEngine MUST emit or persist events before exposing them to entrypoints. CLI adapters and host-server integrations MUST consume the same event source instead of producing separate factual logs.

#### Scenario: Host transport resumes events by cursor

- **GIVEN** a host server forwards TeamEngine events to a client through its own transport
- **AND** the client last received event sequence `42`
- **WHEN** the host server resumes consumption with cursor `{ runId, seq: 42 }`
- **THEN** TeamEngine SHALL resume the stream after sequence `42`
- **AND** MUST NOT skip persisted events after sequence `42`
- **AND** MUST NOT require a MyTeam-owned HTTP or SSE server to provide cursor semantics

#### Scenario: CLI event output uses the same EventLog

- **GIVEN** the default CLI is displaying progress
- **WHEN** the task emits PM, Agent, tool, artifact, or error events
- **THEN** the CLI adapter SHALL render events from `TeamEngine.stream(runId)`
- **AND** MUST NOT invent separate progress facts that are absent from the TeamEngine EventLog

---

### Requirement: Run status and outcome have explicit lifecycle semantics

TeamEngine SHALL expose current state through `check(runId)` and final result through `outcome(runId, options?)`. `RunStatus` SHALL include in-progress states and terminal states. Terminal states SHALL align with `TaskResult.status` semantics.

At minimum, MyTeam SHALL support:

- `queued`
- `waiting_resource`
- `running`
- `blocked`
- `cancelling`
- `succeeded`
- `partial`
- `failed`
- `cancelled`

`outcome(runId, { wait: false })` or equivalent non-wait behavior MUST NOT pretend an unfinished run has succeeded. If the run has not reached a terminal state, the system SHALL return a structured not-ready response or require explicit waiting semantics.

#### Scenario: Status is queryable while running

- **GIVEN** a long-running task has started
- **WHEN** a library consumer calls `TeamEngine.check(runId)`
- **THEN** the response SHALL include `runId`, `taskId`, current `RunStatus`, `updatedAt`, `lastEventSeq`, and current actor or blocking reason when known
- **AND** the consumer SHALL be able to continue consuming events from `lastEventSeq`

#### Scenario: Outcome waits for final result

- **GIVEN** a run is still `running`
- **WHEN** the default CLI calls `TeamEngine.outcome(runId, { wait: true })`
- **THEN** TeamEngine SHALL wait until the run reaches a terminal state or timeout
- **AND** SHALL return the final `TaskResult` after completion
- **AND** if timeout occurs, SHALL return or throw a structured timeout error without marking the task as succeeded

---

### Requirement: Cancellation propagates through the workflow

TeamEngine SHALL implement `cancel(runId, reason?)` as a workflow-level cancellation signal. Cancellation MUST propagate to PM driver, active InternalAgent or CLIAgent turn, active tool calls, and external child processes where possible.

Cancellation MUST produce structured events and a terminal `TaskResult` with `cancelled` or appropriate failure status. It MUST NOT only drop the caller connection or abandon a promise while work continues untracked.

#### Scenario: User cancels an active run

- **GIVEN** a run is executing a delegated agent task
- **WHEN** a user or host system calls `TeamEngine.cancel(runId, reason)`
- **THEN** TeamEngine SHALL move the run to `cancelling`
- **AND** SHALL notify the PM workflow and active agent/tool execution
- **AND** SHALL emit cancellation events
- **AND** SHALL eventually persist a terminal TaskResult

#### Scenario: External CLI agent cannot stop immediately

- **GIVEN** cancellation reaches a CLIAgent process
- **WHEN** the process does not exit immediately
- **THEN** MyTeam MUST apply a timeout or cleanup policy
- **AND** MUST record evidence describing whether the process was gracefully stopped, killed, or left with a known limitation
- **AND** MUST NOT silently report the run as successfully completed

---

### Requirement: MyTeam does not provide a built-in service CLI entrypoint

MyTeam MUST NOT require or provide `myteam serve` as the production service integration path for this capability. Production servers SHALL integrate by importing MyTeam as a library and mapping their own protocols to TeamEngine operations.

MyTeam MUST NOT use repeated invocations of the `myteam` CLI to implement production message streams, agent turns, tool calls, browser automation main loops, or host/tool capability proxies. CLI boundaries SHALL remain at local one-shot execution, diagnostic, and replay granularity.

#### Scenario: Host server handles multiple messages through library API

- **GIVEN** a host server has imported MyTeam and created a TeamEngine
- **WHEN** the host server receives multiple task messages or follow-up actions
- **THEN** the host server SHALL call TeamEngine operations in-process or through its own application architecture
- **AND** MUST NOT spawn `myteam` for each message
- **AND** MUST NOT rely on a `myteam serve` process as the required integration mechanism

#### Scenario: Tool call does not spawn MyTeam CLI

- **GIVEN** an InternalAgent or CLIAgent requests a file, shell, browser, or external tool capability
- **WHEN** the ToolAdapter executes that capability
- **THEN** MyTeam MUST execute through in-process adapter, SDK, RPC, or explicitly wrapped external tool
- **AND** MUST NOT call the `myteam` CLI as the implementation of each tool call

---

### Requirement: Replay is based on TeamEngine records, not adapter-private logs

MyTeam SHALL generate `TaskRecord`, `EventLog`, `Evidence`, `ReplayCase`, and failure fingerprint candidates from TeamEngine-owned execution data. Replay MUST NOT rely on CLI-only logs, host-server connection state, or adapter-private transient state. ReplayCase SHALL capture enough sanitized metadata to support evidence replay, deterministic replay when host snapshot/isolation capability is available, and repair replay for self-healing validation.

#### Scenario: Default CLI execution exports replay case

- **GIVEN** a task completed through default CLI execution
- **WHEN** TeamEngine produces the final `TaskResult`
- **THEN** MyTeam SHALL persist a `TaskRecord`
- **AND** SHALL persist or reference an `EventLog`, `Evidence`, and `ReplayCase`
- **AND** the replay case SHALL be usable without reading CLI-only progress output

#### Scenario: Library execution can be replayed by CLI

- **GIVEN** a task completed through the public library API
- **WHEN** a user invokes `myteam replay --run-id <runId>`
- **THEN** the replay command SHALL load TeamEngine-owned records
- **AND** MUST NOT require host-server private memory or connection state
- **AND** SHALL produce a comparable result or an explicit difference report

---

### Requirement: Public events and records are sanitized

TeamEngine SHALL ensure public `SessionTranscript`, `TaskEvent`, `TaskRecord`, `Evidence`, and `ReplayCase` do not contain secrets, hidden system prompts, private model reasoning, credentials, or adapter-private connection details.

#### Scenario: Secret appears in tool environment

- **GIVEN** a tool executes with access to secret-bearing environment or credentials
- **WHEN** TeamEngine records session transcript, events, evidence, or replay data
- **THEN** secret values MUST be redacted or omitted
- **AND** replay MUST retain enough non-secret metadata to explain the action and failure mode

#### Scenario: Model stream includes private reasoning

- **GIVEN** an underlying model or AgentLoop produces private reasoning or hidden prompt material
- **WHEN** TeamEngine maps stream output to public `TaskEvent`
- **THEN** public events MUST NOT include that private reasoning or hidden prompt material
- **AND** user-visible progress SHALL be generated from safe event summaries or allowed assistant-visible content only
