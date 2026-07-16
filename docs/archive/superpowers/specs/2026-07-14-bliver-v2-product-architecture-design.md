# Bliver V2 产品与技术架构重建设计

状态：已通过对话评审，等待书面规格复核
日期：2026-07-14
范围：上线前产品收敛、全栈架构重建、旧系统最终删除

## 1. 决策摘要

Bliver V2 采用同仓纵向重建，而不是继续原地修补 V1，也不是脱离现有业务知识的完全绿地重写。

核心决策：

- 产品主循环是“地图发现 -> 互动 -> 好友关系 -> 长期个人记忆”。
- 客户端以响应式 Web/PWA 为主，通过 Capacitor 打包 Android，并为未来原生客户端保留标准 API 契约。
- 仓库改为 npm workspaces，使用 Node.js 24、npm 11 和全栈严格 TypeScript。
- 前端继续使用 React、Vite、TanStack Query、受限 Zustand、React Router 和 Socket.IO Client。
- 后端使用 Express 5 的严格模块化单体，不提前拆微服务。
- PostgreSQL + PostGIS 取代 MongoDB，成为唯一事实源。
- Drizzle 提供类型安全 SQL 与版本化 migration。
- REST、OpenAPI、Zod schema 和生成客户端共同定义跨端契约。
- PostgreSQL Outbox 与 Socket.IO 提供可靠领域事件和实时更新。
- Cloudinary 继续承载媒体，但被 Media 模块隔离。
- Web 使用 HttpOnly Session Cookie；Capacitor 使用安全存储的短期凭证与轮换 refresh token。
- Natural City 是唯一视觉方向：暖纸、森林绿、珊瑚红，地图内容承担主要视觉生命力。
- V1 不做兼容迁移、双写或长期并存。V2 全量验收后，一次性删除 V1、MongoDB 和旧契约。

## 2. 背景与现状证据

当前仓库已有大量可工作的业务能力，但处于多次重构后的过渡态：

- `frontend/src/App.jsx` 已增长到 708 行，同时连接认证、地图、导航、覆盖层、Socket、通知、好友、消息和个人页。
- `frontend/src/components` 有 67 个生产组件文件，多数仍平铺在同一目录。
- `backend/services` 有 31 个服务文件，技术分层存在，但领域所有权和跨模块依赖没有统一约束。
- 新旧个人页、地图集群详情、消息接口、导航桥接和读状态兼容层并存。
- `AGENTS.md`、`CLAUDE.md` 与 README 仍描述 React 18、旧 react-leaflet、旧文件行数和已经迁移掉的事件机制；实际依赖是 React 19、react-leaflet 5、Vite 8 和 Tailwind 4。
- 静态搜索已发现多项无生产调用方候选，例如旧 ProfilePage、ClusterDetailPanel、MobileActionDrawer、FootprintCardList 和 useFootprints。
- 当前前端 398 个测试、后端 464 个测试、发布工具 12 个测试通过；TypeScript 检查通过。
- 当前 ESLint 为 0 error、30 warning，主要集中在 effect 状态同步和依赖不完整。

项目尚未正式上线，没有需要保留的真实客户端契约或生产数据。因此本设计不采用 30 天弃用窗口、不保留 MongoDB 兼容层，也不为旧 API 建立长期适配器。

现有 862 个业务测试不是 V2 测试套件本身，而是提取业务规则、隐私边界和隐藏行为的证据来源。

## 3. 目标与原则

### 3.1 产品目标

- 打开应用首先看到一张有生命的地图，而不是通用信息流。
- 用户能理解当前看到的内容来自哪里、与自己是什么关系、为何可见。
- 发布足迹时，受众和位置精度始终可见并由服务端强制执行。
- 公共互动自然过渡到问候、好友和正常会话。
- 公共发现会过期，但足迹继续成为作者的长期地理记忆。
- 移动端决策优先，桌面端扩展空间而不改变信息架构。

