const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/authMiddleware');
const beneficiaryController = require('../controllers/beneficiaryController');

const router = express.Router();

router.use(requireAuth);

router.get('/', beneficiaryController.list);
router.post(
  '/',
  [
    body('nickname').trim().isLength({ min: 1, max: 50 }).withMessage('Nickname is required.'),
    body('accountNumber').notEmpty().withMessage('Account number is required.'),
  ],
  validate,
  beneficiaryController.create
);
router.delete('/:beneficiaryId', beneficiaryController.remove);

module.exports = router;
