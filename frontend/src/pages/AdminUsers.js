import React, { useEffect, useState, useCallback } from 'react';
import api from '../services/api';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadUsers = useCallback(async (page = 1, searchTerm = '') => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/users', { params: { page, limit: 20, search: searchTerm } });
      setUsers(data.data.users);
      setPagination(data.data.pagination);
    } catch (err) {
      setError('Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers(1, '');
  }, [loadUsers]);

  const handleSearch = (e) => {
    e.preventDefault();
    loadUsers(1, search);
  };

  const handleStatusChange = async (userId, newStatus) => {
    setError('');
    setMessage('');
    try {
      await api.patch(`/admin/users/${userId}/status`, { status: newStatus });
      setMessage(`User status updated to ${newStatus}.`);
      loadUsers(pagination.page, search);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update user status.');
    }
  };

  return (
    <div className="page">
      <h1>Manage Users</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <form onSubmit={handleSearch} className="admin-search-form">
        <input
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn btn-primary" type="submit">Search</button>
      </form>

      {loading ? (
        <div className="page-loading">Loading users...</div>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Accounts</th>
                <th>Total Balance</th>
                <th>2FA</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.full_name}</td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td><span className={`status-badge status-${u.status}`}>{u.status}</span></td>
                  <td>{u.account_count}</td>
                  <td>{Number(u.total_balance).toLocaleString()}</td>
                  <td>{u.is_2fa_enabled ? '✅' : '—'}</td>
                  <td>
                    {u.status !== 'suspended' && (
                      <button className="btn btn-danger btn-small" onClick={() => handleStatusChange(u.id, 'suspended')}>
                        Suspend
                      </button>
                    )}
                    {u.status !== 'active' && (
                      <button className="btn btn-primary btn-small" onClick={() => handleStatusChange(u.id, 'active')}>
                        Activate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pagination">
            <button
              className="btn btn-link"
              disabled={pagination.page <= 1}
              onClick={() => loadUsers(pagination.page - 1, search)}
            >
              ← Previous
            </button>
            <span>Page {pagination.page} of {pagination.totalPages || 1}</span>
            <button
              className="btn btn-link"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => loadUsers(pagination.page + 1, search)}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
