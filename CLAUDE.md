# Bliver — 地图朋友圈

## 项目概述

全栈位置分享社交应用。用户在地图上打卡（Check-in），留下心情、照片和留言，实时看到朋友的足迹。支持游客浏览、注册登录、表态/评论互动、个人主页抽屉、管理员后台。

- **前端**: React 18 + Vite + Tailwind CSS + Leaflet (react-leaflet v4) + Socket.IO Client
- **后端**: Express + MongoDB (Mongoose) + Socket.IO v4 + JWT + Cloudinary
- **部署**: Render (backend), 前端通过 Vite 构建

## 项目结构

```
Bliver/
├── frontend/src/
│   ├── App.jsx              # 主应用：状态中心、路由、Socket、所有 handler
│   ├── api.js               # Axios 实例，自动注入 JWT
│   ├── auth.js              # localStorage 封装 (saveAuth/getUser/clearAuth)
│   └── components/
│       ├── NavBar.jsx           # 顶栏：在线人数、铃铛通知、登录/注册/头像/后台管理
│       ├── AuthModal.jsx        # 登录/注册弹窗（支持全屏和叠加层两种模式）
│       ├── CheckInModal.jsx     # 打卡表单：GPS 定位、心情、照片、留言
│       ├── ClusterMarkers.jsx   # Leaflet MarkerCluster 聚合图层，自定义心情图标+浮动动画
│       ├── ClusterDetailPanel.jsx # 地图上点击图钉弹出的底部详情抽屉（留言/表态/分享）
│       ├── TimelineDrawer.jsx   # 右侧"今日记录"侧边栏，按用户分组展示
│       ├── ProfileDrawer.jsx    # 个人主页抽屉：Hero Banner + 错位头像 + 数据栏 + 足迹时间轴
│       ├── ProfilePage.jsx      # （已废弃）旧的独立路由个人主页，被 ProfileDrawer 替代
│       ├── NotificationPanel.jsx # 通知下拉面板
│       ├── ReactionPicker.jsx   # 表情表态选择器（❤️😂😮😢🙏👍）
│       ├── MapLayers.jsx        # 地图叠加层（晨昏线 Terminator、天气图层）
│       ├── FlyToFootprint.jsx   # 监听 activeFootprintId，flyTo 目标坐标后自动打开详情
│       ├── AdminPanel.jsx       # 管理员控制台：在线名单 + 用户管理表格（编辑/踢出/删除）
│       └── AdminPanel.jsx       # 管理员仪表盘
├── backend/
│   ├── index.js             # 入口：Express + HTTP + Socket.IO 服务
│   ├── config/db.js         # Mongoose 连接
│   ├── middleware/
│   │   ├── auth.js          # JWT 验证中间件 (auth) + 管理员中间件 (admin)
│   │   └── upload.js        # Multer + Cloudinary 图片上传
│   ├── models/
│   │   ├── User.js          # 用户模型
│   │   ├── Footprint.js     # 足迹模型
│   │   └── Notification.js  # 通知模型
│   ├── routes/
│   │   ├── api.js           # 主路由：认证、足迹 CRUD、评论、表态、个人主页、通知
│   │   └── admin.js         # 管理员路由：用户管理、在线名单、踢人
│   ├── services/
│   │   ├── nominatim.js     # OpenStreetMap 逆地理编码
│   │   └── weather.js       # OpenWeatherMap API
│   └── socket/
│       └── index.js         # Socket.IO 事件：user:online、disconnect、在线人数统计
```

## 路由表

### 认证 `/api/auth`
| 方法 | 路径 | 中间件 | 说明 |
|------|------|--------|------|
| POST | `/auth/register` | upload, cloudinary | 注册（可选头像），返回 JWT |
| POST | `/auth/login` | - | 登录，自动提升"阿森"为 admin |
| GET | `/auth/me` | auth | 验证 token，返回当前用户。同时自动提升"阿森" |

### 足迹 `/api/footprints` + `/api/checkin`
| 方法 | 路径 | 中间件 | 说明 |
|------|------|--------|------|
| GET | `/footprints/today` | - | 今日所有足迹（游客可用） |
| GET | `/footprints/:id` | - | 单条足迹详情（游客可用） |
| POST | `/checkin` | auth, upload, cloudinary | 打卡（需登录） |
| POST | `/footprints/:id/react` | auth | 切换表情表态（需登录） |
| POST | `/footprints/:id/comment` | auth | 添加评论，IP 记录，username 取自 req.user.name（需登录） |
| DELETE | `/footprints/:id` | auth, admin | 删除足迹（仅管理员） |

### 个人主页 `/api/users/:id`
| 方法 | 路径 | 中间件 | 说明 |
|------|------|--------|------|
| GET | `/users/:id/profile` | - | 用户信息+足迹+最近互动（游客可用） |
| POST | `/users/:id/profile/comment` | auth | 留言板留言（需登录） |
| POST | `/users/:id/profile/react` | auth | 个人主页表态（需登录） |

### 通知 `/api/notifications`
| 方法 | 路径 | 中间件 | 说明 |
|------|------|--------|------|
| GET | `/notifications` | auth | 当前用户最近 50 条通知 |
| PUT | `/notifications/:id/read` | auth | 标记已读 |

