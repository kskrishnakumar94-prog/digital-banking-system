const jwt = require('jsonwebtoken');
const crypto = require('crypto');

function generateAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
}

function generateRefreshToken() {
  // Opaque random token; only its HASH is stored in DB (refresh_tokens.token_hash)
  return crypto.randomBytes(64).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { generateAccessToken, generateRefreshToken, hashToken, verifyAccessToken };