### 3.2 工程原则

- 业务领域拥有自己的写模型、Repository 和应用服务。
- 跨领域写入使用 command 或领域事件，禁止直接访问他域表或 Repository。
- 隐私、身份、屏蔽和权限各有唯一权威策略。
- 服务端状态、UI 状态、URL 状态和本地交互状态分别管理。
- 所有跨端输入先经过共享 schema，服务端仍执行最终验证。
- 数据与 Outbox 事件在同一数据库事务中提交。
- 任何 consumer 都必须幂等并可安全重试。
- 新抽象必须服务于真实边界，不为未来猜测提前造平台。
- “企业级”由边界、可靠性、安全、可观测性和发布纪律定义，不由微服务数量定义。

## 4. 产品信息架构

主导航固定为：

```text
地图 | 动态 | 消息 | 我的
       + 独立发布足迹
```

主循环：

```text
地图或动态发现足迹
-> 打开统一足迹详情
-> 反应、评论、问候或加好友
-> 消息关系加深
-> 足迹长期进入个人记忆
```

### 4.1 保留并重做

- 地图发现、区域范围、搜索、筛选、聚合点和足迹预览。
- 公共、好友、私密发布，以及精确、模糊位置。
- 统一动态流。
- 足迹反应、两级评论、举报和屏蔽。
- 好友请求、陌生人一次问候、回复后解锁会话。
- 个人地图、时间线、照片、访客和长期记忆。
- 站内通知和可选 Push。
- 管理员审核、用户管理和审计。

### 4.2 合并

- Timeline、PhotoWall 和个人页历史合并为“我的 / 记忆”中的地图、时间线、照片视图。
- FriendsPanel、好友请求和会话列表合并进入“消息”。
- 地图、动态和记忆统一使用一个足迹详情 route/sheet。
- 公告成为系统通知的一种，不再拥有独立弹窗和独立用户入口。
- 用户反馈进入“设置 / 帮助”，取消自动评分弹窗。
- 管理后台成为独立 `/admin` 工作区，不再覆盖地图。

### 4.3 删除

- 个人主页留言板和对用户表态；互动只发生在足迹上。
- ProfilePage、ProfileDrawer 双实现及其专属旧组件。
- ClusterDetailPanel、FootprintCardList、CommentSection、MobileActionDrawer 等旧表面。
- LegacyDestinationBridge、窗口 CustomEvent 和重复 Socket 状态桥接。
- 以显示名“阿森”自动提权的逻辑。
- 基于 IP 的克隆用户功能。
- 强制单设备登录；V2 使用多 Session、设备列表和主动撤销。
- 旧消息 API、旧足迹 API、MongoDB 回填脚本和上线前兼容层。
- 独立天气功能表面；天气只作为失败不阻塞发布的可选元数据。

## 5. 重建方式

选择“同仓 V2 纵向重建”：

- 新 workspace 在现有仓库中建立。
- V1 在迁移期保持只读参考，不继续增加功能或整理目录。
- 每个领域从现有实现和测试提取规则，但不机械复制旧代码。
- 每个纵向链路完成时必须可独立运行、测试和演示。
- 全量验收通过后，用单独切换提交删除 V1。

未选择的方案：

- 原地重构：语言迁移、目录搬迁、行为修改和数据库替换会交织，难以回滚。
- 独立绿地重写：容易丢失已经沉淀在测试和边缘逻辑中的隐私与实时规则。

## 6. Monorepo 结构

目标结构：

```text
Bliver/
  apps/
    web/
    api/
  packages/
    contracts/
    domain/
    ui/
    config/
    testing/
  docs/
    architecture/
    operations/
  package.json
  package-lock.json
```

Workspace 职责：

