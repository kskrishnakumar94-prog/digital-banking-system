/**
 * Generates a pseudo-random 12-digit account number.
 * In production, add a DB uniqueness check/retry loop (done in controller).
 */
function generateAccountNumber() {
  let num = '';
  for (let i = 0; i < 12; i++) {
    num += Math.floor(Math.random() * 10);
  }
  return num;
}

module.exports = generateAccountNumber;
