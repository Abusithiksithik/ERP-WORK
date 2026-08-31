import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { CourseCategory } from '../../types';

const MASTER_COURSES = ['IMA', 'TNSCVT', 'Vetri Nichayam'];

const CourseAdd: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<CourseCategory[]>([]);
  const [form, setForm] = useState({
    category_id: '',
    course_name: '',
    description: '',
    duration: '',
    fee_amount: '',
    is_free: false,
    status: 'active',
  });

  useEffect(() => {
    api.get('/categories')
      .then(r => setCategories((r.data.data || []).filter((c: CourseCategory) => c.status === 'active')))
      .catch(() => {});
  }, []);

  // When master course changes, auto-set fee and duration
  const handleCategoryChange = (catId: string) => {
    const cat = categories.find(c => String(c.id) === catId);
    const isFree = cat?.category_name === 'Vetri Nichayam';
    setForm(f => ({
      ...f,
      category_id: catId,
      is_free:     isFree,
      fee_amount:  isFree ? '0' : '25000',
      duration:    isFree ? '3 Months' : '2 Years',
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.category_id) { toast.error('Please select a Master Course'); return; }
    if (!form.course_name.trim()) { toast.error('Sub-course name is required'); return; }
    setLoading(true);
    try {
      await api.post('/courses', {
        ...form,
        category_id: form.category_id || null,
        fee_amount: form.is_free ? 0 : Number(form.fee_amount) || 0,
      });
      toast.success('Sub-course created!');
      navigate('/courses');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create sub-course');
    } finally { setLoading(false); }
  };

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [f]: e.target.value }));

  const selectedCat = categories.find(c => String(c.id) === form.category_id);
  const isMasterFree = selectedCat?.category_name === 'Vetri Nichayam';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Add Sub-Course</h1>
          <p className="page-subtitle">Create a sub-course under a Master Course</p>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('/courses')}>← Back</button>
      </div>

      <div className="card" style={{ maxWidth: 720 }}>
        <form onSubmit={handleSubmit}>

          {/* Master Course */}
          <div className="form-group">
            <label className="form-label">Master Course <span style={{ color: 'var(--red)' }}>*</span></label>
            <select
              className="form-control"
              value={form.category_id}
              onChange={e => handleCategoryChange(e.target.value)}
              required
            >
              <option value="">— Select Master Course —</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.category_name} {MASTER_COURSES.includes(c.category_name) ? '(Master)' : ''}
                </option>
              ))}
            </select>
            {categories.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                No master courses found — run DB migration first.
              </p>
            )}
          </div>

          {/* Auto-set info banner */}
          {form.category_id && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, marginBottom: 16,
              background: isMasterFree ? 'rgba(16,185,129,0.08)' : 'rgba(99,102,241,0.08)',
              border: `1px solid ${isMasterFree ? 'rgba(16,185,129,0.25)' : 'rgba(99,102,241,0.25)'}`,
              fontSize: 13,
            }}>
              {isMasterFree
                ? '✅ Free course — Fee: ₹0, Duration: 3 Months (auto-set)'
                : '💰 Paid course — Fee: ₹25,000, Duration: 2 Years (auto-set)'}
            </div>
          )}

          {/* Sub-Course Name */}
          <div className="form-group">
            <label className="form-label">Sub-Course Name <span style={{ color: 'var(--red)' }}>*</span></label>
            <input
              className="form-control"
              value={form.course_name}
              onChange={set('course_name')}
              placeholder="e.g. DOT, DMLT, DHA, GDA..."
              required autoFocus
            />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              For IMA: DOT / DMLT / DHA &nbsp;|&nbsp; For TNSCVT: DOT / DMLT &nbsp;|&nbsp; For Vetri Nichayam: GDA / DE / Admin Coordinator
            </p>
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-control" value={form.description} onChange={set('description')} rows={2} placeholder="Brief description" />
          </div>

          {/* Duration + Fee (read-only if auto-set) */}
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Duration</label>
              <input
                className="form-control"
                value={form.duration}
                onChange={set('duration')}
                placeholder="e.g. 2 Years"
                style={{ background: form.category_id ? 'rgba(99,102,241,0.06)' : undefined }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={form.status} onChange={set('status')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Fee */}
          <div className="form-group">
            <label className="form-label">Fee Amount (₹)</label>
            <input
              type="number" className="form-control"
              value={form.fee_amount}
              onChange={set('fee_amount')}
              min={0}
              placeholder="25000"
              disabled={isMasterFree}
              style={{ background: isMasterFree ? 'rgba(16,185,129,0.06)' : undefined }}
            />
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Sub-Course'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/courses')}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CourseAdd;
