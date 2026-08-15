import React, { useEffect, useState } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiX } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { User } from '../../types';

const UserList: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'faculty', mobile: '', specialization: '', is_active: true });

  const fetch = () => api.get('/users').then(r => setUsers(r.data.data));
  useEffect(() => { fetch(); }, []);

  const openAdd = () => { setEditing(null); setForm({ full_name: '', email: '', password: '', role: 'faculty', mobile: '', specialization: '', is_active: true }); setShowModal(true); };
  const openEdit = (u: User) => {
    setEditing(u);
    setForm({ full_name: u.full_name, email: u.email, password: '', role: u.role, mobile: u.mobile || '', specialization: u.specialization || '', is_active: u.is_active });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      const payload = { ...form };
      if (!payload.password) delete (payload as any).password;
      if (editing) await api.put(`/users/${editing.id}`, payload);
      else await api.post('/users', form);
      toast.success(editing ? 'User updated!' : 'User created!'); setShowModal(false); fetch();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this user?')) return;
    try { await api.delete(`/users/${id}`); toast.success('Deleted'); fetch(); }
    catch { toast.error('Failed'); }
  };

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(p => ({ ...p, [f]: e.target.value }));

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">User Management</h1><p className="page-subtitle">{users.length} users</p></div>
        <button className="btn btn-primary" onClick={openAdd}><FiPlus /> Add User</button>
      </div>
      <div className="card">
        {users.length === 0 ? <div className="empty-state"><div className="empty-state-icon">👤</div><h3>No Admin/Faculty Users</h3></div>
        : <div className="table-container">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Specialization</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.full_name}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                    <td><span className={`badge badge-${u.role}`}>{u.role}</span></td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{u.specialization || '—'}</td>
                    <td><span className={`badge badge-${u.is_active ? 'active' : 'inactive'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td><div className="table-actions">
                      <button className="action-btn edit" onClick={() => openEdit(u)}><FiEdit2 /></button>
                      <button className="action-btn delete" onClick={() => handleDelete(u.id)}><FiTrash2 /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">{editing ? 'Edit User' : 'Add User'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}><FiX /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Full Name *</label><input className="form-control" value={form.full_name} onChange={set('full_name')} required /></div>
                <div className="form-group"><label className="form-label">Email *</label><input type="email" className="form-control" value={form.email} onChange={set('email')} required /></div>
                <div className="form-group"><label className="form-label">{editing ? 'New Password (leave blank to keep)' : 'Password *'}</label>
                  <input type="password" className="form-control" value={form.password} onChange={set('password')} required={!editing} minLength={6} />
                </div>
                <div className="form-group"><label className="form-label">Role *</label>
                  <select className="form-control" value={form.role} onChange={set('role')} required>
                    <option value="admin">Admin</option>
                    <option value="faculty">Faculty</option>
                  </select>
                </div>
                {form.role === 'faculty' && <>
                  <div className="form-group"><label className="form-label">Mobile</label><input className="form-control" value={form.mobile} onChange={set('mobile')} /></div>
                  <div className="form-group"><label className="form-label">Specialization</label><input className="form-control" value={form.specialization} onChange={set('specialization')} /></div>
                </>}
              </div>
              <div className="form-group">
                <label className="toggle-switch">
                  <span className="toggle"><input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} /><span className="toggle-slider"></span></span>
                  <span className="form-label" style={{ margin: 0 }}>Active</span>
                </label>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
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
