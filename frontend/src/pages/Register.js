import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';

export default function Register() {
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/register', form);
      setSuccess('Registration successful! Redirecting to login...');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      const msg = err.response?.data?.errors?.[0]?.msg || err.response?.data?.message || 'Registration failed.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Create Your Account</h2>
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <form onSubmit={handleSubmit}>
          <label>Full Name</label>
          <input name="fullName" value={form.fullName} onChange={handleChange} required />

          <label>Email</label>
          <input type="email" name="email" value={form.email} onChange={handleChange} required />

          <label>Phone</label>
          <input name="phone" value={form.phone} onChange={handleChange} placeholder="+91XXXXXXXXXX" />

          <label>Password</label>
          <input type="password" name="password" value={form.password} onChange={handleChange} required />
          <small>Minimum 8 characters, at least one number.</small>

          <button className="btn btn-primary" disabled={loading} type="submit">
            {loading ? 'Creating account...' : 'Register'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
