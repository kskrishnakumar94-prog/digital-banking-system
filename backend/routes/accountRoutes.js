const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/authMiddleware');
const accountController = require('../controllers/accountController');

const router = express.Router();

router.use(requireAuth); // every route below requires login

router.get('/dashboard', accountController.getDashboard);
router.get('/', accountController.listAccounts);
router.post(
  '/',
  [
    body('accountType').optional().isIn(['savings', 'checking']),
    body('nickname').optional().isString().isLength({ max: 50 }),
  ],
  validate,
  accountController.createAccount
);

router.post(
  '/fixed-deposit',
  [
    body('sourceAccountNumber').notEmpty(),
    body('principal').isFloat({ gt: 0 }).withMessage('Principal must be a positive number.'),
    body('tenureMonths').isInt({ min: 1, max: 60 }).withMessage('Tenure must be between 1 and 60 months.'),
  ],
  validate,
  accountController.openFixedDeposit
);

router.patch(
  '/:accountId/nickname',
  [body('nickname').isString().isLength({ min: 1, max: 50 })],
  validate,
  accountController.updateNickname
);

router.get('/:accountId/balance', accountController.getBalance);
router.get('/:accountId/transactions', accountController.getTransactionHistory);
router.get('/:accountId/transactions/export', accountController.exportTransactionsCsv);

module.exports = router;