- `apps/web`：React 应用、路由、feature slices、PWA 和 Capacitor 适配。
- `apps/api`：REST、Socket、领域模块、Postgres Repository、Outbox worker 和静态 Web 托管。
- `packages/contracts`：Zod DTO、OpenAPI、错误码、Socket event schema 和生成客户端入口。
- `packages/domain`：纯值对象与确实需要跨端复用的规则；不访问 DOM、网络、数据库或环境变量。跨端复用只用于预览和输入约束，服务端仍是最终权限权威。
- `packages/ui`：Natural City token、无业务基础组件和可访问性交互构件。
- `packages/config`：TypeScript、ESLint、Vitest 和构建共享配置。
- `packages/testing`：fixture factories、contract harness、PostGIS 和 Socket 测试工具。

强制依赖规则：

- Web 禁止导入 API 内部模块。
- API 禁止导入 Web 或 UI 业务实现。
- Domain 禁止依赖基础设施。
- 应用模块禁止访问他域 Repository 或表。
- 所有跨 workspace 导入只能经过公开 export map。
- 所有跨端输入先经过 schema。
- 禁止循环依赖和无归属共享目录。

## 7. 领域模块

### 7.1 Identity & Access

拥有账号、凭证、Session、设备、角色和认证审计。

### 7.2 Geography

拥有结构化地点、行政区归一化、PostGIS 值对象和地理服务 ports。

### 7.3 Footprints

拥有足迹发布、可见性、位置精度、评论和反应。它是“谁能看到什么”的唯一权威。

### 7.4 Discovery

拥有地图和 Activity 的只读查询与投影，不拥有足迹写入。

### 7.5 Social Graph

拥有好友请求、好友关系和屏蔽。它向其他领域提供关系查询端口。

### 7.6 Conversations

拥有陌生人问候、会话解锁、消息、回执、未读和输入状态。

### 7.7 Memories

拥有个人空间的读取模型、个人地图、时间线、照片、访客和回顾能力。

### 7.8 Moderation

拥有举报、审核 case、管理员命令和不可修改审计轨迹。

### 7.9 Notifications

拥有站内通知、系统通知、偏好、Push 订阅和投递状态。

### 7.10 Media

拥有 Cloudinary 签名、媒体归属、变体和删除生命周期。业务模块只保存稳定媒体引用。

## 8. 前端架构

目标目录：

```text
apps/web/src/
  app/
    bootstrap.tsx
    router.tsx
    providers/
    error-boundaries/
  features/
    map/
    discovery/
    footprints/
    social/
    conversations/
    memories/
    moderation/
  shared/
    layouts/
    feedback/
    accessibility/
    formatting/
  platform/
    browser/
    capacitor/
```

每个 feature 使用统一结构：

```text
feature/
  routes/
  components/
  queries/
  commands/
  model/
  tests/
  index.ts
```

规则：

- `app` 只负责组合 Provider、Router、全局错误边界和启动流程。
- Feature 只通过自己的 queries、commands 和公开 index 对外提供能力。
- UI 组件不能直接调用 Axios、Socket 或数据库概念。
- OpenAPI 生成客户端是唯一 REST 入口。
- Capacitor 能力通过 platform port 注入，feature 内不出现平台判断。

路由：

```text
/map
/activity
/messages
/messages/:conversationId
/me
/profile/:userId
/footprints/:footprintId
/admin
```

地图是根画布。预览卡、详情 Sheet、个人空间和会话面板通过嵌套路由或 URL 状态表达，支持刷新恢复、后退、分享和深链。

状态所有权：

- TanStack Query 管理服务端状态。
- Zustand 只管理少量跨 route shell 状态和全局反馈。
- URL 管理地图范围、筛选、选中实体和打开表面。
- React 本地状态管理表单草稿、焦点和短暂交互。
- Socket adapter 将事件映射为 Query cache 更新或失效，不直接修改组件状态。

## 9. 后端架构

Express 5 继续作为 HTTP 运行时。当前问题不来自框架本身，因此不为追求新颖而切换 Fastify 或其他框架。

目标目录：

