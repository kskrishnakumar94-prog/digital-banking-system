const { v4: uuidv4 } = require('uuid');
const { withTransaction, query } = require('../config/db');
const AccountModel = require('../models/accountModel');
const { evaluateTransfer } = require('../utils/fraudDetection');
const { notifyUser } = require('../utils/notifications');
const { transferReceipt } = require('../utils/alertTemplates');
const { logAction } = require('../utils/auditLog');
const logger = require('../utils/logger');

const TRANSFER_RECEIPT_ENABLED = process.env.TRANSFER_RECEIPT_ENABLED !== 'false';

/**
 * Executes a peer-to-peer fund transfer atomically. This is the single
 * source of truth for "how money moves" in the system - both the HTTP
 * `/transfers` endpoint and the scheduled/recurring transfer worker call
 * this same function, so there is exactly one place that implements the
 * locking/rollback/fraud-check/notification behavior.
 *
 * Atomicity guarantee:
 *  - Everything runs inside a single Postgres transaction (BEGIN...COMMIT/ROLLBACK).
 *  - Sender and receiver rows are locked with SELECT ... FOR UPDATE, in a
 *    consistent order (by account id) to prevent deadlocks between concurrent
 *    transfers that involve the same two accounts in reverse order.
 *  - Balance is re-checked AFTER acquiring the lock (not before), preventing
 *    race conditions where two simultaneous transfers both "see" enough funds.
 *  - If ANY step fails (insufficient funds, DB error, etc.) the whole
 *    transaction is rolled back -> no partial debit/credit is ever persisted.
 *
 * Throws an Error with a `.statusCode` set for expected failure cases
 * (insufficient funds, account not found/owned, inactive account) so HTTP
 * callers can map it straight to a response, while the scheduler can just
 * catch-and-log it as a failed run.
 */
async function executeTransfer({ initiatingUserId, fromAccountNumber, toAccountNumber, amount, description }) {
  if (fromAccountNumber === toAccountNumber) {
    const err = new Error('Cannot transfer to the same account.');
    err.statusCode = 400;
    throw err;
  }
  if (!(amount > 0)) {
    const err = new Error('Transfer amount must be greater than zero.');
    err.statusCode = 400;
    throw err;
  }

  const senderAccountCheck = await AccountModel.findByAccountNumber(fromAccountNumber);
  if (!senderAccountCheck || senderAccountCheck.user_id !== initiatingUserId) {
    const err = new Error('You do not own the source account.');
    err.statusCode = 403;
    throw err;
  }

  const receiverAccountCheck = await AccountModel.findByAccountNumber(toAccountNumber);
  if (!receiverAccountCheck) {
    const err = new Error('Recipient account not found.');
    err.statusCode = 404;
    throw err;
  }
  if (receiverAccountCheck.status !== 'active' || senderAccountCheck.status !== 'active') {
    const err = new Error('One of the accounts is not active.');
    err.statusCode = 403;
    throw err;
  }

  const transferId = uuidv4();

  const result = await withTransaction(async (client) => {
    // Lock both rows in a deterministic order (by id) to avoid deadlocks
    const ids = [senderAccountCheck.id, receiverAccountCheck.id].sort();
    const lockedRows = {};
    for (const id of ids) {
      const { rows } = await client.query('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [id]);
      lockedRows[id] = rows[0];
    }

    const sender = lockedRows[senderAccountCheck.id];
    const receiver = lockedRows[receiverAccountCheck.id];

    if (Number(sender.balance) < Number(amount)) {
      const err = new Error('Insufficient funds.');
      err.statusCode = 400;
      throw err;
    }

    const newSenderBalance = (Number(sender.balance) - Number(amount)).toFixed(2);
    const newReceiverBalance = (Number(receiver.balance) + Number(amount)).toFixed(2);

    await client.query('UPDATE accounts SET balance = $1 WHERE id = $2', [newSenderBalance, sender.id]);
    await client.query('UPDATE accounts SET balance = $1 WHERE id = $2', [newReceiverBalance, receiver.id]);

    const debitTxn = await client.query(
      `INSERT INTO transactions
         (transfer_id, account_id, counterparty_account_id, type, amount, balance_after, description, status)
       VALUES ($1, $2, $3, 'debit', $4, $5, $6, 'completed')
       RETURNING *`,
      [transferId, sender.id, receiver.id, amount, newSenderBalance, description || 'Fund transfer']
    );

    const creditTxn = await client.query(
      `INSERT INTO transactions
         (transfer_id, account_id, counterparty_account_id, type, amount, balance_after, description, status)
       VALUES ($1, $2, $3, 'credit', $4, $5, $6, 'completed')
       RETURNING *`,
      [transferId, receiver.id, sender.id, amount, newReceiverBalance, description || 'Fund transfer']
    );

    return {
      debit: debitTxn.rows[0],
      credit: creditTxn.rows[0],
      senderNewBalance: newSenderBalance,
      receiverNewBalance: newReceiverBalance,
    };
  });

  logger.info(`Transfer ${transferId}: ${amount} from ${fromAccountNumber} to ${toAccountNumber}`);
  logAction({
    userId: initiatingUserId,
    action: 'TRANSFER_COMPLETED',
    metadata: { transferId, amount, fromAccountNumber, toAccountNumber },
  });

  // Fraud evaluation runs AFTER commit - never blocks a legitimate transfer,
  // but immediately flags suspicious patterns for review/alerting.
  const alerts = await evaluateTransfer({
    userId: initiatingUserId,
    amount: Number(amount),
    transferId,
    senderAccountId: senderAccountCheck.id,
  });

  // Best-effort transfer receipts to both parties - never blocks the caller
  if (TRANSFER_RECEIPT_ENABLED) {
    sendTransferReceipts({
      senderUserId: senderAccountCheck.user_id,
      receiverUserId: receiverAccountCheck.user_id,
      amount,
      senderNewBalance: result.senderNewBalance,
      receiverNewBalance: result.receiverNewBalance,
      fromAccountNumber,
      toAccountNumber,
    }).catch((err) => logger.error(`Transfer receipt notification failed: ${err.message}`));
  }

  return { transferId, result, alerts };
}

/**
 * Looks up both parties' contact info and emails/SMSes each a receipt.
 * Runs after commit and is fully best-effort: any failure here is logged
 * but never surfaces to the caller, since the money movement already
 * succeeded and is the part that actually matters.
 */
async function sendTransferReceipts({
  senderUserId,
  receiverUserId,
  amount,
  senderNewBalance,
  receiverNewBalance,
  fromAccountNumber,
  toAccountNumber,
}) {
  const { rows } = await query('SELECT id, email, phone, full_name FROM users WHERE id = ANY($1)', [
    [senderUserId, receiverUserId],
  ]);
  const sender = rows.find((u) => u.id === senderUserId);
  const receiver = rows.find((u) => u.id === receiverUserId);

  const tasks = [];
  if (sender) {
    tasks.push(
      notifyUser(
        sender,
        transferReceipt({ amount, counterpartyAccountNumber: toAccountNumber, newBalance: senderNewBalance, type: 'debit' })
      )
    );
  }
  if (receiver) {
    tasks.push(
      notifyUser(
        receiver,
        transferReceipt({ amount, counterpartyAccountNumber: fromAccountNumber, newBalance: receiverNewBalance, type: 'credit' })
      )
    );
  }
  return Promise.all(tasks);
}

module.exports = { executeTransfer };
