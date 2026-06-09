# Change Proposal: define-user-visible-communication

## 为什么

MyTeam 的核心产品承诺是“事事有回音、件件有着落、用户能看懂”。现有设计已经定义了 `TaskEvent`、`Evidence`、`TaskRecord`、`ReplayCase` 等事实记录，但这些记录主要服务调试、复盘和 replay，不等同于用户可直接消费的沟通体验。

如果没有明确的用户可见沟通契约，实现很容易退回到工程日志、原始事件流或 CLI stdout/stderr 拼接，导致 PM 角色只在 prompt 里存在，无法稳定兑现“收到、在做、卡住、完成、失败、如何自愈”的产品目标。

本变更定义 `user-visible-communication` 能力：Secretary / PM 必须把 TeamEngine 的事实事件、证据、错误和 replay 状态转换成安全、克制、可理解、可追踪的用户消息，并持久化到 session transcript。

## 变更内容

- 新增 `user-visible-communication` 能力规约。
- 定义用户可见消息类型：接收确认、进度摘要、阻塞说明、澄清请求、完成交付、失败说明、replay / repair 状态、自愈建议。
- 明确 `TaskEvent` 是事实日志，`UserVisibleMessage` 是面向用户的沟通产物，二者必须通过 event / evidence / replay refs 关联。
- 明确用户可见消息不得包含 secret、隐藏 system prompt、模型私密 reasoning、原始工程日志倾倒。
- 明确失败和 unavailable 场景必须给出“已完成什么、失败在哪里、影响是什么、能否重试、下一步建议、相关证据 / replay 引用”。
- 明确默认 CLI、library consumer 和 host server 都必须消费同一套沟通语义，不能各自发明用户状态。

## 能力范围

### 新增能力

- `user-visible-communication`
  - PM 用户消息最小 schema。
  - 生命周期沟通点。
  - 失败 / 阻塞 / replay-unavailable 的用户说明规则。
  - 与 `TaskEvent`、`Evidence`、`ReplayCase`、`SessionTranscript` 的引用关系。
  - 安全、脱敏和去日志化要求。

### 修改能力

- `team-engine-entrypoints`：默认 CLI / library / replay 输出用户可见沟通时必须使用同一套消息语义。
- `task-events-evidence`：事件仍是事实日志，但必须能支持生成用户可见状态。
- `workspace-provider`：workspace-unavailable、snapshot incomplete、isolation unavailable 必须能转成用户可理解说明。
- `workspace-storage`：session transcript 需要保存安全的用户可见消息和 task/run 引用。

## 非目标

- 不定义完整 UI 组件、前端布局或通知系统。
- 不要求每个底层 `TaskEvent` 都对应一条用户消息。
- 不把原始日志、模型推理或工具输出直接作为用户沟通协议。
- 不替代 `TaskEvent`、`Evidence`、`TaskRecord` 或 `ReplayCase`。
- 不要求 PM 在每个 tool call 后都打扰用户。

## 风险

- 如果沟通过于频繁，会变成日志刷屏；需要聚合和节流。
- 如果沟通过于抽象，用户无法判断真实进展；必须引用 evidence / event / replay refs。
- 如果失败说明只写自然语言而不关联结构化错误，后续无法自愈。
- 如果各入口自行渲染状态，会破坏 library / CLI / host 的一致性。