```text
apps/api/src/
  bootstrap/
  http/
    routes/
    controllers/
    middleware/
    openapi/
  realtime/
  modules/
  platform/
    db/
    cloudinary/
    geocoding/
    weather/
    observability/
  outbox/
  jobs/
```

每个领域模块采用轻量六边形分层：

```text
module/
  domain/
  application/
  infrastructure/
  transport/
```

- Domain 包含实体、值对象、状态机和策略。
- Application 包含 command/query handler、事务用例和 ports。
- Infrastructure 包含 Repository、SQL 和外部供应商适配器。
- Transport 包含 REST controller、Socket handler 和 DTO mapping。

事务边界位于 application handler。Controller 只做认证上下文、schema 校验、handler 调用和响应映射。业务数据与 Outbox 事件在同一事务中提交。

## 10. PostgreSQL 与位置隐私

PostgreSQL + PostGIS 是唯一事实源。Drizzle 提供类型安全 SQL，所有 schema 变化通过版本化 migration。

模块表：

```text
identity:      users, credentials, sessions, devices, roles
footprints:    footprints, footprint_media, comments, reactions
social:        friendships, blocks
conversations: conversations, participants, messages, message_receipts
moderation:    reports, moderation_cases, audit_logs
notifications: notifications, push_subscriptions
platform:      outbox_events, idempotency_keys
```

实体 ID 使用 UUIDv7，时间统一存 UTC。所有列表使用稳定不透明游标。

每个足迹分别保存：

- `private_point`：真实发布位置，只供作者记忆和明确授权的审核流程。
- `display_point`：其他用户实际看到和参与发现查询的位置。
- `location_precision`：`precise | approximate`。
- `visibility`：`public | friends | private`。
- `discovery_expires_at`：公共发现窗口，默认发布后 24 小时。
- 结构化 country、region、city 和 place 信息。

模糊位置在发布时生成一次稳定偏移。普通 DTO 无法序列化 `private_point`。公共发现到期不删除足迹，只停止陌生人地图和 Activity 推荐；允许访问的历史入口继续按可见性规则读取。

好友关系使用规范化用户对和唯一约束。屏蔽是公开内容、关系、消息和通知查询的前置条件。

陌生人会话状态机：

```text
requested
  -> recipient replied -> active
  -> recipient ignored -> ignored
  -> either user blocks -> blocked
```

`requested` 只允许一条问候。发布、消息和其他可重试命令支持 Idempotency-Key。

## 11. REST、OpenAPI 与实时事件

统一 REST 前缀 `/api/v1`：

```text
/session
/users/me
/users/:userId
/footprints
/footprints/:footprintId
/discovery/map
/activity
/friendships
/blocks
/conversations
/messages
/notifications
/reports
/admin
/media
```

Zod schema 生成 OpenAPI；Web 和 Capacitor 使用生成客户端。错误统一为 Problem Details，并包含稳定错误码和 request ID。

Socket 事件复用共享 schema。Socket handler 不实现业务逻辑，只调用 application command。Outbox consumer 负责广播已提交事件、更新通知和读取投影。

核心事件包括：

- `FootprintPublished`
- `FootprintVisibilityChanged`
- `ReactionAdded`
- `CommentAdded`
- `FriendshipAccepted`
- `GreetingSent`
- `ConversationUnlocked`
- `MessageSent`
- `ReportResolved`

核心发布链路：

```text
REST command
-> schema / auth / policy
-> Footprints application handler
-> Postgres transaction: footprint + media reference + outbox event
-> outbox consumer
-> Discovery read model / Notifications / Socket
```

## 12. 身份与媒体

用户名和密码是主要登录方式，用户可选绑定邮箱。密码使用 Argon2id。

- Web 使用 HttpOnly、Secure、SameSite Cookie，并验证 Origin/CSRF。
- Capacitor 使用安全存储的短期 access token 和轮换 refresh token。
- 角色与 Session 状态始终以数据库为准。
- 多 Session 和设备列表取代单设备互斥登录。
- 管理员权限与显示名完全无关。

