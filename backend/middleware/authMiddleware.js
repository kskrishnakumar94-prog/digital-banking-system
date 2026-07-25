const { verifyAccessToken } = require('../utils/token');
const { query } = require('../config/db');

/**
 * Verifies the JWT access token on protected routes.
 * Expects: Authorization: Bearer <token>
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Access token missing.' });
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
    }

    const { rows } = await query('SELECT id, email, full_name, phone, is_2fa_enabled, role, status FROM users WHERE id = $1', [payload.sub]);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Account is not active.' });
    }

    req.user = user; // attach for downstream handlers
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Restricts a route to specific roles, e.g. requireRole('admin').
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
