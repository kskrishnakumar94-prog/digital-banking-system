const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/authMiddleware');
const { authLimiter, authSlowDown, twoFactorLimiter } = require('../middleware/rateLimiter');
const authController = require('../controllers/authController');

const router = express.Router();

router.post(
  '/register',
  [
    body('fullName').trim().isLength({ min: 2 }).withMessage('Full name is required.'),
    body('email').isEmail().withMessage('A valid email is required.').normalizeEmail(),
    body('phone').optional().isMobilePhone('any').withMessage('Invalid phone number.'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters.')
      .matches(/\d/)
      .withMessage('Password must contain a number.'),
  ],
  validate,
  authController.register
);

// Login: slow-down kicks in after a few failed attempts (adds delay),
// authLimiter is the hard cap (only failed attempts count against it).
router.post(
  '/login',
  authSlowDown,
  authLimiter,
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  validate,
  authController.login
);

// 2FA code verification gets its own tighter limiter (see rateLimiter.js)
router.post(
  '/login/verify-2fa',
  twoFactorLimiter,
  [body('challengeId').notEmpty(), body('token').isLength({ min: 6, max: 6 })],
  validate,
  authController.verifyTwoFactorLogin
);

router.post('/refresh', authController.refreshToken);
router.post('/logout', authController.logout);

router.get('/me', requireAuth, authController.me);

router.post('/2fa/setup', requireAuth, authController.setupTwoFactor);
router.post(
  '/2fa/confirm',
  requireAuth,
  twoFactorLimiter,
  [body('token').isLength({ min: 6, max: 6 })],
  validate,
  authController.confirmTwoFactor
);
router.post('/2fa/disable', requireAuth, authController.disableTwoFactor);

router.patch(
  '/profile',
  requireAuth,
  [
    body('fullName').optional().trim().isLength({ min: 2 }),
    body('phone').optional().isMobilePhone('any'),
  ],
  validate,
  authController.updateProfile
);

router.post(
  '/change-password',
  requireAuth,
  [
    body('currentPassword').notEmpty(),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters.')
      .matches(/\d/)
      .withMessage('New password must contain a number.'),
  ],
  validate,
  authController.changePassword
);

module.exports = router;
