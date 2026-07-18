# V1 数据保留与 V2 离线迁移设计

日期：2026-07-18

状态：已确认设计

适用目标：Bliver V1 MongoDB 到现有 Bliver V2 PostgreSQL/PostGIS

## 1. 目标与不可变约束

本章节在 V1 可完整停机、当前没有活跃用户的前提下，执行一次性离线迁移。迁移只恢复当前 V2 已有功能能够表达的数据；V2 没有对应功能或无法满足现有约束的数据不写入 PostgreSQL，而由完整、加密且实际恢复验证过的 Mongo/BSON 冷备份长期保留。

以下约束不可放宽：

- V1 停止全部读写后再备份和迁移；不实现双写、CDC、增量追平或长期 Mongo/PostgreSQL 并存。
- PostgreSQL 在切换后是唯一运行时事实源。V2 API、Web、Socket、Outbox 和 worker 不连接 MongoDB。
- Mongo 驱动、BSON 解析、V1 模型知识和源 ID 映射只属于独立离线迁移工具，不进入任何 V2 runtime package 或启动路径。
- 不改变现有 V2 模块职责、依赖方向、HTTP/Socket 契约、隐私策略或事件所有权。迁移只通过现有表表达已有语义。
- 保留老用户名和 bcrypt 密码哈希；旧用户使用原用户名和原密码登录。首次成功验证 bcrypt 后，仅在 identity 模块内部以 CAS 原子升级为当前 Argon2id 策略。
- 不迁移 V1 JWT、`sessionVersion` 或在线状态。所有用户切换后重新登录，V2 只签发自己的 session。
- 所有迁移实体使用固定规则生成确定性 UUID。工具不得随机生成业务主键，也不得依赖导入顺序生成主键。
- 源 MongoDB 永远只读。任何失败均回滚当前 PostgreSQL 事务并销毁全新目标库，再从已验证备份和空库重跑；不得回写或“修复”源 MongoDB。
- 历史导入不产生 Outbox 事件、Socket 事件、推送投递、通知副本、审计动作或其他新业务副作用。已有 V1 通知记录是被迁移的数据，不是导入时新生成的事件。

## 2. 选定方案与边界

采用“停机快照 -> 隔离恢复 -> 只读转换 -> 空 PostgreSQL 单事务装载 -> 离线验收 -> 切换”的方案。相比直接从生产 Mongo 边读边写，该方案提供可重复的不可变输入；相比双写或 CDC，它不引入第二条运行时数据路径，也符合当前无活跃用户的实际情况。

迁移工具是发布工具，不是业务模块。它可以依赖 Mongo/BSON 客户端、Cloudinary 只读资源查询和 PostgreSQL 客户端，但输出仅限：

1. 向全新且已完成现有十个 Drizzle migration 的 PostgreSQL 写入现有正式表；
2. 生成不含密码、令牌、URL、精确坐标或 Mongo ObjectId 明文的聚合验收报告；
3. 生成含源 ID 到目标 UUID 映射、逐条分类和异常详情的加密迁移账本。账本与备份同级保管，不提交 Git，也不进入运行库。

迁移不新增 `legacy_*` schema、运行时兼容表、Mongo 外键列或 API 字段。PostgreSQL 正式表中不保留 Mongo ObjectId。需要重跑时由相同源 BSON、固定 namespace 和规范化名称重新计算相同 UUID。

## 3. 数据范围

### 3.1 写入现有 V2 运行库的数据

- 用户基本身份、bcrypt 凭据和 `user`/`admin` 角色；
- 足迹正文、心情、可见性、私密/展示坐标、地点、地区、发现期限和发布时间；
- 已验证的足迹 Cloudinary 图片及足迹与媒体的关联；
- 足迹已读、表态、两级评论；
- 好友关系、好友初始状态历史和拉黑关系；
- 双人会话、参与者隐藏状态、消息和已读回执；
- `reaction`、`comment` 两类历史通知及其已读状态；
- 可由同一 VAPID 密钥继续使用的 Push subscription；
- 目标为足迹的举报及其处理状态；
- 主页访客的聚合访问次数和最后访问时间。

### 3.2 不写入 V2 运行库、仅由完整 BSON 备份保留的数据

