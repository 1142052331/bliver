# 阶段 6：陌生人私信与屏蔽设计

## 状态

已完成 brainstorming，产品规则、后端契约和前端交互已确认，等待实现计划审阅。

## 目标

在现有好友私信基础设施上增加受控的陌生人问候、回复解锁、陌生人私信偏好、屏蔽/解除屏蔽和消息会话列表，同时让资料、公开足迹、评论、消息读取和实时事件共享同一套安全策略。

本阶段不重做举报审核系统，不执行真实地理回填，不合并 main、不推送、不部署。

## 产品规则

- 陌生人可从公开足迹或开放资料发起一条问候。
- 每条问候只能等待收件人处理；收件人回复后解锁普通会话。
- 忽略只关闭当前问候。只要收件人仍允许陌生人私信，同一陌生人之后可以再次发起问候。
- 好友直接拥有普通会话，不受陌生人私信开关影响。
- 用户可以关闭陌生人私信；关闭后新的陌生人问候返回无权限，已有已解锁好友会话不受影响。
- 屏蔽使双方资料、公开内容、评论和消息互相不可见，也不再接收 Socket 事件。
- 解除屏蔽后立即恢复原有历史消息与会话。
- 删除会话只对当前用户隐藏；之后收到或发送新消息时会话重新出现。

## 数据模型

### Conversation

保存规范化用户对（较小的 userId 在前）、状态（`greeting_pending` 或 `unlocked`）、双方隐藏时间和最近消息摘要。好友会话直接为 `unlocked`。会话索引覆盖用户对、状态和最近活动时间。

### Message

保留 sender、receiver、content、read 状态，新增 `conversationId` 与 `kind`（`greeting` 或 `text`）。解锁状态不从消息数量推导。

### Block

保存规范化的 blocker/blocked 唯一对及创建时间。查询任一方向都视为互相屏蔽，建立唯一索引避免重复。

### User

新增 `allowStrangerMessages`，默认开启；通过 Me 的隐私设置修改。

## InteractionPolicy

集中提供 `canViewProfile`、`canViewContent`、`canSendGreeting`、`canSendText`、`canReadConversation` 和 `canUnblock`。屏蔽优先级最高，其次是本人/好友，再其次是公开内容和陌生人私信设置。地图、Activity、详情、资料、评论、消息 HTTP 路由和 Socket 发送都调用该策略，不复制局部判断。

## HTTP API

- `GET /api/conversations`：返回当前用户可读会话，按最近活动倒序，过滤本方隐藏时间和屏蔽对象。
- `GET /api/conversations/:id/messages?before=`：返回授权历史并标记入站未读。
- `POST /api/users/:id/greetings`：校验公开可见、未屏蔽、目标允许陌生人消息后创建问候。
- `POST /api/conversations/:id/reply`：仅 pending 收件人可调用；原子创建普通消息并解锁。
- `POST /api/conversations/:id/messages`：仅好友或 unlocked 会话可用。
- `POST /api/conversations/:id/ignore`：仅收件人关闭当前问候。
- `DELETE /api/conversations/:id`：写入当前用户隐藏时间。
- `POST /api/users/:id/block` / `DELETE /api/users/:id/block`：创建或解除屏蔽。
- `GET/PATCH /api/me/message-settings`：读取和更新陌生人私信开关。

403 表示目标不可见、未允许陌生人消息、会话未解锁或已屏蔽；409 表示重复或过期状态竞争。问候创建、回复解锁和屏蔽使用事务或条件更新，避免双击产生重复状态或绕过解锁。

## Socket

保留现有 Socket 注册方式。发送前服务端再次执行 InteractionPolicy；事件使用 `message:greeting`、`message:reply`、`message:new`、`conversation:updated`、`conversation:blocked` 和 `conversation:unblocked`。屏蔽双方不接收实时事件。客户端只更新或失效 React Query 缓存，不自行推断权限；失败只向发送方返回可重试错误，不广播半成功消息。

## 前端体验

- 足迹详情底部抽屉对公开、非好友目标显示“发问候”；发送后显示等待状态。
- 消息页将陌生人问候显示为独立请求卡，提供“回复并解锁”“忽略”“屏蔽”；pending 会话不显示普通 composer。
- 已解锁会话沿用现有 ChatWindow 的气泡、输入和分页体验，但消息入口改为会话列表而非仅好友列表。
- 资料与足迹安全区始终提供举报和屏蔽；已屏蔽对象显示解除屏蔽。
- Me 隐私设置提供“允许陌生人私信”开关，成功后更新缓存并给出明确反馈。
- 收到屏蔽/解除屏蔽事件时关闭相关抽屉、清理会话缓存并刷新地图、资料和评论查询。
- 使用 Natural City 纸张、鼠尾草、森林和珊瑚 tokens，不延续旧 ChatWindow 的黑玻璃视觉。所有交互目标至少 44px，支持焦点、键盘、安全区和 reduced-motion。

## 测试与验收

### 后端

InteractionPolicy 单测；问候、重复问候、忽略后重发、回复解锁、好友直聊、开关关闭、屏蔽/解除、删除隐藏、历史/列表过滤，以及 Socket 不泄漏测试。

### 前端

问候按钮状态、请求卡动作、解锁后的 composer、消息设置开关、屏蔽后的缓存清理、移动抽屉和键盘可达性测试。

### 回归与视觉

运行现有后端与前端测试、typecheck、production build、`git diff --check`。浏览器检查 360x800、390x844、430x932、1440x1000，覆盖长文本、空会话、网络失败、屏蔽态、解除屏蔽、键盘和 reduced-motion。不得推送、部署或执行真实回填。

## 非目标

本阶段不实现关注/粉丝、转发、无限评论嵌套、全新举报审核流程、历史足迹迁移或最终路由级代码分割；这些继续按路线图后续阶段处理。
