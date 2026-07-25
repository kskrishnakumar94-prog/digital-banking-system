const AccountModel = require('../models/accountModel');
const TransactionModel = require('../models/transactionModel');
const { logAction } = require('../utils/auditLog');

// ---------------------- DASHBOARD ----------------------
exports.getDashboard = async (req, res, next) => {
  try {
    const accounts = await AccountModel.findByUserId(req.user.id);

    const accountsWithRecent = await Promise.all(
      accounts.map(async (acc) => {
        const recentTxns = await TransactionModel.findByAccountId(acc.id, { limit: 5 });
        return { ...acc, recentTransactions: recentTxns };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        user: { id: req.user.id, fullName: req.user.full_name, email: req.user.email },
        accounts: accountsWithRecent,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------- BALANCE INQUIRY ----------------------
exports.getBalance = async (req, res, next) => {
  try {
    const { accountId } = req.params;
    const account = await AccountModel.findById(accountId);

    if (!account || account.user_id !== req.user.id) {
      return res.status(404).json({ success: false, message: 'Account not found.' });
    }

    res.status(200).json({
      success: true,
      data: {
        accountNumber: account.account_number,
        balance: account.balance,
        currency: account.currency,
        status: account.status,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------- TRANSACTION HISTORY (paginated) ----------------------
exports.getTransactionHistory = async (req, res, next) => {
  try {
    const { accountId } = req.params;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = (page - 1) * limit;

    const account = await AccountModel.findById(accountId);
    if (!account || account.user_id !== req.user.id) {
      return res.status(404).json({ success: false, message: 'Account not found.' });
    }

    const [transactions, total] = await Promise.all([
      TransactionModel.findByAccountId(accountId, { limit, offset }),
      TransactionModel.countByAccountId(accountId),
    ]);

    res.status(200).json({
      success: true,
      data: {
        transactions,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------- EXPORT STATEMENT AS CSV ----------------------
exports.exportTransactionsCsv = async (req, res, next) => {
  try {
    const { accountId } = req.params;
    const account = await AccountModel.findById(accountId);
    if (!account || account.user_id !== req.user.id) {
      return res.status(404).json({ success: false, message: 'Account not found.' });
    }

    // Cap the export at a sane maximum so a single request can't be used
    // to pull an unbounded amount of data.
    const transactions = await TransactionModel.findByAccountId(accountId, { limit: 1000, offset: 0 });

    const header = 'Date,Type,Amount,Balance After,Description,Status\n';
    const rows = transactions
      .map((t) => {
        const desc = (t.description || '').replace(/"/g, '""');
        return `"${new Date(t.created_at).toISOString()}","${t.type}","${t.amount}","${t.balance_after}","${desc}","${t.status}"`;
      })
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="statement-${account.account_number}.csv"`);
    res.status(200).send(header + rows);
  } catch (err) {
    next(err);
  }
};

// ---------------------- LIST MY ACCOUNTS ----------------------
exports.listAccounts = async (req, res, next) => {
  try {
    const accounts = await AccountModel.findByUserId(req.user.id);
    res.status(200).json({ success: true, data: { accounts } });
  } catch (err) {
    next(err);
  }
};

// ---------------------- CREATE ADDITIONAL ACCOUNT (savings/checking) ----------------------
exports.createAccount = async (req, res, next) => {
  try {
    const { accountType, nickname } = req.body;
    const account = await AccountModel.createForUser(req.user.id, accountType || 'savings', nickname || null);
    logAction({
      userId: req.user.id,
      action: 'ACCOUNT_CREATED',
      ipAddress: req.ip,
      metadata: { accountId: account.id, accountType: account.account_type },
    });
    res.status(201).json({ success: true, message: 'Account created.', data: { account } });
  } catch (err) {
    next(err);
  }
};

// ---------------------- OPEN A FIXED DEPOSIT ----------------------
exports.openFixedDeposit = async (req, res, next) => {
  try {
    const { sourceAccountNumber, principal, tenureMonths } = req.body;

    const sourceAccount = await AccountModel.findByAccountNumber(sourceAccountNumber);
    if (!sourceAccount || sourceAccount.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You do not own the source account.' });
    }

    const fd = await AccountModel.openFixedDeposit({
      userId: req.user.id,
      sourceAccountId: sourceAccount.id,
      principal: Number(principal),
      tenureMonths: Number(tenureMonths),
    });

    logAction({
      userId: req.user.id,
      action: 'FIXED_DEPOSIT_OPENED',
      ipAddress: req.ip,
      metadata: { accountId: fd.id, principal, tenureMonths, interestRate: fd.interest_rate },
    });

    res.status(201).json({
      success: true,
      message: `Fixed Deposit opened at ${fd.interest_rate}% p.a., maturing ${new Date(fd.maturity_date).toDateString()}.`,
      data: { account: fd },
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    next(err);
  }
};

// ---------------------- RENAME / SET NICKNAME ----------------------
exports.updateNickname = async (req, res, next) => {
  try {
    const { accountId } = req.params;
    const { nickname } = req.body;
    const updated = await AccountModel.updateNickname(req.user.id, accountId, nickname);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Account not found.' });
    }
    res.status(200).json({ success: true, message: 'Nickname updated.', data: { account: updated } });
  } catch (err) {
    next(err);
  }
};
