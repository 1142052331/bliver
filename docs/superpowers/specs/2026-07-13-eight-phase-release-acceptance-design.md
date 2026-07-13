# Bliver 八阶段发布验收设计

日期：2026-07-13  
状态：已批准执行  
目标分支：`codex/map-home-redesign`  
生产目标：`https://bliver.onrender.com`

## 目标

把已完成的八阶段重构作为一个固定提交候选发布到隔离的 Render 候选环境，完成自动化、认证态、实时通信、响应式和数据回填演练后，将同一提交发布到生产。生产发布采用一次性测试账号金丝雀和可暂停、可续跑的分批地理回填；任何权限、隐私、健康、数据或错误率门禁失败都停止晋级。

本轮同时修复当前审计确认的发布阻断：用户名“阿森”可触发管理员提权、运行时仍锁定已结束维护的 Node 20、Render 构建与环境契约不可复现、健康端点无法证明部署版本或数据库就绪，以及 Phase 7/8 和认证态/Socket/多视口缺少最终验收证据。

## 发布拓扑

发布单元是一个不可变的 Git 提交 SHA，而不是可移动分支名。

1. 本地和 GitHub CI 在 Node 24 上验证候选 SHA。
2. Render Candidate 从候选分支构建该 SHA，使用独立服务和独立 MongoDB 数据库。
3. 候选环境完成 HTTP、认证、权限、Socket、上传、管理员、响应式和回填演练。
4. 生产数据库完成可恢复备份并记录只读基线。
5. Render Production 部署同一 SHA；`/healthz` 和 `/readyz` 必须返回该 SHA。
6. 一次性生产账号执行受控写入金丝雀，随后删除或停用测试数据。
7. 地理回填从小批次开始，使用游标续跑；每批检查计数、错误和延迟后才启动下一批。
8. 观察窗口通过后签署上线；候选服务保留到观察结束，随后关闭。

候选环境不得连接生产数据库。production-mode 的本地预览也不得因跟踪的前端环境文件自动写入生产。

## 身份与管理员安全

用户名只用于显示和兼容“阿森”品牌身份，不再授予任何权限。

- 注册、个人资料改名和管理员代改名都不得让其他账号取得保留名“阿森”。现有受控“阿森”账号可以保留原名。
- 受控创作者账号使用唯一、不可变的 `systemIdentity` 标记承载品牌好友/广播行为；即使展示名变化也不丢失身份，其他账号不能取得该标记。管理员能力仍只由数据库 `role` 决定。
- 登录和 `/auth/me` 不再按用户名自动修改角色。
- JWT 携带 `sessionVersion`，HTTP `auth`、`optionalAuth` 和 `admin` 中间件以数据库中的当前账号、角色和会话版本为准；删除账号、降权、改密码或撤销会话后，旧 JWT 不得继续提供旧身份或管理员权限。
- Socket 握手除验证 JWT 外还必须确认账号存在，并绑定数据库中的当前身份。被删除账号的旧 Token 不得建立连接。
- 公告发布、评论管理、好友/消息特殊权限和其他服务端授权必须使用数据库角色；对“阿森”的品牌展示可以继续使用保留名。
- `/api/admin/setup` 是一次性引导：仅当数据库尚无管理员时可用，必须提供 `ADMIN_SETUP_SECRET`，成功后原子提升当前账号、递增 `sessionVersion` 并签发新 Token；再次调用返回冲突。生产中必须设置强随机 secret，完成引导后可以从环境中移除。
- 密钥比较使用恒定时间比较；日志、健康端点和响应不得回显 secret。
- 浏览器不得把原始密码或可逆编码的密码写入 localStorage/sessionStorage。登录持久化只保存服务端签发的会话 Token 和最小用户快照；关闭“记住登录”或退出时清理旧 `bliver_cred` 遗留值。

生产发布前必须只读确认：保留名最多对应一个账号；该账号若存在则角色为 `admin`。若生产尚无管理员，先在旧版本仍在线时确认受控账号，或在候选版本通过一次性 setup 完成引导。

## Node 24 与可复现部署

Node 24 是唯一发布基线，Node 20 只保留为历史证据。

- `.nvmrc`、根/前端/后端 `engines`、`check:node`、GitHub Actions 和 Render `NODE_VERSION` 统一到 Node 24。
- Render build 使用锁文件和 `npm ci`。前端构建明确包含 devDependencies，避免 `NODE_ENV=production` 导致 Vite 被省略。
- Render start 使用 `npm start`，运行时明确 `NODE_ENV=production`。
- 仓库加入 `render.yaml`，声明候选服务的 build、start、health、runtime 和非秘密环境契约；秘密使用 `sync: false`，不得提交值。
- 前端 API 和 Socket 在 Render 上默认同源。候选构建通过候选域名访问自身后端，不能由跟踪的 `.env.production` 固定指向生产。
- 所有实际读取的环境变量在示例和发布文档中标明 required、optional 或 feature-disabled 行为。

构建保留当前非阻断的大 chunk 和 `browser-image-compression` mixed import 警告，但记录为发布后性能任务；它们不覆盖安全、正确性或可用性失败。当前 ESLint 错误和依赖 high 漏洞不是既有警告豁免，必须在候选构建前处置。

## 健康、版本与可观测性

