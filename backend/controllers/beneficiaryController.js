const BeneficiaryModel = require('../models/beneficiaryModel');
const AccountModel = require('../models/accountModel');

exports.list = async (req, res, next) => {
  try {
    const beneficiaries = await BeneficiaryModel.findByUserId(req.user.id);
    res.status(200).json({ success: true, data: { beneficiaries } });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { nickname, accountNumber } = req.body;

    const targetAccount = await AccountModel.findByAccountNumber(accountNumber);
    if (!targetAccount) {
      return res.status(404).json({ success: false, message: 'No account found with that account number.' });
    }
    if (targetAccount.user_id === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot add your own account as a beneficiary.' });
    }

    const beneficiary = await BeneficiaryModel.create(req.user.id, { nickname, accountNumber });
    res.status(201).json({ success: true, message: 'Beneficiary added.', data: { beneficiary } });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'This account is already saved as a beneficiary.' });
    }
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const { beneficiaryId } = req.params;
    const deleted = await BeneficiaryModel.delete(req.user.id, beneficiaryId);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Beneficiary not found.' });
    }
    res.status(200).json({ success: true, message: 'Beneficiary removed.' });
  } catch (err) {
    next(err);
  }
};
