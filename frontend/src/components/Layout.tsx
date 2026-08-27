import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  FiHome, FiUsers, FiVideo, FiUser, FiLogOut, FiMenu, FiX, FiUserCheck,
  FiCreditCard, FiCalendar, FiAlertCircle, FiUserX, FiDollarSign, FiSettings,
} from 'react-icons/fi';

const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const role = user?.role || '';
  const isAdmin    = role === 'super_admin' || role === 'admin';
  const isIncharge = role === 'incharge';
  const isTeacher  = role === 'teacher';

  const roleLabel: Record<string, string> = {
    super_admin: 'Admin',
    admin:       'Admin',
    incharge:    'Incharge',
    teacher:     'Teacher',
  };

  const roleColor: Record<string, string> = {
    super_admin: 'var(--accent)',
    admin:       'var(--accent)',
    incharge:    '#f59e0b',
    teacher:     '#10b981',
  };

  // ── Nav order as specified ─────────────────────────────────
  // Students, Enrollment, Attendance, Videos, Payment Method,
  // Discontinue, User, Profile, Dashboard
  const navItems = [
    {
      to: '/students', icon: <FiUsers />, label: 'Students',
      // Admin: full CRUD | Incharge: view only | Teacher: view only
      show: isAdmin || isIncharge || isTeacher,
    },
    {
      to: '/enrollments', icon: <FiUserCheck />, label: 'Enrollment',
      // Admin: full CRUD | Incharge: view + approve | Teacher: no access
      show: isAdmin || isIncharge,
    },
    {
      to: '/attendance', icon: <FiCalendar />, label: 'Attendance',
      // Admin: full | Incharge: view + mark | Teacher: mark + view own batches
      show: isAdmin || isIncharge || isTeacher,
    },
    {
      to: '/videos', icon: <FiVideo />, label: 'Videos',
      // Admin: full CRUD | Teacher: upload + manage own | Incharge: no access
      show: isAdmin || isTeacher,
    },
    {
      to: '/payment-methods', icon: <FiDollarSign />, label: 'Payment Method',
      // Admin only
      show: isAdmin,
    },
    {
      to: '/discontinued-students', icon: <FiUserX />, label: 'Discontinue',
      // Admin only
      show: isAdmin,
    },
    {
      to: '/users', icon: <FiSettings />, label: 'User',
      // Admin only
      show: isAdmin,
    },
    {
      to: '/profile', icon: <FiUser />, label: 'Profile',
      // All roles
      show: true,
    },
    {
      to: '/', icon: <FiHome />, label: 'Dashboard',
      // All roles
      show: true,
    },
  ].filter(item => item.show);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const avatarContent = user?.photo_url
    ? <img src={user.photo_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
    : (user?.full_name?.charAt(0).toUpperCase() || '?');

  return (
    <div className="layout">
      {/* ── Sidebar ─────────────────────────────────── */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
        <div className="sidebar-header">
          <div className="brand">
            <div className="brand-icon">N</div>
            {sidebarOpen && (
              <div className="brand-text">
                <span className="brand-name">EPFT</span>
                <span className="brand-sub">Nalam Academy</span>
              </div>
            )}
          </div>
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <FiX /> : <FiMenu />}
          </button>
        </div>

        {sidebarOpen && (
          <div style={{ padding: '4px 16px 12px', borderBottom: '1px solid var(--border-light)' }}>
            <span style={{
              display: 'inline-block',
              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
              background: `${roleColor[role] || 'var(--accent)'}22`,
              color: roleColor[role] || 'var(--accent)',
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
              {roleLabel[role] || role}
            </span>
          </div>
        )}

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {sidebarOpen && <span className="nav-label">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar" style={{ overflow: 'hidden' }}>{avatarContent}</div>
            {sidebarOpen && (
              <div className="user-details">
                <span className="user-name">{user?.full_name}</span>
                <span className="user-role">{roleLabel[role] || role}</span>
              </div>
            )}
          </div>
          <button
            className="logout-btn"
            onClick={() => setShowLogoutModal(true)}
            title="Logout"
            style={{
              display: 'flex', alignItems: 'center',
              gap: sidebarOpen ? 8 : 0,
              padding: sidebarOpen ? '8px 14px' : '8px',
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 10, color: '#f87171',
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
              transition: 'all 0.2s', whiteSpace: 'nowrap',
              marginTop: sidebarOpen ? 8 : 0,
              width: sidebarOpen ? '100%' : 'auto',
              justifyContent: 'center',
            }}
          >
            <FiLogOut size={16} />
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────── */}
      <div className={`main-content ${sidebarOpen ? '' : 'expanded'}`}>
        <header className="topbar">
          <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <FiMenu />
          </button>
          <div className="topbar-right">
            <div className="topbar-user">
              <div className="user-avatar sm" style={{ overflow: 'hidden' }}>{avatarContent}</div>
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.full_name}</div>
                <div style={{ fontSize: 11, color: roleColor[role] || 'var(--text-muted)', fontWeight: 600 }}>{roleLabel[role] || role}</div>
              </div>
            </div>
            <button
              onClick={() => setShowLogoutModal(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 16px',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 8, color: '#f87171',
                cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.2s',
              }}
            >
              <FiLogOut size={14} />
              <span>Logout</span>
            </button>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>

      {/* ── Logout Modal ─────────────────────────────── */}
      {showLogoutModal && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: 380, textAlign: 'center' }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'rgba(239,68,68,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <FiAlertCircle size={30} color="#f87171" />
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Confirm Logout</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                Are you sure you want to logout?
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowLogoutModal(false)} autoFocus>
                Cancel
              </button>
              <button
                style={{
                  flex: 1, padding: '10px 20px',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  border: 'none', borderRadius: 10, color: '#fff',
                  fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
                onClick={handleLogout}
              >
                <FiLogOut size={15} /> Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
