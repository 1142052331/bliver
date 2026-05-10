const mongoose = require('mongoose');

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

const connectDB = async (retryCount = 0) => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    if (retryCount < MAX_RETRIES) {
      console.log(`Retrying in ${RETRY_DELAY_MS / 1000}s... (${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      return connectDB(retryCount + 1);
    }
    console.error('MongoDB connection failed after max retries');
    process.exit(1);
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected — Mongoose will auto-reconnect');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err.message);
});

module.exports = connectDB;
