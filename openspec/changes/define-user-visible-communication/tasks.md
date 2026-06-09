# Tasks: define-user-visible-communication

> 复选框语法必须是标准 markdown，便于后续 OpenSpec / 人工跟踪进度。

---

## Phase 1 — 规约与边界

- [x] 1.1 定义 `user-visible-communication` change。
- [x] 1.2 明确 `TaskEvent` 是事实日志，`UserVisibleMessage` 是用户沟通产物。
- [x] 1.3 明确 PM 生命周期沟通点：ack、progress、blocked、clarification、completion、failure、replay-status、repair-suggestion。
- [x] 1.4 明确用户消息必须安全、脱敏、可追踪到 event / evidence / replay refs。

## Phase 2 — 公共类型与契约

- [ ] 2.1 在 contracts 中定义 `UserVisibleMessage`、`UserVisibleBlocker`、`UserVisibleNextAction`、`UserVisibleRefs`。
- [ ] 2.2 定义 `user.message.created` 或等价事件，用于 stream / CLI / host 消费。
- [ ] 2.3 扩展 `SessionTranscript`：保存安全的用户可见消息和 task/run 引用。
- [ ] 2.4 明确 `TaskResult` 如何引用最终用户消息或 final communication summary。
- [ ] 2.5 验证命令：`npm run typecheck`。

## Phase 3 — PM 沟通策略

- [ ] 3.1 实现接收确认策略：任务接受后生成 `ack`。
- [ ] 3.2 实现进度聚合策略：多个底层事件合并为少量 `progress`。
- [ ] 3.3 实现阻塞说明策略：resource wait、capability missing、workspace unavailable 生成 `blocked`。
- [ ] 3.4 实现澄清策略：只有缺少必要信息时生成 `clarification`，可合理假设时默认推进。
- [ ] 3.5 实现完成和失败收口策略：`completion` / `failure` 必须引用 evidence / error / replay。

## Phase 4 — Replay / Repair 沟通

- [ ] 4.1 deterministic replay unavailable 时生成用户可理解的 `replay-status`。
- [ ] 4.2 repair replay 完成后生成 `repair-suggestion` 或修复验证说明。
- [ ] 4.3 workspace snapshot 缺失、ignored 文件缺失、isolation unavailable 必须转成可操作建议。

## Phase 5 — CLI / Host 一致性

- [ ] 5.1 默认 CLI 在 stderr 渲染用户可见消息，JSON event stream 模式输出结构化消息事件。
- [ ] 5.2 library stream 暴露同一套用户可见消息事件。
- [ ] 5.3 host server 不得绕过 TeamEngine 生成矛盾事实状态。
- [ ] 5.4 契约测试：同一 fixture 通过 CLI / library 产生兼容的用户消息序列。

## Phase 6 — 安全与验收

- [ ] 6.1 测试用户消息不包含 secret、隐藏 prompt、private reasoning。
- [ ] 6.2 测试失败消息包含已完成内容、失败点、可重试性、下一步建议和 evidence / replay refs。
- [ ] 6.3 测试长任务进度不会按每个 tool call 刷屏。
- [ ] 6.4 `npm run typecheck`。
- [ ] 6.5 `npm test`。
