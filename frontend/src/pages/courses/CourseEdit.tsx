import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { CourseCategory } from '../../types';

const CourseEdit: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
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
    const load = async () => {
      try {
        const [courseRes, catRes] = await Promise.all([
          api.get(`/courses/${id}`),
          api.get('/categories'),
        ]);
        const c = courseRes.data.data;
        setForm({
          category_id: c.category_id ? String(c.category_id) : '',
          course_name: c.course_name,
          description: c.description || '',
          duration: c.duration || '',
          fee_amount: c.is_free ? '' : String(c.fee_amount || 0),
          is_free: c.is_free,
          status: c.status,
        });
        setCategories(catRes.data.data || []);
      } catch {
        toast.error('Failed to load course');
        navigate('/courses');
      } finally {
        setPageLoading(false);
      }
    };
    load();
  }, [id, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.put(`/courses/${id}`, {
        ...form,
        category_id: form.category_id || null,
        fee_amount: form.is_free ? 0 : Number(form.fee_amount) || 0,
      });
      toast.success('Course updated!');
      navigate('/courses');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update course');
    } finally {
      setLoading(false);
    }
  };

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [f]: e.target.value }));

  if (pageLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <div className="spinner" style={{ margin: '0 auto 12px', width: 32, height: 32, borderWidth: 3 }} />
        <p style={{ color: 'var(--text-muted)' }}>Loading course...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Edit Course</h1>
          <p className="page-subtitle">{form.course_name}</p>
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
          </div>

          {/* Course Name */}
          <div className="form-group">
            <label className="form-label">Course Name *</label>
            <input
              className="form-control"
              value={form.course_name}
              onChange={set('course_name')}
              required
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
            />
          </div>

          {/* Duration + Status */}
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Duration</label>
              <input className="form-control" value={form.duration} onChange={set('duration')} placeholder="e.g. 6 Months" />
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
              />
            </div>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
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

export default CourseEdit;
