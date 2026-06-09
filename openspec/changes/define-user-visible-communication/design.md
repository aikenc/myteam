# Design: define-user-visible-communication

## 背景

MyTeam 内部已经有事实层：`TaskEvent`、`Evidence`、`TaskRecord`、`ReplayCase`。这些材料适合 replay、调试和运营自愈，但不适合直接展示给用户。用户需要的是 PM 用人能理解的方式回答：收到没有、现在在做什么、为什么卡住、结果是什么、失败后怎么办、能否复现和自愈。

因此需要在事实层之上定义用户可见沟通层：

```text
TaskEvent / Evidence / Error / ReplayCase
  -> PM communication policy
  -> UserVisibleMessage
  -> SessionTranscript / CLI stderr / host UI
```

## 设计目标

- 每个用户请求都有接收确认。
- 长任务有节制地汇报进度，不刷屏。
- 阻塞、缺能力、缺 workspace、replay unavailable 必须解释原因和下一步。
- 完成与失败都必须收口，不能只留下日志或半截状态。
- 用户消息必须能追溯到 event / evidence / replay refs。
- 用户消息必须安全：不泄漏 secret、隐藏 prompt、模型私密 reasoning 或原始敏感日志。

## 核心对象

```ts
interface UserVisibleMessage {
  messageId: string;
  sessionId?: string;
  turnId?: string;
  taskId?: string;
  runId?: string;
  kind:
    | 'ack'
    | 'progress'
    | 'blocked'
    | 'clarification'
    | 'completion'
    | 'failure'
    | 'replay-status'
    | 'repair-suggestion';
  summary: string;
  detail?: string;
  completedWork?: string[];
  currentWork?: string[];
  blockers?: UserVisibleBlocker[];
  nextActions?: UserVisibleNextAction[];
  refs: UserVisibleRefs;
  createdAt: string;
}

interface UserVisibleRefs {
  eventRefs?: string[];
  evidenceRefs?: string[];
  replayRef?: string;
  workspaceSnapshotRef?: string;
  errorCodes?: string[];
}
```

`UserVisibleMessage` 是 PM 面向用户的沟通产物；它可以由 CLI 渲染到 stderr、由 host server 推送到 UI，也可以作为安全消息写入 `SessionTranscript`。写入 session 时，`messageId` 应尽量复用为 `SessionMessage.id`，`summary` / `detail` 作为安全内容，`sessionId`、`turnId`、`taskId`、`runId` 和 refs 作为 MyTeam 公共 ID 链接保存。它不是事实源，事实源仍是 `TaskEvent` / `Evidence` / `TaskRecord` / `ReplayCase`，且不能用 PI request/message/tool ID 或 `llmRequestId` 替代公共 task/run 链接。

## 生命周期沟通点

| 时机 | message kind | 要求 |
|---|---|---|
| 请求被解析并接受 | `ack` | 说明理解到的目标、关键假设、下一步 |
| 长任务推进中 | `progress` | 聚合说明当前 owner / 正在做什么 / 已完成什么 |
| 资源等待或能力缺失 | `blocked` | 说明阻塞点、影响、是否可等待 / 重试 / 替代 |
| 必须用户输入才能继续 | `clarification` | 只问必要问题；能合理假设时默认先推进 |
| 成功完成 | `completion` | 总结交付物、证据、风险和后续建议 |
| 失败或取消 | `failure` | 明确失败点、已完成内容、可重试性、下一步 |
| replay / repair | `replay-status` / `repair-suggestion` | 说明是否可复现、workspace 是否可用、如何自愈 |

## 事件与用户消息的关系

- `TaskEvent` 是事实日志，不是 UI 文案。
- 用户消息必须从事实日志、证据、错误和 replay 状态生成或引用它们。
- 不是每个事件都发用户消息；PM 可以聚合多个事件成一条进度消息。
- 用户消息不能发明事实。如果没有 evidence / event 支撑，应说明是 PM 的判断或建议。

## CLI / Host 渲染边界

默认 CLI：
- `stdout` 在 JSON 模式只输出最终 `TaskResult` 或明确 event stream。
- 用户可读沟通默认走 `stderr`，或在 event stream 模式作为结构化 `user.message` 事件输出。

Host server：
- 可以把 `UserVisibleMessage` 转成 UI 通知、聊天气泡、toast 或任务时间线。
- 不得绕过 TeamEngine 自行生成互相矛盾的事实状态。

## 安全与脱敏

用户消息不得包含：
- secret、token、password、credential。
- 隐藏 system prompt。
- 模型私密 reasoning。
- 未截断或未脱敏的原始 shell / browser / tool 日志。
- adapter-private connection detail。

如果证据被脱敏，用户消息应说明“证据已脱敏”而不是隐藏失败原因。

## 取舍

选择单独定义 `UserVisibleMessage` 的收益：
- 避免把事件日志当用户体验。
- 让 PM 沟通可测试、可复盘、可跨 CLI / Host 一致。
- 失败和 replay-unavailable 能被用户理解，也能被运营自愈使用。

代价：
- 需要额外的消息生成策略、节流和测试。
- 需要维护事件 / 证据 / 用户消息之间的引用一致性。
