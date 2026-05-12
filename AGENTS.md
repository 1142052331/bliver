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
