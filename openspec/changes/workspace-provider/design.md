# Design: workspace-provider

## 背景

MyTeam 的 replay/fork 目标不是“重放一段日志”，而是从任意关键节点恢复出可执行 workspace，并继续复现、分叉或验证修复。这个能力不只是 snapshot，而是围绕 workspace 的检查、捕获、可执行副本准备、fork、清理和可用性解释。它是持久化体系的底层支撑，应独立成模块：

```text
ReplayNode / ForkPoint
  -> WorkspaceSnapshotRef
  -> WorkspaceProvider.prepareCopy()
  -> prepared workspace path
  -> replay / fork / repair run
```

V1 选择 Git 作为实现基础，因为大多数代码 workspace 是 Git 仓库，Git object database 天然具备内容寻址和去重能力，`git worktree` 可以按需创建隔离工作目录。未来可以增加 host-provided workspace、reflink copy、overlayfs、volume snapshot 等 provider，但不改变上层 replay/fork contract。

## 设计目标

- 任意 replayable 节点都可以引用 `workspaceBeforeRef` 和 / 或 `workspaceAfterRef`。
- Git workspace 的 dirty、staged、unstaged、untracked non-ignored 文件状态可以被捕获。
- 嵌套 Git repo、submodule、Git worktree 的 dirty 和 untracked 状态必须被捕获，不能只记录 gitlink。
- replay/fork 时懒创建 workspace copy，用完默认清理；fork 可保留。
- snapshot metadata 可持久化、可审计、可脱敏、可解释 unavailable 原因。
- workspace copy 是 replay / fork 的执行边界；它的安全隔离等级必须由 `WorkspaceProvider` 或 host 显式声明，不能被隐式假设。

## 总体结构

```text
TeamWorkflowLoop
  -> before/after replayable node
  -> WorkspaceProvider.capture()
  -> WorkspaceSnapshotRef
  -> TaskRecord / ReplayCase / ReplayNode

Replay / Fork
  -> load WorkspaceSnapshotRef
  -> WorkspaceProvider.prepareCopy() / forkCopy()
  -> run in prepared workspace path
  -> cleanup or keep
```

建议目录：

```text
packages/engine/src/
  workspace-provider/
    provider.ts
    git-provider.ts
    git-discovery.ts
    git-snapshot.ts
    git-worktree.ts
    types.ts
```

持久化目录：

```text
.myteam/
  runs/{runId}/
    workspace/
      snapshots/{snapshotId}.json
      copies/{copyId}.json
    nodes/{nodeId}/
      node.json
      state-before.json
      state-after.json
```

Git objects 存在原仓库 object database；`.myteam/runs/.../workspace` 只保存 metadata，不复制完整文件内容。

## 核心接口

`WorkspaceProvider` 负责 workspace 运行时状态，而 `WorkspaceLoader` 负责读取 `SOUL.md`、`agents/`、`skills/`、`tools/` 等项目插件配置。二者不能混淆：前者提供可执行工作空间与状态副本，后者提供项目能力定义。

```ts
interface WorkspaceProvider {
  readonly kind: WorkspaceProviderKind;

  inspect(input: InspectWorkspaceInput): Promise<WorkspaceInspection>;
  capture(input: CaptureWorkspaceInput): Promise<WorkspaceSnapshotRef>;
  prepareCopy(input: PrepareWorkspaceCopyInput): Promise<PreparedWorkspaceCopy>;
  forkCopy(input: ForkWorkspaceCopyInput): Promise<PreparedWorkspaceCopy>;
  cleanup(input: CleanupWorkspaceCopyInput): Promise<CleanupWorkspaceCopyResult>;
}

type WorkspaceProviderKind =
  | 'git-v1'
  | 'host-provided'
  | 'reflink-copy'
  | 'overlay'
  | 'volume-snapshot'
  | 'archive';
```

V1 只实现 `git-v1`，其他 kind 是未来扩展点。

## Git V1：snapshot commit + worktree

### 捕获 root repo

Git V1 使用临时 index 生成内部 snapshot commit，不能污染用户 index 或 branch：

```bash
GIT_INDEX_FILE=<tmp-index> git read-tree HEAD
# add tracked/staged/unstaged/untracked non-ignored files, excluding .myteam and configured redaction paths
GIT_INDEX_FILE=<tmp-index> git add -A -- ':!/.myteam' ':!/.git' <additional-redaction-pathspecs>
GIT_INDEX_FILE=<tmp-index> git write-tree
printf '%s\n' 'myteam snapshot ...' | git commit-tree <tree> -p HEAD
git update-ref refs/myteam/runs/<runId>/nodes/<nodeId>/<point>/<repoId> <commit>
```

要求：

- MUST 使用临时 index。
- MUST NOT 执行普通 `git add` / `git commit` 污染用户状态。
- snapshot ref MUST 写入 `refs/myteam/...`，避免被 GC 回收。
- 默认只纳入 tracked、staged、unstaged、untracked non-ignored 文件。
- `.myteam/`、`.git/`、provider prepared copy 目录、replay/fork 临时目录和 redaction path MUST 默认排除，即使它们是 non-ignored。
- ignored 文件默认排除；只有显式 allowlist 才可纳入。

### 发现嵌套 Git

Git V1 capture MUST 发现 workspace root 下的 Git 仓库集合：