- `GET /healthz` 是 liveness，返回 `status`, `uptime`, `release` 和有界请求聚合，不访问用户数据。
- `GET /readyz` 是 readiness，只有进程可服务、MongoDB 为 connected 状态且静态前端入口存在时返回 `200`；否则返回 `503`。
- `release` 优先读取 Render 提供的提交 SHA，回退到显式 `RELEASE_SHA`，本地未知时为 `local`。
- 健康与就绪响应必须为 `application/json`。SPA HTML 的 `200` 不能算通过。
- 所有响应继续携带 `X-Request-Id`；生产 500 响应只返回通用文案。
- 发布 smoke 验证根页面资产、`/healthz`、`/readyz`、游客 Activity、未认证保护、Socket.IO polling/连接以及候选 SHA 一致性。

## 候选环境验收

候选数据库从空库开始，用一次性账号生成最小但完整的数据集：管理员、普通用户 A、普通用户 B、好友关系、三种可见性和两种位置精度的足迹、评论/回复/反应、陌生人问候、屏蔽、举报和公告。测试数据不复制生产隐私内容。

自动化门禁：

- Node 24 运行时检查。
- 后端 Jest 全套；发现窗口并发用例连续运行三次，排除索引初始化抖动。
- 前端 Vitest 全套、TypeScript typecheck、production build。
- 前端 ESLint 返回零错误。测试、service worker 和浏览器 globals 通过作用域配置声明；不得通过全局关闭 hooks 或 correctness 规则来制造通过。
- 根、后端和前端依赖审计不得包含未处置的 critical/high 漏洞。升级不能消除的项必须证明不进入生产运行路径，并在最终 QA 中记录 advisory、影响、负责人和复查日期。
- `git diff --check`、依赖锁文件一致性和 release smoke。
- 生产构建不得包含生产 API 固定地址或未授权的秘密。

浏览器和实时门禁：

- 360x800、390x844、430x932、1440x1000 四个视口。
- 游客与认证态覆盖 Map、Activity、Messages、Me、Check-in、详情、评论、举报、管理员、照片墙和公告。
- 检查 44px 目标、无横向溢出、安全区、键盘/焦点、reduced-motion、加载/空/失败/离线状态。
- 两个真实 Socket 客户端覆盖 online/offline、消息、单设备踢出、屏蔽后拒绝、缓存隔离和足迹事件。
- Cloudinary、Nominatim、地图瓦片和可选推送在配置/未配置两种状态下都必须有明确降级。

Phase 7、Phase 8 和最终总验收分别形成 QA 文档；旧阶段清单中的未执行认证态与浏览器项在最终总清单中补齐，不以旧截图代替当前 SHA 的证据。

## 回填与生产写入

地理回填继续使用现有 CLI 和状态机，不增加自动 deploy hook。无参数和 `--dry-run` 保持零写入；生产执行仍要求 `--execute --confirm-production BACKFILL_FOOTPRINT_GEOGRAPHY`。

候选环境先完成 dry-run、`limit 5` execute、游标续跑、重复运行幂等、失败重试和中断恢复。生产顺序：

1. 记录 eligible、pending、processing、complete、failed、dead 和 discovery window 基线。
2. dry-run 并保存 would-succeed/would-fail/invalid-coordinate 计数。
3. `limit 5-10` 执行首批，不带 `--retry-failed`。生产使用单 runner 串行执行且 `delay >= 1000ms`，遵守公共 Nominatim 限流；候选环境只有在 mock geocoder 下才可使用更短延迟。
4. 验证写入字段、可见性、Activity/Map、旧接口和下一游标。
5. 以 `limit 50-100` 续跑，每批单独记录 totals 和下一游标。
6. failed/dead 项先审查原因，再单独决定是否运行 `--retry-failed`。

回填不是通过反向更新来回滚。异常时停止启动下一批，保留 lease、cursor、runToken 和 complete 审计；只有数据库快照恢复才能回退已写数据。

## 停止与回滚

以下任一情况立即停止晋级或下一回填批次：权限/隐私越权；保留名提权；Socket 绕过屏蔽；health/readiness 非 JSON 或非 200；部署 SHA 不一致；Mongo 断连；5xx 超过 1% 或持续五分钟；回填冲突/dead 非预期；外部地理服务 429/失败激增；Map/Activity p95 超过基线两倍。

应用回滚使用 Render 上一个已验证提交。当前 Render 服务由 Express 同时托管前后端，因此只能把整个服务回滚到与已写数据向前兼容的提交，不能声称单独回滚前端；旧 `/api/footprints/today`、旧 Timeline 和既有详情入口在观察窗口内保留为功能降级路径。不得在无快照时尝试逆向回填。

## 上线完成标准

只有同时满足以下条件才称为“八阶段修改部署成功并上线”：

- P0/P1 发布阻断已修复并有回归测试。
- Node 24 的本地、CI 和 Render 候选门禁全部通过。
- 候选四视口、认证态、双客户端 Socket 和回填演练通过。
- 生产运行与就绪端点返回相同候选 SHA。
- 生产金丝雀写入和分批回填完成，无未解释 failed/dead/conflict。
- 生产观察窗口内错误率、延迟、Socket 和关键用户路径正常。
- 最终 QA 文档记录命令、计数、SHA、URL、已知非阻断警告和回滚点。

不以“构建成功”“HTTP 200”或“部署已触发”单独作为上线完成证据。
