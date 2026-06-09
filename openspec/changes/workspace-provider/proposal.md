# Change Proposal: workspace-provider

## 为什么

MyTeam 的 replay、fork、repair replay 和运营自愈都依赖一个关键前提：**任意可复现节点都能拿到对应时刻的可执行 workspace 副本**。

仅有 `TaskRecord`、`EventLog`、`Evidence` 不足以复现问题；如果 workspace 状态无法恢复，deterministic replay 和 fork 都会退化为日志解释。尤其常见的 workspace 形态是“根目录是 Git 仓库，同时内部还有用户维护的 Git 项目、submodule 或 worktree”。父仓库 snapshot 只会记录嵌套仓库的 gitlink / commit，不会自动捕获嵌套仓库中的 dirty 文件、untracked 文件和工作区状态。因此 MyTeam 必须把 workspace 的检查、状态捕获、可执行副本准备、fork、清理和可用性解释作为独立模块和持久化关键支撑能力，而不是散落在 replay 或 CLI 逻辑里。

本变更定义 `workspace-provider` 能力：它不是单纯的 snapshot provider，而是 MyTeam 对“运行时 workspace 状态与可执行副本”的统一抽象。V1 使用 Git snapshot commit + Git worktree 实现；未来允许接入 reflink、overlayfs、volume snapshot、host-provided workspace 等实现，但公共契约保持一致。

## 变更内容

- 新增 `workspace-provider` 能力规约。
- 定义 `WorkspaceProvider` 抽象：`inspect`、`capture`、`prepareCopy`、`forkCopy`、`cleanup`。
- 定义 Git V1 实现：通过临时 index、`write-tree`、`commit-tree`、`update-ref` 生成内部 snapshot ref，通过 `git worktree add` 懒创建 replay/fork workspace。
- 明确嵌套 Git 必须被处理：V1 SHALL 发现并递归 snapshot workspace 内的 nested Git repo / submodule / worktree；dirty 与 untracked non-ignored 状态 MUST 被捕获或显式失败，不能假装 deterministic replay 可用。
- 明确 ignored 文件、`.myteam/` runtime 数据、prepared copy 目录和 secret-bearing paths 默认不进入 snapshot；如需纳入 ignored 业务文件，必须通过显式 allowlist，并记录 redaction report。
- 明确 `WorkspaceSnapshotRef` 与 `ReplayNode`、`ReplayCase`、`ForkRecord` 的关系。
- 明确非 Git workspace 在 V1 只支持 evidence replay，除非宿主提供兼容的 workspace provider。

## 能力范围

### 新增能力

- `workspace-provider`
  - workspace 状态捕获、恢复、副本创建和清理。
  - Git root 与 nested Git repo 的发现、分类、snapshot 和 restore。
  - 节点级 `workspaceBeforeRef` / `workspaceAfterRef`。
  - replay / fork worktree 的懒创建和 fail-closed 清理。
  - snapshot completeness、redaction、unavailable reason 与审计事件。

### 修改能力

- `team-engine-entrypoints`：deterministic replay / repair replay / fork SHALL 依赖 `WorkspaceProvider` 提供 workspace copy。
- `task-events-evidence`：ReplayCase、TaskRecord、TaskEvent SHALL 引用 workspace snapshot / copy / unavailable reason。
- `workspace-storage`：`.myteam/runs/{runId}/workspace/` SHALL 保存 workspace snapshot metadata，而不是保存完整文件副本。
- `tool-capability-adapters`：文件和 shell 能力执行时应能关联到当前 prepared workspace path。

## 影响范围

- `packages/engine/src/workspace-provider/*`：新增 workspace provider 抽象和 Git V1 实现。
- `packages/engine/src/records/*`：ReplayCase / TaskRecord 增加 workspace snapshot 引用。
- `packages/engine/src/workflow/*`：agent-turn / verification 节点保存 before/after workspace snapshot。
- `packages/engine/src/resources/*`：fork/replay worktree path 与资源锁协调。
- `packages/cli/*`：`replay` / `fork` 命令使用 provider 创建临时或持久 workspace copy。
- `docs/technical-architecture.md`：后续实现时补充 Workspace Snapshot 模块说明。

## 非目标

- 不在 V1 支持所有非 Git workspace 的 deterministic replay；非 Git workspace 默认只支持 evidence replay。
- 不在 V1 实现 overlayfs、Btrfs/ZFS/APFS snapshot、container snapshot 或远程 volume snapshot。
- 不把 `WorkspaceProvider` 当成隐式全能安全黑盒；它必须显式声明 workspace copy、进程隔离、容器隔离或 host-provided 隔离能力的边界与不可用原因。
- 不默认收集 ignored 文件、secret、node_modules、构建缓存或大文件。
- 不要求每个 tool-call 都生成 workspace snapshot；V1 先支持 agent-turn / verification 等关键节点。

## 风险

- 嵌套 Git 处理不完整会导致 replay 伪确定性；必须 fail closed，不能静默 degraded。
- 临时 index / internal refs 使用不当可能污染用户 index、branch 或 Git refs；实现必须使用隔离 index 和 `refs/myteam/*`。
- ignored 文件默认排除可能导致某些 replay 缺依赖；必须在 ReplayCase 中记录 excluded / unavailable 原因，并支持显式 allowlist。
- 大仓库频繁 snapshot 可能带来扫描成本；V1 应只在关键节点 snapshot，并复用相同 tree hash。
- replay/fork worktree 清理不当可能删除用户修改；cleanup 必须检查 dirty 和未合并 commit，默认 fail closed。
