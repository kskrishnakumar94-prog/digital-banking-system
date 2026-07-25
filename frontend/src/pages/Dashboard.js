import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import api from '../services/api';

const CHART_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899', '#0891b2'];

export default function Dashboard() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const { data } = await api.get('/accounts/dashboard');
        setAccounts(data.data.accounts);
      } catch (err) {
        setError('Failed to load dashboard.');
      } finally {
        setLoading(false);
      }
    };
    loadDashboard();
  }, []);

  if (loading) return <div className="page-loading">Loading dashboard...</div>;

  const totalBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);
  const chartData = accounts
    .filter((a) => Number(a.balance) > 0)
    .map((a) => ({ name: a.nickname || a.account_number, value: Number(a.balance) }));

  return (
    <div className="page">
      <div className="page-header-row">
        <h1>My Dashboard</h1>
        <div className="page-header-actions">
          <Link to="/transfer" className="btn btn-primary">Send Money</Link>
          <Link to="/accounts" className="btn btn-secondary">Manage Accounts</Link>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="dashboard-summary-row">
        <div className="summary-card">
          <span className="stat-label">Total Balance</span>
          <span className="stat-value">{totalBalance.toLocaleString()}</span>
        </div>
        <div className="summary-card">
          <span className="stat-label">Total Accounts</span>
          <span className="stat-value">{accounts.length}</span>
        </div>
        {chartData.length > 0 && (
          <div className="summary-chart-card">
            <span className="stat-label">Balance Distribution</span>
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={35} outerRadius={55} paddingAngle={2}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => Number(v).toLocaleString()} />
                <Legend verticalAlign="middle" align="right" layout="vertical" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="accounts-grid">
        {accounts.map((acc) => (
          <div key={acc.id} className="account-card">
            <div className="account-card-header">
              <span className="account-type">{acc.nickname || acc.account_type.replace('_', ' ').toUpperCase()}</span>
              <span className={`status-badge status-${acc.status}`}>{acc.status}</span>
            </div>
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

            <h4>Recent Transactions</h4>
            {acc.recentTransactions.length === 0 ? (
              <p className="muted">No transactions yet.</p>
            ) : (
              <ul className="txn-list">
                {acc.recentTransactions.map((txn) => (
                  <li key={txn.id} className={`txn-item txn-${txn.type}`}>
                    <span>{txn.description || (txn.type === 'credit' ? 'Received' : 'Sent')}</span>
                    <span>
                      {txn.type === 'credit' ? '+' : '-'}
                      {Number(txn.amount).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
