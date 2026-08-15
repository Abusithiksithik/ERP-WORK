import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { FiUser, FiLock, FiSave } from 'react-icons/fi';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const [pwForm, setPwForm] = useState({ old_password: '', new_password: '', confirm_password: '' });
  const [loading, setLoading] = useState(false);

  const handleChangePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.new_password !== pwForm.confirm_password) { toast.error('Passwords do not match'); return; }
    if (pwForm.new_password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      await api.post('/auth/change-password', { old_password: pwForm.old_password, new_password: pwForm.new_password });
      toast.success('Password changed successfully!');
      setPwForm({ old_password: '', new_password: '', confirm_password: '' });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to change password');
    } finally { setLoading(false); }
  };

  const roleColors: Record<string, string> = { super_admin: 'var(--accent-2)', admin: 'var(--accent)', faculty: 'var(--teal)', student: 'var(--amber)' };

  return (
    <div>
      <div className="page-header"><div><h1 className="page-title">My Profile</h1></div></div>
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="profile-avatar-lg" style={{ margin: '0 auto 20px' }}>
            {user?.full_name?.charAt(0).toUpperCase()}
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>{user?.full_name}</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>{user?.email}</p>
          <div style={{ marginTop: 12 }}>
            <span className={`badge badge-${user?.role}`} style={{ color: roleColors[user?.role || ''], padding: '6px 16px', fontSize: 13 }}>
              {user?.role?.replace('_', ' ').toUpperCase()}
            </span>
          </div>
          <div style={{ marginTop: 20, padding: '16px 0', borderTop: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
              <FiUser /> <span>Account active</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <FiLock style={{ fontSize: 20, color: 'var(--accent)' }} />
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>Change Password</h2>
          </div>
          <form onSubmit={handleChangePw} style={{ maxWidth: 400 }}>
            <div className="form-group">
              <label className="form-label">Current Password</label>
              <input type="password" className="form-control" value={pwForm.old_password} onChange={e => setPwForm(p => ({ ...p, old_password: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input type="password" className="form-control" value={pwForm.new_password} onChange={e => setPwForm(p => ({ ...p, new_password: e.target.value }))} required minLength={6} />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm New Password</label>
              <input type="password" className="form-control" value={pwForm.confirm_password} onChange={e => setPwForm(p => ({ ...p, confirm_password: e.target.value }))} required />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}><FiSave /> {loading ? 'Saving...' : 'Update Password'}</button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
