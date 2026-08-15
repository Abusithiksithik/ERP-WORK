import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FiUpload } from 'react-icons/fi';
import api from '../../api/axios';

const StudentAdd: React.FC = () => {
  const navigate = useNavigate();
  const photoRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: '',
    mobile: '',
    email: '',
    date_of_birth: '',
    gender: '',
    address: '',
    parent_name: '',
    parent_mobile: '',
    status: 'active',
    cert_10th_collected: false,
    cert_12th_collected: false,
    cert_diploma_collected: false,
  });

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (typeof v === 'boolean') fd.append(k, String(v));
        else if (v) fd.append(k, v);
      });
      if (photoRef.current?.files?.[0]) fd.append('photo', photoRef.current.files[0]);
      await api.post('/students', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Student added successfully!');
      navigate('/students');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to add student');
    } finally {
      setLoading(false);
    }
  };

  const set = (field: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Add Student</h1>
          <p className="page-subtitle">Create a new student account</p>
        </div>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit}>

          {/* ── Photo ── */}
          <h3 className="section-heading">📸 Student Photo</h3>
          <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 20 }}>
            {photoPreview
              ? <img src={photoPreview} alt="preview" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--accent)' }} />
              : <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--bg-tertiary)', border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 28 }}>👤</div>}
            <label className="btn btn-secondary" style={{ cursor: 'pointer' }} onClick={() => photoRef.current?.click()}>
              <FiUpload /> Upload Photo
              <input type="file" ref={photoRef} accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} />
            </label>
          </div>

          {/* ── Personal Info ── */}
          <h3 className="section-heading">👤 Personal Information</h3>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input className="form-control" value={form.full_name} onChange={set('full_name')} placeholder="Enter full name" required />
            </div>
            <div className="form-group">
              <label className="form-label">Mobile Number *</label>
              <input className="form-control" value={form.mobile} onChange={set('mobile')} placeholder="10-digit mobile" required />
            </div>
            <div className="form-group">
              <label className="form-label">Email Address *</label>
              <input type="email" className="form-control" value={form.email} onChange={set('email')} placeholder="student@example.com" required />
            </div>
            <div className="form-group">
              <label className="form-label">Date of Birth</label>
              <input type="date" className="form-control" value={form.date_of_birth} onChange={set('date_of_birth')} />
            </div>
            <div className="form-group">
              <label className="form-label">Gender</label>
              <select className="form-control" value={form.gender} onChange={set('gender')}>
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={form.status} onChange={set('status')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Address</label>
            <textarea className="form-control" value={form.address} onChange={set('address')} rows={2} placeholder="Full address..." />
          </div>

          {/* ── Parent Info ── */}
          <h3 className="section-heading">👨‍👩‍👧 Parent / Guardian Information</h3>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Parent Name</label>
              <input className="form-control" value={form.parent_name} onChange={set('parent_name')} placeholder="Parent / guardian name" />
            </div>
            <div className="form-group">
              <label className="form-label">Parent Mobile</label>
              <input className="form-control" value={form.parent_mobile} onChange={set('parent_mobile')} placeholder="Parent mobile number" />
            </div>
          </div>

          {/* ── Certificate Verification ── */}
          <h3 className="section-heading">📋 Certificate Verification</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14, marginTop: -8 }}>Mark the original certificates collected from the student.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
            {([
              { key: 'cert_10th_collected',    label: '10th Marksheet' },
              { key: 'cert_12th_collected',    label: '12th Marksheet' },
              { key: 'cert_diploma_collected', label: 'TC' },
            ] as const).map(({ key, label }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                  style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 14, fontWeight: 500 }}>{label} Collected</span>
                {form[key] && <span style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600 }}>✓ Collected</span>}
              </label>
            ))}
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Adding Student...' : 'Add Student'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/students')}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StudentAdd;
