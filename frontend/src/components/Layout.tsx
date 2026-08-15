import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  FiHome, FiUsers, FiVideo, FiFileText, FiDollarSign,
  FiSettings, FiUser, FiLogOut, FiMenu, FiX,
  FiGrid, FiUserCheck, FiCreditCard, FiCalendar, FiAlertCircle, FiUserX,
  FiBookOpen, FiLayers, FiTag
} from 'react-icons/fi';

const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // ✅ Logout: clear session → redirect to /login
  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const isFaculty = user?.role === 'faculty';
  const isStudent = user?.role === 'student';

  const roleLabel: Record<string, string> = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    faculty: 'Faculty',
    student: 'Student',
  };

  const navItems = [
    { to: '/', icon: <FiHome />, label: 'Dashboard', show: true },
    { to: '/students', icon: <FiUsers />, label: 'Students', show: isAdmin },
    { to: '/discontinued-students', icon: <FiUserX />, label: 'Discontinued', show: isAdmin },
    { to: '/enrollments', icon: <FiUserCheck />, label: 'Enrollment', show: true },
    { to: '/categories', icon: <FiTag />, label: 'Categories', show: isAdmin },
    { to: '/courses', icon: <FiBookOpen />, label: 'Courses', show: isAdmin },
    { to: '/batches', icon: <FiLayers />, label: 'Batches', show: isAdmin },
    { to: '/modules', icon: <FiGrid />, label: 'Modules', show: isAdmin },
    { to: '/videos', icon: <FiVideo />, label: 'Videos', show: isAdmin || isFaculty || isStudent },
    { to: '/materials', icon: <FiFileText />, label: 'Materials', show: true },
    { to: '/attendance', icon: <FiCalendar />, label: 'Attendance', show: isAdmin || isFaculty },
    { to: '/payments', icon: <FiCreditCard />, label: 'Payments', show: isAdmin || isStudent },
    { to: '/payment-methods', icon: <FiDollarSign />, label: 'Pay Methods', show: isAdmin },
    { to: '/users', icon: <FiSettings />, label: 'Users', show: isAdmin },
    { to: '/profile', icon: <FiUser />, label: 'Profile', show: true },
  ].filter(item => item.show);

  return (
    <div className="layout">

      {/* ── Sidebar ── */}
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

        {/* ── Sidebar Footer: User info + Logout ── */}
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{user?.full_name?.charAt(0).toUpperCase()}</div>
            {sidebarOpen && (
              <div className="user-details">
                <span className="user-name">{user?.full_name}</span>
                <span className="user-role">{roleLabel[user?.role || ''] || user?.role}</span>
              </div>
            )}
          </div>

          {/* ✅ Logout button — always visible, label shown when sidebar open */}
          <button
            className="logout-btn"
            onClick={() => setShowLogoutModal(true)}
            title="Logout"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: sidebarOpen ? 8 : 0,
              padding: sidebarOpen ? '8px 14px' : '8px',
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 10,
              color: '#f87171',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              marginTop: sidebarOpen ? 8 : 0,
              width: sidebarOpen ? '100%' : 'auto',
              justifyContent: 'center',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.22)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.12)'; }}
          >
            <FiLogOut size={16} />
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className={`main-content ${sidebarOpen ? '' : 'expanded'}`}>
        <header className="topbar">
          <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <FiMenu />
          </button>

          <div className="topbar-right">
            <div className="topbar-user">
              <div className="user-avatar sm">{user?.full_name?.charAt(0).toUpperCase()}</div>
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.full_name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{roleLabel[user?.role || ''] || user?.role}</div>
              </div>
            </div>

            {/* ✅ Logout button in topbar — always visible on desktop */}
            <button
              onClick={() => setShowLogoutModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 16px',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 8,
                color: '#f87171',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)'; }}
              title="Logout"
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

      {/* ✅ Logout Confirmation Modal */}
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
                Are you sure you want to logout?<br />
                You will be redirected to the login page.
              </p>
            </div>

            {/* Logged-in user info */}
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-light)',
              borderRadius: 10,
              padding: '10px 16px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              textAlign: 'left',
            }}>
              <div className="user-avatar" style={{ width: 36, height: 36, fontSize: 15, flexShrink: 0 }}>
                {user?.full_name?.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{user?.full_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{user?.email}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {/* Cancel */}
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setShowLogoutModal(false)}
                autoFocus
              >
                Cancel
              </button>
              {/* Confirm Logout */}
              <button
                style={{
                  flex: 1,
                  padding: '10px 20px',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  border: 'none',
                  borderRadius: 10,
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'opacity 0.2s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                onClick={handleLogout}
              >
                <FiLogOut size={15} />
                Yes, Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