```text
root repo
nested normal repo
submodule
nested worktree
```

检测时不能只看 `.git` 是否为目录；`.git` 可能是文件：

```text
gitdir: ../../.git/worktrees/foo
gitdir: ../.git/modules/submodule
```

每个 repo MUST 记录：

```ts
interface GitRepoSnapshotMeta {
  repoId: string;
  relativePath: string;       // root repo 使用 '.'
  kind: 'root' | 'nested-repo' | 'submodule' | 'worktree';
  worktreeRoot: string;
  gitDir: string;
  gitCommonDir: string;
  headCommit: string | null;
  snapshotRef: string;
  treeHash: string;
  status: 'clean' | 'dirty' | 'unborn' | 'unavailable';
  includedIgnored: string[];
  excludedIgnored: string[];
  redactionReportRef?: string;
  unavailableReason?: string;
}
```

### 嵌套 Git 必须解决

父 repo snapshot 只会记录嵌套 repo 的 gitlink / commit，不能捕获嵌套 repo 的 dirty、unstaged、untracked 文件。因此 Git V1 MUST 对每个 nested repo 单独执行 snapshot commit，并把这些 repo snapshot 记录到同一个 `WorkspaceSnapshotRef`。

```ts
interface GitWorkspaceSnapshotRef {
  kind: 'git-v1';
  snapshotId: string;
  rootRepoId: string;
  repos: GitRepoSnapshotMeta[];
  completeness: 'complete' | 'unavailable';
  unavailableReasons: WorkspaceUnavailableReason[];
}
```

规则：

- 如果 nested repo dirty，MUST snapshot 其 dirty 和 untracked non-ignored 状态。
- 如果 nested repo 无法 snapshot，deterministic replay / fork MUST 标记 unavailable 或 fail closed。
- MyTeam MUST NOT 仅记录 nested repo 的 `HEAD` 然后声称 deterministic replay 可用。
- 如果用户配置排除某个 nested repo，ReplayCase MUST 记录排除原因；任何依赖该 repo 的节点 deterministic replay MUST unavailable。

### Restore / prepare copy

`prepareCopy(snapshotRef)` 按以下流程创建工作空间副本：

```text
1. git worktree add <copyPath> <root.snapshotRef>
2. 对每个 nested repo：
   2.1 确保 <copyPath>/<relativePath> 可作为 nested worktree 目标
   2.2 使用原 nested repo 的 git common dir / object database 创建 nested worktree
   2.3 checkout nested snapshotRef
3. 校验每个 repo 的 treeHash / status
4. 返回 PreparedWorkspaceCopy
```

`forkCopy` 与 `prepareCopy` 类似，但 copy 默认可保留，并可创建 fork branch / label。

### Cleanup

cleanup 必须 fail closed：

- 如果 copy dirty，默认不删除。
- 如果 copy 中有未合并 / 未记录 commit，默认不删除。
- 只有显式 force 才可强删。
- cleanup 结果必须记录到事件和 copy metadata。

## ReplayNode 关系

每个 replayable node 至少可以引用：

```ts
interface ReplayNodeWorkspaceRefs {
  workspaceBeforeRef?: string;
  workspaceAfterRef?: string;
  workspaceProviderKind: WorkspaceProviderKind;
}
```

V1 建议 snapshot 粒度：

| 节点 | workspace snapshot |
|---|---|
| run start | MUST |
| agent-turn before | MUST |
| agent-turn after | MUST |
| verification before | MUST |
| PM turn | MAY，仅 state 必须 |
| read-only tool-call | MAY |
| mutating tool-call | SHOULD，V1 可后置 |

## 非 Git workspace

V1 对非 Git workspace 的规则：

- evidence replay MAY work。
- deterministic replay / fork SHALL unavailable，除非宿主注入 `host-provided` provider。
- unavailable 结果必须包含原因和建议，例如“初始化 Git repo”或“配置 host workspace provider”。

## ignored、secret 与大文件

- ignored 文件默认不捕获。
- `.env`、凭证、secret-bearing 文件 MUST 默认排除或脱敏。
- `includeIgnored` 只能是 allowlist，不能是全局 true 默认值。
- snapshot metadata MUST 包含 redaction report。
- 如果 replay 依赖被排除文件，deterministic replay MUST unavailable，不能伪装成功。

## 成本策略

- 多存 snapshot ref，少创建 worktree。
- snapshot ref 使用 Git object database 去重。
- worktree 只在 replay/fork 时懒创建。
- replay copy 默认临时清理；fork copy 可保留。
- 相同 treeHash 可复用上一个 snapshot ref。

## 取舍

选择 Git V1 的收益：

- 实现简单，用户认知清晰。
- 与 Claude Code 的 worktree 隔离经验一致。
- Git object database 天然内容寻址和去重。
- 通过递归 nested repo snapshot 解决常见多 Git workspace 问题。

代价：

- V1 对非 Git workspace 的 deterministic replay 不支持。
- ignored 文件默认排除，需要显式配置。
- nested repo restore 需要谨慎管理 worktree path 和 cleanup。
- Git V1 worktree 提供文件系统副本边界，但不自动提供进程、网络或权限隔离；更强隔离需由 `WorkspaceProvider` 的其他实现或 host capability 显式提供并记录。
