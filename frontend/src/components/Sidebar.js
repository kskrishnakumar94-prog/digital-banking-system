import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  CalendarClock,
  Users,
  ShieldCheck,
  UserCircle,
  Bell,
  ShieldAlert,
  Landmark,
  UsersRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/transfer', label: 'Transfer', icon: ArrowLeftRight },
  { to: '/scheduled-transfers', label: 'Scheduled', icon: CalendarClock },
  { to: '/beneficiaries', label: 'Beneficiaries', icon: Users },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/security', label: 'Security', icon: ShieldCheck },
  { to: '/profile', label: 'Profile', icon: UserCircle },
];

const adminItems = [
  { to: '/admin', label: 'Admin Overview', icon: ShieldAlert, end: true },
  { to: '/admin/users', label: 'Manage Users', icon: UsersRound },
  { to: '/admin/alerts', label: 'Fraud Alerts', icon: ShieldAlert },
];

export default function Sidebar({ open, onNavigate }) {
  const { user } = useAuth();

  return (
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand">
        <Landmark size={22} strokeWidth={2.2} />
        <span>DigitalBank</span>
      </div>

      <nav className="sidebar-nav">
        <p className="sidebar-section-label">Banking</p>
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
          >
            <Icon size={18} strokeWidth={2} />
            <span>{label}</span>
          </NavLink>
        ))}

        {user?.role === 'admin' && (
          <>
            <p className="sidebar-section-label">Administration</p>
            {adminItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={onNavigate}
                className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
              >
                <Icon size={18} strokeWidth={2} />
                <span>{label}</span>
              </NavLink>
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}
