# Spec Delta: workspace-provider

> 属于 change `workspace-provider`。定义 MyTeam 的 runtime workspace inspect / snapshot / copy / fork / cleanup 能力，作为 replay、fork、repair replay 与运营自愈的持久化关键支撑。

---

## ADDED Requirements

### Requirement: WorkspaceProvider is the runtime workspace abstraction

MyTeam SHALL define `WorkspaceProvider` as the only internal abstraction responsible for runtime workspace state: inspecting workspace capabilities, capturing restorable state, preparing executable workspace copies, forking workspace copies, explaining snapshot/copy availability, and cleaning up prepared copies.

`WorkspaceProvider` is broader than snapshot capture. Snapshot refs are one output of the provider; executable copies, fork copies, cleanup, nested repository handling, and unavailable reasons are also part of the provider boundary.

`WorkspaceProvider` SHALL expose at least:

- `inspect(input): Promise<WorkspaceInspection>`
- `capture(input): Promise<WorkspaceSnapshotRef>`
- `prepareCopy(input): Promise<PreparedWorkspaceCopy>`
- `forkCopy(input): Promise<PreparedWorkspaceCopy>`
- `cleanup(input): Promise<CleanupWorkspaceCopyResult>`

Team Workflow, replay, fork, repair replay, CLI adapters, and host integrations MUST NOT implement ad-hoc workspace copying logic that bypasses this provider.

`WorkspaceProvider` MUST NOT replace `WorkspaceLoader`. `WorkspaceLoader` SHALL remain responsible for loading user-editable project configuration such as `SOUL.md`, `agents/`, `skills/`, `tools/`, and `myteam.config.json`. `WorkspaceProvider` SHALL be responsible for runtime workspace state and executable copies.

#### Scenario: Replay requests a workspace copy

- **GIVEN** a deterministic replay needs a workspace for a historical node
- **WHEN** replay starts
- **THEN** replay SHALL resolve the node's `WorkspaceSnapshotRef`
- **AND** SHALL call `WorkspaceProvider.prepareCopy()`
- **AND** MUST NOT manually copy directories or create Git worktrees outside the provider

#### Scenario: Provider unavailable

- **GIVEN** a workspace does not support the configured workspace provider
- **WHEN** deterministic replay or fork is requested
- **THEN** MyTeam SHALL return a structured unavailable result
- **AND** SHALL include provider kind, workspace path, and a human-readable reason
- **AND** MUST NOT pretend deterministic replay or fork was performed

---

### Requirement: Git V1 uses internal snapshot commits and worktrees

MyTeam V1 SHALL provide a `git-v1` workspace provider. The provider SHALL capture workspace state by creating internal Git snapshot commits and SHALL prepare executable copies using `git worktree`.

The Git provider MUST use an isolated temporary index when creating snapshot commits. It MUST NOT mutate the user's current index, branch, staged state, or working branch.

Snapshot refs SHALL be stored under `refs/myteam/*` or an equivalent MyTeam-owned internal ref namespace so that Git garbage collection does not remove required snapshot objects.

#### Scenario: Capturing a dirty root Git workspace

- **GIVEN** the workspace root is a Git repository with staged, unstaged, and untracked non-ignored files
- **WHEN** MyTeam captures a workspace snapshot
- **THEN** the Git provider SHALL create a snapshot commit that includes tracked content, staged changes, unstaged changes, and untracked non-ignored files
- **AND** SHALL write an internal MyTeam ref for that snapshot
- **AND** MUST NOT change the user's branch, index, or working tree

#### Scenario: Preparing a replay copy

- **GIVEN** a `WorkspaceSnapshotRef` produced by the Git provider
- **WHEN** deterministic replay prepares a workspace copy
- **THEN** the provider SHALL create a `git worktree` from the recorded snapshot ref
- **AND** SHALL return the prepared workspace path and copy metadata
- **AND** SHALL record whether the copy is disposable or retained

---

### Requirement: Nested Git repositories are recursively captured

The Git V1 provider SHALL detect and handle nested Git repositories within the selected workspace root, including normal nested repositories, submodules, and nested Git worktrees.

A parent repository snapshot MUST NOT be considered complete for deterministic replay if nested repositories under the workspace root have dirty, staged, unstaged, or untracked non-ignored state that has not been captured. MyTeam MUST NOT rely only on a parent's gitlink or nested repository HEAD commit to claim deterministic replay support.

Each discovered repository SHALL have its own snapshot metadata and snapshot ref in the `WorkspaceSnapshotRef`.

#### Scenario: Nested repo has dirty files

- **GIVEN** the workspace root is a Git repository
- **AND** it contains a nested Git repository at `packages/foo`
- **AND** `packages/foo` has unstaged or untracked non-ignored files
- **WHEN** MyTeam captures a workspace snapshot
- **THEN** the Git provider SHALL capture a separate snapshot commit for `packages/foo`
- **AND** the top-level `WorkspaceSnapshotRef` SHALL include metadata for both the root repo and `packages/foo`
- **AND** deterministic replay SHALL be able to restore both repositories or report a structured unavailable error

#### Scenario: Nested repo cannot be captured

- **GIVEN** a nested Git repository is required for the workspace snapshot
- **WHEN** the Git provider cannot inspect or snapshot that repository
- **THEN** the snapshot SHALL be marked unavailable or incomplete for deterministic replay
- **AND** the unavailable reason SHALL identify the nested repository path and failure reason
- **AND** MyTeam MUST NOT silently downgrade to recording only the nested repo HEAD commit

#### Scenario: Clean submodule is recorded

