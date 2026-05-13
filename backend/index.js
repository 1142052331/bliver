const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
require('dotenv').config();

const Sentry = require('@sentry/node');
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV || 'production',
  });
}

const connectDB = require('./config/db');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const pushRoutes = require('./routes/push');
const announcementRoutes = require('./routes/announcements');
const friendRoutes = require('./routes/friends');
const messageRoutes = require('./routes/messages');
const profileRoutes = require('./routes/profile');
const errorHandler = require('./middleware/errorHandler');
const { setupSocket } = require('./socket');
const notification = require('./services/notification');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.set('trust proxy', true);
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.tile.openstreetmap.org", "https://res.cloudinary.com"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
}));
app.use(express.json({ limit: '1mb' }));

// ── Global rate limit: 200 req/min per IP ──
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: { error: '请求过于频繁，请稍后再试' },
}));
app.use((req, res, next) => {
  res.charset = 'utf-8';
  next();
});

app.use('/api', apiRoutes);
app.use('/api', adminRoutes);
app.use('/api', pushRoutes);
app.use('/api', announcementRoutes);
app.use('/api', friendRoutes);
app.use('/api', messageRoutes);
app.use('/api', profileRoutes);

// Serve frontend static files
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
// SPA fallback: serve index.html for client-side routes (not API, not static files)
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
  if (path.extname(req.path)) return next(); // real file like .js .css .png
  res.sendFile(path.join(frontendDist, 'index.html'));
});

setupSocket(io);
notification.init(io);

// Only auto-start when run directly (node index.js), not when imported for tests
if (require.main === module) {
  connectDB().then(async () => {
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  });
}

// Error reporting: Sentry captures first, then custom handler formats the JSON response.
// Express 5 auto-forwards async errors — handlers should NOT try/catch 500s themselves.
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}
app.use(errorHandler);

module.exports = { app, server, io };





