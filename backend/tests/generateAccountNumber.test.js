const test = require('node:test');
const assert = require('node:assert/strict');
const generateAccountNumber = require('../utils/generateAccountNumber');

test('generateAccountNumber returns a 12-digit numeric string', () => {
  const num = generateAccountNumber();
  assert.equal(typeof num, 'string');
  assert.equal(num.length, 12);
  assert.match(num, /^[0-9]{12}$/);
});

test('generateAccountNumber produces varied output across calls', () => {
  const samples = new Set();
  for (let i = 0; i < 50; i++) samples.add(generateAccountNumber());
  // Extremely unlikely to collide 50 times if randomness works
  assert.ok(samples.size > 45, `expected high uniqueness, got ${samples.size}/50`);
});
