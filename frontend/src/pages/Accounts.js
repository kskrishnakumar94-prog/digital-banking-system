import React, { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { Landmark, PiggyBank, CreditCard, Pencil, Download } from 'lucide-react';

const TYPE_ICONS = { savings: PiggyBank, checking: CreditCard, fixed_deposit: Landmark };
const TYPE_LABELS = { savings: 'Savings', checking: 'Checking', fixed_deposit: 'Fixed Deposit' };

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [showNewAccount, setShowNewAccount] = useState(false);
  const [newAccountForm, setNewAccountForm] = useState({ accountType: 'savings', nickname: '' });

  const [showFdForm, setShowFdForm] = useState(false);
  const [fdForm, setFdForm] = useState({ sourceAccountNumber: '', principal: '', tenureMonths: '12' });

  const [editingNicknameId, setEditingNicknameId] = useState(null);
  const [nicknameDraft, setNicknameDraft] = useState('');

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/accounts');
      setAccounts(data.data.accounts);
      if (data.data.accounts.length > 0 && !fdForm.sourceAccountNumber) {
        setFdForm((f) => ({ ...f, sourceAccountNumber: data.data.accounts[0].account_number }));
      }
    } catch (err) {
      setError('Failed to load accounts.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.post('/accounts', newAccountForm);
      setMessage('Account created.');
      setShowNewAccount(false);
      setNewAccountForm({ accountType: 'savings', nickname: '' });
      loadAccounts();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create account.');
    }
  };

  const handleOpenFd = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/accounts/fixed-deposit', fdForm);
      setMessage(data.message);
      setShowFdForm(false);
      setFdForm({ sourceAccountNumber: accounts[0]?.account_number || '', principal: '', tenureMonths: '12' });
      loadAccounts();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to open Fixed Deposit.');
    }
  };

  const startEditNickname = (acc) => {
    setEditingNicknameId(acc.id);
    setNicknameDraft(acc.nickname || '');
  };

  const saveNickname = async (accId) => {
    try {
      await api.patch(`/accounts/${accId}/nickname`, { nickname: nicknameDraft });
      setEditingNicknameId(null);
      loadAccounts();
    } catch (err) {
      setError('Failed to update nickname.');
    }
  };

  const downloadStatement = (accId, accountNumber) => {
    const token = localStorage.getItem('accessToken');
    const base = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
    fetch(`${base}/accounts/${accId}/transactions/export`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `statement-${accountNumber}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => setError('Failed to download statement.'));
  };

  if (loading) return <div className="page-loading">Loading accounts...</div>;

  return (
    <div className="page">
      <div className="page-header-row">
        <h1>My Accounts</h1>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => setShowNewAccount((v) => !v)}>
            + New Account
          </button>
          <button className="btn btn-primary" onClick={() => setShowFdForm((v) => !v)}>
            + Open Fixed Deposit
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      {showNewAccount && (
        <form onSubmit={handleCreateAccount} className="form-card form-card-inline">
          <h3>Open a New Account</h3>
          <label>Account Type</label>
          <select
            value={newAccountForm.accountType}
            onChange={(e) => setNewAccountForm({ ...newAccountForm, accountType: e.target.value })}
          >
            <option value="savings">Savings</option>
            <option value="checking">Checking</option>
          </select>
          <label>Nickname (optional)</label>
          <input
            value={newAccountForm.nickname}
            onChange={(e) => setNewAccountForm({ ...newAccountForm, nickname: e.target.value })}
            placeholder="e.g. Rent Fund"
          />
          <button className="btn btn-primary" type="submit">Create Account</button>
        </form>
      )}

      {showFdForm && (
        <form onSubmit={handleOpenFd} className="form-card form-card-inline">
          <h3>Open a Fixed Deposit</h3>
          <p className="muted">Funds are locked until maturity and earn a fixed annual interest rate based on tenure.</p>
          <label>Fund From</label>
          <select
            value={fdForm.sourceAccountNumber}
            onChange={(e) => setFdForm({ ...fdForm, sourceAccountNumber: e.target.value })}
          >
            {accounts.filter((a) => a.account_type !== 'fixed_deposit').map((a) => (
              <option key={a.id} value={a.account_number}>
                {a.nickname || a.account_number} - {Number(a.balance).toLocaleString()} {a.currency}
              </option>
            ))}
          </select>
          <label>Principal Amount</label>
          <input
            type="number"
            min="1"
            step="0.01"
            value={fdForm.principal}
            onChange={(e) => setFdForm({ ...fdForm, principal: e.target.value })}
            required
          />
          <label>Tenure</label>
          <select value={fdForm.tenureMonths} onChange={(e) => setFdForm({ ...fdForm, tenureMonths: e.target.value })}>
            <option value="3">3 months (5.00% p.a.)</option>
            <option value="6">6 months (5.00% p.a.)</option>
            <option value="12">12 months (6.00% p.a.)</option>
            <option value="24">24 months (6.75% p.a.)</option>
            <option value="36">36 months (7.25% p.a.)</option>
          </select>
          <button className="btn btn-primary" type="submit">Open Fixed Deposit</button>
        </form>
      )}

      <div className="accounts-grid">
        {accounts.map((acc) => {
          const Icon = TYPE_ICONS[acc.account_type] || PiggyBank;
          return (
            <div key={acc.id} className="account-card">
              <div className="account-card-header">
                <span className="account-type"><Icon size={16} /> {TYPE_LABELS[acc.account_type]}</span>
                <span className={`status-badge status-${acc.status}`}>{acc.status}</span>
              </div>

              {editingNicknameId === acc.id ? (
                <div className="nickname-edit-row">
                  <input value={nicknameDraft} onChange={(e) => setNicknameDraft(e.target.value)} autoFocus />
                  <button className="btn btn-primary btn-small" onClick={() => saveNickname(acc.id)}>Save</button>
                </div>
              ) : (
                <p className="account-nickname" onClick={() => startEditNickname(acc)} title="Click to rename">
                  {acc.nickname || 'Add a nickname'} <Pencil size={12} />
                </p>
              )}

              <p className="account-number">A/C: {acc.account_number}</p>
              <h2 className="account-balance">
                {acc.currency} {Number(acc.balance).toLocaleString()}
              </h2>

              {acc.account_type === 'fixed_deposit' && (
                <div className="fd-details">
                  <span>Rate: <strong>{acc.interest_rate}% p.a.</strong></span>
                  <span>Matures: <strong>{new Date(acc.maturity_date).toDateString()}</strong></span>
                </div>
              )}

              <button className="btn btn-link" onClick={() => downloadStatement(acc.id, acc.account_number)}>
                <Download size={14} /> Download Statement (CSV)
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
