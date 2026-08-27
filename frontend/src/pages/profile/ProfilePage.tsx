import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'react-toastify';
import { FiUser, FiLock, FiSave, FiUpload, FiEdit2 } from 'react-icons/fi';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const photoRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(user?.photo_url || null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [profileForm, setProfileForm] = useState({
    full_name: user?.full_name || '',
    mobile: (user as any)?.mobile || '',
    specialization: (user as any)?.specialization || '',
  });

  const [pwForm, setPwForm] = useState({ old_password: '', new_password: '', confirm_password: '' });

  useEffect(() => {
    // Load latest profile data
    api.get('/profile').then(r => {
      const d = r.data.data;
      setProfileForm({ full_name: d.full_name || '', mobile: d.mobile || '', specialization: d.specialization || '' });
      if (d.photo_url) setPhotoPreview(d.photo_url);
    }).catch(() => {});
  }, []);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setPhotoPreview(previewUrl);
    setPhotoLoading(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      await api.post('/profile/photo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Photo updated!');
    } catch { toast.error('Failed to upload photo'); }
    finally { setPhotoLoading(false); }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileLoading(true);
    try {
      await api.put('/profile', profileForm);
      toast.success('Profile updated!');
      setEditMode(false);
    } catch (err: any) { toast.error(err.response?.data?.message || 'Update failed'); }
    finally { setProfileLoading(false); }
  };

  const handleChangePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.new_password !== pwForm.confirm_password) { toast.error('Passwords do not match'); return; }
    if (pwForm.new_password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setPwLoading(true);
    try {
      await api.post('/auth/change-password', { old_password: pwForm.old_password, new_password: pwForm.new_password });
      toast.success('Password changed successfully!');
      setPwForm({ old_password: '', new_password: '', confirm_password: '' });
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed to change password'); }
    finally { setPwLoading(false); }
  };

  const roleColors: Record<string, string> = { super_admin: 'var(--accent-2)', admin: 'var(--accent)', incharge: 'var(--amber)', teacher: 'var(--teal)', student: 'var(--amber)' };
  const roleLabels: Record<string, string> = { super_admin: 'Super Admin', admin: 'Admin', incharge: 'Incharge', teacher: 'Teacher', student: 'Student' };

  const initials = profileForm.full_name?.charAt(0).toUpperCase() || user?.full_name?.charAt(0).toUpperCase() || '?';

  return (
    <div>
      <div className="page-header"><div><h1 className="page-title">My Profile</h1></div></div>
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>
        {/* Left: Avatar card */}
        <div className="card" style={{ textAlign: 'center' }}>
          {/* Photo */}
          <div style={{ position: 'relative', width: 100, height: 100, margin: '0 auto 20px' }}>
            {photoPreview
              ? <img src={photoPreview} alt="profile" style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--accent)' }} />
              : <div className="profile-avatar-lg" style={{ margin: 0 }}>{initials}</div>}
            <button
              onClick={() => photoRef.current?.click()}
              disabled={photoLoading}
              style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 30, height: 30, borderRadius: '50%',
                background: 'var(--accent)', border: 'none',
                color: '#fff', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
              title="Change photo"
            >
              {photoLoading ? '⏳' : <FiUpload size={13} />}
            </button>
            <input type="file" ref={photoRef} accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} />
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 700 }}>{profileForm.full_name || user?.full_name}</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>{user?.email}</p>
          {profileForm.mobile && <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>{profileForm.mobile}</p>}
          {profileForm.specialization && <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>{profileForm.specialization}</p>}
          <div style={{ marginTop: 12 }}>
            <span className={`badge badge-${user?.role}`} style={{ color: roleColors[user?.role || ''], padding: '6px 16px', fontSize: 13 }}>
              {roleLabels[user?.role || ''] || user?.role?.replace('_', ' ').toUpperCase()}
            </span>
          </div>
          <div style={{ marginTop: 20, padding: '16px 0', borderTop: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
              <FiUser /> <span>Account active</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Profile Edit */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <FiUser style={{ fontSize: 20, color: 'var(--accent)' }} />
                <h2 style={{ fontSize: 18, fontWeight: 700 }}>Profile Information</h2>
              </div>
              {!editMode && (
                <button className="btn btn-secondary btn-sm" onClick={() => setEditMode(true)}>
                  <FiEdit2 size={13} /> Edit
                </button>
              )}
            </div>
            <form onSubmit={handleProfileSave} style={{ maxWidth: 420 }}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input className="form-control" value={profileForm.full_name} onChange={e => setProfileForm(p => ({ ...p, full_name: e.target.value }))} disabled={!editMode} required />
              </div>
              <div className="form-group">
                <label className="form-label">Mobile</label>
                <input className="form-control" value={profileForm.mobile} onChange={e => setProfileForm(p => ({ ...p, mobile: e.target.value }))} disabled={!editMode} placeholder="Mobile number" />
              </div>
              <div className="form-group">
                <label className="form-label">Specialization</label>
                <input className="form-control" value={profileForm.specialization} onChange={e => setProfileForm(p => ({ ...p, specialization: e.target.value }))} disabled={!editMode} placeholder="e.g. Mathematics, Science" />
              </div>
              {editMode && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="submit" className="btn btn-primary" disabled={profileLoading}><FiSave /> {profileLoading ? 'Saving...' : 'Save Changes'}</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditMode(false)}>Cancel</button>
                </div>
              )}
            </form>
          </div>

          {/* Password Change */}
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
              <button type="submit" className="btn btn-primary" disabled={pwLoading}><FiSave /> {pwLoading ? 'Saving...' : 'Update Password'}</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