全部 15 个 V1 collection 都必须进入备份。以下项目没有当前 V2 无损归属，明确不导入 PostgreSQL：

| V1 来源 | 不导入内容 | 原因 |
| --- | --- | --- |
| `Announcement` | 全部公告 | V2 无公告功能和正式表 |
| `Feedback` | 全部反馈 | V2 无反馈功能和正式表 |
| `AdminBootstrap` | 全部记录、owner token | V2 管理员授权模型不同；token 不得传播 |
| `BackfillDiscoveryWindow` | 全部窗口和租约状态 | 属于 V1 临时运维机制，V2 无对应运行语义 |
| `AuditLog` | 全部旧审计 | V1 只有字符串 actor/target/IP，不能满足 V2 必需的 actor UUID、case 关联和不可变治理语义；禁止伪造 V2 审计 |
| `User` | avatar、profile banner、全局在线状态、陌生人私信偏好、`systemIdentity`、`sessionVersion`、主页留言、主页表态、check-in streak、注册/登录 IP、最后登录时间、足迹读取 baseline、最后可见性偏好 | 当前 V2 无对应功能或契约；敏感 IP 不复制到运行库 |
| `Footprint` | `discoveryOrigin`、window token、region backfill 状态/租约/错误、评论 IP、评论 direct reply target/username 快照、反应 username 快照 | V2 不使用 V1 运维状态或反规范化用户名；V2 评论仅保留两级 parent 关系 |
| `Conversation` | pairKey、pending sender、last-message preview 缓存 | 均可由正式关系和消息派生，不能成为 V2 事实源 |
| `Notification` | `profile_view` 通知、senderName/content 展示快照 | V2 当前不支持主页访问通知；展示名从 identity 解析 |
| `Report` | `targetType=comment` 的举报、旧 reviewer/resolution 展示文本 | V2 当前只支持足迹举报；评论举报不得伪装为足迹举报 |

`Friendship`、`Block`、`FootprintRead`、`Message` 和 `PushSubscription` collection 本身均有 V2 功能归属，但无效、孤儿或无法验证的记录不能被静默丢弃或改写；它们触发第 11 节的迁移阻断，原始记录仍完整存在于加密备份。

## 4. V1 到现有 V2 的映射

### 4.1 Identity 与角色

| V1 | V2 | 规则 |
| --- | --- | --- |
| `User._id` | `identity_users.id` | 按第 5 节生成确定性合法 UUIDv7 |
| `User.name` | `identity_users.username`, `display_name` | 保留 trim 后完全相同的登录名；不改大小写、不拼后缀、不音译 |
| `User.password` | `identity_credentials.password_hash` | 仅接受合法 bcrypt 编码并原样保存 |
| timestamps | user/credential timestamps | 保留 V1 `createdAt`/`updatedAt` |
| `role=user` | `identity_roles(user)` | 每个用户必须具有 `user` 角色 |
| `role=admin` | `identity_roles(admin)`、`admin_roles(admin)` | 同时保留基础 `user` 角色；不依据用户名或 `systemIdentity` 自动提权 |

真实源预检确认部分 V1 登录名包含非 ASCII 字符或短于 3 字符。经批准的 identity 范围决策是：V2 新注册仍严格要求 `^[a-zA-Z0-9_]{3,32}$`；登录契约和数据库存储允许 1–32 个无控制字符、无首尾空白的历史登录名。迁移保留原登录名，不改大小写、不拼后缀、不音译；空值、首尾空白、控制字符、超长或重复仍阻断。

历史内容引用已从 V1 `User` 删除的身份时，迁移层按源 ID 创建确定性、不可登录的 deleted-user tombstone，仅含 `identity_users` 与基础 `user` 角色，不创建 credential。早期评论缺少 `userId` 但保留 username 快照时，仅在快照唯一匹配现存用户时恢复真实作者；缺失或歧义仍阻断。该兼容逻辑只存在于离线迁移工具和 identity 存储约束，不进入其他业务模块。

### 4.2 地理、足迹和发现投影

