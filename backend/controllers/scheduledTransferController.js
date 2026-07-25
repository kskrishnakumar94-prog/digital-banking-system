const AccountModel = require('../models/accountModel');
const ScheduledTransferModel = require('../models/scheduledTransferModel');

exports.list = async (req, res, next) => {
  try {
    const transfers = await ScheduledTransferModel.findByUserId(req.user.id);
    res.status(200).json({ success: true, data: { scheduledTransfers: transfers } });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { fromAccountNumber, toAccountNumber, amount, description, frequency, scheduledAt } = req.body;

    if (fromAccountNumber === toAccountNumber) {
      return res.status(400).json({ success: false, message: 'Cannot schedule a transfer to the same account.' });
    }

    const nextRunAt = new Date(scheduledAt);
    if (Number.isNaN(nextRunAt.getTime()) || nextRunAt <= new Date()) {
      return res.status(400).json({ success: false, message: 'scheduledAt must be a valid date in the future.' });
    }

    const sourceAccount = await AccountModel.findByAccountNumber(fromAccountNumber);
    if (!sourceAccount || sourceAccount.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You do not own the source account.' });
    }

    const recipientAccount = await AccountModel.findByAccountNumber(toAccountNumber);
    if (!recipientAccount) {
      return res.status(404).json({ success: false, message: 'Recipient account not found.' });
    }

    const scheduled = await ScheduledTransferModel.create({
      userId: req.user.id,
      fromAccountId: sourceAccount.id,
      toAccountNumber,
      amount: Number(amount),
      description,
      frequency: frequency || 'once',
      nextRunAt,
    });

    res.status(201).json({ success: true, message: 'Transfer scheduled.', data: { scheduledTransfer: scheduled } });
  } catch (err) {
    next(err);
  }
};

exports.cancel = async (req, res, next) => {
  try {
    const { id } = req.params;
    const cancelled = await ScheduledTransferModel.cancel(req.user.id, id);
    if (!cancelled) {
      return res.status(404).json({ success: false, message: 'Scheduled transfer not found.' });
    }
    res.status(200).json({ success: true, message: 'Scheduled transfer cancelled.' });
  } catch (err) {
    next(err);
  }
};
