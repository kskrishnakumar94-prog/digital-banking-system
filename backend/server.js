require('dotenv').config();

const validateEnv = require('./config/validateEnv');
validateEnv(); // fail fast on missing/placeholder config, before touching the DB or JWT

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const { apiLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const { startScheduler } = require('./utils/scheduler');
const { pool } = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const accountRoutes = require('./routes/accountRoutes');
const transferRoutes = require('./routes/transferRoutes');
const fraudRoutes = require('./routes/fraudRoutes');
const adminRoutes = require('./routes/adminRoutes');
const beneficiaryRoutes = require('./routes/beneficiaryRoutes');
const scheduledTransferRoutes = require('./routes/scheduledTransferRoutes');

const app = express();

// Trust the first hop proxy (e.g. nginx/docker-compose frontend, or a cloud
// load balancer) so express-rate-limit and req.ip see the REAL client IP
// from X-Forwarded-For instead of the proxy's own IP. Without this, every
// request behind a proxy would appear to come from the same address and
// rate limits would apply globally instead of per-client.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));

// ---------- Global middleware ----------
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(apiLimiter);

// Simple request logger
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// ---------- Routes ----------
// A shallow "is the process alive" check - always fast, no dependencies.
app.get('/api/health', (req, res) => res.json({ success: true, message: 'API is healthy.' }));

// A deep check that actually verifies the database connection - this is
// the one to point a real uptime monitor / load balancer health check at,
// since a process that's "alive" but can't reach Postgres is not actually
// healthy from the caller's point of view.
app.get('/api/health/deep', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, message: 'API and database are healthy.' });
  } catch (err) {
    res.status(503).json({ success: false, message: 'Database is unreachable.' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/fraud', fraudRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/beneficiaries', beneficiaryRoutes);
app.use('/api/scheduled-transfers', scheduledTransferRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// Global error handler (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`🚀 Digital Banking API running on port ${PORT}`);
  startScheduler(); // background worker for scheduled/recurring transfers
});

module.exports = app;