- `Footprint._id` 确定性映射到 `footprints.id`。
- `userId` 经用户映射写入 `author_id`；缺少作者会阻断迁移。
- `realLocation` 有效时写入 `private_point`，否则使用 `location`；`location` 写入 `display_point`。经度必须在 `[-180,180]`、纬度必须在 `[-90,90]`，顺序固定为 `ST_MakePoint(lng, lat)`。
- `visibility` 原值写入；源字段缺失时采用 V1 当时的公开兼容语义 `public`，并在聚合报告中单独计数。其他值阻断。
- `locationPrecision`、`message`、`mood`、`createdAt`、`updatedAt`、`discoveryExpiresAt` 分别写入现有同义列；`published_at=createdAt`。
- 有合法两位 `countryCode` 时转为大写。地区以 `(countryCode, regionCode)` 建立确定性 `regions`；缺少合法 country/region 时 `region_id=NULL`，不猜测地理行政区。
- 非空 `placeName` 建立一条确定性 `places` 记录，provider 固定为 `legacy-mongo`，provider place ID 由加密账本中的源足迹 ID确定；地点坐标使用 display point。空名称不创建 place。
- 每条足迹同步创建一条同 ID 的 `discovery_entries` 投影，字段与 `footprints` 一致，`has_media` 来自成功迁移的媒体关联，`deleted_at=NULL`。这不是事件回放，不写 Outbox。
- V1 `FootprintRead` 映射为 `discovery_reads`，保留 `readAt`；用户或足迹不存在时阻断。

### 4.3 媒体

V1 只有 `photoUrl`，而 V2 `media_assets` 要求受控 Cloudinary `public_id`、MIME、字节数、version、format、width 和 height。正式装载前先做只读媒体清点：

1. 从 URL 解析 cloud name、resource type、version、public ID 和 format，不在日志或普通报告中输出完整 URL；
2. 使用目标环境 Cloudinary 的只读资源查询验证资产存在、类型为受支持图片、资源归属和元数据；
3. 验证 URL 的 cloud name 与切换后 V2 使用的 Cloudinary 账户一致；
4. 为媒体资产和 `footprint_media` 关联生成确定性 UUID，owner 使用足迹作者，position 固定为 0；
5. 只引用既有 Cloudinary 资产，不搬移、不覆盖、不删除、不重新上传。

任一非空 `photoUrl` 无法解析、远端不存在、账户不一致或缺少 V2 必需元数据时，整次迁移阻断。不能用虚构 MIME、字节数或占位图片换取通过。媒体资产在 PostgreSQL 恢复完成且冷备份保留期结束前禁止从 Cloudinary 删除。

### 4.4 表态与评论

- V1 reaction 以 `(footprintId,userId)` 映射到 `footprint_reactions`，保留 emoji。真实 V1 reaction 子文档没有独立时间时，使用所属 footprint 的 `createdAt` 作为确定性历史基线并单独计数。V2 每用户每足迹只允许一个表态；若源中存在重复，只有 emoji 与确定性时间完全相同的重复才可去重并计数，冲突则阻断。
- V1 comment subdocument `_id` 确定性映射到 `footprint_comments.id`，`userId` 映射为 `author_id`，保留 content、createdAt 和 deletedAt。
- 顶层评论 `parent_comment_id=NULL`；回复只映射到其顶层 `parentCommentId`。`replyToCommentId` 和 `replyToUser` 仅在 BSON 备份保留，不进入 V2。
- 被删除且 content 为空的评论用固定 tombstone `"[deleted]"` 满足 V2 约束，同时保留 `deleted_at`；早期缺少 `userId` 的评论只允许按唯一 username 快照恢复作者。未删除的空评论、超过 2000 字符、无法唯一恢复的用户、跨足迹 parent、缺失 parent 或超过两级均阻断。

### 4.5 社交关系

- 每条 V1 friendship 生成确定性 `friendships.id`，`user_low_id`/`user_high_id` 按 UUID 字节序固定排序，同时保留 requester/addressee 和 pending/accepted 状态。
- 每条 friendship 生成一条确定性的 `friendship_status_history` 初始记录：`from_status=NULL`、`to_status` 为当前状态、actor 为 requester、`occurred_at=createdAt`。这只是恢复现有状态的历史基线，不产生业务事件。
- 同一无序用户对出现多条关系、自好友、孤儿用户或方向冲突均阻断；不自动选择“最新一条”。
- V1 `Block` 直接映射 `blocks`，保留创建时间。自拉黑、重复冲突或孤儿用户阻断。

