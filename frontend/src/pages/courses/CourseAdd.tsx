import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { CourseCategory } from '../../types';

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
    api.get('/categories').then(r => setCategories(r.data.data || [])).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/courses', {
        ...form,
        category_id: form.category_id || null,
        fee_amount: form.is_free ? 0 : Number(form.fee_amount) || 0,
      });
      toast.success('Course created!');
      navigate('/courses');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create course');
    } finally {
      setLoading(false);
    }
  };

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [f]: e.target.value }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Add Course</h1>
          <p className="page-subtitle">Create a new course for Nalam Academy</p>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('/courses')}>← Back</button>
      </div>

      <div className="card" style={{ maxWidth: 720 }}>
        <form onSubmit={handleSubmit}>

          {/* Category */}
          <div className="form-group">
            <label className="form-label">Category</label>
            <select className="form-control" value={form.category_id} onChange={set('category_id')}>
              <option value="">— No Category —</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.category_name}</option>
              ))}
            </select>
            {categories.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                No categories yet — <a href="/categories" style={{ color: 'var(--accent)' }}>create one first</a>
              </p>
            )}
          </div>

          {/* Course Name */}
          <div className="form-group">
            <label className="form-label">Course Name *</label>
            <input
              className="form-control"
              value={form.course_name}
              onChange={set('course_name')}
              placeholder="e.g. IMAI Batch 5, Advanced Stock Trading..."
              required
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-control"
              value={form.description}
              onChange={set('description')}
              rows={3}
              placeholder="Brief description of this course..."
            />
          </div>

          {/* Duration + Status */}
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Duration</label>
              <input
                className="form-control"
                value={form.duration}
                onChange={set('duration')}
                placeholder="e.g. 6 Months, 12 Weeks"
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

          {/* Free toggle */}
          <div className="form-group">
            <label className="toggle-switch">
              <span className="toggle">
                <input
                  type="checkbox"
                  checked={form.is_free}
                  onChange={e => setForm(f => ({ ...f, is_free: e.target.checked, fee_amount: e.target.checked ? '' : f.fee_amount }))}
                />
                <span className="toggle-slider" />
              </span>
              <span className="form-label" style={{ margin: 0 }}>Free Course</span>
            </label>
          </div>

          {/* Fee */}
          {!form.is_free && (
            <div className="form-group">
              <label className="form-label">Fee Amount (₹)</label>
              <input
                type="number"
                className="form-control"
                value={form.fee_amount}
                onChange={set('fee_amount')}
                min={0}
                placeholder="0"
              />
            </div>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Course'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/courses')}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CourseAdd;
