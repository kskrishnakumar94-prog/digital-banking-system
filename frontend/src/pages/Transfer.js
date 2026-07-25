import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { CalendarClock } from 'lucide-react';

export default function Transfer() {
  const [accounts, setAccounts] = useState([]);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [form, setForm] = useState({ fromAccountNumber: '', toAccountNumber: '', amount: '', description: '' });
  const [saveAsBeneficiary, setSaveAsBeneficiary] = useState(false);
  const [beneficiaryNickname, setBeneficiaryNickname] = useState('');
  const [message, setMessage] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [accountsRes, beneficiariesRes] = await Promise.all([
        api.get('/accounts'),
        api.get('/beneficiaries'),
      ]);
      setAccounts(accountsRes.data.data.accounts);
      setBeneficiaries(beneficiariesRes.data.data.beneficiaries);
      if (accountsRes.data.data.accounts.length > 0) {
        setForm((f) => ({ ...f, fromAccountNumber: accountsRes.data.data.accounts[0].account_number }));
      }
    };
    load();
  }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSelectBeneficiary = (accountNumber) => {
    setForm({ ...form, toAccountNumber: accountNumber });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage(null);
    setLoading(true);
    try {
      const { data } = await api.post('/transfers', {
        ...form,
        amount: parseFloat(form.amount),
      });

      if (saveAsBeneficiary && beneficiaryNickname) {
        api
          .post('/beneficiaries', { nickname: beneficiaryNickname, accountNumber: form.toAccountNumber })
          .catch(() => {}); // best-effort, don't block the transfer success message on this
      }

      setMessage(
        `Transfer successful! New balance: ${data.data.newBalance}` +
          (data.data.fraudAlertsTriggered ? ' (⚠️ Flagged for review)' : '')
      );
      setForm({ ...form, toAccountNumber: '', amount: '', description: '' });
      setSaveAsBeneficiary(false);
      setBeneficiaryNickname('');
    } catch (err) {
      setError(err.response?.data?.errors?.[0]?.msg || err.response?.data?.message || 'Transfer failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header-row">
        <h1>Transfer Funds</h1>
        <Link to="/scheduled-transfers" className="btn btn-secondary">
          <CalendarClock size={16} /> Schedule for Later
        </Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      {beneficiaries.length > 0 && (
        <div className="beneficiary-quickpicks">
          <span className="muted">Quick send:</span>
          {beneficiaries.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`chip ${form.toAccountNumber === b.account_number ? 'chip-active' : ''}`}
              onClick={() => handleSelectBeneficiary(b.account_number)}
            >
              {b.nickname}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="form-card">
        <label>From Account</label>
        <select name="fromAccountNumber" value={form.fromAccountNumber} onChange={handleChange} required>
          {accounts.filter((a) => a.account_type !== 'fixed_deposit').map((acc) => (
            <option key={acc.id} value={acc.account_number}>
              {acc.nickname || acc.account_number} ({acc.account_type}) - {acc.currency} {Number(acc.balance).toLocaleString()}
            </option>
          ))}
        </select>

        <label>Recipient Account Number</label>
        <input name="toAccountNumber" value={form.toAccountNumber} onChange={handleChange} required />

        <label>Amount</label>
        <input type="number" step="0.01" min="0.01" name="amount" value={form.amount} onChange={handleChange} required />

        <label>Description (optional)</label>
        <input name="description" value={form.description} onChange={handleChange} placeholder="e.g. Rent payment" />

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={saveAsBeneficiary}
            onChange={(e) => setSaveAsBeneficiary(e.target.checked)}
          />
          Save this recipient as a beneficiary
        </label>
        {saveAsBeneficiary && (
          <input
            value={beneficiaryNickname}
            onChange={(e) => setBeneficiaryNickname(e.target.value)}
            placeholder="Nickname for this beneficiary"
            required
          />
        )}

        <button className="btn btn-primary" disabled={loading} type="submit">
          {loading ? 'Processing...' : 'Send Money'}
        </button>
      </form>
    </div>
  );
}
