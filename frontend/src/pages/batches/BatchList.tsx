import React, { useEffect, useState, useCallback } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiX, FiCheck } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { Batch, Course } from '../../types';

// Generate years from current year ±3
const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 8 }, (_, i) => currentYear - 1 + i); // 2025…2032

const BatchList: React.FC = () => {
  const [batches, setBatches]     = useState<Batch[]>([]);
  const [courses, setCourses]     = useState<Course[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<Batch | null>(null);
  const [loading, setLoading]     = useState(false);

  // Form: use start_year + end_year instead of free-text batch_name
  const [form, setForm] = useState({
    start_year: String(currentYear),
    end_year:   String(currentYear + 2),
    course_id:  '',
    status:     'active',
  });

  // Derived batch_name from start/end year
  const batchName = form.start_year && form.end_year
    ? `${form.start_year}-${form.end_year}`
    : '';

  const fetchBatches = useCallback(async () => {
    try {
      const r = await api.get('/batches');
      setBatches(r.data.data || []);
    } catch { toast.error('Failed to load batches'); }
  }, []);

  useEffect(() => {
    fetchBatches();
    api.get('/courses').then(r => setCourses((r.data.data || []).filter((c: Course) => c.status === 'active')));
  }, [fetchBatches]);

  const openAdd = () => {
    setEditing(null);
    setForm({ start_year: String(currentYear), end_year: String(currentYear + 2), course_id: '', status: 'active' });
    setShowModal(true);
  };

  const openEdit = (b: Batch) => {
    setEditing(b);
    // Parse start/end years from batch_name (e.g. "2025-2027")
    const [sy, ey] = b.batch_name?.split('-') || [String(currentYear), String(currentYear + 2)];
    setForm({ start_year: sy || String(currentYear), end_year: ey || String(currentYear + 2), course_id: String(b.course_id), status: b.status });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.course_id) { toast.error('Please select a sub-course'); return; }
    if (!form.start_year || !form.end_year) { toast.error('Start and end years are required'); return; }
    if (Number(form.end_year) <= Number(form.start_year)) { toast.error('End year must be after start year'); return; }

    setLoading(true);
    const startDate = `${form.start_year}-06-01`;
    const endDate   = `${form.end_year}-05-31`;
    const payload   = {
      batch_name: batchName,
      course_id:  form.course_id,
      start_date: startDate,
      end_date:   endDate,
      status:     form.status,
    };

    try {
      if (editing) {
        await api.put(`/batches/${editing.id}`, payload);
        toast.success('Batch year updated!');
      } else {
        await api.post('/batches', payload);
        toast.success('Batch year created!');
      }
      setShowModal(false);
      fetchBatches();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this batch year? Students linked to it must be reassigned first.')) return;
    try { await api.delete(`/batches/${id}`); toast.success('Deleted'); fetchBatches(); }
    catch { toast.error('Cannot delete — students may be linked to this batch'); }
  };

  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('en-IN'); } catch { return d; }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Batch Years</h1>
          <p className="page-subtitle">{batches.length} batch year{batches.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}><FiPlus /> Add Batch Year</button>
      </div>

      <div className="card">
        {batches.length === 0
          ? (
            <div className="empty-state">
              <div className="empty-state-icon">🗓️</div>
              <h3>No Batch Years</h3>
              <p>Create batch years (e.g. 2025–2027, 2026–2028) for each sub-course.</p>
            </div>
          )
          : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Batch Year</th>
                    <th>Sub-Course</th>
                    <th>Master Course</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Candidates</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map(b => (
                    <tr key={b.id}>
                      <td>
                        <span style={{
                          fontWeight: 700, fontSize: 15,
                          background: 'rgba(99,102,241,0.12)',
                          color: 'var(--accent)',
                          padding: '3px 10px',
                          borderRadius: 8,
                        }}>
                          {b.batch_name}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{b.course_name || '—'}</td>
                      <td>
                        {b.category_name && (
                          <span style={{ fontSize: 12, background: 'rgba(139,92,246,0.12)', color: 'var(--accent-2)', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                            {b.category_name}
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 13 }}>{b.start_date ? fmtDate(b.start_date) : '—'}</td>
                      <td style={{ fontSize: 13 }}>{b.end_date ? fmtDate(b.end_date) : '—'}</td>
                      <td>{b.student_count || 0}</td>
                      <td><span className={`badge badge-${b.status}`}>{b.status}</span></td>
                      <td>
                        <div className="table-actions">
                          <button className="action-btn edit" onClick={() => openEdit(b)} title="Edit"><FiEdit2 /></button>
                          <button className="action-btn delete" onClick={() => handleDelete(b.id)} title="Delete"><FiTrash2 /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">{editing ? '✏️ Edit Batch Year' : '➕ Add Batch Year'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}><FiX /></button>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Sub-Course */}
              <div className="form-group">
                <label className="form-label">Sub-Course *</label>
                <select className="form-control" value={form.course_id}
                  onChange={e => setForm(p => ({ ...p, course_id: e.target.value }))} required>
                  <option value="">— Select Sub-Course —</option>
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>{c.course_name} {c.category_name ? `(${c.category_name})` : ''}</option>
                  ))}
                </select>
              </div>

              {/* Start Year → End Year */}
              <div className="form-group">
                <label className="form-label">Batch Year (Start → End) *</label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <select className="form-control" value={form.start_year}
                    onChange={e => setForm(p => ({ ...p, start_year: e.target.value }))}>
                    {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <span style={{ fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>→</span>
                  <select className="form-control" value={form.end_year}
                    onChange={e => setForm(p => ({ ...p, end_year: e.target.value }))}>
                    {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                {batchName && (
                  <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(99,102,241,0.08)', fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                    📅 Batch Year: <strong>{batchName}</strong>
                  </div>
                )}
              </div>

              {/* Status */}
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-control" value={form.status}
                  onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  <FiCheck /> {loading ? 'Saving...' : 'Save Batch Year'}
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

export default BatchList;
