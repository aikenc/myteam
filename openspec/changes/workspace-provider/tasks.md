# Tasks: workspace-provider

> 复选框语法必须是标准 markdown，便于后续 OpenSpec / 人工跟踪进度。

---

## Phase 1 — 规约与文档

- [x] 1.1 创建 `workspace-provider` change。
- [x] 1.2 定义 workspace inspect / snapshot / copy / fork / cleanup 是 replay 与运营自愈的持久化关键支撑。
- [x] 1.3 明确命名为 `WorkspaceProvider`：它不只是 snapshot provider，而是运行时 workspace 状态与可执行副本抽象。
- [x] 1.4 明确 V1 使用 Git snapshot commit + Git worktree，未来可接入其他 provider。
- [x] 1.5 明确 nested Git dirty / untracked 状态必须被捕获或 fail closed。
- [ ] 1.6 更新 `docs/technical-architecture.md`，加入 Workspace Provider 模块和 Git V1 策略。

## Phase 2 — 公共类型与契约

- [ ] 2.1 定义 `WorkspaceProvider` 接口：`inspect`、`capture`、`prepareCopy`、`forkCopy`、`cleanup`，并明确它与 `WorkspaceLoader` 的边界。
- [ ] 2.2 定义 `WorkspaceSnapshotRef`、`GitWorkspaceSnapshotRef`、`GitRepoSnapshotMeta`、`PreparedWorkspaceCopy`。
- [ ] 2.3 定义 `WorkspaceUnavailableReason` 与 replay/fork unavailable 结果。
- [ ] 2.4 扩展 `ReplayCase`、`TaskRecord`、`ReplayNode`，引用 `workspaceBeforeRef` / `workspaceAfterRef`。
- [ ] 2.5 定义 `WorkspaceSnapshotOptions`：ignored allowlist、nested repo policy、copy retention、cleanup policy。
- [ ] 2.6 验证命令：`npm run typecheck`。

## Phase 3 — Git discovery

- [ ] 3.1 实现 root Git repo 检测：使用 `git rev-parse --show-toplevel`、`--git-dir`、`--git-common-dir`。
- [ ] 3.2 实现 nested Git repo 发现：支持 `.git` 目录、`.git` 文件、submodule、worktree。
- [ ] 3.3 排除 `.git`、`.myteam`、`node_modules`、大型缓存目录等扫描噪声。
- [ ] 3.4 对每个 repo 读取 HEAD、status、dirty、untracked non-ignored 摘要。
- [ ] 3.5 单测覆盖：root repo、submodule、普通 nested repo、nested worktree、unborn repo。

## Phase 4 — Git snapshot capture

- [ ] 4.1 使用临时 index 捕获 root repo snapshot commit，不污染用户 index / branch。
- [ ] 4.2 对每个 nested repo 单独捕获 snapshot commit。
- [ ] 4.3 snapshot ref 写入 `refs/myteam/runs/{runId}/nodes/{nodeId}/{point}/{repoId}`。
- [ ] 4.4 默认包含 tracked / staged / unstaged / untracked non-ignored 文件。
- [ ] 4.5 默认排除 ignored 文件和 secret-bearing 文件，生成 redaction report。
- [ ] 4.6 任一必需 nested repo 无法 snapshot 时，返回结构化 unavailable / fail closed。
- [ ] 4.7 单测验证 dirty nested repo 的修改和 untracked 文件可被 snapshot 捕获。

## Phase 5 — Worktree prepare / fork / cleanup

- [ ] 5.1 实现 root snapshot 的 lazy `git worktree add`。
- [ ] 5.2 在 root worktree 内恢复每个 nested repo snapshot。
- [ ] 5.3 实现 `prepareCopy`：临时 replay workspace，用完默认清理。
- [ ] 5.4 实现 `forkCopy`：可保留 workspace，并记录 `ForkRecord`。
- [ ] 5.5 cleanup 前检查 dirty 与未记录 commit，默认 fail closed。
- [ ] 5.6 单测覆盖 replay copy、fork copy、dirty cleanup 拒绝、force cleanup。

## Phase 6 — Workflow / Replay 集成

- [ ] 6.1 run start 保存 workspace snapshot。
- [ ] 6.2 agent-turn before / after 保存 workspace snapshot。
- [ ] 6.3 verification before 保存 workspace snapshot。
- [ ] 6.4 deterministic replay 使用 `prepareCopy` 创建 workspace 后执行。
- [ ] 6.5 fork 使用 `forkCopy` 创建 workspace 并生成新 runId。
- [ ] 6.6 repair replay 使用历史 snapshot 和更新后的 agent / skill / tool / workflow 验证修复。
- [ ] 6.7 ReplayCase 中记录 workspace snapshot completeness、provider kind、unavailable reason。

## Phase 7 — 验证

- [ ] 7.1 `npm run typecheck`。
- [ ] 7.2 `npm test`。
- [ ] 7.3 手动验证：root repo dirty 文件可 replay。
- [ ] 7.4 手动验证：nested repo dirty 文件和 untracked 文件可 replay。
- [ ] 7.5 手动验证：submodule dirty 状态可 snapshot 或 fail closed。
- [ ] 7.6 手动验证：fork workspace 保留后用户可进入查看和继续工作。
- [ ] 7.7 验证 ignored / secret 文件默认不进入 snapshot，且 unavailable 原因可解释。
