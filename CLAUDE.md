# Bliver — 地图朋友圈

全栈位置分享社交应用。用户在地图上打卡，留下心情/照片/留言，实时看到朋友的足迹。

- **前端**: React 18 + Vite + Tailwind CSS + Leaflet (react-leaflet v4) + Socket.IO Client
- **后端**: Express + MongoDB (Mongoose) + Socket.IO v4 + JWT + Cloudinary
- **部署**: Render (backend), Vite 构建前端

## 项目结构

```
Bliver/
├── frontend/src/
│   ├── App.jsx              # 主应用：状态中心、路由、Socket、所有 handler
│   ├── api.js               # Axios 实例，自动注入 JWT
│   ├── auth.js              # localStorage 封装
│   └── components/          # UI 组件（NavBar, Modals, Drawers, Map 图层等）
├── backend/
│   ├── index.js             # Express + HTTP + Socket.IO 入口
│   ├── config/db.js         # Mongoose 连接
│   ├── middleware/          # auth.js (JWT+admin), upload.js (Multer+Cloudinary)
│   ├── models/             # User, Footprint, Notification
│   ├── routes/             # api.js (认证/足迹/评论/表态/通知/个人主页), admin.js
│   ├── services/           # nominatim.js (逆地理编码), weather.js
│   └── socket/             # Socket.IO 事件处理
```

## 关键架构决策

- **游客模式**: 地图对所有人可见，互动操作需登录（requireLogin() 拦截 → AuthModal）
- **抽屉式交互**: ProfileDrawer (右滑)、ClusterDetailPanel (底部)、TimelineDrawer (右侧)，非页面跳转
- **实时更新**: Socket 事件同时派发 `window.dispatchEvent(CustomEvent)`（前缀 `ws:`），供独立组件监听
- **管理员**: "阿森"自动提升为 admin，AdminPanel 提供用户管理/踢人功能
- **评论安全**: 后端从 `req.user.name` 取用户名，不信任客户端传入值

## 本地开发

```bash
npm run dev          # 前端(:5173) + 后端(:5000) 同时启动
npm run dev:frontend # 仅前端
npm run dev:backend  # 仅后端
```

## 环境变量（Render）

MONGODB_URI, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, OPENWEATHERMAP_API_KEY, JWT_SECRET, PORT=5000

## Token 优化规则

- 读取大文件（App.jsx 587行, ProfileDrawer.jsx 408行, api.js 376行）时只读取需要的行范围，不读整个文件
- 查找符号/函数优先用 Grep，定位到行号后再 Read 相关区间
- 路由表、数据模型等细节通过读取源文件获取，不需要记忆
- 独立功能完成后建议 /clear 开启新对话

## 定位功能文件

修改功能时，先用 Grep 搜索 `@feature.*关键词` 定位目标文件，不要逐文件阅读。每个组件文件顶部有 `// @feature 中文功能名 | English Name | ComponentName` 注释。

---

## Reasonix 优化规则（从 DeepSeek V4 移植）

### 引用强制 — 必须有据可查

每个关于本代码库的事实声明都必须有证据支持。

- **正面声明**（文件存在、函数做了 X、功能已实现）→ 附上文件路径和行号：`MCP 客户端支持 listResources (backend/routes/api.js:142)`
- **否定声明**（X 缺失、Y 未实现、没有 Z）→ 这是**最常见的幻觉形态**。写之前**必须先搜索**：
  - 先用 Grep 搜索相关符号或术语
  - 搜索有结果 → 你错了，纠正自己并引用结果
  - 搜索无结果 → 带着搜索证据声明缺失：`未找到 foo() 的调用方 (Grep "foo")`
  - **没有搜索就断言缺失 = 不诚实**

### 探索路由 — 选对工具

- **描述性查询**（"哪里处理 X"、"Y 怎么工作"）→ 先 Grep 搜索关键词，定位后 Read 相关区间
- **精确查询**（特定标识符、函数名、路由路径）→ 直接 Grep 精确匹配
- **文件发现**（"哪些文件是 .jsx"、"最近改了什么"）→ 用 Glob
- **结构概览**（目录树）→ 用 Agent(Explore) 子代理

如果 Grep 返回空结果，再换一种搜索方式。不要一开始就用子代理 — 直接工具调用更快更便宜。

### 编辑纪律

- **先读后改** — 编辑前必须先 Read 目标文件/行范围
- **精确匹配** — Edit 工具的 old_string 必须与文件内容逐字节匹配
- **一次一改** — 每个 Edit 一个逻辑变更，多处变更用多个 Edit
- **不改未读** — 没有读过的文件不要编辑
- **不改未问** — 用户没有要求修改的文件不要动

### 子代理派发规则

**默认不派发。** 直接工具调用（Grep、Read、Edit）更快、更便宜、证据留在上下文中可复用。

**仅在以下情况派发子代理：**
1. **真正的并行** — 有 2+ 个独立调查可以同时进行
2. **上下文爆炸** — 需要 10+ 次文件读取/搜索，且只需要结论

**反模式 — 不要派发的情况：**
- 单次 Grep / 单次 Read → 直接调用工具
- 1-3 个文件交叉引用 → 直接读取
- "为了保持上下文干净" → 不值得
- 需要用户交互的任务（子代理无法与用户对话）
- 需要跟踪中间结果的任务（规划、多步编辑）

### 风格

- 先展示代码变更，再解释为什么
- 探索时静默调用工具，不需要文字说明
- 一段简短的"为什么"说明 + 代码变更块
- 不要在每个回复末尾总结你做了什么

### 范围纪律

- 用户要求**运行/启动**某东西 → 只启动、验证启动成功、报告。不要顺便检查代码质量
- 用户要求**分析/阅读/探索** → 只用工具收集信息，回复文字。不要提议编辑
- 用户要求**修改/修复/添加** → 才进行编辑
- 发现明显问题 → 一句话提一下，等用户说"修"再修
