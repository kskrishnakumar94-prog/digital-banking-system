import React, { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { CalendarPlus, XCircle } from 'lucide-react';

export default function ScheduledTransfers() {
  const [accounts, setAccounts] = useState([]);
  const [scheduled, setScheduled] = useState([]);
  const [form, setForm] = useState({
    fromAccountNumber: '',
    toAccountNumber: '',
    amount: '',
    description: '',
    frequency: 'once',
    scheduledAt: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accountsRes, scheduledRes] = await Promise.all([
        api.get('/accounts'),
        api.get('/scheduled-transfers'),
      ]);
      setAccounts(accountsRes.data.data.accounts);
      setScheduled(scheduledRes.data.data.scheduledTransfers);
      if (accountsRes.data.data.accounts.length > 0) {
        setForm((f) => ({ ...f, fromAccountNumber: f.fromAccountNumber || accountsRes.data.data.accounts[0].account_number }));
      }
    } catch (err) {
      setError('Failed to load scheduled transfers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.post('/scheduled-transfers', { ...form, amount: parseFloat(form.amount) });
      setMessage('Transfer scheduled successfully.');
      setForm({ ...form, toAccountNumber: '', amount: '', description: '', scheduledAt: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.errors?.[0]?.msg || err.response?.data?.message || 'Failed to schedule transfer.');
    }
  };

  const handleCancel = async (id) => {
    try {
      await api.delete(`/scheduled-transfers/${id}`);
      load();
    } catch (err) {
      setError('Failed to cancel scheduled transfer.');
    }
  };

  // Sensible default: 1 hour from now, formatted for a datetime-local input
  const minDateTime = new Date(Date.now() + 60 * 1000).toISOString().slice(0, 16);

  if (loading) return <div className="page-loading">Loading...</div>;

  return (
    <div className="page">
      <h1>Scheduled &amp; Recurring Transfers</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <form onSubmit={handleSubmit} className="form-card">
        <h3><CalendarPlus size={16} /> Schedule a New Transfer</h3>
        <label>From Account</label>
        <select value={form.fromAccountNumber} onChange={(e) => setForm({ ...form, fromAccountNumber: e.target.value })} required>
          {accounts.filter((a) => a.account_type !== 'fixed_deposit').map((a) => (
            <option key={a.id} value={a.account_number}>
              {a.nickname || a.account_number} - {Number(a.balance).toLocaleString()} {a.currency}
            </option>
          ))}
        </select>

        <label>Recipient Account Number</label>
        <input value={form.toAccountNumber} onChange={(e) => setForm({ ...form, toAccountNumber: e.target.value })} required />

        <label>Amount</label>
        <input type="number" step="0.01" min="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />

        <label>Description (optional)</label>
        <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

        <label>Frequency</label>
        <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
          <option value="once">Once</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>

        <label>{form.frequency === 'once' ? 'Send At' : 'First Run At'}</label>
        <input
          type="datetime-local"
          min={minDateTime}
          value={form.scheduledAt}
          onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
          required
        />

        <button className="btn btn-primary" type="submit">Schedule Transfer</button>
      </form>

      <h3>Your Scheduled Transfers</h3>
      {scheduled.length === 0 ? (
        <p className="muted">No scheduled transfers yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>From</th><th>To</th><th>Amount</th><th>Frequency</th><th>Next Run</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {scheduled.map((s) => (
              <tr key={s.id}>
                <td>{s.from_account_number}</td>
                <td>{s.to_account_number}</td>
                <td>{Number(s.amount).toLocaleString()}</td>
                <td>{s.frequency}</td>
                <td>{new Date(s.next_run_at).toLocaleString()}</td>
                <td><span className={`status-badge status-${s.status === 'active' ? 'active' : 'closed'}`}>{s.status}</span></td>
                <td>
                  {s.status === 'active' && (
                    <button className="btn btn-danger btn-small" onClick={() => handleCancel(s.id)}>
                      <XCircle size={14} /> Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
