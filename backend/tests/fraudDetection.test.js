const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LARGE_TXN_THRESHOLD = '500000';
process.env.VELOCITY_WINDOW_MINUTES = '10';
process.env.VELOCITY_MAX_TXNS = '5';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'test_db';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_pass';

// --- Mock the DB layer BEFORE requiring fraudDetection, so its destructured
// `query` reference points at our mock instead of a real Postgres pool. ---
const dbModule = require('../config/db');

const insertedAlerts = [];
let mockTxnCount = 0;
let mockLoginAttemptCount = 0;

dbModule.query = async (sql, params) => {
  if (sql.includes('INSERT INTO fraud_alerts')) {
    insertedAlerts.push({ userId: params[0], relatedTxnId: params[1], alertType: params[2], severity: params[3], details: params[4] });
    return { rows: [] };
  }
  if (sql.includes('txn_count')) {
    return { rows: [{ txn_count: mockTxnCount }] };
  }
  if (sql.includes('attempt_count')) {
    return { rows: [{ attempt_count: mockLoginAttemptCount }] };
  }
  return { rows: [] };
};

const { evaluateTransfer, evaluateLoginAttempt } = require('../utils/fraudDetection');

test('evaluateTransfer flags a transaction at/above the large-amount threshold', async () => {
  insertedAlerts.length = 0;
  mockTxnCount = 0; // below velocity limit

  const alerts = await evaluateTransfer({
    userId: 'user-1',
    amount: 600000, // above the 500000 threshold
    transferId: 'transfer-1',
    senderAccountId: 'acct-1',
  });

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].alertType, 'LARGE_AMOUNT');
  assert.equal(insertedAlerts.length, 1);
  assert.equal(insertedAlerts[0].alertType, 'LARGE_AMOUNT');
});

test('evaluateTransfer does NOT flag a normal small transaction with low velocity', async () => {
  insertedAlerts.length = 0;
  mockTxnCount = 1;

  const alerts = await evaluateTransfer({
    userId: 'user-1',
    amount: 1000,
    transferId: 'transfer-2',
    senderAccountId: 'acct-1',
  });

  assert.equal(alerts.length, 0);
  assert.equal(insertedAlerts.length, 0);
});

test('evaluateTransfer flags high-velocity transfers even for small amounts', async () => {
  insertedAlerts.length = 0;
  mockTxnCount = 6; // >= VELOCITY_MAX_TXNS (5)

  const alerts = await evaluateTransfer({
    userId: 'user-1',
    amount: 100,
    transferId: 'transfer-3',
    senderAccountId: 'acct-1',
  });

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].alertType, 'VELOCITY');
});

test('evaluateTransfer can raise BOTH alerts when amount is large AND velocity is high', async () => {
  insertedAlerts.length = 0;
  mockTxnCount = 10;

  const alerts = await evaluateTransfer({
    userId: 'user-1',
    amount: 1000000,
    transferId: 'transfer-4',
    senderAccountId: 'acct-1',
  });

  const types = alerts.map((a) => a.alertType).sort();
  assert.deepEqual(types, ['LARGE_AMOUNT', 'VELOCITY']);
});

test('evaluateLoginAttempt does nothing on a successful login', async () => {
  insertedAlerts.length = 0;
  const alerts = await evaluateLoginAttempt({ userId: 'user-1', email: 'a@b.com', ipAddress: '127.0.0.1', success: true });
  assert.equal(alerts.length, 0);
  assert.equal(insertedAlerts.length, 0);
});

test('evaluateLoginAttempt flags brute-force after 5+ failed attempts', async () => {
  insertedAlerts.length = 0;
  mockLoginAttemptCount = 5;

  const alerts = await evaluateLoginAttempt({ userId: 'user-1', email: 'a@b.com', ipAddress: '127.0.0.1', success: false });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].alertType, 'LOGIN_BRUTE_FORCE');
});

test('evaluateLoginAttempt does not flag below the brute-force threshold', async () => {
  insertedAlerts.length = 0;
  mockLoginAttemptCount = 2;

  const alerts = await evaluateLoginAttempt({ userId: 'user-1', email: 'a@b.com', ipAddress: '127.0.0.1', success: false });
  assert.equal(alerts.length, 0);
});
