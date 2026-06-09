# Change Proposal: align-workspace-storage-genethub

## 为什么

MyTeam 当前处于架构设计阶段，workspace 存储结构尚未落地。GenetHub 的 `assistant-core` 已经沉淀了一套成熟的 workspace 持久化方案，包括 session 文件存储、原子写入、目录约定、消息模型和 project state 管理。这套方案直接对齐 MyTeam 的需求：

- MyTeam 的核心产品叙事是"用户 → Secretary / PM → PM-driven Workgroup"的协作模型
- MyTeam 同样需要区分 `user-chat`（用户-PM 对话）和 `agents-chat`（PM 工作群任务）
- MyTeam 同样需要耐久会话、任务编排状态、消息归档和过程可追踪
- MyTeam 是独立项目，但不需要为相同问题重新发明轮子

本变更将 MyTeam workspace 存储层对齐 GenetHub `assistant-core` 的成熟设计，确保 session 持久化、目录结构、消息 schema 和写入语义一致，避免从零自研带来的设计和兼容成本。

## 变更内容

- 新增 `workspace-storage` 能力规约，定义 MyTeam workspace 的持久化目录结构和 session 存储语义。
- 对齐 GenetHub 的 session 文件存储语义，但运行时数据统一放在 `{workspace}/.myteam/sessions/{sessionId}.json`，避免污染用户项目根目录。
- 对齐 Session / SessionMessage / Participant / ProjectState 等核心类型 schema。
- 对齐原子写入语义（tmp + rename）。
- 对齐 session 归档分离机制。
- 对齐 workspace 下用户可编辑的 `skills/`、`agents/` 结构；会话、运行记录和 memory 等运行时数据统一进入 `.myteam/`。
- 对齐 `user-chat` 与 `agents-chat` 两种会话类型的区分和字段差异。

## 能力范围

### 新增能力

- `workspace-storage`
  - Workspace 根目录约定和必选/可选子目录。
  - `sessions/{sessionId}.json` 单文件 session 持久化。
  - `ChatSession`、`SessionMessage`、`Participant`、`ProjectState` 等核心类型。
  - `user-chat` 与 `agents-chat` 的字段区分：`ownerSessionId`、`goal`、`metadata.projectState`。
  - 原子写入语义与并发安全约束。
  - `.myteam/sessions/archives/` 消息归档分离。
  - `SessionStore` / `SessionManager` 的抽象边界。
  - `skills/`、`agents/` 与 `.myteam/memory/` 目录的结构化约定。

### 修改能力

- `workspace-layer`：后续实现时应引用 `workspace-storage` 的目录结构和持久化语义。
- `task-lifecycle`：TaskRecord / EventLog 等复盘证据的存储位置应与 session 存储协调。
- `team-orchestration`：agents-chat 的 `ProjectState` 应与 session 的 `metadata.projectState` 对齐。

## 影响范围

- `packages/engine/src/contracts/*`：阶段 1 导出 `ChatSession`、`SessionMessage`、`Participant`、`ProjectState` 等公共类型。
- `packages/engine/src/workspace/*`：实现 `SessionStore`、`SessionManager`、`SessionArchive`，对齐 GenetHub 存储模式。
- `packages/engine/*`：通过 `SessionStore` 管理 session 生命周期，不再自建 session 持久化。
- `packages/engine/src/workflow/*`：agents-chat 的 `ProjectState` 映射到 session `metadata.projectState`。
- `docs/technical-architecture.md`：更新 workspace 插件层的目录结构，补充持久化语义说明。

## 非目标

- 不引入 GenetHub 的 project launcher、review 系统或具体业务编排逻辑。
- 不引入 GenetHub 的 tool registry、agent profile、roster 等业务层概念。
- 不要求 MyTeam 在运行期兼容 GenetHub 的服务端持久化后端。
- 不引入数据库存储适配层；当前阶段仅文件系统存储。
- 不引入 session 加密、压缩或增量同步机制。
- 不引入跨 workspace 的 session 迁移或导入/导出协议。

## 风险

- session 文件全部写入单个 JSON 文件，消息量大时可能导致读写负担；需要在 spec 中预留 archive 分离和未来的分页/增量策略。
- 原子写入依赖文件系统 rename 原子性；在非 POSIX 文件系统上可能不可靠，需在 spec 中声明前提。
- `agents-chat` 的 `metadata.projectState` 与 workflow 的执行状态必须单源管理，避免两份状态不一致。
- session 文件包含完整消息历史；spec 必须约束不在 session 文件中存储 secret、private reasoning 或敏感上下文。
