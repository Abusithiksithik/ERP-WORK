import React, { useEffect, useState, useCallback } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiX, FiShield, FiUser, FiUsers } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

interface AppUser {
  id: number; full_name: string; email: string; role: string;
  is_active: boolean; created_at: string;
  mobile?: string; specialization?: string;
}

/* ── Role definitions ─────────────────────────────────────────── */
const ROLES = [
  {
    value:   'admin',
    label:   'Admin',
    icon:    <FiShield size={16} />,
    color:   'var(--accent)',
    bg:      'rgba(99,102,241,0.12)',
    desc:    'Full access — manage students, enrollment, payments, users',
  },
  {
    value:   'incharge',
    label:   'Incharge',
    icon:    <FiUsers size={16} />,
    color:   '#f59e0b',
    bg:      'rgba(245,158,11,0.12)',
    desc:    'View students, enrollment, attendance, payments — no delete',
  },
  {
    value:   'teacher',
    label:   'Teacher',
    icon:    <FiUser size={16} />,
    color:   'var(--teal)',
    bg:      'rgba(16,185,129,0.12)',
    desc:    'View students, attendance, videos, materials',
  },
];

const blankForm = { full_name: '', email: '', password: '', role: 'teacher', mobile: '', specialization: '', is_active: true };

const UserList: React.FC = () => {
  const { user: me } = useAuth();
  const isSuperAdmin = me?.role === 'super_admin';

  const [users, setUsers]       = useState<AppUser[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]   = useState<AppUser | null>(null);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState({ ...blankForm });
  const [showPw, setShowPw]     = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/users');
      setUsers(r.data.data);
    } catch { toast.error('Failed to load users'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...blankForm });
    setShowPw(false);
    setShowModal(true);
  };

  const openEdit = (u: AppUser) => {
    setEditing(u);
    setForm({ full_name: u.full_name, email: u.email, password: '', role: u.role, mobile: u.mobile || '', specialization: u.specialization || '', is_active: u.is_active });
    setShowPw(false);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) { toast.error('Name and email required'); return; }
    if (!editing && !form.password) { toast.error('Password required for new user'); return; }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/users/${editing.id}`, form);
        toast.success('User updated!');
      } else {
        await api.post('/users', form);
        toast.success('User created!');
      }
      setShowModal(false);
      fetchUsers();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (u: AppUser) => {
    if (!confirm(`Delete user "${u.full_name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      toast.success('User deleted');
      fetchUsers();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Cannot delete'); }
  };

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [f]: f === 'is_active' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const roleInfo = (role: string) => ROLES.find(r => r.value === role);

  const roleCount = (role: string) => users.filter(u => u.role === role).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-subtitle">Manage staff access — Admin, Incharge, Teacher</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}><FiPlus /> Add User</button>
      </div>

      {/* ── Role summary cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        {ROLES.map(r => (
          <div key={r.value} style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: '16px 20px', border: `1px solid ${r.color}33`, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: r.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: r.color, flexShrink: 0 }}>
              {r.icon}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{r.label}</span>
                <span style={{ fontSize: 12, background: r.bg, color: r.color, padding: '1px 8px', borderRadius: 10, fontWeight: 700 }}>{roleCount(r.value)}</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>{r.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Users table ── */}
      <div className="card">
        {loading
          ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading users...</div>
          : users.length === 0
            ? <div className="empty-state"><div className="empty-state-icon">👥</div><h3>No users yet</h3><p>Add staff members to give them access.</p></div>
            : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Mobile</th>
                      <th>Specialization</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => {
                      const ri = roleInfo(u.role);
                      return (
                        <tr key={u.id}>
                          <td style={{ fontWeight: 600 }}>{u.full_name}</td>
                          <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{u.email}</td>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: ri?.bg || 'var(--bg-tertiary)', color: ri?.color || 'var(--text-secondary)' }}>
                              {ri?.icon} {ri?.label || u.role}
                            </span>
                          </td>
                          <td style={{ fontSize: 13 }}>{u.mobile || '—'}</td>
                          <td style={{ fontSize: 13 }}>{u.specialization || '—'}</td>
                          <td>
                            <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: u.is_active ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)', color: u.is_active ? 'var(--teal)' : '#ef4444' }}>
                              {u.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <div className="table-actions">
                              <button className="action-btn edit" onClick={() => openEdit(u)} title="Edit"><FiEdit2 /></button>
                              {isSuperAdmin && (
                                <button className="action-btn delete" onClick={() => handleDelete(u)} title="Delete"><FiTrash2 /></button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
        }
      </div>

      {/* ── Modal ── */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2 className="modal-title">{editing ? 'Edit User' : 'Add New User'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}><FiX /></button>
            </div>

            {/* Role picker */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 20 }}>
              {ROLES.map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, role: r.value }))}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    padding: '12px 8px', borderRadius: 10,
                    border: `2px solid ${form.role === r.value ? r.color : 'var(--border-light)'}`,
                    background: form.role === r.value ? r.bg : 'var(--bg-tertiary)',
                    color: form.role === r.value ? r.color : 'var(--text-secondary)',
                    cursor: 'pointer', transition: 'all 0.15s', fontWeight: form.role === r.value ? 700 : 400,
                  }}
                >
                  {r.icon}
                  <span style={{ fontSize: 13 }}>{r.label}</span>
                </button>
              ))}
            </div>

            {/* Selected role description */}
            <div style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              <strong style={{ color: 'var(--text-primary)' }}>{roleInfo(form.role)?.label}:</strong> {roleInfo(form.role)?.desc}
            </div>

            <form onSubmit={handleSave}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input className="form-control" value={form.full_name} onChange={set('full_name')} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Email *</label>
                  <input type="email" className="form-control" value={form.email} onChange={set('email')} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{editing ? 'New Password (leave blank = no change)' : 'Password *'}</label>
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="form-control"
                    value={form.password}
                    onChange={set('password')}
                    required={!editing}
                    placeholder={editing ? 'Leave blank to keep current' : 'Min 6 characters'}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Mobile</label>
                  <input className="form-control" value={form.mobile} onChange={set('mobile')} placeholder="10-digit mobile" maxLength={10} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Specialization</label>
                <input className="form-control" value={form.specialization} onChange={set('specialization')} placeholder="e.g. Mathematics, Science, IMDE Coordinator" />
              </div>
              {editing && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 16, fontSize: 14 }}>
                  <input type="checkbox" checked={form.is_active} onChange={set('is_active')} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                  <span style={{ fontWeight: 500 }}>Account Active</span>
                </label>
              )}
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editing ? 'Update User' : 'Create User'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserList;
