const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const adminController = require('../controllers/adminController');

const router = express.Router();

// Every route here requires an authenticated admin
router.use(requireAuth, requireRole('admin'));

router.get('/stats', adminController.getStats);
router.get('/users', adminController.listUsers);
router.get('/users/:userId', adminController.getUserDetail);
router.patch(
  '/users/:userId/status',
  [body('status').isIn(['active', 'suspended', 'closed'])],
  validate,
  adminController.updateUserStatus
);
router.get('/audit-logs', adminController.getAuditLogs);

module.exports = router;
