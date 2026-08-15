import React, { useEffect, useState, useCallback } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiX, FiRefreshCw, FiToggleLeft, FiToggleRight } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { CourseCategory } from '../../types';

const CategoryList: React.FC = () => {
  const [categories, setCategories] = useState<CourseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CourseCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [form, setForm] = useState({ category_name: '', description: '', status: 'active' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/categories');
      setCategories(r.data.data || []);
    } catch {
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.category_name.trim()) errs.category_name = 'Category name is required';
    else if (form.category_name.trim().length < 2) errs.category_name = 'Name must be at least 2 characters';
    else if (form.category_name.trim().length > 200) errs.category_name = 'Name must be under 200 characters';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ category_name: '', description: '', status: 'active' });
    setErrors({});
    setShowModal(true);
  };

  const openEdit = (cat: CourseCategory) => {
    setEditing(cat);
    setForm({ category_name: cat.category_name, description: cat.description || '', status: cat.status });
    setErrors({});
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/categories/${editing.id}`, form);
        toast.success('Category updated successfully');
      } else {
        await api.post('/categories', form);
        toast.success('Category created successfully');
      }
      setShowModal(false);
      fetchCategories();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat: CourseCategory) => {
    if (!window.confirm(`Delete category "${cat.category_name}"?\n\nThis cannot be undone.`)) return;
    setDeleting(cat.id);
    try {
      await api.delete(`/categories/${cat.id}`);
      toast.success('Category deleted');
      fetchCategories();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete category');
    } finally {
      setDeleting(null);
    }
  };

  const handleToggleStatus = async (cat: CourseCategory) => {
    try {
      await api.patch(`/categories/${cat.id}/status`);
      fetchCategories();
      toast.success(`Category ${cat.status === 'active' ? 'deactivated' : 'activated'}`);
    } catch {
      toast.error('Failed to update status');
    }
  };

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(p => ({ ...p, [f]: e.target.value }));
    if (errors[f]) setErrors(p => ({ ...p, [f]: '' }));
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Course Categories</h1>
          <p className="page-subtitle">{categories.length} categor{categories.length !== 1 ? 'ies' : 'y'} — organise courses into groups</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={fetchCategories} title="Refresh">
            <FiRefreshCw />
          </button>
          <button className="btn btn-primary" onClick={openAdd}>
            <FiPlus /> Add Category
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div className="spinner" style={{ margin: '0 auto 12px', width: 32, height: 32, borderWidth: 3 }} />
            <p style={{ color: 'var(--text-muted)' }}>Loading categories...</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🗂️</div>
            <h3>No Categories Yet</h3>
            <p>Create your first category to organise courses (e.g. IMAI, DNSVT, Free Courses).</p>
            <button className="btn btn-primary" onClick={openAdd} style={{ marginTop: 16 }}>
              <FiPlus /> Create First Category
            </button>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Category Name</th>
                  <th>Description</th>
                  <th>Courses</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat, idx) => (
                  <tr key={cat.id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{idx + 1}</td>
                    <td>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{cat.category_name}</span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13, maxWidth: 250 }}>
                      {cat.description ? (
                        <span title={cat.description}>
                          {cat.description.length > 60 ? cat.description.slice(0, 60) + '...' : cat.description}
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      <span style={{
                        background: 'rgba(99,102,241,0.12)',
                        color: 'var(--accent)',
                        padding: '3px 10px',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 700,
                      }}>
                        {cat.course_count ?? 0} course{cat.course_count !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${cat.status}`}>{cat.status}</span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="action-btn"
                          title={cat.status === 'active' ? 'Deactivate' : 'Activate'}
                          onClick={() => handleToggleStatus(cat)}
                          style={{ color: cat.status === 'active' ? 'var(--teal)' : 'var(--text-muted)' }}
                        >
                          {cat.status === 'active' ? <FiToggleRight size={16} /> : <FiToggleLeft size={16} />}
                        </button>
                        <button className="action-btn edit" onClick={() => openEdit(cat)} title="Edit">
                          <FiEdit2 />
                        </button>
                        <button
                          className="action-btn delete"
                          onClick={() => handleDelete(cat)}
                          title={Number(cat.course_count) > 0 ? 'Cannot delete: has courses' : 'Delete'}
                          disabled={deleting === cat.id}
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">{editing ? '✏️ Edit Category' : '➕ Add Category'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}><FiX /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Category Name *</label>
                <input
                  className={`form-control ${errors.category_name ? 'input-error' : ''}`}
                  value={form.category_name}
                  onChange={set('category_name')}
                  placeholder="e.g. IMAI, DNSVT, Free Courses"
                  autoFocus
                  maxLength={200}
                />
                {errors.category_name && (
                  <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 4 }}>⚠ {errors.category_name}</p>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-control"
                  value={form.description}
                  onChange={set('description')}
                  rows={3}
                  placeholder="Brief description of this course category..."
                />
              </div>

              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-control" value={form.status} onChange={set('status')}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editing ? 'Update Category' : 'Create Category'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryList;
