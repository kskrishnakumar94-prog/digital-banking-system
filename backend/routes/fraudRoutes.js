const express = require('express');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const fraudController = require('../controllers/fraudController');

const router = express.Router();

router.use(requireAuth);

router.get('/my-alerts', fraudController.getMyAlerts);
router.get('/login-attempts', fraudController.getLoginAttempts);

// Admin-only endpoints
router.get('/admin/alerts', requireRole('admin'), fraudController.getAllAlerts);
router.patch('/admin/alerts/:alertId/resolve', requireRole('admin'), fraudController.resolveAlert);

module.exports = router;
