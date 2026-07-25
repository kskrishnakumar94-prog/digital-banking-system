const { query } = require('../config/db');

const BeneficiaryModel = {
  async create(userId, { nickname, accountNumber }) {
    const { rows } = await query(
      `INSERT INTO beneficiaries (user_id, nickname, account_number)
       VALUES ($1, $2, $3)
       RETURNING id, nickname, account_number, created_at`,
      [userId, nickname, accountNumber]
    );
    return rows[0];
  },

  async findByUserId(userId) {
    const { rows } = await query(
      'SELECT id, nickname, account_number, created_at FROM beneficiaries WHERE user_id = $1 ORDER BY nickname',
      [userId]
    );
    return rows;
  },

  async delete(userId, beneficiaryId) {
    const { rowCount } = await query('DELETE FROM beneficiaries WHERE id = $1 AND user_id = $2', [
      beneficiaryId,
      userId,
    ]);
    return rowCount > 0;
  },
};

module.exports = BeneficiaryModel;
