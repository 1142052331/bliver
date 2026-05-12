function errorHandler(err, req, res, _next) {
  const statusCode = err.isOperational ? err.statusCode : 500;
  const message = err.isOperational
    ? err.message
    : process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error';

  if (statusCode >= 500) {
    console.error(`[${statusCode}]`, err.message, err.stack);
  }

  res.status(statusCode).json({ error: message });
}

module.exports = errorHandler;
