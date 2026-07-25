const { query } = require('../config/db');

const TransactionModel = {
  /**
   * Fetches paginated transaction history for an account, most recent first.
   */
  async findByAccountId(accountId, { limit = 20, offset = 0 } = {}) {
    const { rows } = await query(
      `SELECT id, transfer_id, account_id, counterparty_account_id, type, amount,
              balance_after, description, status, created_at
       FROM transactions
       WHERE account_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [accountId, limit, offset]
    );
    return rows;
  },

  async countByAccountId(accountId) {
    const { rows } = await query('SELECT COUNT(*)::int AS total FROM transactions WHERE account_id = $1', [accountId]);
    return rows[0].total;
  },

  async findByTransferId(transferId) {
    const { rows } = await query('SELECT * FROM transactions WHERE transfer_id = $1', [transferId]);
    return rows;
  },
};

module.exports = TransactionModel;
