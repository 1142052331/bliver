# Bliver — Agentic Full-Stack Map Social App

> **Bliver · 智能体驱动的全栈地图社交应用**

**🌍 Online Demo / 在线体验**: [https://bliver.onrender.com](https://bliver.onrender.com)

**Stack / 技术栈**: React 18 · Zustand · React Query · Socket.IO · MongoDB · MCP · Vite · Tailwind CSS · Leaflet

---

## Overview / 项目概述

Bliver is a mobile-first, map-centric social web app where users check in at real-world locations, leave mood emojis, photos, and messages, and see their friends' footprints in real time. It supports guest browsing, JWT-based authentication, reactions & comments, WebSocket private messaging, online presence broadcasting, and an admin dashboard.

> Bliver 是一款面向移动端深度优化的地图社交 Web 应用。用户可以在真实地理位置打卡，留下心情 emoji、照片和留言，并实时查看好友的足迹。支持游客浏览、JWT 鉴权登录、表态与评论、WebSocket 私信、在线状态广播，以及管理员后台。

The entire development workflow is **agentic** — Claude Code operates as the primary engineering agent, reading project context from `CLAUDE.md`, manipulating the codebase, validating data via MCP, and tailing production logs, all within a unified terminal session.

> 整个开发流程是**智能体驱动**的——Claude Code 作为主力工程 Agent，通过读取 `CLAUDE.md` 获取项目上下文、操作代码库、通过 MCP 协议直连线上数据库验证数据，并在终端内直接拉取生产日志进行排障。

---

## Core Architecture & Agentic Workflow / 核心架构与智能体工作流

### 1. Context Control via CLAUDE.md — The Architecture Constitution / 上下文宪法

[`CLAUDE.md`](./CLAUDE.md) acts as the single source of architectural truth ingested by the agent on every session. It encodes the mobile-first dark glassmorphism UI constraints as **non-negotiable red lines**, ensuring that logic-layer refactors (state management, data fetching, security) never leak CSS class mutations or DOM restructures into the diff. This separation of concerns is enforced by convention — the agent reads the constitution before every operation.

> [`CLAUDE.md`](./CLAUDE.md) 是 Agent 每次会话加载的架构宪法文件。它明确划定了移动端深色毛玻璃 UI 的**不可逾越红线**，确保所有逻辑层重构（状态管理、数据获取、安全修复）不会将 CSS 类名变更或 DOM 结构改动泄露到 diff 中。Agent 在每次操作前都会读取这份宪法，从源头将关注点隔离。

**Impact / 成效**: 3 major state-layer refactors (Zustand, React Query, GlobalToaster) delivered across 4 commits with **zero unintended CSS churn**.
> 3 次重大状态层重构（Zustand、React Query、GlobalToaster），跨越 4 次提交，**零意外 CSS 变更**。

### 2. Three-Tier State Management — Separation of Concerns / 三权分立状态管理

| Tier / 层 | Library / 库 | Scope / 职责 |
|-----------|-------------|--------------|
| **UI Transient** / UI 瞬态 | Zustand (`useUIStore`) | Modal/drawer toggles, map interaction state, floating notification queue (6 types: `online`, `offline`, `reaction`, `comment`, `message`, `announcement`) / 弹窗抽屉开关、地图交互状态、全局浮动通知队列（6 种类型） |
| **Server Cache** / 服务端缓存 | React Query (`@tanstack/react-query`) | Footprints API with 5-minute `staleTime`, automatic refetch on visibility change, cache invalidation on mutations / 足迹 API 5 分钟缓存、页面可见性变化时自动重取、变更后缓存失效 |
| **Real-Time** / 实时推送 | Socket.IO + Query Cache | `footprint:new/updated/deleted` events write directly into React Query cache via `queryClient.setQueryData()` for optimistic local updates without refetch / Socket 事件通过 `queryClient.setQueryData()` 直接写入 React Query 缓存，实现乐观更新、无需重取 |

**Result / 成果**: App.jsx reduced from 30+ `useState` declarations to 1 core identity state + Zustand selectors + React Query hooks. NavBar props dropped from 15 to 7; MobileActionDrawer from 11 to 5.
> App.jsx 从 30+ 个 `useState` 精简为 1 个核心身份状态 + Zustand 选择器 + React Query Hooks。NavBar 传参从 15 个降至 7 个；MobileActionDrawer 从 11 个降至 5 个。

### 3. MCP-Powered Closed-Loop DevOps / 基于 MCP 的跨端闭环 DevOps

Two standalone Node.js MCP servers grant Claude Code direct operational access to the production stack:

> 两个独立的 Node.js MCP 服务赋予 Claude Code 直接访问生产环境的运维能力：

| MCP Server / MCP 服务 | Capability / 能力 | Tool / 工具 |
|-----------------------|-------------------|-------------|
| `bliver-db` | Read-only MongoDB queries across 7 collections / 跨 7 个集合的只读 MongoDB 查询 | `query_bliver_db` — supports filter, sort, and capped limits / 支持筛选、排序、封顶返回数 |
| `render-logs` | Render API log tailing / Render API 日志拉取 | `fetch_render_logs` — streams recent log lines with level labels / 流式返回带级别标签的日志行 |

**Security incident fixed / 安全漏洞修复案例**: Rendering logs revealed that `force_single_session` was only triggered on manual login, not auto-login. The agent traced the vulnerability, then moved session enforcement from the frontend `kickExistingRef` flag to a server-side automatic check in the Socket.IO `connection` handler — every new socket for a `userId` now forcibly disconnects existing sockets regardless of login path. The fix was validated by tailing production logs post-deploy.

> 通过拉取 Render 日志发现：`force_single_session`（单设备互斥逻辑）仅在手动登录时触发，自动登录（使用本地 Token）绕过了该机制，导致同账号多设备并发。Agent 追溯漏洞根因后，将互斥逻辑从前端 `kickExistingRef` 标志位下沉到服务端 Socket.IO `connection` 处理器中进行自动拦截——现在无论何种登录方式，只要同一 `userId` 建立新连接，旧连接立即被强制踢出。修复后通过 MCP 验证了部署日志。

---

## Project Structure / 项目结构

```
Bliver/
├── CLAUDE.md                          # Agent constitution (read every session) / Agent 架构宪法（每次会话加载）
├── .mcp.json                          # MCP server registry (gitignored — contains secrets) / MCP 服务注册表（含密钥，已 gitignore）
├── frontend/
│   └── src/
│       ├── App.jsx                    # Root: wires Zustand + React Query + Socket / 根组件：串联 Zustand + React Query + Socket
│       ├── main.jsx                   # Entry: QueryClientProvider + BrowserRouter / 入口：QueryClientProvider + BrowserRouter
│       ├── api.js                     # Axios instance with JWT interceptor / Axios 实例，自动注入 JWT
│       ├── store/
│       │   └── useUIStore.js          # Zustand: UI toggles + notification queue / Zustand：UI 开关 + 通知队列
│       ├── hooks/
│       │   ├── useSocket.js           # Socket.IO lifecycle + event → cache bridge / Socket.IO 生命周期 + 事件到缓存桥接
│       │   ├── useFootprints.js       # React Query: GET /api/footprints/today / React Query：获取足迹列表
│       │   └── useFriends.js          # Friend list + presence state / 好友列表 + 在线状态
│       └── components/
│           ├── GlobalToaster.jsx      # Floating notification stack (click-to-dismiss) / 浮动通知堆栈（点击即关闭）
│           ├── NavBar.jsx             # Desktop top bar / 桌面端顶栏
│           ├── MobileActionDrawer.jsx # Mobile FAB menu / 移动端悬浮菜单
│           ├── ClusterMarkers.jsx     # Leaflet MarkerCluster layer / Leaflet 聚合标记图层
│           ├── TimelineDrawer.jsx     # Today's footprints sidebar / 今日足迹侧边栏
│           ├── ProfileDrawer.jsx      # User profile slide-out / 个人主页抽屉
│           ├── ChatWindow.jsx         # WebSocket private messaging / WebSocket 私信窗口
│           └── ...                    # Auth, Admin, Notifications, etc. / 登录注册、后台管理、通知面板等
├── backend/
│   ├── index.js                       # Express + HTTP + Socket.IO entry / Express + HTTP + Socket.IO 入口
│   ├── middleware/
│   │   ├── auth.js                    # JWT verification + admin guard / JWT 验证 + 管理员守卫
│   │   └── upload.js                  # Multer → Cloudinary pipeline / Multer → Cloudinary 图片上传管线
│   ├── models/                        # Mongoose: User, Footprint, Notification, Message, Friendship / Mongoose 数据模型
│   ├── routes/
│   │   ├── api.js                     # Auth, footprints CRUD, reactions, comments, profiles / 认证、足迹 CRUD、表态、评论、个人主页
│   │   └── admin.js                   # User management, kick, online list / 用户管理、踢人、在线名单
│   └── socket/
│       └── index.js                   # Socket.IO: auth middleware, single-session enforcement, messaging / Socket.IO 鉴权中间件、单点登录互斥、私信
└── bliver-mcp-server/                 # MCP servers (MongoDB + Render logs) / MCP 服务（MongoDB + Render 日志）
    ├── index.js                       # query_bliver_db tool / 数据库查询工具
    └── render-mcp.js                  # fetch_render_logs tool / 日志拉取工具
```

## API Routes / 路由表

### Auth / 认证 `/api/auth`

| Method / 方法 | Path / 路径 | Auth / 鉴权 | Description / 说明 |
|--------------|------------|------------|-------------------|
| POST | `/auth/register` | upload | Register (optional avatar), returns JWT / 注册（可选头像），返回 JWT |
| POST | `/auth/login` | — | Login, auto-promotes "阿森" to admin / 登录，自动提升"阿森"为管理员 |
| GET | `/auth/me` | JWT | Validate token, return current user / 验证 Token，返回当前用户 |

### Footprints / 足迹 `/api/footprints` + `/api/checkin`

| Method / 方法 | Path / 路径 | Auth / 鉴权 | Description / 说明 |
|--------------|------------|------------|-------------------|
| GET | `/footprints/today?period=` | — | Today's / week's footprints / 今日 / 本周足迹 |
| POST | `/checkin` | JWT + upload | Create a check-in (mood, photo, message) / 创建打卡（心情、照片、留言） |
| POST | `/footprints/:id/react` | JWT | Toggle emoji reaction / 切换表情表态 |
| POST | `/footprints/:id/comment` | JWT | Add comment (username from token) / 添加评论（用户名取自 Token） |
| DELETE | `/footprints/:id` | JWT + Admin | Delete footprint / 删除足迹 |

### Notifications / 通知 `/api/notifications`

| Method / 方法 | Path / 路径 | Auth / 鉴权 | Description / 说明 |
|--------------|------------|------------|-------------------|
| GET | `/notifications` | JWT | Last 50 notifications / 最近 50 条通知 |
| PUT | `/notifications/:id/read` | JWT | Mark as read / 标记已读 |

### Admin / 管理员 `/api/admin` (JWT + Admin)

| Method / 方法 | Path / 路径 | Description / 说明 |
|--------------|------------|--------------------|
| GET | `/admin/online` | Current online users with IP / 当前在线用户（含 IP） |
| GET | `/admin/users` | All registered users with footprint counts / 所有注册用户（含足迹计数） |
| PUT | `/admin/users/:id` | Edit username/password / 修改用户名密码 |
| DELETE | `/admin/users/:id` | Delete user + footprints + notifications / 删除用户及关联足迹和通知 |
| POST | `/admin/kick/:userId` | Force logout via Socket.IO / 通过 Socket.IO 强制踢出 |

## Local Development / 本地开发

```bash
cd Bliver
npm run dev           # Frontend (:5173) + Backend (:5000) / 前端 + 后端
npm run dev:frontend  # Frontend only / 仅前端
npm run dev:backend   # Backend only / 仅后端
```

## Environment Variables / 环境变量（Backend）

```
MONGODB_URI        — MongoDB Atlas connection string / MongoDB Atlas 连接串
CLOUDINARY_*       — Cloudinary cloud name, API key, secret / Cloudinary 云存储凭证
OPENWEATHERMAP_API_KEY
JWT_SECRET
PORT=5000
```

## Git Workflow / Git 工作流

- Branch / 分支: `main`
- Remote / 远程: `https://github.com/1142052331/bliver.git`
- Render auto-deploys on push to `main` / Render 在推送至 main 时自动部署
- Commit messages in English, authored by Bliver / 提交信息使用英文，用户名为 Bliver
