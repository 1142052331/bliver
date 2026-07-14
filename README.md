# Bliver — 地图朋友圈

> **在地图上留下你的足迹，和朋友分享每一个瞬间**

**在线体验**: [https://bliver.onrender.com](https://bliver.onrender.com)

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react) ![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite) ![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss) ![Leaflet](https://img.shields.io/badge/Leaflet-1.9-199900?logo=leaflet) ![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101?logo=socket.io) ![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?logo=mongodb) ![Express](https://img.shields.io/badge/Express-4-000000?logo=express)

---

## 项目简介

Bliver 是一款移动端优先的地图社交应用。用户在真实地理位置打卡，留下心情 emoji、照片和留言，实时查看好友的足迹动态。

**核心功能：**
- **地图打卡** — 在任意位置留下足迹，支持照片、心情、留言
- **实时足迹** — 好友的打卡动态实时推送到地图上
- **好友系统** — 添加好友、查看在线状态、私信聊天
- **iOS 风格 UI** — 深色毛玻璃设计，流畅的动画和手势交互
- **游客模式** — 无需登录即可浏览地图，互动操作需登录
- **管理员后台** — 用户管理、踢人、数据维护

---

## 快速开始

### 环境要求

- Node.js 24.16.0 (the checked-in `.nvmrc`; supported range `>=24 <25`)
- npm 11.13.0
- Windows PowerShell users: if the execution policy blocks `npm.ps1`, use `npm.cmd` instead, for example `npm.cmd install` or `npm.cmd run dev`.
- MongoDB (本地或 Atlas)
- Cloudinary 账号（图片存储）

### 安装与启动

```bash
# 克隆项目
git clone https://github.com/1142052331/bliver.git
cd bliver

# 安装依赖
npm install

# 配置环境变量（见下方说明）
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
# 编辑 backend/.env 填入你的配置

# 启动开发服务器
npm run dev          # 前端(:5173) + 后端(:5000)
npm run dev:frontend # 仅前端
npm run dev:backend  # 仅后端
```

### 环境变量

在 `backend/.env` 中配置：

```env
MONGODB_URI=mongodb+srv://...          # MongoDB 连接串
CLOUDINARY_CLOUD_NAME=your_cloud       # Cloudinary 云名称
CLOUDINARY_API_KEY=your_key            # Cloudinary API Key
CLOUDINARY_API_SECRET=your_secret      # Cloudinary API Secret
OPENWEATHERMAP_API_KEY=your_key        # OpenWeatherMap API Key（天气功能）
JWT_SECRET=your_jwt_secret             # JWT 签名密钥
PORT=5000                              # 后端端口
```

The browser uses the current origin for both `/api` and Socket.IO by default. `VITE_API_URL` and
`VITE_SOCKET_URL` are optional and should only be injected by the deployment environment for a
split-origin deployment. Keep all real environment values out of tracked `.env` files.

### Release build

```bash
npm run check:node
npm run render-build
test -f frontend/dist/index.html
```

`render-build` performs lockfile-based production installs and builds the frontend from the repo root.

Release operations use an immutable candidate SHA:

- [Eight-phase release runbook](docs/release/eight-phase-release-runbook.md)
- [Release acceptance checklist](docs/qa/eight-phase-release-checklist.md)
- [Profile and memories checklist](docs/qa/profile-memories-checklist.md)
- [Legacy hardening checklist](docs/qa/legacy-hardening-checklist.md)

---

## 项目结构

```
Bliver/
├── CLAUDE.md                    # AI 开发宪法（每次会话加载）
├── frontend/src/
│   ├── App.jsx                  # 根组件：状态中心、路由、Socket
│   ├── api.js                   # Axios 实例，自动注入 JWT
│   ├── store/useUIStore.ts      # Zustand：UI 状态管理
│   ├── hooks/                   # 自定义 Hooks
│   │   ├── useSocket.js         # Socket.IO 生命周期
│   │   ├── useFootprints.js     # React Query：足迹数据
│   │   └── useFriends.js        # 好友列表 + 在线状态
│   └── components/              # UI 组件（每个文件顶部有 @feature 注释）
│       ├── MapView.jsx          # 地图视图
│       ├── NavBar.jsx           # 顶部导航栏
│       ├── MobileActionDrawer.jsx # 移动端菜单
│       ├── CheckInModal.jsx     # 打卡弹窗
│       ├── ProfileDrawer.jsx    # 个人主页
│       ├── ChatWindow.jsx       # 聊天窗口
│       └── ...                  # 更多组件见下方清单
├── backend/
│   ├── index.js                 # Express + Socket.IO 入口
│   ├── models/                  # Mongoose 数据模型
│   ├── routes/                  # API 路由
│   ├── middleware/              # 认证 + 文件上传
│   └── socket/                  # Socket.IO 事件处理
└── bliver-mcp-server/           # MCP 服务（数据库查询 + 日志）
```

### 前端组件清单

每个组件文件顶部有 `// @feature` 注释，用于 AI 快速定位功能：

| 组件 | 功能 |
|------|------|
| `MapView.jsx` | 地图视图 |
| `NavBar.jsx` | 顶部导航栏 |
| `MobileActionDrawer.jsx` | 移动端菜单面板 |
| `CheckInModal.jsx` | 打卡弹窗 |
| `ProfileDrawer.jsx` | 个人主页抽屉 |
| `TimelineDrawer.jsx` | 足迹时间线 |
| `FootprintDetailModal.jsx` | 打卡详情卡片 |
| `ClusterDetailPanel.jsx` | 集群详情面板 |
| `NotificationPanel.jsx` | 通知面板 |
| `FriendsPanel.jsx` | 好友面板 |
| `ChatWindow.jsx` | 聊天窗口 |
| `AdminPanel.jsx` | 管理员面板 |
| `PhotoWall.jsx` | 照片墙 |
| `AnnouncementPanel.jsx` | 公告面板 |
| `AboutModal.jsx` | 关于弹窗 |
| `AuthModal.jsx` | 登录注册弹窗 |
| `MessageIsland.jsx` | 消息浮岛 |
| `FootprintCardList.jsx` | 足迹卡片列表 |

---

## API 文档

### 认证 `/api/auth`

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/auth/register` | 上传 | 注册（可选头像），返回 JWT |
| POST | `/auth/login` | — | 登录，自动提升"阿森"为管理员 |
| GET | `/auth/me` | JWT | 验证 Token，返回当前用户 |

### 足迹 `/api/footprints` + `/api/checkin`

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/footprints/today?period=` | — | 获取今日/本周足迹 |
| POST | `/checkin` | JWT + 上传 | 创建打卡（心情、照片、留言） |
| POST | `/footprints/:id/react` | JWT | 切换表情表态 |
| POST | `/footprints/:id/comment` | JWT | 添加评论 |
| DELETE | `/footprints/:id` | JWT + 管理员 | 删除足迹 |

### 通知 `/api/notifications`

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/notifications` | JWT | 最近 50 条通知 |
| PUT | `/notifications/:id/read` | JWT | 标记已读 |

### 管理员 `/api/admin`（JWT + 管理员）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/online` | 当前在线用户（含 IP） |
| GET | `/admin/users` | 所有注册用户（含足迹计数） |
| PUT | `/admin/users/:id` | 修改用户名密码 |
| DELETE | `/admin/users/:id` | 删除用户及关联数据 |
| POST | `/admin/kick/:userId` | 强制踢出用户 |

---

## 架构设计

### 三权分立状态管理

| 层级 | 库 | 职责 |
|------|-----|------|
| **UI 瞬态** | Zustand | 弹窗/抽屉开关、地图交互状态、通知队列 |
| **服务端缓存** | React Query | 足迹 API 5 分钟缓存、自动重取、变更失效 |
| **实时推送** | Socket.IO | 足迹/通知/消息事件直接写入 React Query 缓存 |

### 实时通信

Socket.IO 事件通过 `queryClient.setQueryData()` 直接写入 React Query 缓存，实现乐观更新，无需额外请求。支持的事件类型：
- `footprint:new/updated/deleted` — 足迹变更
- `notification:new` — 新通知
- `message:new` — 新私信
- `user:online/offline` — 在线状态

### 安全设计

- JWT 鉴权 + 自动刷新
- 后端从 Token 取用户名，不信任客户端传入值
- 管理员权限服务端验证
- 单设备互斥登录（Socket.IO 连接级）
- Cloudinary 图片上传（Multer + 服务端签名）

---

## AI 驱动开发

Bliver 的整个开发流程由 **Claude Code** 作为主力工程 Agent 驱动。

### CLAUDE.md — 架构宪法

[`CLAUDE.md`](./CLAUDE.md) 是 Agent 每次会话加载的架构宪法文件，包含：
- 项目结构和关键架构决策
- 移动端 UI 设计红线（不可逾越的约束）
- Token 优化规则（高效读取大文件）
- 功能定位规则（通过 `@feature` 注释快速搜索）

### MCP 集成

两个 MCP 服务赋予 Claude Code 直接访问生产环境的能力：

| 服务 | 能力 | 用途 |
|------|------|------|
| `bliver-db` | MongoDB 只读查询 | 验证数据、排查问题 |
| `render-logs` | Render 日志拉取 | 监控部署、排查错误 |

### 智能体工作流

1. **上下文加载** — Agent 读取 CLAUDE.md 获取项目架构
2. **功能定位** — 通过 `@feature` 注释快速找到目标组件
3. **代码修改** — 遵循架构约束进行修改
4. **数据验证** — 通过 MCP 查询数据库验证结果
5. **日志监控** — 通过 MCP 拉取生产日志确认部署

---

## 部署

### Render（推荐）

1. Fork 本仓库
2. 在 Render 创建 Web Service
3. 连接 GitHub 仓库
4. 配置环境变量
5. 自动部署（推送到 `main` 分支触发）

### 环境变量（生产环境）

```
MONGODB_URI, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
CLOUDINARY_API_SECRET, OPENWEATHERMAP_API_KEY, JWT_SECRET, PORT=5000
```

---

## Git 工作流

- **分支**: `main`
- **远程**: `https://github.com/1142052331/bliver.git`
- **部署**: 推送到 `main` 自动触发 Render 部署
- **提交规范**: 英文提交信息，用户名 Bliver

---

## 许可证

MIT License

---

## V2 foundation (canonical architecture)

The active implementation is the V2 npm workspaces monorepo. The release toolchain is Node.js 24
(`>=24 <25`) and npm 11. The new runtime is split into `apps/web` (React/Vite) and `apps/api`
(Express 5), with shared `packages/contracts`, `packages/domain`, `packages/ui`, `packages/config`,
and `packages/testing` packages.

V2 uses PostgreSQL with PostGIS as its single source of truth and Drizzle for repeatable migrations.
Run `npm run db:v2:up`, `npm run db:v2:migrate`, and `npm run db:v2:seed` for local database setup.
Use `npm run verify:v2-foundation` for the deterministic architecture, lint, typecheck, test, and
build gate; `npm run smoke:v2` checks an already-running API.

The existing `frontend/` and `backend/` trees are frozen V1 reference/runtime code during migration.
They remain runnable through the original V1 scripts and are removed only in Phase 8 after V2 acceptance.
