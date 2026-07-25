const { query } = require('../config/db');

const ScheduledTransferModel = {
  async create({ userId, fromAccountId, toAccountNumber, amount, description, frequency, nextRunAt }) {
    const { rows } = await query(
      `INSERT INTO scheduled_transfers
         (user_id, from_account_id, to_account_number, amount, description, frequency, next_run_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, fromAccountId, toAccountNumber, amount, description || null, frequency, nextRunAt]
    );
    return rows[0];
  },

  async findByUserId(userId) {
    const { rows } = await query(
      `SELECT st.*, a.account_number AS from_account_number
       FROM scheduled_transfers st
       JOIN accounts a ON a.id = st.from_account_id
       WHERE st.user_id = $1
       ORDER BY st.created_at DESC`,
      [userId]
    );
    return rows;
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM scheduled_transfers WHERE id = $1', [id]);
    return rows[0];
  },

  async cancel(userId, id) {
    const { rows } = await query(
      `UPDATE scheduled_transfers SET status = 'cancelled' WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );
    return rows[0];
  },

  /**
   * Finds every active scheduled transfer whose next_run_at has arrived.
   * Used by the background scheduler (utils/scheduler.js).
   */
  async findDue() {
    const { rows } = await query(
      `SELECT * FROM scheduled_transfers WHERE status = 'active' AND next_run_at <= NOW()`
    );
    return rows;
  },

  /**
   * Records the outcome of one execution attempt. On success,
   * consecutive_failures resets to 0. On failure, it increments - the
   * caller (utils/scheduler.js) uses the returned count to decide whether
   * to auto-pause a job that's failed too many times in a row (e.g. its
   * source account was closed), instead of retrying it forever.
   */
  async recordRunResult(id, { success, nextRunAt, completed, autoPause }) {
    const { rows } = await query(
      `UPDATE scheduled_transfers
       SET last_run_at = NOW(),
           last_run_status = $1,
           next_run_at = COALESCE($2, next_run_at),
           consecutive_failures = CASE WHEN $1 = 'success' THEN 0 ELSE consecutive_failures + 1 END,
           status = CASE
             WHEN $3 THEN 'completed'
             WHEN $4 THEN 'paused'
             ELSE status
           END
       WHERE id = $5
       RETURNING consecutive_failures, status`,
      [success ? 'success' : 'failed', nextRunAt || null, !!completed, !!autoPause, id]
    );
    return rows[0];
  },
};

module.exports = ScheduledTransferModel;
