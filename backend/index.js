const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const connectDB = require('./config/db');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const pushRoutes = require('./routes/push');
const setupSocket = require('./socket');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.set('trust proxy', true);
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.charset = 'utf-8';
  next();
});

app.use('/api', apiRoutes(io));
app.use('/api', adminRoutes(io));
app.use('/api', pushRoutes());

setupSocket(io);

connectDB().then(() => {
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
