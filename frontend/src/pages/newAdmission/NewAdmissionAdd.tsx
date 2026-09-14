import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FiAlertCircle, FiCalendar } from 'react-icons/fi';
import api from '../../api/axios';

// ── Calendar / date-picker helper (same pattern as StudentAdd) ───────
const fmtDate = (iso: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const DatePickerField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}> = ({ label, value, onChange, required }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div style={{ position: 'relative' }}>
      <label className="form-label">{label}{required && <span style={{ color: 'var(--red)' }}> *</span>}</label>
      <div
        className="form-control"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', userSelect: 'none',
        }}
        onClick={() => inputRef.current?.showPicker?.()}
      >
        <span style={{ color: value ? 'inherit' : 'var(--text-muted)', fontSize: 14 }}>
          {value ? fmtDate(value) : 'Select date'}
        </span>
        <FiCalendar size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      </div>
      <input
        ref={inputRef}
        type="date"
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
};

const MOBILE_REGEX = /^[6-9]\d{9}$/;

const NewAdmissionAdd: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState('');

  const [form, setForm] = useState({
    full_name: '',
    mobile: '',
    email: '',
    date_of_birth: '',
    gender: '',
    admission_date: new Date().toISOString().split('T')[0],
    source: '',
    address: '',
  });

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value }));
    if (field === 'email') setEmailError('');
  };

  const handleSubmit = async () => {
    if (!form.full_name.trim() || form.full_name.trim().length < 3) {
      toast.error('Full name must be at least 3 characters');
      return;
    }
    if (!form.mobile.trim()) {
      toast.error('Mobile number is required');
      return;
    }
    if (!MOBILE_REGEX.test(form.mobile.trim())) {
      toast.error('Invalid Mobile Number — must be 10 digits starting with 6, 7, 8, or 9');
      return;
    }
    if (!form.admission_date) {
      toast.error('Joining / Admission Date is required');
      return;
    }
    if (!form.source) {
      toast.error('Source is required');
      return;
    }

    setLoading(true);
    try {
      await api.post('/new-admissions', {
        full_name:      form.full_name.trim(),
        mobile:         form.mobile.trim(),
        email:          form.email.trim() || undefined,
        date_of_birth:  form.date_of_birth || undefined,
        gender:         form.gender || undefined,
        admission_date: form.admission_date,
        source: form.source || undefined,
        address:        form.address.trim() || undefined,
      });
      toast.success('New admission created successfully');
      navigate('/new-admissions');
    } catch (err: any) {
      const errData = err.response?.data;
      if (errData?.error === 'DUPLICATE_EMAIL') {
        setEmailError(errData.message || 'Email already exists');
        toast.error(errData.message || 'Duplicate email');
      } else {
        toast.error(errData?.message || 'Failed to create admission');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 720, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <button
          onClick={() => navigate('/new-admissions')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary)', fontSize: 13, display: 'flex',
            alignItems: 'center', gap: 6, marginBottom: 8, padding: 0,
          }}
        >
          ← Back to New Admissions
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>New Admission</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '4px 0 0' }}>
          Enter basic details for the new admission
        </p>
      </div>

      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 24px' }}>

          {/* Full Name */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Full Name <span style={{ color: 'var(--red)' }}>*</span></label>
            <input
              className="form-control"
              value={form.full_name}
              onChange={set('full_name')}
              placeholder="Enter full name"
              autoFocus
            />
          </div>

          {/* Mobile */}
          <div>
            <label className="form-label">Mobile Number <span style={{ color: 'var(--red)' }}>*</span></label>
            <input
              className="form-control"
              value={form.mobile}
              onChange={set('mobile')}
              placeholder="10-digit mobile number"
              maxLength={10}
              inputMode="numeric"
            />
          </div>

          {/* Email (optional) */}
          <div>
            <label className="form-label">Email <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <input
              type="email"
              className="form-control"
              value={form.email}
              onChange={set('email')}
              placeholder="student@email.com"
              style={emailError ? { borderColor: 'var(--red)' } : {}}
            />
            {emailError && (
              <div className="field-error" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--red)', fontSize: 12, marginTop: 4 }}>
                <FiAlertCircle size={12} />{emailError}
              </div>
            )}
          </div>

          {/* Date of Birth */}
          <DatePickerField
            label="Date of Birth"
            value={form.date_of_birth}
            onChange={v => setForm(f => ({ ...f, date_of_birth: v }))}
          />

          {/* Gender */}
          <div>
            <label className="form-label">Gender</label>
            <select className="form-control" value={form.gender} onChange={set('gender')}>
              <option value="">Select gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Joining / Admission Date */}
          <DatePickerField
            label="Joining / Admission Date"
            value={form.admission_date}
            onChange={v => setForm(f => ({ ...f, admission_date: v }))}
            required
          />

          {/* Source */}
          <div>
            <label className="form-label">Source <span style={{ color: 'var(--red)' }}>*</span></label>
            <select className="form-control" value={form.source} onChange={set('source')}>
              <option value="">Select source</option>
              <option value="TV Ads">TV Ads</option>
              <option value="Friend Referral">Friend Referral</option>
              <option value="Sir Referral">Sir Referral</option>
              <option value="Social Media">Social Media</option>
              <option value="Individual">Individual</option>
            </select>
          </div>

          {/* Address */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Address</label>
            <textarea
              className="form-control"
              rows={3}
              value={form.address}
              onChange={set('address')}
              placeholder="Enter address"
              style={{ resize: 'vertical' }}
            />
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12, marginTop: 28, justifyContent: 'flex-end' }}>
          <button
            className="btn btn-secondary"
            onClick={() => navigate('/new-admissions')}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Saving…' : 'Save Admission'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewAdmissionAdd;
