import React, { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { Trash2, UserPlus } from 'lucide-react';

export default function Beneficiaries() {
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [form, setForm] = useState({ nickname: '', accountNumber: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/beneficiaries');
      setBeneficiaries(data.data.beneficiaries);
    } catch (err) {
      setError('Failed to load beneficiaries.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.post('/beneficiaries', form);
      setMessage('Beneficiary added.');
      setForm({ nickname: '', accountNumber: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add beneficiary.');
    }
  };

  const handleRemove = async (id) => {
    try {
      await api.delete(`/beneficiaries/${id}`);
      load();
    } catch (err) {
      setError('Failed to remove beneficiary.');
    }
  };

  return (
    <div className="page">
      <h1>Beneficiaries</h1>
      <p className="muted">Save trusted recipients here for quick selection when sending money.</p>
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <form onSubmit={handleAdd} className="form-card">
        <h3><UserPlus size={16} /> Add a Beneficiary</h3>
        <label>Nickname</label>
        <input
          value={form.nickname}
          onChange={(e) => setForm({ ...form, nickname: e.target.value })}
          placeholder="e.g. Mom, Landlord, Roommate"
          required
        />
        <label>Account Number</label>
        <input
          value={form.accountNumber}
          onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
          required
        />
        <button className="btn btn-primary" type="submit">Save Beneficiary</button>
      </form>

      {loading ? (
        <div className="page-loading">Loading...</div>
      ) : beneficiaries.length === 0 ? (
        <p className="muted">No beneficiaries saved yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Nickname</th><th>Account Number</th><th>Added</th><th></th></tr>
          </thead>
          <tbody>
            {beneficiaries.map((b) => (
              <tr key={b.id}>
                <td>{b.nickname}</td>
                <td>{b.account_number}</td>
                <td>{new Date(b.created_at).toLocaleDateString()}</td>
                <td>
                  <button className="btn btn-danger btn-small" onClick={() => handleRemove(b.id)}>
                    <Trash2 size={14} /> Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
