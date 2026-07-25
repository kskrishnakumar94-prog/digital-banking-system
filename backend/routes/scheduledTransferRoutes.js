const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/authMiddleware');
const { transferLimiter } = require('../middleware/rateLimiter');
const scheduledTransferController = require('../controllers/scheduledTransferController');

const router = express.Router();

router.use(requireAuth);

router.get('/', scheduledTransferController.list);
router.post(
  '/',
  transferLimiter,
  [
    body('fromAccountNumber').notEmpty(),
    body('toAccountNumber').notEmpty(),
    body('amount').isFloat({ gt: 0 }),
    body('frequency').optional().isIn(['once', 'weekly', 'monthly']),
    body('scheduledAt').isISO8601().withMessage('scheduledAt must be a valid ISO date.'),
    body('description').optional().isString().isLength({ max: 255 }),
  ],
  validate,
  scheduledTransferController.create
);
router.delete('/:id', scheduledTransferController.cancel);

module.exports = router;
