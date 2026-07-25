const UserModel = require('../models/userModel');
const AccountModel = require('../models/accountModel');
const TransactionModel = require('../models/transactionModel');
const AuditLogModel = require('../models/auditLogModel');
const { notifyUser } = require('../utils/notifications');
const { logAction } = require('../utils/auditLog');

// ---------------------- SYSTEM STATS ----------------------
exports.getStats = async (req, res, next) => {
  try {
    const stats = await UserModel.getSystemStats();
    res.status(200).json({ success: true, data: { stats } });
  } catch (err) {
    next(err);
  }
};

// ---------------------- LIST USERS (paginated + search) ----------------------
exports.listUsers = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();

    const [users, total] = await Promise.all([
      UserModel.findAllPaginated({ limit, offset, search }),
      UserModel.countAll(search),
    ]);

    res.status(200).json({
      success: true,
      data: { users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------- USER DETAIL ----------------------
exports.getUserDetail = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const user = await UserModel.findDetailById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const accounts = await AccountModel.findByUserId(userId);
    const accountsWithTxns = await Promise.all(
      accounts.map(async (acc) => ({
        ...acc,
        recentTransactions: await TransactionModel.findByAccountId(acc.id, { limit: 10 }),
      }))
    );

    res.status(200).json({ success: true, data: { user, accounts: accountsWithTxns } });
  } catch (err) {
    next(err);
  }
};

// ---------------------- SUSPEND / REACTIVATE USER ----------------------
exports.updateUserStatus = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    if (!['active', 'suspended', 'closed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    }
    if (userId === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot change your own account status.' });
    }

    const updated = await UserModel.updateStatus(userId, status);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    logAction({
      userId: req.user.id,
      action: 'ADMIN_USER_STATUS_CHANGED',
      ipAddress: req.ip,
      metadata: { targetUserId: userId, newStatus: status },
    });

    // Best-effort - let the affected user know their account status changed
    notifyUser(updated, {
      subject: 'Account Status Updated',
      message: `Your account status has been changed to "${status}" by an administrator.`,
    }).catch(() => {});

    res.status(200).json({ success: true, message: `User status updated to ${status}.`, data: { user: updated } });
  } catch (err) {
    next(err);
  }
};

// ---------------------- AUDIT LOG (compliance trail) ----------------------
exports.getAuditLogs = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = (page - 1) * limit;
    const userId = req.query.userId || null;
    const action = req.query.action || null;

    const [logs, total] = await Promise.all([
      AuditLogModel.findPaginated({ limit, offset, userId, action }),
      AuditLogModel.count({ userId, action }),
    ]);

    res.status(200).json({
      success: true,
      data: { logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
    });
  } catch (err) {
    next(err);
  }
};
