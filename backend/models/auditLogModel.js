const { query } = require('../config/db');

const AuditLogModel = {
  async findPaginated({ limit = 50, offset = 0, userId = null, action = null } = {}) {
    const { rows } = await query(
      `SELECT al.id, al.user_id, u.email, al.action, al.ip_address, al.metadata, al.created_at
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE ($3::uuid IS NULL OR al.user_id = $3)
         AND ($4::text IS NULL OR al.action = $4)
       ORDER BY al.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset, userId, action]
    );
    return rows;
  },

  async count({ userId = null, action = null } = {}) {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS total FROM audit_logs
       WHERE ($1::uuid IS NULL OR user_id = $1)
         AND ($2::text IS NULL OR action = $2)`,
      [userId, action]
    );
    return rows[0].total;
  },
};

module.exports = AuditLogModel;
