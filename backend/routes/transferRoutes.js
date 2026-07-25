const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/authMiddleware');
const { transferLimiter } = require('../middleware/rateLimiter');
const { requireIdempotencyKey } = require('../middleware/idempotency');
const transferController = require('../controllers/transferController');

const router = express.Router();

router.use(requireAuth);

// Idempotency-Key is optional but strongly recommended for this endpoint -
// see middleware/idempotency.js for why (safe retries on money movement).
router.post(
  '/',
  transferLimiter,
  requireIdempotencyKey({ optional: true }),
  [
    body('fromAccountNumber').notEmpty().withMessage('Source account is required.'),
    body('toAccountNumber').notEmpty().withMessage('Recipient account is required.'),
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a positive number.'),
    body('description').optional().isString().isLength({ max: 255 }),
  ],
  validate,
  transferController.transferFunds
);

router.get('/:transferId', transferController.getTransferDetail);

module.exports = router;
