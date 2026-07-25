const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');

/**
 * All limits are tunable via .env without touching code, so ops can adjust
 * thresholds per-environment (e.g. looser in staging, tighter in prod)
 * without a redeploy of application logic.
 */
const minutes = (n) => n * 60 * 1000;

const AUTH_WINDOW_MIN = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MIN || 15);
const AUTH_MAX = Number(process.env.AUTH_RATE_LIMIT_MAX || 20);

const TWO_FA_WINDOW_MIN = Number(process.env.TWO_FA_RATE_LIMIT_WINDOW_MIN || 15);
const TWO_FA_MAX = Number(process.env.TWO_FA_RATE_LIMIT_MAX || 10);

const API_WINDOW_MIN = Number(process.env.API_RATE_LIMIT_WINDOW_MIN || 15);
const API_MAX = Number(process.env.API_RATE_LIMIT_MAX || 300);

const TRANSFER_WINDOW_MIN = Number(process.env.TRANSFER_RATE_LIMIT_WINDOW_MIN || 5);
const TRANSFER_MAX = Number(process.env.TRANSFER_RATE_LIMIT_MAX || 15);

const SLOWDOWN_WINDOW_MIN = Number(process.env.AUTH_SLOWDOWN_WINDOW_MIN || 15);
const SLOWDOWN_AFTER = Number(process.env.AUTH_SLOWDOWN_AFTER || 3);
const SLOWDOWN_DELAY_MS = Number(process.env.AUTH_SLOWDOWN_DELAY_MS || 500);

// ---------------------------------------------------------------------
// Login: only FAILED attempts count against the limit (skipSuccessfulRequests)
// so a legitimate user who logs in repeatedly is never penalized - only
// repeated *failures* trip the limiter. Paired with a slow-down layer that
// adds an increasing delay before the hard cap is even reached, which
// blunts fast automated brute-force attempts without locking out humans.
// ---------------------------------------------------------------------
const authLimiter = rateLimit({
  windowMs: minutes(AUTH_WINDOW_MIN),
  max: AUTH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many failed attempts. Please try again later.' },
});

const authSlowDown = slowDown({
  windowMs: minutes(SLOWDOWN_WINDOW_MIN),
  delayAfter: SLOWDOWN_AFTER,
  delayMs: (hits) => hits * SLOWDOWN_DELAY_MS, // linear backoff per extra attempt
  maxDelayMs: 10000,
});

// ---------------------------------------------------------------------
// 2FA code verification: a 6-digit TOTP code has only ~1,000,000 possible
// values (or fewer effective values within the valid time window), so this
// endpoint needs a much tighter cap than general auth.
// ---------------------------------------------------------------------
const twoFactorLimiter = rateLimit({
  windowMs: minutes(TWO_FA_WINDOW_MIN),
  max: TWO_FA_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many 2FA attempts. Please wait before trying again.' },
});

// General API limiter - generous ceiling, mainly to blunt scraping/abuse
const apiLimiter = rateLimit({
  windowMs: minutes(API_WINDOW_MIN),
  max: API_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down.' },
});

// Transfers: tight cap since each request moves money
const transferLimiter = rateLimit({
  windowMs: minutes(TRANSFER_WINDOW_MIN),
  max: TRANSFER_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many transfer attempts. Please wait before retrying.' },
});

module.exports = { authLimiter, authSlowDown, twoFactorLimiter, apiLimiter, transferLimiter };
