const { query } = require('../config/db');
const { executeTransfer } = require('../services/transferService');

/**
 * Peer-to-peer fund transfer (HTTP endpoint).
 * All the atomicity/locking/fraud-check/notification logic lives in
 * services/transferService.js so the scheduled-transfer worker can reuse
 * the exact same code path - see that file for the detailed guarantees.
 */
exports.transferFunds = async (req, res, next) => {
  const { fromAccountNumber, toAccountNumber, amount, description } = req.body;

  try {
    const { transferId, result, alerts } = await executeTransfer({
      initiatingUserId: req.user.id,
      fromAccountNumber,
      toAccountNumber,
      amount,
      description,
    });

    res.status(200).json({
      success: true,
      message: 'Transfer completed successfully.',
      data: {
        transferId,
        newBalance: result.senderNewBalance,
        debitTransaction: result.debit,
        fraudAlertsTriggered: alerts.length > 0,
      },
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    next(err);
  }
};

/**
 * Fetch status/detail of a specific transfer by its transfer_id (shows both legs).
 */
exports.getTransferDetail = async (req, res, next) => {
  try {
    const { transferId } = req.params;
    const { rows } = await query('SELECT * FROM transactions WHERE transfer_id = $1 ORDER BY type', [transferId]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Transfer not found.' });
    }

    // Only allow the involved user(s) to view
    const accountIds = rows.map((r) => r.account_id);
    const { rows: ownedAccounts } = await query(
      'SELECT id FROM accounts WHERE user_id = $1 AND id = ANY($2)',
      [req.user.id, accountIds]
    );
    if (ownedAccounts.length === 0) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this transfer.' });
    }

    res.status(200).json({ success: true, data: { legs: rows } });
  } catch (err) {
    next(err);
  }
};