- **GIVEN** the workspace contains a clean Git submodule
- **WHEN** MyTeam captures a workspace snapshot
- **THEN** the provider SHALL record the submodule path, kind, gitdir/common-dir, HEAD commit, and clean status
- **AND** MAY reuse a snapshot ref equivalent to the submodule HEAD
- **AND** SHALL still include the submodule entry in snapshot metadata

---

### Requirement: WorkspaceSnapshotRef records provider, completeness, and repository metadata

A `WorkspaceSnapshotRef` SHALL contain enough metadata to explain, restore, fork, and audit a workspace snapshot without reading adapter-private memory.

For Git V1, `WorkspaceSnapshotRef` SHALL include at minimum:

- `snapshotId`
- `providerKind = 'git-v1'`
- `workspaceRoot`
- `capturedAt`
- `runId`, when available
- `nodeId`, when available
- `point = 'before' | 'after' | 'start'`
- `repos[]`, including root and nested repo metadata
- `completeness = 'complete' | 'unavailable'`
- `unavailableReasons[]`
- `redactionReportRef`, when applicable

Each Git repo metadata entry SHALL include at minimum:

- `repoId`
- `relativePath`
- `kind = 'root' | 'nested-repo' | 'submodule' | 'worktree'`
- `worktreeRoot`
- `gitDir`
- `gitCommonDir`
- `headCommit`
- `snapshotRef`
- `treeHash`
- `status`

#### Scenario: Snapshot metadata survives process restart

- **GIVEN** MyTeam captured a workspace snapshot for a replayable node
- **WHEN** the original process exits and later replay starts
- **THEN** MyTeam SHALL load snapshot metadata from persisted run records
- **AND** SHALL restore or explain the snapshot without relying on in-memory provider state

---

### Requirement: Replay nodes reference workspace snapshots

Replayable nodes SHALL be able to reference workspace snapshots. At minimum, agent-turn and verification nodes SHALL support `workspaceBeforeRef`; agent-turn nodes SHALL also support `workspaceAfterRef` when the turn completes.

V1 SHALL capture workspace snapshots at these points:

- run start: MUST
- agent-turn before: MUST
- agent-turn after: MUST
- verification before: MUST
- PM turn: MAY capture workspace, but MUST capture workflow state
- read-only tool-call: MAY
- mutating tool-call: SHOULD in a later phase

#### Scenario: Agent turn can be replayed

- **GIVEN** an agent turn node has `workspaceBeforeRef` and state-before data
- **WHEN** deterministic replay targets that node
- **THEN** MyTeam SHALL prepare a workspace copy from `workspaceBeforeRef`
- **AND** SHALL restore workflow state from state-before data
- **AND** SHALL rerun the node in the prepared workspace

#### Scenario: Fork starts after an agent turn

- **GIVEN** an agent turn node completed with `workspaceAfterRef`
- **WHEN** a user forks from that node after completion
- **THEN** MyTeam SHALL create a fork workspace from `workspaceAfterRef`
- **AND** SHALL create a new `runId`
- **AND** SHALL record `forkedFromRunId`, `forkedFromNodeId`, and fork point metadata

---

### Requirement: Ignored files and secrets are excluded by default

The Git V1 provider SHALL exclude Git-ignored files by default. Secret-bearing files such as `.env` and credential files MUST NOT be captured unless explicitly allowed by a safe, auditable allowlist policy.

If deterministic replay requires excluded files, MyTeam SHALL mark replay unavailable or degraded with a clear reason. MyTeam MUST NOT silently include ignored or secret-bearing files to make replay succeed.

#### Scenario: Ignored test data is required

- **GIVEN** a task depends on an ignored file under `local-test-data/`
- **AND** that path is not allowlisted for workspace snapshots
- **WHEN** deterministic replay is requested
- **THEN** MyTeam SHALL report that the required ignored file was not captured
- **AND** SHALL suggest adding a workspace snapshot allowlist entry if appropriate
- **AND** MUST NOT pretend deterministic replay is complete

---

### Requirement: Prepared workspace cleanup is fail-closed

Prepared replay and fork workspaces SHALL have explicit cleanup semantics. Replay copies MAY be disposable by default. Fork copies MAY be retained when requested.

Before deleting a prepared workspace, MyTeam SHALL inspect it for dirty files and unrecorded commits. Cleanup MUST fail closed by default if deleting the copy would discard user-visible work.

#### Scenario: Disposable replay copy is clean

- **GIVEN** a replay copy was created as disposable
- **AND** replay completed without leaving dirty files or unrecorded commits
- **WHEN** cleanup runs
- **THEN** MyTeam MAY remove the worktree
- **AND** SHALL record cleanup success in copy metadata

#### Scenario: Fork copy has user changes

- **GIVEN** a fork copy is retained or has user changes
- **WHEN** cleanup is requested without force
- **THEN** MyTeam SHALL refuse destructive cleanup
- **AND** SHALL report dirty paths or unrecorded commits
- **AND** SHALL require explicit force or user action before deletion

---

### Requirement: Non-Git workspaces require another provider for deterministic replay

In V1, deterministic replay and fork SHALL require Git V1 provider support unless a host-provided or future provider is configured. Non-Git workspaces MAY support evidence replay, but deterministic replay and fork MUST be unavailable by default.

#### Scenario: Non-Git workspace uses evidence replay

- **GIVEN** a workspace has no supported workspace provider
- **WHEN** evidence replay is requested
- **THEN** MyTeam MAY replay persisted events and evidence
- **AND** SHALL mark workspace execution replay as unavailable

#### Scenario: Non-Git workspace requests fork

- **GIVEN** a workspace has no Git repository and no host workspace provider
- **WHEN** fork is requested from a replay node
- **THEN** MyTeam SHALL reject the fork with a structured unavailable reason
- **AND** MUST NOT create an untracked ad-hoc directory copy as if it were a supported snapshot
