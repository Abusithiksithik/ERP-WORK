import React, { useEffect, useState, useCallback, useRef } from 'react';
import { FiSearch, FiEdit2, FiRefreshCw, FiX, FiUpload, FiArrowLeft, FiTrash2 } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { Student, Course, Batch } from '../../types';

const DiscontinuedStudents: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 15;

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  // Restore confirm modal
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreStudent, setRestoreStudent] = useState<Student | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);

  // Delete confirm modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteStudent, setDeleteStudent] = useState<Student | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit };
      if (search) params.search = search;
      const res = await api.get('/students/discontinued', { params });
      setStudents(res.data.data);
      setTotal(res.data.total);
    } catch {
      toast.error('Failed to load discontinued students');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);
  useEffect(() => { api.get('/courses').then(r => setCourses(r.data.data)); }, []);

  // ─── Edit ──────────────────────────────────────────────────────────
  const openEdit = (s: Student) => {
    setEditStudent(s);
    setEditForm({
      full_name: s.full_name || '',
      mobile: s.mobile || '',
      email: s.email || '',
      date_of_birth: s.date_of_birth ? s.date_of_birth.split('T')[0] : '',
      gender: s.gender || '',
      address: s.address || '',
      parent_name: s.parent_name || '',
      parent_mobile: s.parent_mobile || '',
      course_id: s.course_id ? String(s.course_id) : '',
      batch_id: s.batch_id ? String(s.batch_id) : '',
      admission_date: s.admission_date ? s.admission_date.split('T')[0] : '',
      status: 'discontinued',
    });
    setPhotoPreview(s.photo_url || null);
    setBatches([]);
    if (s.course_id) {
      api.get('/batches', { params: { course_id: s.course_id } }).then(r => setBatches(r.data.data));
    }
    setShowEditModal(true);
  };

  const handleCourseChange = async (courseId: string) => {
    setEditForm((f: any) => ({ ...f, course_id: courseId, batch_id: '' }));
    setBatches([]);
    if (!courseId) return;
    setBatchLoading(true);
    try {
      const r = await api.get('/batches', { params: { course_id: courseId } });
      setBatches(r.data.data);
    } catch { toast.error('Failed to load batches'); }
    finally { setBatchLoading(false); }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editStudent) return;
    setEditLoading(true);
    try {
      const fd = new FormData();
      Object.entries(editForm).forEach(([k, v]) => {
        if (v !== undefined && v !== null) fd.append(k, String(v));
      });
      if (photoRef.current?.files?.[0]) fd.append('photo', photoRef.current.files[0]);
      await api.put(`/students/${editStudent.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Student details updated!');
      setShowEditModal(false);
      fetchStudents();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally {
      setEditLoading(false);
    }
  };

  const setF = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setEditForm((f: any) => ({ ...f, [field]: e.target.value }));

  // ─── Restore ───────────────────────────────────────────────────────
  const openRestore = (s: Student) => {
    setRestoreStudent(s);
    setShowRestoreModal(true);
  };

  const handleRestore = async () => {
    if (!restoreStudent) return;
    setRestoreLoading(true);
    try {
      await api.post(`/students/${restoreStudent.id}/restore`);
      toast.success(`${restoreStudent.full_name} restored to active students!`);
      setShowRestoreModal(false);
      fetchStudents();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Restore failed');
    } finally {
      setRestoreLoading(false);
    }
  };

  // ─── Delete ────────────────────────────────────────────────────────
  const openDelete = (s: Student) => {
    setDeleteStudent(s);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!deleteStudent) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/students/${deleteStudent.id}`);
      toast.success(`${deleteStudent.full_name} has been permanently deleted.`);
      setShowDeleteModal(false);
      fetchStudents();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally {
      setDeleteLoading(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link to="/students" className="btn btn-secondary btn-sm" title="Back to Students"><FiArrowLeft /></Link>
          <div>
            <h1 className="page-title" style={{ color: 'var(--danger, #ef4444)' }}>🚫 Discontinued Students</h1>
            <p className="page-subtitle">{total} discontinued students</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="search-bar">
          <div className="search-input-wrap">
            <FiSearch className="search-icon" />
            <input
              className="form-control search-input"
              placeholder="Search by name, email, ID..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading...</div>
        ) : students.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">✅</div>
            <h3>No Discontinued Students</h3>
            <p>All students are currently active.</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>ID</th>
                  <th>Mobile</th>
                  <th>Course</th>
                  <th>Discontinued On</th>
                  <th>Reason</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {s.photo_url
                          ? <img src={s.photo_url} alt={s.full_name} className="student-photo" style={{ opacity: 0.7 }} />
                          : <div className="student-avatar" style={{ background: 'rgba(239,68,68,0.2)', color: '#ef4444' }}>
                              {s.full_name.charAt(0)}
                            </div>}
                        <div>
                          <div style={{ fontWeight: 600 }}>{s.full_name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><code style={{ color: '#ef4444', fontSize: 12 }}>{s.student_id}</code></td>
                    <td>{s.mobile}</td>
                    <td>{s.course_name || '—'}</td>
                    <td>
                      {s.discontinued_at
                        ? new Date(s.discontinued_at).toLocaleDateString()
                        : '—'}
                    </td>
                    <td style={{ maxWidth: 200, fontSize: 12, color: 'var(--text-muted)' }}>
                      {s.discontinued_reason || '—'}
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="action-btn edit"
                          title="Edit Details"
                          onClick={() => openEdit(s)}
                        >
                          <FiEdit2 />
                        </button>
                        <button
                          className="action-btn view"
                          title="Restore Student"
                          onClick={() => openRestore(s)}
                          style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--teal)' }}
                        >
                          <FiRefreshCw />
                        </button>
                        <button
                          className="action-btn delete"
                          title="Permanently Delete Student"
                          onClick={() => openDelete(s)}
                          style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
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

        {totalPages > 1 && (
          <div className="pagination">
            <button className="page-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>←</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, page - 2) + i;
              if (p > totalPages) return null;
              return <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>;
            })}
            <button className="page-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>→</button>
          </div>
        )}
      </div>

      {/* ── Edit Modal ── */}
      {showEditModal && editStudent && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <h2 className="modal-title">✏️ Edit Discontinued Student</h2>
              <button className="modal-close" onClick={() => setShowEditModal(false)}><FiX /></button>
            </div>
            <form onSubmit={handleEditSubmit} style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>
              {/* Photo */}
              <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
                {photoPreview
                  ? <img src={photoPreview} alt="preview" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '3px solid #ef4444' }} />
                  : <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#ef4444' }}>👤</div>}
                <label className="btn btn-secondary" style={{ cursor: 'pointer' }} onClick={() => photoRef.current?.click()}>
                  <FiUpload /> Change Photo
                  <input type="file" ref={photoRef} accept="image/*"
                    onChange={e => { const f = e.target.files?.[0]; if (f) setPhotoPreview(URL.createObjectURL(f)); }}
                    style={{ display: 'none' }} />
                </label>
              </div>

              <div className="form-grid">
                <div className="form-group"><label className="form-label">Full Name *</label><input className="form-control" value={editForm.full_name || ''} onChange={setF('full_name')} required /></div>
                <div className="form-group"><label className="form-label">Mobile *</label><input className="form-control" value={editForm.mobile || ''} onChange={setF('mobile')} required /></div>
                <div className="form-group"><label className="form-label">Email *</label><input type="email" className="form-control" value={editForm.email || ''} onChange={setF('email')} required /></div>
                <div className="form-group"><label className="form-label">Date of Birth</label><input type="date" className="form-control" value={editForm.date_of_birth || ''} onChange={setF('date_of_birth')} /></div>
                <div className="form-group"><label className="form-label">Gender</label>
                  <select className="form-control" value={editForm.gender || ''} onChange={setF('gender')}>
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div className="form-group"><label className="form-label">Address</label><textarea className="form-control" value={editForm.address || ''} onChange={setF('address')} rows={2} /></div>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Parent Name</label><input className="form-control" value={editForm.parent_name || ''} onChange={setF('parent_name')} /></div>
                <div className="form-group"><label className="form-label">Parent Mobile</label><input className="form-control" value={editForm.parent_mobile || ''} onChange={setF('parent_mobile')} /></div>
              </div>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Course</label>
                  <select className="form-control" value={editForm.course_id || ''} onChange={e => handleCourseChange(e.target.value)}>
                    <option value="">Select Course</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.course_name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Batch {batchLoading && <span style={{ fontSize: 11, color: 'var(--accent)' }}>Loading...</span>}</label>
                  <select className="form-control" value={editForm.batch_id || ''} onChange={setF('batch_id')} disabled={!editForm.course_id || batchLoading}>
                    <option value="">Select Batch</option>
                    {batches.map(b => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={editLoading}>{editLoading ? 'Saving...' : 'Save Changes'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Restore Confirmation Modal ── */}
      {showRestoreModal && restoreStudent && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 440, textAlign: 'center' }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28 }}>
                🔄
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Restore Student</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                Are you sure you want to restore <strong>{restoreStudent.full_name}</strong> back to active students?
              </p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '10px 16px', marginBottom: 20, textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{restoreStudent.full_name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{restoreStudent.student_id} · {restoreStudent.email}</div>
              {restoreStudent.course_name && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Course: {restoreStudent.course_name}</div>}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowRestoreModal(false)}>Cancel</button>
              <button
                style={{ flex: 1, padding: '10px 20px', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                onClick={handleRestore}
                disabled={restoreLoading}
              >
                <FiRefreshCw size={15} /> {restoreLoading ? 'Restoring...' : 'Yes, Restore'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {showDeleteModal && deleteStudent && (
        <div className="modal-overlay" style={{ zIndex: 10001 }}>
          <div className="modal" style={{ maxWidth: 460, textAlign: 'center' }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 30 }}>
                🗑️
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#ef4444' }}>Permanently Delete Student</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                This action is <strong style={{ color: '#ef4444' }}>irreversible</strong>. All data for this student — including attendance, payments, and enrollments — will be permanently removed from the system.
              </p>
            </div>

            <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 24, textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>{deleteStudent.full_name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{deleteStudent.student_id} · {deleteStudent.email}</div>
              {deleteStudent.course_name && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Course: {deleteStudent.course_name}</div>}
              <div style={{ fontSize: 11, marginTop: 8, color: '#ef4444', fontWeight: 600 }}>Status: Discontinued ✓</div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setShowDeleteModal(false)}
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                style={{ flex: 1, padding: '10px 20px', background: 'linear-gradient(135deg, #ef4444, #b91c1c)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 14, cursor: deleteLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: deleteLoading ? 0.7 : 1 }}
                onClick={handleDelete}
                disabled={deleteLoading}
              >
                <FiTrash2 size={15} /> {deleteLoading ? 'Deleting...' : 'Yes, Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiscontinuedStudents;