### 4.6 会话、消息和回执

- V1 conversation 按无序参与者对映射到一个确定性 V2 conversation；`userA`/`userB` 排序为 low/high，initiator 优先取 `pendingSenderId`，否则取 `userA`。
- `greeting_pending -> requested`，`unlocked -> active`。参与者的 `hiddenAtA/B` 分别写入 `conversation_participants.hidden_at`。
- V1 message 使用自身 `_id` 生成 `messages.id`，`text -> message`、`greeting -> greeting`，`createdAt -> sent_at`，`event_id` 使用独立名称生成确定性 UUID。既有内容视为 V1 已接受内容，`moderation_status=clear`、`moderation_labels=[]`，导入不重新广播或触发审核 worker。
- message 的 sender/receiver 必须正好是 conversation 两名参与者。`conversationId` 缺失时仅允许按 sender/receiver 唯一匹配已有 conversation；没有 conversation 时由该用户对建立确定性派生 conversation，状态为 greeting 对应 requested、否则 active。歧义或关联冲突阻断。
- `isRead=true` 时为 receiver 建立 `message_receipts`，`read_at` 使用 message `updatedAt`，缺失时使用 `createdAt`；未读消息不建立 receipt。
- conversation `updated_at` 使用其 `updatedAt` 与最后消息时间的最大值。preview、pairKey 和 pending sender 缓存不导入。

### 4.7 通知、推送、举报和主页访客

- 仅迁移 V1 `reaction` 和 `comment` 通知。`recipientId`/`senderId` 映射用户，`footprintId` 必须有效；`type` 保持，target 为对应 footprint，dedupe key 和通知 ID均由源通知 `_id` 确定性生成。
- `isRead=false -> read_at=NULL`；`isRead=true` 因 V1 无真实阅读时间，确定性设置为 `createdAt`。V1 `content` 和 senderName 快照不进入 payload；payload 只保留 V2 需要的目标引用。
- Push subscription 仅在 V1 与 V2 VAPID 公钥指纹一致时导入 endpoint、p256dh 和 auth，并为有订阅的用户设置 `notification_preferences.push=true`，其他偏好保持 V2 默认值。指纹不一致或无法证明时阻断，不能导入必然失效的订阅。
- 仅迁移 `targetType=footprint` 的 V1 report。`pending -> open`、`actioned -> resolved`、`dismissed -> dismissed`，保留 reason、details、createdAt、reviewedAt 到 resolvedAt。V2 无法可靠表达的 reviewer/resolution 文本只留在 BSON 备份。comment report 不导入。
- `User.profileVisitors` 按 `(owner,visitor)` 聚合写入 `profile_visitors`：`visit_count` 为记录数，`last_visited_at` 为最大 visitedAt。V2 表允许自访问，因此自访问照常迁移；孤儿 visitor 或无效时间会阻断，不能静默排除。

V1 没有可靠来源的数据不制造默认历史行：不生成 memory highlight、delivery attempt、moderation case/action、V2 audit log、identity device/session/security event 或 processed event。通知偏好仅在 Push subscription 需要启用 push 时创建。

## 5. 确定性 UUID 与规范化

V2 domain 对 `UserId`、`FootprintId`、`ConversationId` 和 `EventId` 强制执行 UUIDv7，因此迁移映射也必须生成确定性合法 UUIDv7；不得放宽 runtime 解析器以接受 UUIDv5。固定映射命名空间为 `7290d9d2-4307-5ebf-a8fd-57483b403f67`。哈希输入使用 UTF-8，格式为 `<namespace>:<entity>:<canonical-key>`，通过 SHA-256 产生 UUIDv7 的随机位，并显式设置 version 7 与 RFC variant bits。

Mongo ObjectId 统一为 24 位小写十六进制，其前 4 bytes 秒级时间戳乘以 1000 后写入 UUIDv7 的 48-bit 毫秒时间字段。没有单一 ObjectId 的 derived entity 使用固定时间 `2026-07-18T00:00:00.000Z`，其规范键必须完全由稳定源值组成：无序用户对先排序，region/place 使用规范化 country/region/provider key，link/history/receipt 使用明确的父实体和源实体 ID。任何 ID 都不得使用“首条扫描记录”的时间、当前时间、批次号或数据库序列。实体前缀至少包括 `user`、`footprint`、`media`、`footprint-media`、`comment`、`friendship`、`friendship-history`、`conversation`、`message`、`message-event`、`notification`、`push-subscription`、`report`、`region` 和 `place`。

