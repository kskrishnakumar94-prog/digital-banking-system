const { query } = require('../config/db');
const logger = require('./logger');
const { notifyUser } = require('./notifications');
const templates = require('./alertTemplates');

const LARGE_TXN_THRESHOLD = Number(process.env.LARGE_TXN_THRESHOLD || 500000);
const VELOCITY_WINDOW_MINUTES = Number(process.env.VELOCITY_WINDOW_MINUTES || 10);
const VELOCITY_MAX_TXNS = Number(process.env.VELOCITY_MAX_TXNS || 5);
const MAX_LOGIN_ATTEMPTS = Number(process.env.MAX_LOGIN_ATTEMPTS || 5);
const LOGIN_LOCKOUT_MINUTES = Number(process.env.LOGIN_LOCKOUT_MINUTES || 15);

async function getUserContact(userId) {
  const { rows } = await query('SELECT id, email, phone, full_name FROM users WHERE id = $1', [userId]);
  return rows[0] || null;
}

/**
 * Maps an alert's type/details to the right email+SMS copy. Returns null
 * for alert types that don't have a user-facing notification (shouldn't
 * happen currently, but keeps this forward-compatible with new alert
 * types that might be internal-only).
 */
function buildNotificationContent(alertType, details) {
  switch (alertType) {
    case 'LARGE_AMOUNT':
      return templates.largeTransactionAlert(details);
    case 'VELOCITY':
      return templates.velocityAlert(details);
    case 'LOGIN_BRUTE_FORCE':
      return templates.loginBruteForceAlert(details);
    case 'NEW_DEVICE':
      return templates.newDeviceLoginAlert(details);
    default:
      return null;
  }
}

/**
 * Creates a fraud alert record, logs it, and notifies the affected user
 * by email/SMS (best-effort - notification failures never throw, since a
 * failed alert email should never be allowed to break the underlying
 * banking operation that triggered it).
 */
async function createAlert({ userId, relatedTxnId = null, alertType, severity = 'medium', details = {} }) {
  await query(
    `INSERT INTO fraud_alerts (user_id, related_txn_id, alert_type, severity, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, relatedTxnId, alertType, severity, details]
  );
  logger.warn(`FRAUD ALERT [${severity.toUpperCase()}] ${alertType} - user:${userId}`, details);

  try {
    const user = await getUserContact(userId);
    const content = buildNotificationContent(alertType, details);
    if (user && content) {
      await notifyUser(user, content);
    }
  } catch (err) {
    // Never let a notification failure surface as an error to the caller
    logger.error(`Failed to send fraud alert notification: ${err.message}`);
  }
}

/**
 * Evaluates a fund transfer for suspicious activity.
 * Runs AFTER the transaction is committed so it never blocks the transfer,
 * but flags are visible immediately in the fraud_alerts table/dashboard.
 */
async function evaluateTransfer({ userId, amount, transferId, senderAccountId }) {
  const alerts = [];

  // 1. Large single transaction
  if (amount >= LARGE_TXN_THRESHOLD) {
    alerts.push({
      userId,
      alertType: 'LARGE_AMOUNT',
      severity: 'high',
      details: { amount, threshold: LARGE_TXN_THRESHOLD, transferId },
    });
  }

  // 2. Velocity check - too many transactions in a short window
  const { rows } = await query(
    `SELECT COUNT(*)::int AS txn_count
     FROM transactions
     WHERE account_id = $1
       AND type = 'debit'
       AND created_at >= NOW() - ($2 || ' minutes')::interval`,
    [senderAccountId, VELOCITY_WINDOW_MINUTES]
  );

  if (rows[0].txn_count >= VELOCITY_MAX_TXNS) {
    alerts.push({
      userId,
      alertType: 'VELOCITY',
      severity: 'medium',
      details: {
        count: rows[0].txn_count,
        windowMinutes: VELOCITY_WINDOW_MINUTES,
        transferId,
      },
    });
  }

  for (const alert of alerts) {
    await createAlert(alert);
  }

  return alerts;
}

/**
 * Evaluates login attempts for brute-force / suspicious login patterns.
 */
async function evaluateLoginAttempt({ userId, email, ipAddress, success }) {
  if (success) return [];

  const { rows } = await query(
    `SELECT COUNT(*)::int AS attempt_count
     FROM login_attempts
     WHERE (user_id = $1 OR email_attempted = $2)
       AND success = FALSE
       AND created_at >= NOW() - ($3 || ' minutes')::interval`,
    [userId, email, LOGIN_LOCKOUT_MINUTES]
  );

  const alerts = [];
  if (rows[0].attempt_count >= MAX_LOGIN_ATTEMPTS) {
    alerts.push({
      userId,
      alertType: 'LOGIN_BRUTE_FORCE',
      severity: 'critical',
      details: { attempts: rows[0].attempt_count, ipAddress, email },
    });
    await createAlert(alerts[0]);
  }
  return alerts;
}

/**
 * Flags a successful login from an IP address that has never successfully
 * logged in to this account before. Runs only after a successful login
 * (password + 2FA, if enabled) so it reflects genuine access, not guesses.
 * Low/medium severity - this is informational ("hey, is this you?") rather
 * than a hard block, since new devices/networks are extremely common.
 */
async function evaluateNewDevice({ userId, ipAddress }) {
  if (!ipAddress) return [];

  const { rows } = await query(
    `SELECT COUNT(*)::int AS prior_success_count
     FROM login_attempts
     WHERE user_id = $1 AND ip_address = $2 AND success = TRUE`,
    [userId, ipAddress]
  );

  // If this IP has 1 or fewer prior successes, the current login is either
  // the very first one ever recorded from it or the first time we're
  // seeing it - either way, treat it as a new device/location.
  if (rows[0].prior_success_count <= 1) {
    const alert = {
      userId,
      alertType: 'NEW_DEVICE',
      severity: 'low',
      details: { ipAddress, when: new Date().toISOString() },
    };
    await createAlert(alert);
    return [alert];
  }
  return [];
}

module.exports = { createAlert, evaluateTransfer, evaluateLoginAttempt, evaluateNewDevice };
