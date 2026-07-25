const { query } = require('../config/db');
const logger = require('./logger');

/**
 * Records an entry in the audit_logs table. This is distinct from
 * fraud_alerts (which is specifically for suspicious activity) and from
 * login_attempts (auth-specific) - audit_logs is the general compliance
 * trail: every significant account/money action, who did it, and from
 * where, regardless of whether anything looked suspicious about it.
 *
 * Never throws - an audit log write failing should never block the
 * actual operation it's describing (the operation already happened by
 * the time this is called).
 */
async function logAction({ userId, action, ipAddress, metadata = {} }) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, ip_address, metadata) VALUES ($1, $2, $3, $4)`,
      [userId || null, action, ipAddress || null, metadata]
    );
  } catch (err) {
    logger.error(`Failed to write audit log entry (${action}): ${err.message}`);
  }
}

module.exports = { logAction };