同一输入在任何机器、任何批次大小、任何扫描顺序和任何重试中必须得到相同 UUID，并通过现有 `isUuidV7` 及对应 `parse*Id`。预检为所有计划写入的 UUID 建立反向集合；不同源实体发生目标 UUID 冲突立即阻断。UUID 固定测试向量及其预期值属于实现测试和加密账本，不向运行时暴露源 ID。

## 6. bcrypt 兼容与首次登录升级

兼容逻辑严格封装在 identity domain/application/infrastructure 内：

1. `verifyPassword` 先按受支持前缀识别 Argon2id 或 bcrypt；其他编码统一验证失败，不向客户端暴露算法差异。
2. Argon2id 沿用当前路径。bcrypt 使用经过维护的本地库验证，设置可接受 cost 上下限，避免畸形哈希造成资源消耗。
3. bcrypt 验证成功后，以当前 Argon2id 参数计算新哈希。即使旧密码少于 V2 新注册的 8 字符规则，也允许对“已经由 bcrypt 验证成功的旧密码”执行升级；这不放宽新注册密码策略。
4. credential repository 以 `UPDATE ... WHERE user_id=? AND password_hash=?` 做 CAS。成功更新一行后才签发 session。
5. CAS 返回零行时重新读取凭据；若另一并发登录已写入 Argon2id 且当前密码验证成功，则继续登录，否则失败。数据库或 rehash 异常时不签发 session。
6. 永不记录明文密码、哈希、算法参数全文或用户名；可记录无用户标识的升级成功/失败聚合指标。

旧 JWT、设备、refresh token 和 session 全部不迁移。切换前轮换或移除 V1 JWT secret 的运行时可达性，防止旧 token 被误接受。

## 7. 冻结备份与恢复验证

备份必须覆盖已确认数据库中的全部 collection、索引、collection options 和 BSON 类型，不允许只导出计划迁移的集合。流程如下：

1. 下线 V1 Web/API/worker/定时任务，撤销应用写权限；以数据库侧连接和写操作指标证明静默窗口。
2. 记录 MongoDB 服务版本、`mongodump` 版本、数据库名、collection 列表、每集合 count、索引摘要和备份开始/结束时间；报告不含连接串、主机、用户名或业务内容。
3. 使用 `mongodump --archive --gzip` 对单一明确 database 导出，并在受限主机上直接流式经过 age 加密；不在普通磁盘留下持久明文 archive。
4. 至少使用两个独立保管的 age recipient，私钥不进入仓库、CI、Render 环境或迁移日志。记录密文 SHA-256、大小和 recipient 指纹。
5. 将密文解密流式恢复到隔离、无公网应用访问的 Mongo 实例；重新核对 collection、counts、索引、BSON 可读性和规范化内容摘要。只有实际 `mongorestore` 成功才算“可恢复”。
6. 迁移读取隔离恢复副本，而不是继续读取原生产 Mongo。原实例保持只读，直到 V2 验收和保留策略生效。

密文备份、加密迁移账本、manifest 和恢复报告按同一 retention policy 保存；删除必须是单独审批动作。因为备份含密码哈希、私信、push 密钥、精确坐标和 IP，它按最高敏感级别处理。

## 8. 离线执行流程

