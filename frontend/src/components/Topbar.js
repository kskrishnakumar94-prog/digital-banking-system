import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Topbar({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const initials = (user?.fullName || '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="topbar">
      <button className="topbar-menu-btn" onClick={onToggleSidebar} aria-label="Toggle menu">
        <Menu size={22} />
      </button>

      <div className="topbar-spacer" />

      {user && (
        <div className="topbar-user">
          <div className="avatar">{initials}</div>
          <div className="topbar-user-info">
            <span className="topbar-user-name">{user.fullName}</span>
            <span className="topbar-user-role">{user.role}</span>
          </div>
          <button className="btn btn-icon" onClick={handleLogout} title="Logout" aria-label="Logout">
            <LogOut size={18} />
          </button>
        </div>
      )}
    </header>
  );
}
