const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/db');
const UserModel = require('../models/userModel');
const AccountModel = require('../models/accountModel');
const { generateAccessToken, generateRefreshToken, hashToken, } = require('../utils/token');
const { evaluateLoginAttempt, evaluateNewDevice } = require('../utils/fraudDetection');
const { notifyUser } = require('../utils/notifications');
const { twoFactorStatusChanged } = require('../utils/alertTemplates');
const { logAction } = require('../utils/auditLog');
const logger = require('../utils/logger');

const MAX_LOGIN_ATTEMPTS = Number(process.env.MAX_LOGIN_ATTEMPTS || 5);
const LOGIN_LOCKOUT_MINUTES = Number(process.env.LOGIN_LOCKOUT_MINUTES || 15);
const REFRESH_EXPIRES_DAYS = 7;

// Temporary in-memory store for "pending 2FA" logins (userId -> expiry)
// In production, use Redis. Kept simple here for clarity.
const pendingTwoFA = new Map();

async function logLoginAttempt({ userId, email, ip, userAgent, success, reason }) {
  await query(
    `INSERT INTO login_attempts (user_id, email_attempted, ip_address, user_agent, success, reason)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId || null, email, ip, userAgent, success, reason || null]
  );
}

// ---------------------- REGISTER ----------------------
exports.register = async (req, res, next) => {
  try {
    const { fullName, email, phone, password } = req.body;

    const existing = await UserModel.findByEmail(email);
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email is already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await UserModel.create({ fullName, email, phone, passwordHash });

    // Auto-create a default savings account for the new user
    const account = await AccountModel.createForUser(user.id, 'savings');

    logger.info(`New user registered: ${email}`);
    logAction({ userId: user.id, action: 'REGISTER', ipAddress: req.ip, metadata: { email } });
    res.status(201).json({
      success: true,
      message: 'Registration successful.',
      data: { user, account },
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------- LOGIN (step 1: password) ----------------------
exports.login = async (req, res, next) => {
  const ip = req.ip;
  const userAgent = req.headers['user-agent'];
  const { email, password } = req.body;

  try {
    const user = await UserModel.findByEmail(email);

    if (!user) {
      await logLoginAttempt({ email, ip, userAgent, success: false, reason: 'USER_NOT_FOUND' });
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Check account lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await logLoginAttempt({ userId: user.id, email, ip, userAgent, success: false, reason: 'ACCOUNT_LOCKED' });
      return res.status(423).json({
        success: false,
        message: `Account temporarily locked. Try again after ${new Date(user.locked_until).toLocaleTimeString()}.`,
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      const failCount = await UserModel.incrementFailedLogin(user.id);
      await logLoginAttempt({ userId: user.id, email, ip, userAgent, success: false, reason: 'BAD_PASSWORD' });
      await evaluateLoginAttempt({ userId: user.id, email, ipAddress: ip, success: false });

      if (failCount >= MAX_LOGIN_ATTEMPTS) {
        const lockUntil = new Date(Date.now() + LOGIN_LOCKOUT_MINUTES * 60 * 1000);
        await UserModel.lockAccount(user.id, lockUntil);
        logAction({
          userId: user.id,
          action: 'ACCOUNT_LOCKED',
          ipAddress: ip,
          metadata: { reason: 'too_many_failed_attempts', failCount, lockUntil },
        });
        return res.status(423).json({
          success: false,
          message: `Too many failed attempts. Account locked for ${LOGIN_LOCKOUT_MINUTES} minutes.`,
        });
      }
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Password correct -> reset counters
    await UserModel.resetFailedLogin(user.id);
    await logLoginAttempt({ userId: user.id, email, ip, userAgent, success: true });

    // If 2FA enabled, don't issue tokens yet - require OTP verification.
    // (new-device check runs later, after the OTP is confirmed, so it
    // reflects a fully-completed login rather than password-only.)
    if (user.is_2fa_enabled) {
      const challengeId = uuidv4();
      pendingTwoFA.set(challengeId, { userId: user.id, expires: Date.now() + 5 * 60 * 1000 });
      return res.status(200).json({
        success: true,
        requires2FA: true,
        challengeId,
        message: 'Password verified. Please provide your 2FA code.',
      });
    }

    // No 2FA -> this login is fully complete now
    evaluateNewDevice({ userId: user.id, ipAddress: ip }).catch(() => {});
    return await issueTokens(res, user, req);
  } catch (err) {
    next(err);
  }
};

// ---------------------- LOGIN (step 2: verify 2FA code) ----------------------
exports.verifyTwoFactorLogin = async (req, res, next) => {
  try {
    const { challengeId, token } = req.body;
    const pending = pendingTwoFA.get(challengeId);

    if (!pending || pending.expires < Date.now()) {
      pendingTwoFA.delete(challengeId);
      return res.status(400).json({ success: false, message: 'Login challenge expired. Please log in again.' });
    }

    const fullUser = await query('SELECT * FROM users WHERE id = $1', [pending.userId]);
    const dbUser = fullUser.rows[0];

    const verified = speakeasy.totp.verify({
      secret: dbUser.two_fa_secret,
      encoding: 'base32',
      token,
      window: 1, // allow 30s clock drift
    });

    if (!verified) {
      await logLoginAttempt({
        userId: dbUser.id,
        email: dbUser.email,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        success: false,
        reason: 'BAD_2FA_CODE',
      });
      return res.status(401).json({ success: false, message: 'Invalid 2FA code.' });
    }

    pendingTwoFA.delete(challengeId);
    evaluateNewDevice({ userId: dbUser.id, ipAddress: req.ip }).catch(() => {});
    return await issueTokens(res, dbUser, req);
  } catch (err) {
    next(err);
  }
};

// ---------------------- 2FA SETUP ----------------------
exports.setupTwoFactor = async (req, res, next) => {
  try {
    const secret = speakeasy.generateSecret({
      name: `${process.env.TWO_FA_APP_NAME || 'DigitalBank'} (${req.user.email})`,
    });

    await UserModel.setTwoFactorSecret(req.user.id, secret.base32);
    const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);

    res.status(200).json({
      success: true,
      message: 'Scan this QR code with your authenticator app, then confirm with a code to enable 2FA.',
      data: { qrCode: qrDataUrl, manualEntryKey: secret.base32 },
    });
  } catch (err) {
    next(err);
  }
};

exports.confirmTwoFactor = async (req, res, next) => {
  try {
    const { token } = req.body;
    const { rows } = await query('SELECT two_fa_secret FROM users WHERE id = $1', [req.user.id]);
    const secret = rows[0]?.two_fa_secret;

    if (!secret) {
      return res.status(400).json({ success: false, message: 'No 2FA setup in progress.' });
    }

    const verified = speakeasy.totp.verify({ secret, encoding: 'base32', token, window: 1 });
    if (!verified) {
      return res.status(401).json({ success: false, message: 'Invalid code. Please try again.' });
    }

    await UserModel.enableTwoFactor(req.user.id);
    logAction({ userId: req.user.id, action: 'TWO_FA_ENABLED', ipAddress: req.ip });
    notifyUser(req.user, twoFactorStatusChanged({ enabled: true })).catch(() => {});
    res.status(200).json({ success: true, message: '2FA has been enabled on your account.' });
  } catch (err) {
    next(err);
  }
};

exports.disableTwoFactor = async (req, res, next) => {
  try {
    await UserModel.disableTwoFactor(req.user.id);
    logAction({ userId: req.user.id, action: 'TWO_FA_DISABLED', ipAddress: req.ip });
    notifyUser(req.user, twoFactorStatusChanged({ enabled: false })).catch(() => {});
    res.status(200).json({ success: true, message: '2FA has been disabled.' });
  } catch (err) {
    next(err);
  }
};

// ---------------------- TOKEN ISSUANCE / SESSION MGMT ----------------------
async function issueTokens(res, user, req) {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken();
  const refreshHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, refreshHash, req.headers['user-agent'], req.ip, expiresAt]
  );

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
  });

  logAction({ userId: user.id, action: 'LOGIN_SUCCESS', ipAddress: req.ip, metadata: { via2FA: !!user.is_2fa_enabled } });

  return res.status(200).json({
    success: true,
    message: 'Login successful.',
    data: {
      accessToken,
      user: { id: user.id, fullName: user.full_name, email: user.email, role: user.role, is_2fa_enabled: !!user.is_2fa_enabled },
    },
  });
}

// ---------------------- REFRESH ACCESS TOKEN ----------------------
exports.refreshToken = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'No refresh token provided.' });
    }

    const tokenHash = hashToken(refreshToken);
    const { rows } = await query(
      `SELECT * FROM refresh_tokens WHERE token_hash = $1 AND is_revoked = FALSE AND expires_at > NOW()`,
      [tokenHash]
    );
    const stored = rows[0];

    if (!stored) {
      return res.status(401).json({ success: false, message: 'Invalid or expired session. Please log in again.' });
    }

    const user = await UserModel.findById(stored.user_id);
    const accessToken = generateAccessToken({ id: user.id, role: user.role, email: user.email });

    res.status(200).json({ success: true, data: { accessToken } });
  } catch (err) {
    next(err);
  }
};

// ---------------------- LOGOUT ----------------------
exports.logout = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await query('UPDATE refresh_tokens SET is_revoked = TRUE WHERE token_hash = $1', [tokenHash]);
    }
    res.clearCookie('refreshToken');
    res.status(200).json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
};

exports.me = async (req, res) => {
  res.status(200).json({ success: true, data: { user: req.user } });
};

// ---------------------- UPDATE PROFILE ----------------------
exports.updateProfile = async (req, res, next) => {
  try {
    const { fullName, phone } = req.body;
    const updated = await UserModel.updateProfile(req.user.id, { fullName, phone });
    res.status(200).json({ success: true, message: 'Profile updated.', data: { user: updated } });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'That phone number is already in use.' });
    }
    next(err);
  }
};

// ---------------------- CHANGE PASSWORD ----------------------
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const { rows } = await query('SELECT password_hash, email FROM users WHERE id = $1', [req.user.id]);
    const dbUser = rows[0];

    const matches = await bcrypt.compare(currentPassword, dbUser.password_hash);
    if (!matches) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await UserModel.updatePassword(req.user.id, newHash);
    logAction({ userId: req.user.id, action: 'PASSWORD_CHANGED', ipAddress: req.ip });

    notifyUser(req.user, {
      subject: 'Password Changed',
      message: 'Your account password was just changed. If this was not you, contact support immediately.',
    }).catch(() => {});

    res.status(200).json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    next(err);
  }
};