1. **解除源阻断**：只从受控 secret 文件加载 Mongo URI；确认 URI 指向的明确 database、只读凭据可连接，并将实际 database name 与运维登记一致。不得依赖 driver 的默认数据库。
2. **冻结 V1**：下线所有 V1 进程，关闭计划任务和写凭据，证明无写入。
3. **备份及恢复演练**：完成第 7 节的全库加密 dump 和隔离 restore；失败则停止。
4. **源预检**：在恢复副本上执行 schema 枚举、关联完整性、约束兼容性、媒体清点、VAPID 指纹和全量转换 dry-run；输出迁移/归档/阻断三类聚合数量。
5. **准备目标**：创建全新 PostgreSQL 16/PostGIS 数据库，执行仓库现有十个有序 migration 和 foundation seed。确认除 migration 元数据及 `platform.system_markers/v2-foundation` 外没有业务行，并验证数据库指纹与批准 baseline 一致。
6. **装载**：在单个 PostgreSQL `SERIALIZABLE` transaction 中按 identity -> geography/place -> media -> footprints/discovery -> reads/interactions -> social -> conversations/messages -> notifications/push -> reports/profile visitors 顺序使用参数化批量 INSERT。业务表发生任意冲突即回滚；不使用跳过错误的 `ON CONFLICT DO NOTHING`。
7. **数据库内验收**：事务提交前执行 FK/唯一性/空间范围、源目标计数、规范化摘要和隐私查询断言；全部通过后才 commit。
8. **离线应用验收**：目标仍不对公网开放，启动 exact-SHA V2，执行 identity、地图、足迹详情、互动、社交、消息、通知、媒体、举报和权限 smoke；确认 Outbox 为空且无 Socket/push 副作用。
9. **备份 PostgreSQL 并恢复**：按现有 `docs/operations/backup-restore.md` 将已迁移目标备份并恢复到另一隔离 PostgreSQL，验证 migration 幂等、schema/index hash、聚合 counts、数据摘要和授权读取。
10. **切换**：仅在全部 gate 通过后让 exact-SHA V2 指向验收过的 PostgreSQL，保持 V1 下线；执行远程 `/healthz`、`/readyz`、`/versionz` 和 60 分钟观察。

该流程没有增量阶段。冻结备份生成后若源 Mongo 出现任何写入，当前快照和所有结果作废，重新冻结、备份并从空目标开始。

## 9. 隐私与秘密处理

- Mongo URI、PostgreSQL URL、Cloudinary secret、VAPID private key、age private key、bcrypt/Argon2id hash、push endpoint/keys、消息内容、精确坐标、IP 和源 ObjectId 不得出现在 Git、终端转录、普通日志或非加密验收产物中。
- 工具默认日志只包含阶段、耗时、collection/table 聚合 count、不可逆错误码和运行 ID。逐条错误和 ID 映射只写加密账本。
- 源读取凭据为单库只读；Cloudinary 凭据只允许读取资源元数据；PostgreSQL 装载凭据只对全新目标有效。迁移结束立即撤销三类临时凭据。
- 临时主机磁盘、进程参数、shell history、崩溃转储和 CI artifact 均视为泄漏面。secret 只通过忽略的环境文件或 secret manager 注入，不作为 CLI 参数。
- 验收使用聚合和合成 smoke 账号。禁止在截图、错误响应或审查文档中展示真实用户名、私信、通知文本或地图精确位置。

## 10. 一致性与验收标准

迁移只有同时满足以下条件才通过：

### 10.1 备份证据

- 明确且唯一的 Mongo database name；15 个 V1 model 对应 collection 均被枚举，额外 collection 也被备份和登记；
- 加密 archive 的 SHA-256 和 recipient 指纹已记录；
- 隔离 `mongorestore` 成功，collection counts、索引摘要和规范化内容摘要匹配；
- 加密账本可解密、可读取且与运行 ID、archive hash 和候选 SHA 绑定。

### 10.2 数据映射证据

- 每个源 collection 给出 `source / migrated / archived-only / blocked` 四类数量，恒等式严格成立；
- 所有计划迁移记录均有且仅有一个分类，所有目标 UUID 可重复计算，无碰撞；
- identity、footprints、media、reads、reactions、comments、friendships、blocks、conversations、messages、receipts、notifications、subscriptions、reports 和 profile visitors 的目标计数符合本设计的明确聚合规则；
- 每个目标表以主键排序，时间统一 UTC、JSON key 排序、geography 使用稳定 EWKB 表示后计算 SHA-256；转换 dry-run 的期望摘要与 PostgreSQL 实际摘要一致；
- FK、唯一约束、CHECK、两级评论、无自好友/自拉黑、会话参与者、消息 sender/receiver、媒体 owner 和可见性均通过数据库查询验证。

### 10.3 行为证据