Cloudinary 使用服务端短期签名上传。服务端验证媒体类型、大小、归属和用途。数据库只保存稳定 public ID、版本、尺寸、格式和业务归属，不保存临时签名 URL。

## 13. 安全、错误与降级

启动时使用 schema 校验全部配置；关键配置缺失时拒绝启动。

安全要求：

- Session、角色和封禁状态以数据库为准。
- 所有权限通过策略对象执行。
- 登录、注册、问候、评论、发布和上传分别限流。
- Helmet、严格 CSP、Origin 校验和 CSRF 默认开启。
- 日志禁止记录密码、Cookie、Token、消息正文、精确坐标和上传签名。
- 管理员读取私密内容必须关联 moderation case 并写入审计。

错误类型：

```text
ValidationError      400
AuthenticationError  401
AuthorizationError   403
NotFoundError        404
ConflictError        409
RateLimitError       429
DependencyError      503
InternalError        500
```

对外统一 Problem Details；内部保留 cause、request ID 和 trace。领域错误使用稳定错误码，不依赖字符串匹配。

降级要求：

- 地理编码和天气失败不阻塞发布。
- Push 失败保留站内通知。
- Socket 断开退化为 Query 重取。
- Outbox 失败保留事件并指数退避。
- 地图瓦片失败时，动态、消息和个人记忆仍可使用。
- 上传失败保留表单草稿，不创建半完成足迹。

## 14. 可观测性与性能预算

采用结构化日志、指标、Trace 和 Sentry。

- HTTP、Socket command 和 Outbox event 共享 correlation ID。
- 监控请求 p50/p95、错误率、数据库池、慢查询、Socket 在线数和重连率。
- 监控 Outbox backlog、最老事件年龄、重试和 dead-letter。
- 监控 Cloudinary、地理编码和 Push 的延迟与失败率。
- `/healthz` 只表示进程存活。
- `/readyz` 检查数据库、migration 和关键启动状态。
- `/versionz` 返回构建 SHA 与环境，不返回秘密。

性能预算：

- Web 首屏非地图公共代码不超过 200 KB gzip；地图和管理后台独立分包。
- LCP < 2.5s、INP < 200ms、CLS < 0.1。
- 地图和 Activity API 在验收数据规模下 p95 < 400ms。
- 不含外部上传的普通写命令 p95 < 300ms。
- 核心 SQL 有索引与 `EXPLAIN` 证据，禁止 N+1。
- 地图只执行视口查询和有上限的聚合，不发送全量历史。
- Socket 重连后按事件游标或 Query 版本补同步。

## 15. 测试与质量门禁

统一测试栈：

- Vitest：前端、后端和共享包单元与模块测试。
- Supertest：Express REST 集成测试。
- Testcontainers：真实 PostgreSQL + PostGIS 集成测试。
- Socket.IO Client：真实实时协议测试。
- Playwright：Web/PWA、响应式和关键跨模块流程。
- dependency-cruiser + ESLint：模块边界和禁止依赖。
- fast-check：隐私策略、游标和状态机属性测试。

Testcontainers 是 CI 的真实数据库基线；本地开发提供等价的 Docker Compose 数据库命令，不要求开发者手工安装或维护共享数据库。

测试层次：

1. Domain tests：值对象、策略、关系和状态机。
2. Contract tests：Zod、OpenAPI、生成客户端和 Socket schema。
3. Repository integration：migration、事务、空间查询、约束、索引和并发。
4. Module integration：REST/Socket 到 application、Outbox 和错误映射。
5. End-to-end：身份、发布、发现、互动、关系、消息、屏蔽、记忆和审核。
6. Visual/accessibility：四视口、Natural City、键盘、焦点、安全区、离线和 reduced-motion。

质量门禁：

