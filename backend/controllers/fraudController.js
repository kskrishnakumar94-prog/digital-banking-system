const { query } = require('../config/db');

// User-facing: view their own fraud alerts
exports.getMyAlerts = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, alert_type, severity, details, is_resolved, created_at
       FROM fraud_alerts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.status(200).json({ success: true, data: { alerts: rows } });
  } catch (err) {
    next(err);
  }
};

// Admin-facing: view all unresolved alerts across the system
exports.getAllAlerts = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT fa.id, fa.user_id, u.email, fa.alert_type, fa.severity, fa.details, fa.is_resolved, fa.created_at
       FROM fraud_alerts fa
       JOIN users u ON u.id = fa.user_id
       ORDER BY fa.is_resolved ASC, fa.created_at DESC
       LIMIT 200`
    );
    res.status(200).json({ success: true, data: { alerts: rows } });
  } catch (err) {
    next(err);
  }
};

exports.resolveAlert = async (req, res, next) => {
  try {
    const { alertId } = req.params;
    await query('UPDATE fraud_alerts SET is_resolved = TRUE WHERE id = $1', [alertId]);
    res.status(200).json({ success: true, message: 'Alert marked as resolved.' });
  } catch (err) {
    next(err);
  }
};

exports.getLoginAttempts = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, email_attempted, ip_address, success, reason, created_at
       FROM login_attempts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.status(200).json({ success: true, data: { attempts: rows } });
  } catch (err) {
    next(err);
  }
};
