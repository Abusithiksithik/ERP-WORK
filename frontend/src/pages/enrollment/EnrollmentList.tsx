import React, { useEffect, useState, useCallback } from 'react';
import { FiPlus, FiX, FiCheck, FiXCircle, FiEdit2, FiTrash2, FiToggleLeft, FiToggleRight } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { Enrollment, Course, Student, Batch, CourseCategory } from '../../types';
import { useAuth } from '../../context/AuthContext';

type Tab = 'enrollments' | 'courses' | 'batches';

const EnrollmentList: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  const [activeTab, setActiveTab] = useState<Tab>('enrollments');

  // ─── Enrollments ──────────────────────────────────────────────────
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [enrollForm, setEnrollForm] = useState({ student_id: '', course_id: '', batch_id: '', notes: '', admission_date: new Date().toISOString().split('T')[0] });
  // Category cascade state for enrollment form
  const [enrollCategoryId, setEnrollCategoryId] = useState('');
  const [enrollFilteredCourses, setEnrollFilteredCourses] = useState<Course[]>([]);
  const [enrollFilteredBatches, setEnrollFilteredBatches] = useState<Batch[]>([]);

  // ─── Categories ──────────────────────────────────────────────────
  const [categories, setCategories] = useState<CourseCategory[]>([]);

  // ─── Courses ──────────────────────────────────────────────────────
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseFilterCategory, setCourseFilterCategory] = useState('');
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [courseLoading, setCourseLoading] = useState(false);
  const [courseForm, setCourseForm] = useState({ category_id: '', course_name: '', description: '', duration: '', fee_amount: '', is_free: 'false', status: 'active' });

  // ─── Batches ──────────────────────────────────────────────────────
  const [batches, setBatches] = useState<Batch[]>([]);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchForm, setBatchForm] = useState({ batch_name: '', course_id: '', start_date: '', end_date: '', status: 'active' });
  const [batchFilterCourse, setBatchFilterCourse] = useState('');

  // ─── Students (for enrollment modal) ──────────────────────────────
  const [students, setStudents] = useState<Student[]>([]);

  // ─── Fetch helpers ─────────────────────────────────────────────────
  const fetchEnrollments = useCallback(async () => {
    try {
      const params: any = {};
      if (filterStatus) params.status = filterStatus;
      const r = await api.get('/enrollments', { params });
      setEnrollments(r.data.data);
    } catch { toast.error('Failed to load enrollments'); }
  }, [filterStatus]);

  const fetchCourses = useCallback(async () => {
    try {
      const params: any = {};
      if (courseFilterCategory) params.category_id = courseFilterCategory;
      const r = await api.get('/courses', { params });
      setCourses(r.data.data);
    } catch { toast.error('Failed to load courses'); }
  }, [courseFilterCategory]);

  const fetchBatches = useCallback(async () => {
    try {
      const params: any = {};
      if (batchFilterCourse) params.course_id = batchFilterCourse;
      const r = await api.get('/batches', { params });
      setBatches(r.data.data);
    } catch { toast.error('Failed to load batches'); }
  }, [batchFilterCourse]);

  // Category cascade handlers for enrollment form
  const handleEnrollCategoryChange = useCallback(async (catId: string) => {
    setEnrollCategoryId(catId);
    setEnrollForm(p => ({ ...p, course_id: '', batch_id: '' }));
    setEnrollFilteredBatches([]);
    if (!catId) { setEnrollFilteredCourses(courses); return; }
    const filtered = courses.filter(c => String(c.category_id) === catId);
    setEnrollFilteredCourses(filtered);
  }, [courses]);

  const handleEnrollCourseChange = useCallback(async (courseId: string) => {
    setEnrollForm(p => ({ ...p, course_id: courseId, batch_id: '' }));
    setEnrollFilteredBatches([]);
    if (!courseId) return;
    try {
      const r = await api.get('/batches', { params: { course_id: courseId } });
      setEnrollFilteredBatches(r.data.data || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchEnrollments(); }, [fetchEnrollments]);
  useEffect(() => { fetchCourses(); }, [fetchCourses]);
  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  useEffect(() => {
    api.get('/categories').then(r => setCategories(r.data.data || [])).catch(() => {});
    if (isAdmin) api.get('/students').then(r => setStudents(r.data.data || [])).catch(() => {});
  }, [isAdmin]);

  // When categories/courses load, initialise enrollFilteredCourses
  useEffect(() => { setEnrollFilteredCourses(courses); }, [courses]);

  // ─── Enrollment Actions ────────────────────────────────────────────
  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollForm.student_id) { toast.error('Please select a student'); return; }
    if (!enrollForm.course_id) { toast.error('Please select a course'); return; }
    setEnrollLoading(true);
    try {
      await api.post('/enrollments', enrollForm);
      toast.success('Enrollment submitted!');
      setShowEnrollModal(false);
      fetchEnrollments();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setEnrollLoading(false); }
  };

  const handleApprove = async (id: number) => {
    try { await api.patch(`/enrollments/${id}/approve`); toast.success('Approved!'); fetchEnrollments(); }
    catch { toast.error('Failed'); }
  };

  const handleReject = async (id: number) => {
    if (!confirm('Reject this enrollment?')) return;
    try { await api.patch(`/enrollments/${id}/reject`, { notes: 'Rejected by admin' }); toast.success('Rejected'); fetchEnrollments(); }
    catch { toast.error('Failed'); }
  };

  // ─── Course Actions ────────────────────────────────────────────────
  const openAddCourse = () => {
    setEditingCourse(null);
    setCourseForm({ category_id: '', course_name: '', description: '', duration: '', fee_amount: '', is_free: 'false', status: 'active' });
    setShowCourseModal(true);
  };

  const openEditCourse = (c: Course) => {
    setEditingCourse(c);
    setCourseForm({
      category_id: c.category_id ? String(c.category_id) : '',
      course_name: c.course_name,
      description: c.description || '',
      duration: c.duration || '',
      fee_amount: String(c.fee_amount),
      is_free: String(c.is_free),
      status: c.status,
    });
    setShowCourseModal(true);
  };

  const handleCourseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCourseLoading(true);
    try {
      if (editingCourse) {
        await api.put(`/courses/${editingCourse.id}`, courseForm);
        toast.success('Course updated!');
      } else {
        await api.post('/courses', courseForm);
        toast.success('Course created!');
      }
      setShowCourseModal(false);
      fetchCourses();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setCourseLoading(false); }
  };

  const handleDeleteCourse = async (id: number) => {
    if (!confirm('Delete this course? This cannot be undone.')) return;
    try { await api.delete(`/courses/${id}`); toast.success('Course deleted'); fetchCourses(); }
    catch { toast.error('Cannot delete course with enrolled students'); }
  };

  const handleToggleCourse = async (id: number) => {
    try { await api.patch(`/courses/${id}/status`); fetchCourses(); }
    catch { toast.error('Failed to update status'); }
  };

  // ─── Batch Actions ─────────────────────────────────────────────────
  const openAddBatch = () => {
    setEditingBatch(null);
    setBatchForm({ batch_name: '', course_id: '', start_date: '', end_date: '', status: 'active' });
    setShowBatchModal(true);
  };

  const openEditBatch = (b: Batch) => {
    setEditingBatch(b);
    setBatchForm({ batch_name: b.batch_name, course_id: String(b.course_id), start_date: b.start_date || '', end_date: b.end_date || '', status: b.status });
    setShowBatchModal(true);
  };

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBatchLoading(true);
    try {
      if (editingBatch) {
        await api.put(`/batches/${editingBatch.id}`, batchForm);
        toast.success('Batch updated!');
      } else {
        await api.post('/batches', batchForm);
        toast.success('Batch created!');
      }
      setShowBatchModal(false);
      fetchBatches();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setBatchLoading(false); }
  };

  const handleDeleteBatch = async (id: number) => {
    if (!confirm('Delete batch?')) return;
    try { await api.delete(`/batches/${id}`); toast.success('Deleted'); fetchBatches(); }
    catch { toast.error('Failed'); }
  };

  const setE = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setEnrollForm(p => ({ ...p, [f]: e.target.value }));
  const setC = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setCourseForm(p => ({ ...p, [f]: e.target.value }));
  const setB = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setBatchForm(p => ({ ...p, [f]: e.target.value }));

  const tabStyle = (tab: Tab): React.CSSProperties => ({
    padding: '10px 24px',
    borderRadius: '10px 10px 0 0',
    border: 'none',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'all 0.2s',
    background: activeTab === tab ? 'var(--accent)' : 'var(--bg-tertiary)',
    color: activeTab === tab ? '#fff' : 'var(--text-secondary)',
    borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
  });

  return (
    <div>
      {/* ── Tab Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Enrollment Management</h1>
          <p className="page-subtitle">Manage enrollments, courses, and batches</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {activeTab === 'enrollments' && isAdmin && (
            <button className="btn btn-primary" onClick={() => { setEnrollForm({ student_id: '', course_id: '', batch_id: '', notes: '', admission_date: new Date().toISOString().split('T')[0] }); setShowEnrollModal(true); }}>
              <FiPlus /> Enroll Student
            </button>
          )}
          {activeTab === 'courses' && isAdmin && (
            <button className="btn btn-primary" onClick={openAddCourse}><FiPlus /> Add Course</button>
          )}
          {activeTab === 'batches' && isAdmin && (
            <button className="btn btn-primary" onClick={openAddBatch}><FiPlus /> Add Batch</button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 0, borderBottom: '2px solid var(--border-light)' }}>
        <button style={tabStyle('enrollments')} onClick={() => setActiveTab('enrollments')}>📋 Enrollments</button>
        {isAdmin && <button style={tabStyle('courses')} onClick={() => setActiveTab('courses')}>📚 Courses</button>}
        {isAdmin && <button style={tabStyle('batches')} onClick={() => setActiveTab('batches')}>🗓️ Batches</button>}
      </div>

      {/* ══════════════════════════════════════════════════
          ENROLLMENTS TAB
      ══════════════════════════════════════════════════ */}
      {activeTab === 'enrollments' && (
        <div className="card" style={{ borderRadius: '0 8px 8px 8px' }}>
          <div className="search-bar">
            <select className="form-control filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          {/* Enroll Modal open button resets category */}
          {enrollments.length === 0
            ? <div className="empty-state"><div className="empty-state-icon">📋</div><h3>No Enrollments</h3></div>
            : <div className="table-container">
                <table>
                  <thead><tr><th>Student</th><th>Category</th><th>Course</th><th>Batch</th><th>Date</th><th>Status</th>{isAdmin && <th>Actions</th>}</tr></thead>
                  <tbody>
                    {enrollments.map(e => (
                      <tr key={e.id}>
                        <td><div style={{ fontWeight: 600 }}>{e.student_name}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{e.student_code}</div></td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{(e as any).category_name || '—'}</td>
                        <td>{e.course_name}</td>
                        <td>{e.batch_name || '—'}</td>
                        <td>{new Date(e.enrolled_at).toLocaleDateString()}</td>
                        <td><span className={`badge badge-${e.status}`}>{e.status}</span></td>
                        {isAdmin && <td>
                          {e.status === 'pending' && (
                            <div className="table-actions">
                              <button className="action-btn view" onClick={() => handleApprove(e.id)} title="Approve"><FiCheck /></button>
                              <button className="action-btn delete" onClick={() => handleReject(e.id)} title="Reject"><FiXCircle /></button>
                            </div>
                          )}
                        </td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          COURSES TAB
      ══════════════════════════════════════════════════ */}
      {activeTab === 'courses' && (
        <div className="card" style={{ borderRadius: '0 8px 8px 8px' }}>
          {/* Category filter for courses tab */}
          <div className="search-bar" style={{ marginBottom: 0, padding: '12px 20px', borderBottom: '1px solid var(--border-light)' }}>
            <select className="form-control filter-select" value={courseFilterCategory} onChange={e => setCourseFilterCategory(e.target.value)} style={{ maxWidth: 220 }}>
              <option value="">All Categories</option>
              {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.category_name}</option>)}
            </select>
            {courseFilterCategory && <button className="btn btn-secondary btn-sm" onClick={() => setCourseFilterCategory('')}>Clear</button>}
          </div>
          {courses.length === 0
            ? <div className="empty-state"><div className="empty-state-icon">📚</div><h3>No Courses</h3><p>Create your first course.</p></div>
            : <div className="table-container">
                <table>
                  <thead><tr><th>Course Name</th><th>Category</th><th>Duration</th><th>Fee</th><th>Type</th><th>Students</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {courses.map(c => (
                      <tr key={c.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{c.course_name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.description?.slice(0, 60)}</div>
                        </td>
                        <td>
                          {c.category_name
                            ? <span style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{c.category_name}</span>
                            : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                        </td>
                        <td>{c.duration || '—'}</td>
                        <td>{c.is_free ? 'Free' : `₹${Number(c.fee_amount).toLocaleString()}`}</td>
                        <td><span className={`badge badge-${c.is_free ? 'free' : 'paid'}`}>{c.is_free ? 'Free' : 'Paid'}</span></td>
                        <td>{c.student_count || 0}</td>
                        <td><span className={`badge badge-${c.status}`}>{c.status}</span></td>
                        <td>
                          <div className="table-actions">
                            <button className="action-btn edit" onClick={() => openEditCourse(c)} title="Edit"><FiEdit2 /></button>
                            <button className="action-btn" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--amber)' }}
                              onClick={() => handleToggleCourse(c.id)} title={c.status === 'active' ? 'Deactivate' : 'Activate'}>
                              {c.status === 'active' ? <FiToggleRight /> : <FiToggleLeft />}
                            </button>
                            <button className="action-btn delete" onClick={() => handleDeleteCourse(c.id)} title="Delete"><FiTrash2 /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          BATCHES TAB
      ══════════════════════════════════════════════════ */}
      {activeTab === 'batches' && (
        <div className="card" style={{ borderRadius: '0 8px 8px 8px' }}>
          <div className="search-bar">
            <select className="form-control filter-select" value={batchFilterCourse} onChange={e => setBatchFilterCourse(e.target.value)}>
              <option value="">All Courses</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.course_name}</option>)}
            </select>
          </div>
          {batches.length === 0
            ? <div className="empty-state"><div className="empty-state-icon">🗓️</div><h3>No Batches</h3><p>Create your first batch.</p></div>
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
                        <td>
                          <div className="table-actions">
                            <button className="action-btn edit" onClick={() => openEditBatch(b)}><FiEdit2 /></button>
                            <button className="action-btn delete" onClick={() => handleDeleteBatch(b.id)}><FiTrash2 /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
        </div>
      )}

      {/* ── Enroll Modal ── */}
      {showEnrollModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header"><h2 className="modal-title">Enroll Student</h2><button className="modal-close" onClick={() => setShowEnrollModal(false)}><FiX /></button></div>
            <form onSubmit={handleEnrollSubmit}>
              {isAdmin && <div className="form-group"><label className="form-label">Student *</label>
                <select className="form-control" value={enrollForm.student_id} onChange={setE('student_id')} required>
                  <option value="">Select Student</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.student_id})</option>)}
                </select>
              </div>}

              {/* Category cascade */}
              <div className="form-group"><label className="form-label">Category</label>
                <select className="form-control" value={enrollCategoryId} onChange={e => handleEnrollCategoryChange(e.target.value)}>
                  <option value="">All Categories</option>
                  {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.category_name}</option>)}
                </select>
                {enrollCategoryId && enrollFilteredCourses.length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>No courses in this category</p>
                )}
              </div>

              <div className="form-group"><label className="form-label">Course *</label>
                <select className="form-control" value={enrollForm.course_id} onChange={e => handleEnrollCourseChange(e.target.value)} required>
                  <option value="">{enrollCategoryId ? `Select Course (${enrollFilteredCourses.length} available)` : 'Select Course'}</option>
                  {enrollFilteredCourses.map(c => <option key={c.id} value={c.id}>{c.course_name}</option>)}
                </select>
              </div>

              <div className="form-group"><label className="form-label">Batch</label>
                <select className="form-control" value={enrollForm.batch_id} onChange={setE('batch_id')} disabled={!enrollForm.course_id}>
                  <option value="">{enrollForm.course_id ? `Select Batch (${enrollFilteredBatches.length} available)` : '— Select course first —'}</option>
                  {enrollFilteredBatches.map(b => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Admission Date *</label>
                <input
                  type="date"
                  className="form-control"
                  value={enrollForm.admission_date}
                  onChange={setE('admission_date')}
                  required
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>This date will be saved as the student's admission date.</span>
              </div>
              <div className="form-group"><label className="form-label">Notes</label><textarea className="form-control" value={enrollForm.notes} onChange={setE('notes')} rows={2} /></div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={enrollLoading}>{enrollLoading ? 'Submitting...' : 'Submit Enrollment'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowEnrollModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Course Modal ── */}
      {showCourseModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">{editingCourse ? 'Edit Course' : 'Add Course'}</h2>
              <button className="modal-close" onClick={() => setShowCourseModal(false)}><FiX /></button>
            </div>
            <form onSubmit={handleCourseSubmit}>
              {/* Category selector */}
              <div className="form-group"><label className="form-label">Category</label>
                <select className="form-control" value={courseForm.category_id} onChange={setC('category_id')}>
                  <option value="">No Category (Uncategorized)</option>
                  {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.category_name}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Course Name *</label><input className="form-control" value={courseForm.course_name} onChange={setC('course_name')} required /></div>
              <div className="form-group"><label className="form-label">Description</label><textarea className="form-control" value={courseForm.description} onChange={setC('description')} rows={2} /></div>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Duration</label><input className="form-control" value={courseForm.duration} onChange={setC('duration')} placeholder="e.g. 6 months" /></div>
                <div className="form-group"><label className="form-label">Fee Amount (₹)</label><input type="number" className="form-control" value={courseForm.fee_amount} onChange={setC('fee_amount')} min={0} /></div>
              </div>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Type</label>
                  <select className="form-control" value={courseForm.is_free} onChange={setC('is_free')}>
                    <option value="false">Paid</option>
                    <option value="true">Free</option>
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Status</label>
                  <select className="form-control" value={courseForm.status} onChange={setC('status')}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={courseLoading}><FiCheck /> {courseLoading ? 'Saving...' : 'Save'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCourseModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Batch Modal ── */}
      {showBatchModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">{editingBatch ? 'Edit Batch' : 'Add Batch'}</h2>
              <button className="modal-close" onClick={() => setShowBatchModal(false)}><FiX /></button>
            </div>
            <form onSubmit={handleBatchSubmit}>
              <div className="form-group"><label className="form-label">Batch Name *</label><input className="form-control" value={batchForm.batch_name} onChange={setB('batch_name')} required /></div>
              <div className="form-group"><label className="form-label">Course *</label>
                <select className="form-control" value={batchForm.course_id} onChange={setB('course_id')} required>
                  <option value="">Select Course</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.course_name}</option>)}
                </select>
              </div>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Start Date</label><input type="date" className="form-control" value={batchForm.start_date} onChange={setB('start_date')} /></div>
                <div className="form-group"><label className="form-label">End Date</label><input type="date" className="form-control" value={batchForm.end_date} onChange={setB('end_date')} /></div>
              </div>
              <div className="form-group"><label className="form-label">Status</label>
                <select className="form-control" value={batchForm.status} onChange={setB('status')}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={batchLoading}><FiCheck /> {batchLoading ? 'Saving...' : 'Save'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowBatchModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnrollmentList;