- 隐私、身份、屏蔽和权限策略分支覆盖率 100%。
- Domain 行覆盖率至少 90%。
- 仓库整体行覆盖率至少 80%，不得用无意义测试追数字。
- lint、format、typecheck 零错误零警告。
- 禁止循环依赖和未声明跨域导入。
- migration 必须能从空库完整执行。
- 核心 SQL 具备索引测试或 `EXPLAIN` 预算。
- production build、PWA、Service Worker 和 Capacitor sync 必须通过。
- 未处置的高危依赖漏洞阻止合并。

CI 顺序：

```text
install
-> format / lint / architecture
-> typecheck
-> unit / property
-> PostGIS integration
-> REST / Socket contracts
-> production build
-> Playwright
-> security audit
```

## 16. 八阶段重建

### Phase 1：工程地基

建立 workspaces、严格 TypeScript、统一质量工具、PostGIS、migration、seed、CI、配置、错误模型和 Natural City 基础 UI。

退出条件：空应用可构建、部署、连接 PostGIS，并通过全部基础门禁。

### Phase 2：身份与应用壳层

建立 Session、设备、角色、App Shell、路由、深链和身份流程。

退出条件：Web/PWA/Capacitor 身份流程完整，权限测试通过。

### Phase 3：发布与地图核心

建立 Geography、Media、Footprints、PostGIS 地图查询、统一详情、Outbox 与 Socket 发布链路。

退出条件：用户可从地图可靠发布，并在允许的客户端实时看到足迹。

### Phase 4：发现与公共互动

建立 Activity、区域 fallback、24 小时发现、反应、两级评论和举报。

退出条件：发现、详情和互动形成闭环，不存在重复详情实现。

### Phase 5：关系与消息

建立好友、屏蔽、问候、解锁会话、未读、输入状态和重连同步。

退出条件：双客户端实时测试和屏蔽全域隔离通过。

### Phase 6：记忆、通知与管理

建立个人地图、时间线、照片、访客、通知、Push、设置、反馈和 `/admin`。

退出条件：主循环完整延伸到长期记忆和治理。

### Phase 7：产品硬化

完成 PWA、Capacitor、离线、可访问性、性能、安全、故障注入和发布 smoke。

退出条件：全部 CI、E2E、性能、安全和可访问性门禁通过。

### Phase 8：最终切换与删除

删除 V1、MongoDB、旧 package-lock、旧契约、兼容层、回填脚本和失真文档；更新部署、环境模板和架构说明。

退出条件：仓库中不存在 V1 运行路径，空数据库可通过 migration + seed 启动完整 Bliver。

## 17. 企业级成立条件

本设计足以形成企业级可演进项目，但只有在以下条件持续成立时才算真正达到目标：

- 模块所有权和依赖规则由 CI 强制，而不是只写在文档中。
- 数据 migration、备份和恢复演练可重复执行。
- 发布使用不可变 SHA，具备健康检查、readiness、回滚点和变更记录。
- 隐私、身份、屏蔽和权限策略不能被 transport 或 UI 绕过。
- Outbox、Socket、数据库和外部供应商具备可观测指标和告警。
- 性能预算建立在可重复数据集和测试环境上。
- 事故有 runbook、负责人、分级和复盘机制。
- 架构例外必须有原因、负责人和到期日。

这是一套 enterprise-ready 架构，不声称第一天就拥有大型企业的多区域高可用、合规认证或无限容量。

## 18. 扩展触发器

初始部署保持一个 API/Socket 单元。只有出现可测量需求时才增加基础设施：

