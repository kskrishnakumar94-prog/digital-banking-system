const { withTransaction, query } = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const generateAccountNumber = require('../utils/generateAccountNumber');

// Simple tiered interest rate schedule for Fixed Deposits, by tenure length.
// Longer lock-ins earn a higher annual rate - a common real-world FD pattern.
const FD_INTEREST_TIERS = [
  { maxMonths: 6, rate: 5.0 },
  { maxMonths: 12, rate: 6.0 },
  { maxMonths: 24, rate: 6.75 },
  { maxMonths: Infinity, rate: 7.25 },
];

function getFDInterestRate(tenureMonths) {
  const tier = FD_INTEREST_TIERS.find((t) => tenureMonths <= t.maxMonths);
  return tier.rate;
}

const AccountModel = {
  async createForUser(userId, accountType = 'savings', nickname = null) {
    // Retry loop in case of a rare account_number collision
    for (let attempt = 0; attempt < 5; attempt++) {
      const accountNumber = generateAccountNumber();
      try {
        const { rows } = await query(
          `INSERT INTO accounts (user_id, account_number, account_type, nickname)
           VALUES ($1, $2, $3, $4)
           RETURNING id, account_number, account_type, nickname, balance, currency, status, created_at`,
          [userId, accountNumber, accountType, nickname]
        );
        return rows[0];
      } catch (err) {
        if (err.code === '23505') continue; // unique_violation - retry
        throw err;
      }
    }
    throw new Error('Failed to generate a unique account number.');
  },

  /**
   * Opens a Fixed Deposit account funded from an existing account, atomically:
   * the source account is debited, the new FD account is created and
   * credited with the principal, and both sides get a linked transaction
   * row - all inside a single DB transaction so a failure at any step
   * leaves neither account touched.
   */
  async openFixedDeposit({ userId, sourceAccountId, principal, tenureMonths }) {
    const interestRate = getFDInterestRate(tenureMonths);
    const maturityDate = new Date();
    maturityDate.setMonth(maturityDate.getMonth() + Number(tenureMonths));

    return withTransaction(async (client) => {
      const { rows: sourceRows } = await client.query('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [
        sourceAccountId,
      ]);
      const source = sourceRows[0];

      if (!source || source.user_id !== userId) {
        const err = new Error('Source account not found.');
        err.statusCode = 404;
        throw err;
      }
      if (Number(source.balance) < Number(principal)) {
        const err = new Error('Insufficient funds to open this Fixed Deposit.');
        err.statusCode = 400;
        throw err;
      }

      const newSourceBalance = (Number(source.balance) - Number(principal)).toFixed(2);
      await client.query('UPDATE accounts SET balance = $1 WHERE id = $2', [newSourceBalance, source.id]);

      // Generate a unique account number for the new FD (retry inside the same tx)
      let fd;
      for (let attempt = 0; attempt < 5; attempt++) {
        const accountNumber = generateAccountNumber();
        try {
          const { rows } = await client.query(
            `INSERT INTO accounts
               (user_id, account_number, account_type, balance, interest_rate, maturity_date, principal_amount, source_account_id)
             VALUES ($1, $2, 'fixed_deposit', $3, $4, $5, $3, $6)
             RETURNING *`,
            [userId, accountNumber, principal, interestRate, maturityDate, source.id]
          );
          fd = rows[0];
          break;
        } catch (err) {
          if (err.code === '23505') continue;
          throw err;
        }
      }
      if (!fd) throw new Error('Failed to generate a unique account number for the Fixed Deposit.');

      const transferId = uuidv4();

      await client.query(
        `INSERT INTO transactions (transfer_id, account_id, counterparty_account_id, type, amount, balance_after, description, status)
         VALUES ($1, $2, $3, 'debit', $4, $5, $6, 'completed')`,
        [transferId, source.id, fd.id, principal, newSourceBalance, `Fixed Deposit opened (${fd.account_number})`]
      );
      await client.query(
        `INSERT INTO transactions (transfer_id, account_id, counterparty_account_id, type, amount, balance_after, description, status)
         VALUES ($1, $2, $3, 'credit', $4, $5, $6, 'completed')`,
        [transferId, fd.id, source.id, principal, principal, 'Fixed Deposit opening balance']
      );

      return fd;
    });
  },

  async findByUserId(userId) {
    const { rows } = await query(
      `SELECT id, account_number, account_type, nickname, balance, currency, status,
              interest_rate, maturity_date, principal_amount, source_account_id, created_at
       FROM accounts WHERE user_id = $1 ORDER BY created_at`,
      [userId]
    );
    return rows;
  },

  async findByAccountNumber(accountNumber) {
    const { rows } = await query('SELECT * FROM accounts WHERE account_number = $1', [accountNumber]);
    return rows[0];
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM accounts WHERE id = $1', [id]);
    return rows[0];
  },

  async updateNickname(userId, accountId, nickname) {
    const { rows } = await query(
      `UPDATE accounts SET nickname = $1 WHERE id = $2 AND user_id = $3 RETURNING id, nickname`,
      [nickname, accountId, userId]
    );
    return rows[0];
  },
};

module.exports = AccountModel;
