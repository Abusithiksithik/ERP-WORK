import React, { useEffect, useState } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiX, FiCheck } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { Batch, Course } from '../../types';

const BatchList: React.FC = () => {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Batch | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ batch_name: '', course_id: '', start_date: '', end_date: '', status: 'active' });

  const fetch = async () => {
    const r = await api.get('/batches'); setBatches(r.data.data);
  };
  useEffect(() => {
    fetch();
    api.get('/courses').then(r => setCourses(r.data.data));
  }, []);

  const openAdd = () => { setEditing(null); setForm({ batch_name: '', course_id: '', start_date: '', end_date: '', status: 'active' }); setShowModal(true); };
  const openEdit = (b: Batch) => { setEditing(b); setForm({ batch_name: b.batch_name, course_id: String(b.course_id), start_date: b.start_date || '', end_date: b.end_date || '', status: b.status }); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      if (editing) { await api.put(`/batches/${editing.id}`, form); toast.success('Batch updated!'); }
      else { await api.post('/batches', form); toast.success('Batch created!'); }
      setShowModal(false); fetch();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete batch?')) return;
    try { await api.delete(`/batches/${id}`); toast.success('Deleted'); fetch(); }
    catch { toast.error('Failed'); }
  };

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(p => ({ ...p, [f]: e.target.value }));

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Batches</h1><p className="page-subtitle">{batches.length} batches</p></div>
        <button className="btn btn-primary" onClick={openAdd}><FiPlus /> Add Batch</button>
      </div>

      <div className="card">
        {batches.length === 0 ? <div className="empty-state"><div className="empty-state-icon">🗓️</div><h3>No Batches</h3><p>Create your first batch.</p></div>
        : <div className="table-container">
            <table>
              <thead><tr><th>Batch Name</th><th>Course</th><th>Start Date</th><th>End Date</th><th>Students</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {batches.map(b => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 600 }}>{b.batch_name}</td>
                    <td>{b.course_name}</td>
                    <td>{b.start_date ? new Date(b.start_date).toLocaleDateString() : '—'}</td>
                    <td>{b.end_date ? new Date(b.end_date).toLocaleDateString() : '—'}</td>
                    <td>{b.student_count || 0}</td>
                    <td><span className={`badge badge-${b.status}`}>{b.status}</span></td>
                    <td><div className="table-actions">
                      <button className="action-btn edit" onClick={() => openEdit(b)}><FiEdit2 /></button>
                      <button className="action-btn delete" onClick={() => handleDelete(b.id)}><FiTrash2 /></button>
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
              <h2 className="modal-title">{editing ? 'Edit Batch' : 'Add Batch'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}><FiX /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group"><label className="form-label">Batch Name *</label><input className="form-control" value={form.batch_name} onChange={set('batch_name')} required /></div>
              <div className="form-group"><label className="form-label">Course *</label>
                <select className="form-control" value={form.course_id} onChange={set('course_id')} required>
                  <option value="">Select Course</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.course_name}</option>)}
                </select>
              </div>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Start Date</label><input type="date" className="form-control" value={form.start_date} onChange={set('start_date')} /></div>
                <div className="form-group"><label className="form-label">End Date</label><input type="date" className="form-control" value={form.end_date} onChange={set('end_date')} /></div>
              </div>
              <div className="form-group"><label className="form-label">Status</label>
                <select className="form-control" value={form.status} onChange={set('status')}><option value="active">Active</option><option value="inactive">Inactive</option></select>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={loading}><FiCheck /> {loading ? 'Saving...' : 'Save'}</button>
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
