const mongoose = require('mongoose');

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

async function connectDBOrThrow({
  connect = (uri) => mongoose.connect(uri),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  maxRetries = MAX_RETRIES,
  retryDelayMs = RETRY_DELAY_MS,
  onRetry = () => {},
} = {}) {
  let retries = 0;
  while (true) {
    try {
      return await connect(process.env.MONGODB_URI);
    } catch (error) {
      if (retries >= maxRetries) throw error;
      retries += 1;
      onRetry(retries, maxRetries, retryDelayMs);
      await sleep(retryDelayMs);
    }
  }
}

const connectDB = async () => {
  try {
    await connectDBOrThrow({
      onRetry: (retry, maxRetries, retryDelayMs) => {
        console.log(`Retrying in ${retryDelayMs / 1000}s... (${retry}/${maxRetries})`);
      },
    });
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
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
module.exports.connectDBOrThrow = connectDBOrThrow;
