# Tasks: library-first-team-engine

> 复选框语法必须是标准 markdown，便于后续 OpenSpec / 人工跟踪进度。

---

## Phase 1 — 文档与命名收敛

- [x] 1.1 更新 `README.md`：引入 `TeamEngine` 作为 MyTeam 的 library-first 团队执行引擎
- [x] 1.2 更新 `docs/technical-architecture.md`：说明 Library API / Default CLI / Replay CLI / Team Workflow 分层
- [x] 1.3 明确 `TeamEngine` 不等同于通用任务队列、平台控制面、HTTP server 或 CLI 命令实现
- [x] 1.4 明确 MyTeam 不提供 `myteam serve` 作为一等入口，宿主服务器通过 library API 集成
- [x] 1.5 明确 CLI 默认命令就是一次性任务执行，不需要 `myteam run`
- [x] 1.6 明确 README 不放工程目录结构，monorepo 目录结构沉淀到 `docs/technical-architecture.md`

## Phase 2 — TeamEngine 公共类型与导出

- [ ] 2.1 定义 `TeamEngine` 接口：`openSession`、`resumeSession`、`forkSession`、`start`、`stream`、`check`、`outcome`、`cancel`
- [ ] 2.2 定义 `createTeamEngine(options)`，并从 `packages/engine` 导出，通过 root package public API 暴露
- [ ] 2.2a 设计 root package 的 `exports` / `types` / `bin` 与 build 输出路径，确保 `import { createTeamEngine } from 'myteam'` 和 `myteam` CLI 示例可落地
- [ ] 2.2b 明确 `packages/cli` 只能依赖 `packages/engine` public API，禁止导入 `engine/src/` 私有路径
- [ ] 2.3 定义 `ConversationSession`、`SessionSnapshot`、`SessionCursor`、`SessionContextEntry`、`StartRunOptions`
- [ ] 2.4 定义 `ActiveRun`、`RunStatus`、`RunStatusSnapshot`、`EventCursor`、`OutcomeOptions`、`CancelReason`
- [ ] 2.5 明确 `sessionId` / `turnId` / `taskId` / `runId` 的关系，并更新 `TaskEvent` / `TaskRecord` / `ReplayCase` / `SessionTranscript` 引用字段
- [ ] 2.6 定义 request normalizer，供 library API、默认 CLI 和 replay 复用
- [ ] 2.6a 定义 public workspace lifecycle API：`initWorkspace`、`checkWorkspace`、`repairWorkspace`，与 CLI init/check/repair 共用 validation 语义
- [ ] 2.7 验证命令：`npm run typecheck`

## Phase 3 — 最小 TeamEngine 实现

- [ ] 3.1 实现本地 `TeamEngine`，真实验收路径必须使用可持久化 session store、run store、event log、TaskRecord、Evidence、ReplayCase；内存 store 仅用于单测或 prototype
- [ ] 3.2 实现 `openSession` / `resumeSession` / `forkSession`：维护 append-only `SessionTranscript`
- [ ] 3.3 实现 `start`：接收 `TaskRequest` 与可选 `StartRunOptions`，创建 `runId`，启动 Team Workflow，并关联 `sessionId` / `turnId`
- [ ] 3.4 实现 `stream`：按 `runId` 与 `EventCursor` 返回有序 `TaskEvent`
- [ ] 3.5 实现 `check`：返回当前运行状态、最后事件序号和阻塞原因
- [ ] 3.6 实现 `outcome`：支持等待最终 `TaskResult` 与超时
- [ ] 3.7 实现 `cancel`：向 PM / Agent / Tool 执行链路传播取消信号
- [ ] 3.8 验证：单测覆盖 session resume/fork、状态转换、事件顺序、outcome 等待、取消传播

## Phase 4 — 默认 CLI 接入

- [ ] 4.1 实现 CLI 根命令：`myteam "..." --workspace ... --json`，普通 run 模式缺 workspace 结构时返回结构化错误和 init/repair 建议
- [ ] 4.2 实现显式 task 参数：`myteam --task "..." --workspace ... --json`
- [ ] 4.3 实现 stdin 输入：`cat task.md | myteam --workspace ... --json`
- [ ] 4.4 实现会话恢复输入：`myteam --continue "..."` 与 `myteam --resume <sessionId-or-name> "..."`
- [ ] 4.5 stdout / stderr 分离：stdout 输出结果 JSON，stderr 输出日志或人类进度
- [ ] 4.6 默认 CLI 不得包含 CLI 专用业务 fallback、默认工具或默认人格
- [ ] 4.7 不实现 `myteam run` 作为必需命令；默认命令即一次性执行
- [ ] 4.7a 实现 workspace lifecycle CLI：`myteam init`、`myteam check`，并预留或实现 `myteam repair`
- [ ] 4.8 验证：运行 `myteam "读取 README 并总结项目定位" --workspace /data/workspace/myteam --json`
- [ ] 4.9 验证：运行 `myteam --continue "继续刚才的总结" --workspace /data/workspace/myteam --json`

## Phase 5 — Replay CLI 接入

- [ ] 5.1 实现 `myteam replay --run-id <runId> --workspace ... --json`
- [ ] 5.2 实现 `myteam replay --case <ReplayCase path> --json`
- [ ] 5.3 replay 基于 ReplayCase / TaskRecord 重建输入并调用 TeamEngine，或执行明确标记的 evidence replay
- [ ] 5.4 replay 不得依赖 CLI 私有日志、终端输出或不可追踪状态
- [ ] 5.5 验证：一次默认 CLI 执行生成的 replay case 可被 `myteam replay` 使用或解释差异

## Phase 6 — Library / CLI / Replay 一致性验证

- [ ] 6.1 建立 fixture task：同一 `TaskRequest` 分别走 library API 与默认 CLI
- [ ] 6.2 比较关键 `TaskEvent` 类型序列、最终 `TaskResult.status`、错误 code、evidence 引用
- [ ] 6.3 确保 library API 与默认 CLI 都生成 `TaskRecord` 和 `ReplayCase`
- [ ] 6.4 验证会话 transcript 只保存用户可见上下文、安全摘要和 task/run 引用，不复制详细 run 事实日志
- [ ] 6.5 验证 library 路径导出的 replay case 可被 `myteam replay` 使用或解释差异
- [ ] 6.6 验证 secret、隐藏 prompt 和模型私密 reasoning 不进入 session transcript、event、evidence、replay
- [ ] 6.7 验证不存在通过反复启动 `myteam` CLI 实现消息流、agent turn 或 tool call 的路径

## Phase 7 — 最终验收

- [ ] 7.1 `npm run typecheck`
- [ ] 7.2 `npm test`
- [ ] 7.3 手动运行默认 CLI 路径并保存 TaskResult / TaskRecord / ReplayCase / WorkspaceSnapshotRef 证据
- [ ] 7.4 手动运行 replay 路径并保存 replay 结果或差异说明
- [ ] 7.5 检查不存在 `myteam serve`、必需 `myteam run`、或 turn / tool-call / 消息流粒度反复启动 `myteam` 自身的实现