### 管理员 `/api/admin`（全部需要 auth + admin）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/online` | 当前在线用户列表（含 IP、连接时间） |
| GET | `/admin/users` | 所有注册用户（含足迹计数） |
| PUT | `/admin/users/:id` | 修改用户名/密码 |
| DELETE | `/admin/users/:id` | 删除用户+足迹+通知（不可删除 admin） |
| POST | `/admin/kick/:userId` | 强制踢出：emit force_logout → disconnect |

## MongoDB 数据模型

### User
```js
{
  name:          String,      // required, unique
  password:      String,      // required, bcrypt hashed
  avatarUrl:     String,      // default ''
  isOnline:      Boolean,     // default false (Socket.IO 管理)
  role:          String,      // enum: ['user', 'admin'], default 'user'
  profileComments: [{         // 留言板
    senderName:  String,
    content:     String,
    createdAt:   Date
  }],
  profileReactions: [{        // 个人主页表态
    senderId:    ObjectId (ref: User),
    emoji:       String
  }]
}
// + timestamps (createdAt, updatedAt)
```

### Footprint
```js
{
  userId:    ObjectId (ref: User),  // required
  location:  { lat: Number, lng: Number },  // required
  placeName: String,      // 逆地理编码地名
  message:   String,      // 用户留言（前端会前置 weather 数据）
  mood:      String,      // 心情 emoji: 😊😭😋🏋️😴🍺
  photoUrl:  String,      // Cloudinary URL
  reactions: [{
    userId:   ObjectId (ref: User),
    username: String,
    emoji:    String
  }],
  comments: [{
    username:  String,    // 取自 req.user.name，不信任客户端
    content:   String,
    ipAddress: String,    // 记录真实 IP
    createdAt: Date
  }]
}
// + timestamps
```

### Notification
```js
{
  recipientId: ObjectId (ref: User, indexed),
  senderName:  String,
  type:        String,      // enum: ['reaction', 'comment']
  footprintId: ObjectId (ref: Footprint),
  content:     String,      // emoji 或评论内容
  isRead:      Boolean,     // default false
  createdAt:   Date
}
```

## 核心业务逻辑

### 管理员系统
- "阿森"登录时自动 `role = 'admin'`（在 `/auth/login` 和 `/auth/me` 两处判断）
- admin 中间件检查 `user.role === 'admin'`，拒绝非 admin 访问
- AdminPanel 提供在线名单、用户表格（编辑/踢出/删除）
- 踢人流程：`POST /api/admin/kick/:userId` → `io.fetchSockets()` 找到目标 → emit `force_logout` → `disconnect(true)`
- 前端监听 `force_logout` → `clearAuth()` → `alert('您已被管理员踢出')` → `setUser(null)`

### 游客访问模式
- 删除强制登录门控（`if (!user) return <AuthModal/>`），地图对所有人可见
- 足迹数据在组件挂载时无条件拉取（`useEffect([])` 不依赖 user）
- Socket 连接仅在登录后建立（`useEffect([user])`）
- 互动操作（打卡/表态/评论）被 `requireLogin()` 拦截，弹出 AuthModal
- 登录成功后自动执行挂起操作（`pendingActionRef`）：评论/表态 → 飞跃到足迹；打卡 → 打开 CheckInModal

### 抽屉式交互（非页面跳转）
- 个人主页：`ProfileDrawer` 从右侧滑出（`cubic-bezier(0.2,0.8,0.2,1)`），不再使用 `/profile/:userId` 路由
- 全局所有 `<Link to={/profile/...}>` 替换为 `window.dispatchEvent(new CustomEvent('profile:view', { detail: { userId } }))`
- 图钉详情：`ClusterDetailPanel` 底部抽屉，通过 `cluster:click` 自定义事件触发
- 今日记录：`TimelineDrawer` 右侧面板
- 点击时间轴条目 → 设置 `activeFootprintId` → `FlyToFootprint` → `map.flyTo()` → 到达后自动打开详情

### 实时更新
- Socket 事件：`footprint:new`, `footprint:updated`, `footprint:deleted`, `profile:updated`, `new_notification`, `force_logout`
- 所有 Socket 事件同时派发对应的 `window.dispatchEvent(CustomEvent)`（前缀 `ws:`），使 ProfileDrawer 和 ProfilePage 等独立组件也能实时同步
- Socket 房间机制：`socket.join(userId)` 实现定向通知投递

### 评论安全
- 后端从 `req.user.name` 获取用户名，拒绝客户端传入的 username
- 前端 ClusterDetailPanel 移除了"Your name"输入框，评论表单只有内容框

### 地图防抖动
- `MapDashboard` 从嵌套组件改为 JSX 变量（`const mapDashboard = (...)`），避免 React 在状态变化时将函数组件视为新类型而重新挂载整个地图子树
- `MapContainer` 加入 `key="map"` 确保稳定标识

## 环境变量（Render 后端）

```
MONGODB_URI = xxx (Atlas SRV)
CLOUDINARY_CLOUD_NAME = xxx
CLOUDINARY_API_KEY = xxx
CLOUDINARY_API_SECRET = xxx
OPENWEATHERMAP_API_KEY = xxx
PORT = 5000
JWT_SECRET = xxx
```

## 本地开发

```bash
cd Bliver
npm run dev          # 同时启动前端(:5173)+后端(:5000)
npm run dev:frontend # 仅前端
npm run dev:backend  # 仅后端
```

## Git 工作流

- 分支：`main`
- 远程：`https://github.com/1142052331/bliver.git`
- Render 自动部署（push 到 main 即触发）
- 提交信息用英文，用户名为 Bliver