- 当 API 需要两个以上实例时，引入 Socket.IO Redis adapter 或等价共享广播层，并验证粘性会话和重连。
- Outbox 从第一天使用 `FOR UPDATE SKIP LOCKED` 或等价租约，确保未来多 worker 安全。
- 当异步任务量、重试隔离或延迟目标超出 Postgres Outbox 能力时，再引入 Redis Streams、BullMQ 或专用消息系统。
- 当某个领域具备独立团队、独立扩缩容和独立故障边界，并且事件契约稳定时，才考虑拆服务。
- 当 Postgres 读取容量或查询隔离成为实际瓶颈时，再增加只读副本、搜索引擎或独立读取存储。
- 当媒体处理超出 Cloudinary 能力或成本边界时，再替换 Media adapter。

任何扩展都需要容量数据、故障模型、迁移计划和回滚方案，不以“更像大厂”为理由。

## 19. 发布与运维

V2 首次上线前允许破坏性 migration，因为没有生产数据。首次上线后切换为 expand/contract migration 纪律。

上线前必须具备：

- PostgreSQL 自动备份和加密存储。
- 在非生产环境完成一次恢复演练。
- 数据库、Cloudinary、Session、Push 和地图供应商的配置清单。
- 部署、回滚、数据库恢复、Outbox 堆积、Socket 故障和外部供应商失败 runbook。
- 开发、测试、候选和生产环境隔离。
- 秘密轮换流程和最小权限账号。

## 20. 风险与缓解

### 20.1 V1 与 V2 长期并存

风险：团队继续向 V1 增加功能，V2 永远无法切换。
缓解：V1 冻结；任何新能力只进入当前迁移中的 V2 领域；每阶段有硬退出条件。

### 20.2 过度抽象

风险：为“企业级”创建大量空接口、共享包和通用平台。
缓解：只有跨模块边界或真实可替换基础设施使用 port；模块内部简单逻辑保持直接。

### 20.3 隐藏业务规则丢失

风险：旧实现包含文档未记录的权限、实时或边缘行为。
缓解：按领域审阅旧测试、路由、服务和 Socket handler；先写 V2 行为测试，再实现和删除旧代码。

### 20.4 数据库切换扩大范围

风险：PostGIS、事务、ORM 和 migration 同时引入。
缓解：Phase 1 先建立数据库测试地基；Phase 3 只迁移足迹核心；没有 Mongo/Postgres 双写。

### 20.5 质量门禁拖慢早期速度

风险：一次性建立过多工具阻塞功能。
缓解：Phase 1 只建立能阻止边界退化的最小门禁；性能和完整 E2E 在对应阶段逐步加入。

## 21. 最终完成标准

只有同时满足以下条件，才能称为 Bliver V2 重建完成：

- 主循环从地图发现、互动、关系、消息到长期记忆完整可用。
- 所有产品表面使用统一路由、契约、隐私策略和 Natural City 设计系统。
- 仓库中不存在 V1 运行路径、JavaScript 业务文件、MongoDB 依赖、旧 API、旧 Socket 事件或无归属模块。
- 从空 PostgreSQL 数据库可执行 migration 和 deterministic seed。
- Web/PWA、Capacitor、API、Socket、Outbox 和外部服务降级均通过测试。
- lint、format、typecheck、architecture、unit、integration、contract、build、E2E 和 audit 全部通过。
- 性能、安全、可访问性、可观测性、备份恢复和发布 runbook 达到本设计门禁。
- 根目录文档、环境模板、CI 和 Render 配置准确描述实际系统。

## 22. 非目标

- 首次上线前不拆微服务。
- 不引入 Kubernetes、service mesh、Kafka 或多区域架构。
- 不迁移 MongoDB 开发垃圾数据。
- 不兼容 V1 客户端、V1 REST 或 V1 Socket 契约。
- 不在总设计阶段决定每个页面的像素级布局。
- 不把八个阶段塞入一个实施计划。

## 23. 后续规划边界

本文是总体架构宪章。每个 Phase 在开始前必须拥有独立、聚焦的设计或范围确认以及实施计划。

用户书面复核本文后，下一步只为 Phase 1“工程地基”编写详细实施计划。Phase 2 至 Phase 8 不在该计划中提前排成不可调整的任务清单。
