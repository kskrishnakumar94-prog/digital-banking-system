const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  logger.error(err.message, { stack: err.stack, path: req.path, method: req.method });

  const status = err.statusCode || 500;
  const message = status === 500 ? 'Internal server error. Please try again later.' : err.message;

  res.status(status).json({ success: false, message });
}

module.exports = errorHandler;
