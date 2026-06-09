# Tasks: align-workspace-storage-genethub

> 属于 change `align-workspace-storage-genethub`。按阶段分组，每阶段可独立验证。本 change 只按阶段 1 两包起步策略落到 `packages/engine/src/*` 内部目录，不新增 `packages/contracts` 或 `packages/workspace` 物理包。

---

## 阶段 1：类型契约定义

> 验证方式：类型文件编译通过，`packages/engine/src/contracts` 导出所有 session 相关类型。

- [ ] 1.1 在 `packages/engine/src/contracts/session.ts` 定义 `ChatSession`、`SessionMessage`、`Participant`、`SessionMetadata`、`Outcome`，并包含 `revision` 并发控制字段。
- [ ] 1.2 定义 `CreateSessionInput`、`AppendMessagesInput`、`CreateMessageInput`、`SessionQuery` 等输入类型。
- [ ] 1.3 定义 `SessionArchive` 和 `ArchiveOptions` 类型。
- [ ] 1.4 从 `packages/engine/src/contracts/index.ts` 导出所有 session 相关类型，并由 `packages/engine/src/index.ts` 只暴露 public API。
- [ ] 1.5 明确 session storage schema 使用毫秒时间戳，公共 `TaskEvent` / `TaskRecord` / `Evidence` / `ReplayCase` 使用 ISO 8601 字符串时间戳。
- [ ] 1.6 明确 MyTeam 公共 ID 前缀规则：`session_`、`message_`、`archive_`、`turn_`、`task_`、`run_`、`ws_`、`evidence_`、`artifact_`。

```bash
# 验证命令
npm run typecheck
```

---

## 阶段 2：SessionStore 文件系统实现

> 验证方式：集成测试，创建 session → 读取 session → 追加消息 → 归档，验证 `.myteam/` 下 JSON 文件内容。

- [ ] 2.1 在 `packages/engine/src/workspace/` 实现 `writeJsonAtomic()` 原子写入工具函数。
- [ ] 2.2 实现 per-session write lock 与 revision conflict 检测，明确 atomic rename 不负责逻辑合并。
- [ ] 2.3 实现 `SessionStore` 类：`createSession`、`loadSession`、`saveSession(expectedRevision)`、`deleteSession`。
- [ ] 2.4 实现 `appendMessages()` 和 `listSessions()`，确保 append 基于最新 revision。
- [ ] 2.5 实现 `archiveMessages()` 和 `loadArchive()`。
- [ ] 2.6 编写集成测试：
  - [ ] 创建 session，验证 `.myteam/sessions/{sessionId}.json` 文件存在且内容正确。
  - [ ] 追加消息，验证消息正确追加且 `updatedAt` / `revision` 更新。
  - [ ] 并发 `appendMessages()` 同一 session，验证两边消息都存在且 revision 单调递增。
  - [ ] 基于过期 revision 的 `saveSession()` 返回 conflict error，不覆盖新消息。
  - [ ] 归档消息，验证 `.myteam/sessions/archives/{archiveId}.json` 生成且主 session 消息已移除。
  - [ ] 列出 sessions，验证过滤和排序。

```bash
# 验证命令
npm run typecheck
npm test
```

---

## 阶段 3：SessionManager 观察者包装

> 验证方式：测试事件通知、脏写合并、session actor 串行化。

- [ ] 3.1 在 `packages/engine/src/workspace/` 实现 `SessionManager`：包装 SessionStore，增加内存缓存。
- [ ] 3.2 实现事件通知机制：`session-created`、`session-updated`、`messages-appended`。
- [ ] 3.3 实现 `SessionActor` 串行化队列，保证 TeamEngine 同一 session 的写操作必须排队。
- [ ] 3.4 编写集成测试：
  - [ ] 创建 session 后触发 `session-created` 事件。
  - [ ] 同一 session 并发写入按序执行。
  - [ ] 多次写入后 flush 只产生一次磁盘写入。

```bash
# 验证命令
npm run typecheck
npm test
```

---

## 阶段 4：Workspace 目录初始化

> 验证方式：初始化测试，验证用户可编辑资产目录与 `.myteam/` 运行时目录按约定创建。

- [ ] 4.1 实现 `initWorkspace(path)`：显式初始化时创建 `skills/`、`agents/`、`.myteam/sessions/`、`.myteam/sessions/archives/`、`.myteam/memory/`、`.myteam/runs/` 目录。
- [ ] 4.2 实现 `validateWorkspace(path, mode)`：区分 `init`、`run`、`repair/check`，普通 `run` 缺关键目录时 fail-fast 并给出修复建议。
- [ ] 4.3 集成到 SessionStore / TeamEngine 构造逻辑：普通任务执行不得静默修复已损坏 runtime 目录。
- [ ] 4.4 编写测试：
  - [ ] 新 workspace 显式初始化后所有必要目录存在。
  - [ ] 普通 run 遇到缺失 session 目录时返回结构化 workspace_error，不静默创建。
  - [ ] repair/check 模式能给出明确修复建议。

```bash
# 验证命令
npm run typecheck
npm test
```

---

## 阶段 5：Engine 集成

> 验证方式：通过 library API 创建 session 并持久化，验证往返一致。

- [ ] 5.1 在 TeamEngine 构造时初始化 SessionStore（绑定 workspace）。
- [ ] 5.2 `openSession()` 实现委托给 SessionStore。
- [ ] 5.3 `resumeSession()` 实现委托给 SessionStore。
- [ ] 5.4 确保 `start()` 将 `sessionId` / `runId` 引用持久化到 session，同时完整 run facts 写入 `.myteam/runs/{runId}/`。
- [ ] 5.5 编写契约测试：
  - [ ] `createTeamEngine` → `openSession` → `.myteam/sessions/{sessionId}.json` 存在。
  - [ ] 重启后 `resumeSession` 恢复完整 session 数据。
  - [ ] 错误 sessionId 返回 null。

```bash
# 验证命令
npm run typecheck
npm test
```

---

## 阶段 6：消息归档与清理

> 验证方式：长对话压力测试，验证归档后性能改善。

- [ ] 6.1 定义归档触发阈值（例如 message count > 200）。
- [ ] 6.2 实现自动归档逻辑（可选，可先 manual trigger）。
- [ ] 6.3 编写测试：
  - [ ] 超过阈值的 session 归档后主文件体积缩小。
  - [ ] archive 文件可通过 `loadArchive` 完整恢复。

```bash
# 验证命令
npm run typecheck
npm test
```

---

## 阶段 7：文档更新

> 验证方式：文档评审。

- [ ] 7.1 更新 `docs/technical-architecture.md`：补充 workspace 目录结构中 `.myteam/sessions/`、`.myteam/runs/` 的说明。
- [ ] 7.2 更新 README（如需要）：说明运行时数据进入 `.myteam/`，用户可编辑资产留在 workspace 根目录。
- [ ] 7.3 不创建 `packages/workspace/README.md`；阶段 1 的 SessionStore / SessionManager 使用示例放在 `packages/engine` 文档或架构文档中，等出现提包信号后再迁移。
