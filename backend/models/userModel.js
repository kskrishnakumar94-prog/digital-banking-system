const { query } = require('../config/db');

const UserModel = {
  async create({ fullName, email, phone, passwordHash }) {
    const { rows } = await query(
      `INSERT INTO users (full_name, email, phone, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, email, phone, role, status, created_at`,
      [fullName, email, phone, passwordHash]
    );
    return rows[0];
  },

  async findByEmail(email) {
    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0];
  },

  async findById(id) {
    const { rows } = await query(
      'SELECT id, full_name, email, phone, is_2fa_enabled, role, status, created_at FROM users WHERE id = $1',
      [id]
    );
    return rows[0];
  },

  async setTwoFactorSecret(userId, secret) {
    await query('UPDATE users SET two_fa_secret = $1 WHERE id = $2', [secret, userId]);
  },

  async enableTwoFactor(userId) {
    await query('UPDATE users SET is_2fa_enabled = TRUE WHERE id = $1', [userId]);
  },

  async updateProfile(userId, { fullName, phone }) {
    const { rows } = await query(
      `UPDATE users SET full_name = COALESCE($1, full_name), phone = COALESCE($2, phone), updated_at = now()
       WHERE id = $3
       RETURNING id, full_name, email, phone, role, is_2fa_enabled`,
      [fullName || null, phone || null, userId]
    );
    return rows[0];
  },

  async updatePassword(userId, passwordHash) {
    await query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, userId]);
  },

  async disableTwoFactor(userId) {
    await query('UPDATE users SET is_2fa_enabled = FALSE, two_fa_secret = NULL WHERE id = $1', [userId]);
  },

  async incrementFailedLogin(userId) {
    const { rows } = await query(
      `UPDATE users SET failed_login_count = failed_login_count + 1 WHERE id = $1
       RETURNING failed_login_count`,
      [userId]
    );
    return rows[0]?.failed_login_count;
  },

  async resetFailedLogin(userId) {
    await query('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1', [userId]);
  },

  async lockAccount(userId, until) {
    await query('UPDATE users SET locked_until = $1 WHERE id = $2', [until, userId]);
  },

  // ---------------- Admin-facing methods ----------------

  async findAllPaginated({ limit = 20, offset = 0, search = '' } = {}) {
    const { rows } = await query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.status, u.is_2fa_enabled, u.created_at,
              COALESCE(SUM(a.balance), 0) AS total_balance,
              COUNT(a.id)::int AS account_count
       FROM users u
       LEFT JOIN accounts a ON a.user_id = u.id
       WHERE ($3 = '' OR u.email ILIKE '%' || $3 || '%' OR u.full_name ILIKE '%' || $3 || '%')
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset, search]
    );
    return rows;
  },

  async countAll(search = '') {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS total FROM users
       WHERE ($1 = '' OR email ILIKE '%' || $1 || '%' OR full_name ILIKE '%' || $1 || '%')`,
      [search]
    );
    return rows[0].total;
  },

  async findDetailById(id) {
    const { rows } = await query(
      `SELECT id, full_name, email, phone, is_2fa_enabled, role, status,
              failed_login_count, locked_until, created_at
       FROM users WHERE id = $1`,
      [id]
    );
    return rows[0];
  },

  async updateStatus(userId, status) {
    const { rows } = await query(
      `UPDATE users SET status = $1, updated_at = now() WHERE id = $2
       RETURNING id, full_name, email, status`,
      [status, userId]
    );
    return rows[0];
  },

  async getSystemStats() {
    const [usersRes, balanceRes, txnTodayRes, alertsRes, lockedRes] = await Promise.all([
      query('SELECT COUNT(*)::int AS total_users FROM users'),
      query(`SELECT COALESCE(SUM(balance), 0) AS total_balance, COUNT(*)::int AS total_accounts FROM accounts`),
      query(`SELECT COUNT(*)::int AS total FROM transactions WHERE created_at >= CURRENT_DATE AND type = 'debit'`),
      query(`SELECT COUNT(*)::int AS total FROM fraud_alerts WHERE is_resolved = FALSE`),
      query(`SELECT COUNT(*)::int AS total FROM users WHERE locked_until IS NOT NULL AND locked_until > NOW()`),
    ]);

    return {
      totalUsers: usersRes.rows[0].total_users,
      totalBalance: balanceRes.rows[0].total_balance,
      totalAccounts: balanceRes.rows[0].total_accounts,
      transfersToday: txnTodayRes.rows[0].total,
      unresolvedAlerts: alertsRes.rows[0].total,
      currentlyLockedAccounts: lockedRes.rows[0].total,
    };
  },
};

module.exports = UserModel;
