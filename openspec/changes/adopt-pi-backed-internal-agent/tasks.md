# Tasks: adopt-pi-backed-internal-agent

> 复选框语法必须是标准 markdown，便于后续 OpenSpec / 人工跟踪进度。

---

## Phase 1 — 架构文档与运行时边界

- [ ] 1.1 更新 `README.md`：说明 PI 是 `InternalAgent` 的 AgentLoop 内核，MyTeam Core 负责 Team/Task/Evidence/Replay
- [ ] 1.2 更新 `docs/technical-architecture.md`：拆分 `PI AgentLoop` 与 `MyTeam TeamWorkflowLoop`
- [ ] 1.3 明确 `InternalAgent`、`CLIAgent`、`PM`、`ToolAdapter` 的职责边界
- [ ] 1.4 明确 PI 类型不得上冒为 MyTeam 公共 `TaskResult` / `TaskEvent` / `Evidence` / `ReplayCase`

## Phase 2 — PI-backed InternalAgentRuntime

- [x] 2.1 将 MyTeam Node engine 策略定为 `>=22.19.0`，并明确低版本 Node 隔离方案不作为默认路线
- [ ] 2.2 引入并固定 PI 相关依赖版本：`@earendil-works/pi-agent-core`、`@earendil-works/pi-ai`
- [ ] 2.3 定义 `InternalAgentRuntime` 接口，提供 `runTurn(input)`
- [ ] 2.4 实现 MyTeam prompt assets 注入：`systemPrompt`、`SOUL.md`、`AGENT.md`、capability block
- [ ] 2.5 实现 MyTeam message view 到 PI Agent context 的转换
- [ ] 2.6 实现 PI final message / usage / tool results 到 MyTeam `AgentTurnResult` 的转换
- [ ] 2.7 验证命令：`npm run typecheck`

## Phase 3 — Tool / Capability Adapter

- [ ] 3.1 定义 MyTeam `ToolRegistry` / `CapabilityAdapter` 最小接口
- [ ] 3.2 实现内置 `read_file` 工具，返回可沉淀为 Evidence 的结构化结果
- [ ] 3.3 实现内置 `shell` 工具，限制 workspace 边界、timeout、输出大小与审计信息
- [ ] 3.4 将 MyTeam tool 适配为 PI tool，并确保 PI tool call 实际回到 MyTeam adapter 执行
- [ ] 3.5 工具执行失败时返回结构化错误，不静默吞掉异常
- [ ] 3.6 验证命令：新增工具单测并运行 `npm test` 或等价测试命令

## Phase 4 — TaskEvent / Evidence / Replay 映射

- [ ] 4.1 定义 MyTeam `TaskEvent` 基础类型：task、agent、tool、artifact、error 生命周期
- [ ] 4.2 实现 PI `AgentEvent` 到 MyTeam `TaskEvent` 的映射
- [ ] 4.3 定义 `Evidence` 类型并将工具调用、文件变更、命令结果映射为 evidence
- [ ] 4.4 定义 `TaskRecord` 与 `ReplayCase` 最小字段
- [ ] 4.5 确保 secret 不进入 event、evidence、replay case
- [ ] 4.6 验证：运行一个 InternalAgent 工具调用 turn，检查事件顺序与 evidence 引用

## Phase 5 — CLIAgent 保留与统一调度

- [ ] 5.1 定义 `Agent` 基类或接口，统一 `InternalAgent` 与 `CLIAgent` 的 `runTurn()` 契约
- [ ] 5.2 实现 `CLIAgent` 基础适配：spawn、timeout、stdout/stderr、stdin 大 prompt、progress、heartbeat
- [ ] 5.3 实现至少一个示例 CLI Agent adapter 或 mock CLI adapter，用于验证 PM 委派
- [ ] 5.4 确认 `CLIAgent` 作为 Professional Agent 成员参与 PM 工作流，不作为 PI 普通 tool 内嵌
- [ ] 5.5 验证：PM 能委派给 InternalAgent 与 CLIAgent，并获得统一结果

## Phase 6 — PM Workflow / Driver

- [ ] 6.1 定义 `ProjectState`、`ProjectAction`、`ProjectTurnDirective`、`ProjectDriver` 最小类型
- [ ] 6.2 实现 freeform PM driver：plan、delegate、implementation、verification、finalize、fail
- [ ] 6.3 为 PM InternalAgent 注册结构化 workflow tools：`delegate_to`、`record_plan`、`record_verification`、`finalize_task`、`fail_task`
- [ ] 6.4 实现 TeamWorkflowLoop：`getTurnDirective -> speaker.runTurn -> extract action -> applyTurn -> persist`
- [ ] 6.5 PM 成员执行失败时必须显式感知，并选择重试、换人或失败收口
- [ ] 6.6 验证：一个任务完成 PM plan/delegate/verify/finalize 全流程

## Phase 7 — library / 默认 CLI / replay 闭环

- [ ] 7.1 实现或调整 `myteam "..." --workspace ... --json`，走同一 Task Core / TeamEngine
- [ ] 7.2 实现 `TaskResult` 输出：status、summary、artifacts、evidence、errors、replayRef
- [ ] 7.3 确保宿主服务器可通过 library API 复用相同 TeamEngine，不复制业务实现
- [ ] 7.4 实现 replay case 导出，记录 PI 版本、workspace 摘要、prompt assets 摘要、events、evidence
- [ ] 7.5 验证：同一任务可导出 replay case，并可用 replay 命令或测试解释复现

## Phase 8 — 最终验证

- [ ] 8.1 `npm run typecheck`
- [ ] 8.2 `npm test`
- [ ] 8.3 手动运行：`myteam "读取 README 并总结项目定位" --workspace /data/workspace/myteam --json`
- [ ] 8.4 检查输出中包含 `TaskResult`、`TaskEvent`、`Evidence`、`ReplayCase` 引用
- [ ] 8.5 检查失败路径：工具权限不足、CLI Agent 不存在、PM 委派失败时均有结构化错误和下一步建议
