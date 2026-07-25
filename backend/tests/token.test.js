const test = require('node:test');
const assert = require('node:assert/strict');

// Required env vars before loading the module under test
process.env.JWT_SECRET = 'test_secret_key_for_unit_tests';
process.env.JWT_EXPIRES_IN = '15m';

const { generateAccessToken, generateRefreshToken, hashToken, verifyAccessToken } = require('../utils/token');

test('generateAccessToken + verifyAccessToken round-trip preserves claims', () => {
  const user = { id: 'user-123', role: 'customer', email: 'test@example.com' };
  const token = generateAccessToken(user);
  const payload = verifyAccessToken(token);

  assert.equal(payload.sub, user.id);
  assert.equal(payload.role, user.role);
  assert.equal(payload.email, user.email);
});

test('verifyAccessToken throws on a tampered token', () => {
  const token = generateAccessToken({ id: 'u1', role: 'customer', email: 'a@b.com' });
  const tampered = token.slice(0, -2) + 'xx';
  assert.throws(() => verifyAccessToken(tampered));
});

test('generateRefreshToken produces a long random opaque string, unique per call', () => {
  const t1 = generateRefreshToken();
  const t2 = generateRefreshToken();
  assert.equal(typeof t1, 'string');
  assert.ok(t1.length >= 64);
  assert.notEqual(t1, t2);
});

test('hashToken is deterministic and one-way', () => {
  const raw = 'some-refresh-token-value';
  const h1 = hashToken(raw);
  const h2 = hashToken(raw);
  assert.equal(h1, h2); // deterministic
  assert.notEqual(h1, raw); // not plaintext
  assert.equal(h1.length, 64); // sha256 hex length
});
