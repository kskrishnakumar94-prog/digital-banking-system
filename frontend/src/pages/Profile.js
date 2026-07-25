import React, { useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function Profile() {
  const { user, setUser } = useAuth();
  const [profileForm, setProfileForm] = useState({ fullName: user?.fullName || '', phone: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordErr, setPasswordErr] = useState('');

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileErr('');
    setProfileMsg('');
    try {
      const { data } = await api.patch('/auth/profile', profileForm);
      setUser((u) => ({ ...u, fullName: data.data.user.full_name }));
      setProfileMsg('Profile updated.');
    } catch (err) {
      setProfileErr(err.response?.data?.errors?.[0]?.msg || err.response?.data?.message || 'Failed to update profile.');
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordErr('');
    setPasswordMsg('');
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordErr('New passwords do not match.');
      return;
    }
    try {
      await api.post('/auth/change-password', passwordForm);
      setPasswordMsg('Password changed successfully.');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPasswordErr(err.response?.data?.errors?.[0]?.msg || err.response?.data?.message || 'Failed to change password.');
    }
  };

  return (
    <div className="page">
      <h1>Profile</h1>

      <div className="form-card">
        <h3>Personal Information</h3>
        {profileErr && <div className="alert alert-error">{profileErr}</div>}
        {profileMsg && <div className="alert alert-success">{profileMsg}</div>}
        <form onSubmit={handleProfileSubmit}>
          <label>Full Name</label>
          <input
            value={profileForm.fullName}
            onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
          />
          <label>Phone</label>
          <input
            value={profileForm.phone}
            onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
            placeholder="+91XXXXXXXXXX"
          />
          <label>Email</label>
          <input value={user?.email || ''} disabled />
          <small>Email cannot be changed.</small>
          <button className="btn btn-primary" type="submit">Save Changes</button>
        </form>
      </div>

      <div className="form-card">
        <h3>Change Password</h3>
        {passwordErr && <div className="alert alert-error">{passwordErr}</div>}
        {passwordMsg && <div className="alert alert-success">{passwordMsg}</div>}
        <form onSubmit={handlePasswordSubmit}>
          <label>Current Password</label>
          <input
            type="password"
            value={passwordForm.currentPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
            required
          />
          <label>New Password</label>
          <input
            type="password"
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
            required
          />
          <label>Confirm New Password</label>
          <input
            type="password"
            value={passwordForm.confirmPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
            required
          />
          <button className="btn btn-primary" type="submit">Change Password</button>
        </form>
      </div>
    </div>
  );
}
