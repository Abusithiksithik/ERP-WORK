import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  FiHome, FiUsers, FiVideo, FiUser, FiLogOut, FiMenu, FiX, FiUserCheck,
  FiCreditCard, FiCalendar, FiAlertCircle, FiUserX, FiDollarSign, FiSettings,
  FiBookOpen, FiLayers, FiChevronDown, FiChevronRight, FiFileText, FiUserPlus,
} from 'react-icons/fi';

const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const settingsSubPaths = ['/courses', '/batches', '/payment-methods', '/users'];
  const isOnSettingsRoute = settingsSubPaths.some(p => location.pathname.startsWith(p));
  const [settingsOpen, setSettingsOpen] = useState(isOnSettingsRoute);

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

  // Settings sub-items (Courses, Batches, Payment Methods) — Admin only
  const settingsSubItems = [
    { to: '/courses',         icon: <FiBookOpen />, label: 'Courses'         },
    { to: '/batches',         icon: <FiLayers />,   label: 'Batches'         },
    { to: '/payment-methods', icon: <FiDollarSign />, label: 'Payment Methods' },
    { to: '/users',           icon: <FiSettings />,  label: 'Users'           },
  ];

  const isSettingsActive = settingsSubItems.some(item => location.pathname.startsWith(item.to));

  // Main nav items (without items moved to Settings)
  const navItems = [
    {
      to: '/new-admissions', icon: <FiUserPlus />, label: 'New Candidates',
      show: isAdmin || isIncharge,
    },
    {
      to: '/students', icon: <FiUsers />, label: 'Course',
      show: isAdmin || isIncharge || isTeacher,
    },
    {
      to: '/enrollments', icon: <FiUserCheck />, label: 'Enrollment',
      show: isAdmin || isIncharge,
    },
    {
      to: '/attendance', icon: <FiCalendar />, label: 'Attendance',
      show: isAdmin || isIncharge || isTeacher,
    },
    {
      to: '/videos', icon: <FiVideo />, label: 'Videos',
      show: isAdmin || isTeacher,
    },
    {
      to: '/hostel', icon: <FiHome />, label: 'Hostel',
      show: isAdmin,
    },
    {
      to: '/exam-fees', icon: <FiFileText />, label: 'Exam Fees',
      show: isAdmin || isIncharge,
    },
    {
      to: '/discontinued-students', icon: <FiUserX />, label: 'Discontinued',
      show: isAdmin,
    },
    {
      to: '/profile', icon: <FiUser />, label: 'Profile',
      show: true,
    },
    {
      to: '/dashboard', icon: <FiHome />, label: 'Dashboard',
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

          {/* ── Settings / Master Data section (Admin only) ── */}
          {isAdmin && (
            <>
              {sidebarOpen ? (
                /* Expanded: collapsible group */
                <div>
                  <button
                    onClick={() => setSettingsOpen(o => !o)}
                    className={`nav-item ${isSettingsActive ? 'active' : ''}`}
                    style={{
                      width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 16px', borderRadius: 10,
                      color: isSettingsActive ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: isSettingsActive ? 700 : 500, fontSize: 14,
                      transition: 'all 0.15s',
                    }}
                  >
                    <span className="nav-icon"><FiSettings /></span>
                    <span className="nav-label" style={{ flex: 1, textAlign: 'left' }}>Settings</span>
                    <span style={{ fontSize: 12, opacity: 0.7 }}>
                      {settingsOpen ? <FiChevronDown /> : <FiChevronRight />}
                    </span>
                  </button>

                  {settingsOpen && (
                    <div style={{ paddingLeft: 16, marginTop: 2 }}>
                      {settingsSubItems.map(sub => (
                        <NavLink
                          key={sub.to}
                          to={sub.to}
                          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                          style={{ paddingLeft: 14, fontSize: 13 }}
                        >
                          <span className="nav-icon" style={{ fontSize: 14 }}>{sub.icon}</span>
                          <span className="nav-label">{sub.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Collapsed sidebar: show just the Settings icon (tooltip via title) */
                <NavLink
                  to="/users"
                  className={({ isActive }) =>
                    `nav-item ${isActive || isSettingsActive ? 'active' : ''}`
                  }
                  title="Settings"
                >
                  <span className="nav-icon"><FiSettings /></span>
                </NavLink>
              )}
            </>
          )}
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
