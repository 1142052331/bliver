const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
require('dotenv').config();

const connectDB = require('./config/db');
const Footprint = require('./models/Footprint');
const { blurCoordinate } = require('./services/location');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const pushRoutes = require('./routes/push');
const announcementRoutes = require('./routes/announcements');
const friendRoutes = require('./routes/friends');
const messageRoutes = require('./routes/messages');
const setupSocket = require('./socket');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.set('trust proxy', true);
app.use(cors());
app.use(helmet());
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

app.use('/api', apiRoutes(io));
app.use('/api', adminRoutes(io));
app.use('/api', pushRoutes());
app.use('/api', announcementRoutes());
app.use('/api', friendRoutes());
app.use('/api', messageRoutes());

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

async function migrateLocationBlur() {
  try {
    const count = await Footprint.countDocuments({ realLocation: { $exists: false } });
    if (count === 0) return;
    console.log(`[Migration] Blurring locations for ${count} existing footprints...`);
    const batch = await Footprint.find({ realLocation: { $exists: false } });
    for (const fp of batch) {
      fp.realLocation = { lat: fp.location.lat, lng: fp.location.lng };
      fp.location = blurCoordinate(fp.location.lat, fp.location.lng);
      await fp.save();
    }
    console.log(`[Migration] Done blurring ${count} footprints`);
  } catch (err) {
    console.error('[Migration] Location blur failed:', err.message);
  }
}

connectDB().then(async () => {
  await migrateLocationBlur();
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