- 至少一个专用 bcrypt fixture 账号能以原用户名/密码登录，凭据 CAS 升级为 Argon2id，第二次登录走 Argon2id；错误密码不升级，不创建 session；并发登录只产生一个有效升级结果；
- 新注册仍执行现有 8 字符密码策略；旧 JWT 无法访问；
- owner、friend、stranger、blocked、guest 和 admin 对 public/friends/private 足迹及 precise/approximate 坐标的读取矩阵与现有 V2 策略一致；
- 迁移图片可由 V2 生成有效 Cloudinary delivery URL；足迹、互动、好友、会话、已读、通知、Push subscription、足迹举报和主页访客代表性读取正确；
- 导入前后 `platform.outbox_events`、delivery attempts 和 Socket/push 发送计数均没有因历史装载增加；
- exact-SHA 全量 V2 测试、PostgreSQL integration、render build、release freeze、远程 health/readiness/version 和 60 分钟观察全部通过且无 skip 被算作 pass；
- 已迁移 PostgreSQL 的独立备份恢复演练通过现有生产发布 gate。

### 10.4 发布判定

任何 count/digest 不一致、归档恢复失败、媒体缺失、孤儿业务关系、用户名/密码不兼容、秘密泄漏、权限矩阵变化、数据库 parity 失败或测试 skip 都是阻断。不得以“当前没有用户”为理由降低数据与恢复标准。

## 11. 失败与重跑

- 预检失败：不创建业务目标数据；修复迁移代码或补齐外部权限后，在同一隔离恢复副本重新 dry-run。源数据问题需要改变产品语义时停止并请求单独批准，不自动清洗。
- 装载失败：回滚整个 transaction，撤销应用访问，保留加密错误账本；销毁目标 PostgreSQL database，重新创建、执行 migration 和 seed，再全量重跑。
- 验收失败但已提交 transaction：目标保持隔离只读，保留证据后销毁，禁止在失败库上手工补数据或部分续跑。
- 切换后失败：V1 保持下线；V2 立即停止写入，按已演练的 PostgreSQL backup restore/应用 SHA rollback 恢复。不得重新启用可能已过时的 Mongo 作为写主库。
- Cloudinary、Push 或其他外部依赖失败：不删除源资产、不发送测试到真实用户；整次切换保持阻断，直到只读验证和合成 smoke 通过。

确定性 UUID提高可诊断性，但不等于允许在脏目标上 upsert。唯一受支持的重跑边界始终是“相同已验证 archive + 全新空 PostgreSQL”。

## 12. 当前阻断项

`C:\Users\Administrator\Downloads\bliver.env` 中现有 Mongo 配置此前连接返回 `ECONNREFUSED`，且 URI 的实际 database name 尚未确认。因此目前不能读取真实 source inventory、验证 15 个 model 对应 collection、统计数据量、检查用户名/孤儿关系、清点 Cloudinary 媒体，也不能生成或恢复可信 BSON 快照。

在以下事实全部成立前，本设计不得进入实施性迁移或生产切换：

1. 获得可连接的 V1 Mongo 只读 URL 或从 Mongo provider 获取可恢复 snapshot；
2. 明确 URL 所指向的唯一 database name，并证明不是 driver 默认库或错误环境；
3. 确认该库包含预期 V1 collections，记录额外 collections；
4. 获得只读 Cloudinary 元数据访问，并确认目标 V2 使用同一 cloud；
5. 以不暴露密钥的 fingerprint 方式确认 V1/V2 VAPID 公钥是否一致；
6. 指定两个 age recipient 及独立私钥保管人。

这些是可验证的上线门禁，不授权改变现有 V2 边界，也不授权将 `bliver.env`、数据库 URL 或任何秘密提交到仓库。

## 13. 完成定义

本章节完成的定义是：全量 V1 Mongo 数据已进入验证可恢复的加密 BSON 冷备份；当前 V2 已有功能可表达的有效数据已按固定规则迁入全新 PostgreSQL；老账号以原用户名和原密码登录并在 identity 内安全升级凭据；V2 运行时仍只有 PostgreSQL/Cloudinary 等既有边界；全部结构、计数、摘要、权限、行为、备份恢复和 exact-SHA 发布 gate 有可审计证据。任何一项未满足都只能标记为阻断，不能宣称迁移完成。
