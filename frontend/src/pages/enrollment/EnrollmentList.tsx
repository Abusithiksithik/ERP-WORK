import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  FiX, FiEdit2,
  FiDollarSign, FiPackage, FiTag,
} from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { Enrollment, Course, Student, Batch, CourseCategory, BatchStudent } from '../../types';
import { useAuth } from '../../context/AuthContext';

/* ─── small helpers ─────────────────────────────────────────── */
const fmt = (n: number | string) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;

/* ─── component ─────────────────────────────────────────────── */
const EnrollmentList: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  /* ── enrollments ── */
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [showPayModal, setShowPayModal]         = useState(false);
  const [payLoading, setPayLoading]             = useState(false);
  const [showActionMenu, setShowActionMenu]     = useState<number | null>(null);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountLoading, setDiscountLoading]   = useState(false);
  const [discountAmount, setDiscountAmount]     = useState('');
  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);

  const [payForm, setPayForm] = useState({
    amount: '', payment_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  /* ── categories / courses (kept for potential future use in enroll cascade) ── */
  const [categories, setCategories] = useState<CourseCategory[]>([]);
  const [courses, setCourses]       = useState<Course[]>([]);
  const [students, setStudents]     = useState<Student[]>([]);

  /* ── fetchers ── */
  const fetchEnrollments = useCallback(async () => {
    try {
      const r = await api.get('/enrollments', { params: filterStatus ? { status: filterStatus } : {} });
      setEnrollments(r.data.data);
    } catch { toast.error('Failed to load enrollments'); }
  }, [filterStatus]);

  const fetchCourses = useCallback(async () => {
    try {
      const r = await api.get('/courses');
      setCourses(r.data.data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchEnrollments(); }, [fetchEnrollments]);
  useEffect(() => { fetchCourses(); },    [fetchCourses]);
  useEffect(() => {
    api.get('/categories').then(r => setCategories(r.data.data || [])).catch(() => {});
    if (isAdmin) api.get('/students').then(r => setStudents(r.data.data || [])).catch(() => {});
  }, [isAdmin]);

<<<<<<< HEAD
=======
  /* ── cascade: course → batches in enroll modal ── */
  const handleEnrollCourseChange = useCallback(async (courseId: string) => {
    setEnrollForm(p => ({ ...p, course_id: courseId, batch_id: '' }));
    setEnrollFilteredBatches([]);
    if (!courseId) return;
    const c = courses.find(x => String(x.id) === courseId);
    if (c) setEnrollForm(p => ({ ...p, course_id: courseId, course_fee: String(c.fee_amount || '') }));
    try {
      const r = await api.get('/batches', { params: { course_id: courseId } });
      setEnrollFilteredBatches(r.data.data || []);
    } catch { /* silent */ }
  }, [courses]);

  /* ── enroll submit ── */
  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollForm.student_id) { toast.error('Select a candidate'); return; }
    if (!enrollForm.course_id)  { toast.error('Select a course');  return; }
    setEnrollLoading(true);
    try {
      await api.post('/enrollments', enrollForm);
      toast.success('Enrollment created!');
      setShowEnrollModal(false);
      fetchEnrollments();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setEnrollLoading(false); }
  };

  /* ── fee edit submit ── */
  const handleFeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnrollment) return;
    setFeeLoading(true);
    try {
      await api.put(`/enrollments/${selectedEnrollment.id}`, {
        batch_id:        feeForm.batch_id        || selectedEnrollment.batch_id,
        notes:           feeForm.notes           || selectedEnrollment.notes,
        application_fee: 0,
        course_fee:      Number(feeForm.course_fee),
        hostel_fee:      Number(feeForm.hostel_fee),
        uniform_fee:     Number(feeForm.uniform_fee),
        materials_fee:   Number(feeForm.materials_fee),
      });
      toast.success('Fee details updated!');
      setShowFeeModal(false);
      fetchEnrollments();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setFeeLoading(false); }
  };

>>>>>>> db4c08a89fc3294053c71826514ea5eec542b960
  /* ── record payment submit ── */
  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnrollment) return;
    if (!payForm.amount || Number(payForm.amount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setPayLoading(true);
    try {
      await api.post('/payments', {
        student_id:    selectedEnrollment.student_id,
        enrollment_id: selectedEnrollment.id,
        amount:        Number(payForm.amount),
        payment_date:  payForm.payment_date,
        notes:         payForm.notes,
      });
      toast.success('Payment recorded!');
      setShowPayModal(false);
      fetchEnrollments();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setPayLoading(false); }
  };

  const openDiscountModal = (enr: Enrollment) => {
    setSelectedEnrollment(enr);
    setDiscountAmount(Number(enr.discount || 0) > 0 ? String(enr.discount) : '');
    setShowActionMenu(null);
    setShowDiscountModal(true);
  };

  const handleDiscountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnrollment) return;
    const amount = Number(discountAmount);
    const baseFee = Number(selectedEnrollment.total_fee || 0);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error('Enter a valid discount amount');
      return;
    }
    if (amount > baseFee) {
      toast.error(`Discount cannot exceed ${fmt(baseFee)}`);
      return;
    }
    setDiscountLoading(true);
    try {
      await api.post(`/enrollments/${selectedEnrollment.id}/discount`, { discount: amount });
      toast.success('Discount applied!');
      setShowDiscountModal(false);
      setSelectedEnrollment(null);
      fetchEnrollments();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to apply discount');
    } finally {
      setDiscountLoading(false);
    }
  };

  /* ── approve / reject ── */
<<<<<<< HEAD
=======
  const handleApprove = async (id: number) => {
    try { await api.patch(`/enrollments/${id}/approve`); toast.success('Approved!'); fetchEnrollments(); }
    catch { toast.error('Failed'); }
  };
  const handleReject = async (id: number) => {
    if (!confirm('Reject this enrollment?')) return;
    try { await api.patch(`/enrollments/${id}/reject`, { notes: 'Rejected by admin' }); toast.success('Rejected'); fetchEnrollments(); }
    catch { toast.error('Failed'); }
  };

  /* ── course actions ── */
  const openAddCourse   = () => { setEditingCourse(null); setCourseForm({ category_id: '', course_name: '', description: '', duration: '', fee_amount: '', is_free: 'false', status: 'active' }); setShowCourseModal(true); };
  const openEditCourse  = (c: Course) => { setEditingCourse(c); setCourseForm({ category_id: c.category_id ? String(c.category_id) : '', course_name: c.course_name, description: c.description || '', duration: c.duration || '', fee_amount: String(c.fee_amount), is_free: String(c.is_free), status: c.status }); setShowCourseModal(true); };
  const handleCourseSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setCourseLoading(true);
    try {
      if (editingCourse) { await api.put(`/courses/${editingCourse.id}`, courseForm); toast.success('Course updated!'); }
      else               { await api.post('/courses', courseForm);                     toast.success('Course created!'); }
      setShowCourseModal(false); fetchCourses();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setCourseLoading(false); }
  };
const handleDeleteCourse = async (id: number) => {
  if (!confirm('Delete this course?')) return;

  try {
    await api.delete(`/courses/${id}`);
    toast.success('Deleted');
    fetchCourses();
  } catch {
    toast.error('Cannot delete — candidates enrolled');
  }
};
  const handleToggleCourse = async (id: number) => {
    try { await api.patch(`/courses/${id}/status`); fetchCourses(); }
    catch { toast.error('Failed'); }
  };

  /* ── batch actions ── */
  const openAddBatch  = () => { setEditingBatch(null); setBatchForm({ batch_name: '', course_id: '', start_date: '', end_date: '', status: 'active' }); setShowBatchModal(true); };
  const openEditBatch = (b: Batch) => { setEditingBatch(b); setBatchForm({ batch_name: b.batch_name, course_id: String(b.course_id), start_date: b.start_date || '', end_date: b.end_date || '', status: b.status }); setShowBatchModal(true); };
  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setBatchLoading(true);
    try {
      if (editingBatch) { await api.put(`/batches/${editingBatch.id}`, batchForm); toast.success('Batch updated!'); }
      else              { await api.post('/batches', batchForm);                    toast.success('Batch created!'); }
      setShowBatchModal(false); fetchBatches();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setBatchLoading(false); }
  };
  const handleDeleteBatch = async (id: number) => {
    if (!confirm('Delete batch?')) return;
    try { await api.delete(`/batches/${id}`); toast.success('Deleted'); fetchBatches(); }
    catch { toast.error('Failed'); }
  };
  const handleToggleBatchStatus = async (b: Batch) => {
    const newStatus = b.status === 'active' ? 'inactive' : 'active';
    try {
      await api.put(`/batches/${b.id}`, {
        batch_name: b.batch_name, course_id: String(b.course_id),
        start_date: b.start_date || '', end_date: b.end_date || '', status: newStatus,
      });
      toast.success(`Batch marked as ${newStatus}`);
      fetchBatches();
    } catch { toast.error('Failed to update status'); }
  };

  /* ── batch students ── */
  const openBatchStudents = async (b: Batch) => {
    setSelectedBatchForStudents(b);
    setShowBatchStudentsModal(true);
    setBatchStudentsLoading(true);
    try {
      const r = await api.get('/enrollments', { params: { batch_id: b.id } });
      const data: Enrollment[] = r.data.data || [];
      setBatchStudents(data.map(enr => ({
        id: enr.student_id,
        student_id: enr.student_code || String(enr.student_id),
        full_name: enr.student_name || '—',
        mobile: (enr as any).student_mobile || '—',
        email: (enr as any).student_email || '—',
        status: enr.status,
        enrollment_status: enr.status,
        amount_paid: enr.amount_paid,
        balance_amount: enr.balance_amount,
      })));
    } catch { toast.error('Failed to load students'); }
    finally { setBatchStudentsLoading(false); }
  };

  /* ── inline category create ── */
  const handleInlineCatSubmit = async () => {
    if (!inlineCatName.trim()) { toast.error('Enter category name'); return; }
    setInlineCatLoading(true);
    try {
      const r = await api.post('/categories', { category_name: inlineCatName.trim(), status: 'active' });
      const newCat = r.data.data;
      const cats = await api.get('/categories');
      setCategories(cats.data.data || []);
      // Auto-select new category in course form
      setCourseForm(p => ({ ...p, category_id: String(newCat?.id || '') }));
      setInlineCatName('');
      setShowInlineCatForm(false);
      toast.success(`Category "${inlineCatName.trim()}" added!`);
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setInlineCatLoading(false); }
  };

  /* ── expand batch to show students inline ── */
  const toggleBatchExpand = async (batchId: number) => {
    if (expandedBatchId === batchId) { setExpandedBatchId(null); return; }
    setExpandedBatchId(batchId);
    if (batchStudentsExpanded[batchId]) return; // already loaded
    try {
      const r = await api.get('/enrollments', { params: { batch_id: batchId } });
      const data = r.data.data || [];
      setBatchStudentsExpanded(prev => ({
        ...prev,
        [batchId]: data.map((enr: any) => ({
          student_code: enr.student_code,
          full_name:    enr.student_name || '—',
          status:       enr.status,
          amount_paid:  enr.amount_paid,
          balance:      enr.balance_amount,
        })),
      }));
    } catch { toast.error('Failed to load students'); }
  };
>>>>>>> db4c08a89fc3294053c71826514ea5eec542b960

  /* ── form helpers ── */
  const setP = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setPayForm(p => ({ ...p, [f]: e.target.value }));

  const openPayModal = (enr: Enrollment) => {
    setSelectedEnrollment(enr);
    setPayForm({
      amount:       '',
      payment_date: new Date().toISOString().split('T')[0],
      notes:        '',
    });
    setShowPayModal(true);
  };

  /* ══════════════════════════════════════════════════════════════ */
  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Enrollment Management</h1>
<<<<<<< HEAD
          <p className="page-subtitle">View and manage candidate enrollments</p>
=======
          <p className="page-subtitle">Enrollments · Courses · Batches</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {activeTab === 'enrollments' && isAdmin && (
            <button className="btn btn-primary" onClick={() => {
              setEnrollForm({ student_id: '', course_id: '', batch_id: '', notes: '', category_id: '', admission_date: new Date().toISOString().split('T')[0], course_fee: '', hostel_fee: '', uniform_fee: '', materials_fee: '' });
              setEnrollFilteredBatches([]);
              setShowEnrollModal(true);
            }}>
              <FiPlus /> Enroll Candidate
            </button>
          )}
          {activeTab === 'courses' && isAdmin && (
            <button className="btn btn-primary" onClick={openAddCourse}><FiPlus /> Add Course</button>
          )}
          {activeTab === 'batches' && isAdmin && (
            <button className="btn btn-primary" onClick={openAddBatch}><FiPlus /> Add Batch</button>
          )}
>>>>>>> db4c08a89fc3294053c71826514ea5eec542b960
        </div>
      </div>

      {/* ══════════ ENROLLMENTS TABLE ══════════ */}
      <div className="card">
        <div className="search-bar">
          <select className="form-control filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            <option value="approved">Approved</option>
            <option value="discontinued">Discontinued</option>
          </select>
        </div>

<<<<<<< HEAD
        {enrollments.length === 0
          ? <div className="empty-state"><div className="empty-state-icon">📋</div><h3>No Enrollments</h3></div>
          : <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Course</th>
                    <th>Batch</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Total Fee</th>
                    <th style={{ textAlign: 'right' }}>Paid</th>
                    <th style={{ textAlign: 'right' }}>Balance</th>
                    {isAdmin && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map(enr => {
                    const hasBalance = Number(enr.balance_amount) > 0;
                    return (
                      <tr key={enr.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{enr.student_name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{enr.student_code}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{enr.course_name}</div>
                          {enr.category_name && (
                            <span style={{ fontSize: 11, background: 'rgba(99,102,241,0.1)', color: 'var(--accent)', padding: '1px 7px', borderRadius: 10, fontWeight: 600, display: 'inline-block', marginTop: 3 }}>
                              {enr.category_name}
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{enr.batch_name || '—'}</td>
                        <td style={{ fontSize: 13 }}>{new Date(enr.enrolled_at).toLocaleDateString()}</td>
                        <td><span className={`badge badge-${enr.status}`}>{enr.status}</span></td>
                        <td style={{ textAlign: 'right', fontWeight: 600, fontSize: 14 }}>
                          {Number(enr.total_fee) > 0 ? (
                            <div>
                              {Number(enr.discount || 0) > 0 && (
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'line-through', marginBottom: 2 }}>{fmt(enr.total_fee)}</div>
                              )}
                              <span>{fmt(Math.max(0, Number(enr.total_fee) - Number(enr.discount || 0)))}</span>
                            </div>
                          ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--teal)', fontWeight: 600, fontSize: 14 }}>
                          {Number(enr.amount_paid) > 0 ? fmt(enr.amount_paid) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 14, color: hasBalance ? 'var(--red)' : 'var(--teal)' }}>
                          {Number(enr.total_fee) > 0
                            ? <span>{hasBalance ? fmt(enr.balance_amount) : '✓ Cleared'}</span>
                            : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                        </td>
                        {isAdmin && (
                          <td>
                            <div className="table-actions">
                              {/* Edit Student */}
                              <Link
                                to={`/students/${enr.student_id}/edit`}
                                className="action-btn edit"
                                title="Edit Candidate"
                                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <FiEdit2 />
                              </Link>

                              {/* Course payment actions: Record Payment + Discount */}
                              <div style={{ position: 'relative', display: 'inline-flex' }}>
=======
      {/* ══════════ ENROLLMENTS TAB ══════════ */}
      {activeTab === 'enrollments' && (
        <div className="card" style={{ borderRadius: '0 8px 8px 8px' }}>
          <div className="search-bar">
            <select className="form-control filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Status</option>
              <option value="approved">Approved</option>
              <option value="discontinued">Discontinued</option>
            </select>
          </div>

          {enrollments.length === 0
            ? <div className="empty-state"><div className="empty-state-icon">📋</div><h3>No Enrollments</h3></div>
            : <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th>Course</th>
                      <th>Batch</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Total Fee</th>
                      <th style={{ textAlign: 'right' }}>Paid</th>
                      <th style={{ textAlign: 'right' }}>Balance</th>
                      {isAdmin && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map(enr => {
                      const hasBalance = Number(enr.balance_amount) > 0;
                      return (
                        <tr key={enr.id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{enr.student_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{enr.student_code}</div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{enr.course_name}</div>
                            {enr.category_name && (
                              <span style={{ fontSize: 11, background: 'rgba(99,102,241,0.1)', color: 'var(--accent)', padding: '1px 7px', borderRadius: 10, fontWeight: 600, display: 'inline-block', marginTop: 3 }}>
                                {enr.category_name}
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{enr.batch_name || '—'}</td>
                          <td style={{ fontSize: 13 }}>{new Date(enr.enrolled_at).toLocaleDateString()}</td>
                          <td><span className={`badge badge-${enr.status}`}>{enr.status}</span></td>
                          <td style={{ textAlign: 'right', fontWeight: 600, fontSize: 14 }}>
                            {Number(enr.total_fee) > 0 ? fmt(enr.total_fee) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                          </td>
                          <td style={{ textAlign: 'right', color: 'var(--teal)', fontWeight: 600, fontSize: 14 }}>
                            {Number(enr.amount_paid) > 0 ? fmt(enr.amount_paid) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 14, color: hasBalance ? 'var(--red)' : 'var(--teal)' }}>
                            {Number(enr.total_fee) > 0
                              ? <span>{hasBalance ? fmt(enr.balance_amount) : '✓ Cleared'}</span>
                              : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                          </td>
                          {isAdmin && (
                            <td>
                              <div className="table-actions">
                                {/* Edit Student */}
                                <Link
                                  to={`/students/${enr.student_id}/edit`}
                                  className="action-btn edit"
                                  title="Edit Candidate"
                                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                  <FiEdit2 />
                                </Link>
                                {enr.status === 'pending' && <>
                                  <button className="action-btn view" onClick={() => handleApprove(enr.id)} title="Approve"><FiCheck /></button>
                                  <button className="action-btn delete" onClick={() => handleReject(enr.id)} title="Reject"><FiXCircle /></button>
                                </>}
                                {/* Fee breakdown */}
                                <button
                                  className="action-btn edit"
                                  onClick={() => openFeeModal(enr)}
                                  title="Set Fee Breakdown"
                                  style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--amber)' }}
                                >
                                  <FiEye />
                                </button>
                                {/* Record payment */}
>>>>>>> db4c08a89fc3294053c71826514ea5eec542b960
                                <button
                                  className="action-btn"
                                  onClick={() => setShowActionMenu(showActionMenu === enr.id ? null : enr.id)}
                                  title="Course Payment"
                                  style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--teal)' }}
                                >
                                  <FiDollarSign />
                                </button>
                                {showActionMenu === enr.id && (
                                  <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 30, minWidth: 170, padding: 6, borderRadius: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', boxShadow: '0 12px 30px rgba(0,0,0,.35)' }}>
                                    <button type="button" onClick={() => { setShowActionMenu(null); openPayModal(enr); }} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '9px 10px', background: 'transparent', border: 0, color: 'var(--text-primary)', cursor: 'pointer', borderRadius: 7 }}>
                                      💰 Record Payment
                                    </button>
                                    <button type="button" onClick={() => openDiscountModal(enr)} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '9px 10px', background: 'transparent', border: 0, color: 'var(--text-primary)', cursor: 'pointer', borderRadius: 7 }}>
                                      <FiTag /> Discount
                                    </button>
                                    <button type="button" onClick={() => setShowActionMenu(null)} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '9px 10px', background: 'transparent', border: 0, color: 'var(--red)', cursor: 'pointer', borderRadius: 7 }}>
                                      ✕ Cancel
                                    </button>
                                  </div>
                                )}
                              </div>
<<<<<<< HEAD
                              {/* Materials */}
                              <button
                                className="action-btn"
                                title="View Materials"
                                style={{ background: 'rgba(139,92,246,0.12)', color: 'var(--accent-2)' }}
                                onClick={() => window.open(`/materials?course_id=${enr.course_id}`, '_self')}
                              >
                                <FiPackage />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>}
      </div>
=======
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>}
        </div>
      )}

      {/* ══════════ COURSES TAB ══════════ */}
      {activeTab === 'courses' && (
        <div className="card" style={{ borderRadius: '0 8px 8px 8px' }}>
          <div className="search-bar" style={{ marginBottom: 0, padding: '12px 20px', borderBottom: '1px solid var(--border-light)' }}>
            <select className="form-control filter-select" value={courseFilterCategory} onChange={e => setCourseFilterCategory(e.target.value)} style={{ maxWidth: 220 }}>
              <option value="">All Categories</option>
              {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.category_name}</option>)}
            </select>
            {courseFilterCategory && <button className="btn btn-secondary btn-sm" onClick={() => setCourseFilterCategory('')}>Clear</button>}
          </div>
          {courses.length === 0
            ? <div className="empty-state"><div className="empty-state-icon">📚</div><h3>No Courses</h3></div>
            : <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>Category</th>
                      <th>Duration</th>
                      <th>Fee</th>
                      <th>Type</th>
                      <th>Candidates</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courses.map(c => (
                      <tr key={c.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{c.course_name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.description?.slice(0, 55)}</div>
                        </td>
                        <td>
                          {c.category_name
                            ? <span style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{c.category_name}</span>
                            : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                        </td>
                        <td style={{ fontSize: 13 }}>{c.duration || '—'}</td>
                        <td style={{ fontWeight: 600 }}>{c.is_free ? 'Free' : fmt(c.fee_amount)}</td>
                        <td><span className={`badge badge-${c.is_free ? 'free' : 'paid'}`}>{c.is_free ? 'Free' : 'Paid'}</span></td>
                        <td>{c.student_count || 0}</td>
                        <td><span className={`badge badge-${c.status}`}>{c.status}</span></td>
                        <td>
                          <div className="table-actions">
                            <button className="action-btn edit" onClick={() => openEditCourse(c)} title="Edit"><FiEdit2 /></button>
                            <button className="action-btn" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--amber)' }} onClick={() => handleToggleCourse(c.id)} title={c.status === 'active' ? 'Deactivate' : 'Activate'}>
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

      {/* ══════════ BATCHES TAB ══════════ */}
      {activeTab === 'batches' && (
        <div className="card" style={{ borderRadius: '0 8px 8px 8px' }}>
          <div className="search-bar" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Batch name text search */}
            <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
              <FiSearch style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input className="form-control" placeholder="Search batch name..." value={batchSearch} onChange={e => setBatchSearch(e.target.value)} style={{ paddingLeft: 34 }} />
            </div>
            {/* Course filter */}
            <select className="form-control filter-select" value={batchFilterCourse} onChange={e => setBatchFilterCourse(e.target.value)} style={{ maxWidth: 200 }}>
              <option value="">All Courses</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.course_name}</option>)}
            </select>
            {/* Date range */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>From</span>
              <input type="date" className="form-control" value={batchDateFrom} onChange={e => setBatchDateFrom(e.target.value)} style={{ width: 145 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>To</span>
              <input type="date" className="form-control" value={batchDateTo} onChange={e => setBatchDateTo(e.target.value)} style={{ width: 145 }} />
            </div>
            {(batchSearch || batchFilterCourse || batchDateFrom || batchDateTo) && (
              <button className="btn btn-secondary btn-sm" onClick={() => { setBatchSearch(''); setBatchFilterCourse(''); setBatchDateFrom(''); setBatchDateTo(''); }}>Clear</button>
            )}
          </div>
          {filteredBatchesList.length === 0
            ? <div className="empty-state"><div className="empty-state-icon">🗓️</div><h3>No Batches</h3></div>
            : <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Batch</th>
                      <th>Category</th>
                      <th>Course</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Candidates</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBatchesList.map(b => (
                      <React.Fragment key={b.id}>
                      <tr>
                        <td style={{ fontWeight: 600 }}>{b.batch_name}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {(b as any).category_name
                            ? <span style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>{(b as any).category_name}</span>
                            : '—'}
                        </td>
                        <td style={{ fontSize: 13 }}>{b.course_name}</td>
                        <td style={{ fontSize: 13 }}>{b.start_date ? new Date(b.start_date).toLocaleDateString() : '—'}</td>
                        <td style={{ fontSize: 13 }}>{b.end_date ? new Date(b.end_date).toLocaleDateString() : '—'}</td>
                        <td>
                          <button
                            title={expandedBatchId === b.id ? 'Collapse students' : 'View students'}
                            onClick={() => toggleBatchExpand(b.id)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', fontSize: 12, borderRadius: 8, background: expandedBatchId === b.id ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.08)', color: 'var(--accent)', border: `1px solid ${expandedBatchId === b.id ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.2)'}`, cursor: 'pointer', fontWeight: 700, transition: 'all 0.2s' }}
                          >
                            <FiUsers size={13} /> {(b as any).student_count || 0}
                            <span style={{ fontSize: 10 }}>{expandedBatchId === b.id ? '▲' : '▼'}</span>
                          </button>
                        </td>
                        <td><span className={`badge badge-${b.status}`}>{b.status}</span></td>
                        <td>
                          <div className="table-actions">
                            <button className="action-btn edit" onClick={() => openEditBatch(b)} title="Edit"><FiEdit2 /></button>
                            {/* Toggle active/inactive */}
                            <button
                              className="action-btn"
                              style={{ background: b.status === 'active' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', color: b.status === 'active' ? 'var(--teal)' : 'var(--amber)' }}
                              onClick={() => handleToggleBatchStatus(b)}
                              title={b.status === 'active' ? 'Mark Inactive' : 'Mark Active'}
                            >
                              {b.status === 'active' ? <FiToggleRight /> : <FiToggleLeft />}
                            </button>
                            {/* Payments link */}
                            <button
                              className="action-btn"
                              title="Payments"
                              style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--teal)' }}
                              onClick={() => window.open(`/payments?batch_id=${b.id}`, '_self')}
                            >
                              <FiDollarSign />
                            </button>
                            {/* Materials link */}
                            <button
                              className="action-btn"
                              title="Materials"
                              style={{ background: 'rgba(139,92,246,0.12)', color: 'var(--accent-2)' }}
                              onClick={() => window.open(`/materials?course_id=${b.course_id}`, '_self')}
                            >
                              <FiPackage />
                            </button>
                            <button className="action-btn delete" onClick={() => handleDeleteBatch(b.id)} title="Delete"><FiTrash2 /></button>
                          </div>
                        </td>
                      </tr>
                    {/* Expandable student list for this batch */}
                    {expandedBatchId === b.id && (
                      <tr>
                        <td colSpan={8} style={{ padding: 0, background: 'var(--bg-secondary)' }}>
                          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-light)', borderBottom: '1px solid var(--border-light)' }}>
                            {!batchStudentsExpanded[b.id] ? (
                              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: 13 }}>Loading students...</div>
                            ) : batchStudentsExpanded[b.id].length === 0 ? (
                              <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: 13 }}>No candidates enrolled in this batch yet.</div>
                            ) : (
                              <>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                  {batchStudentsExpanded[b.id].length} Student{batchStudentsExpanded[b.id].length !== 1 ? 's' : ''} in {b.batch_name}
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                  <thead>
                                    <tr style={{ background: 'var(--bg-tertiary)' }}>
                                      <th style={{ padding: '6px 10px', fontSize: 11, textAlign: 'left', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Student ID</th>
                                      <th style={{ padding: '6px 10px', fontSize: 11, textAlign: 'left', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Name</th>
                                      <th style={{ padding: '6px 10px', fontSize: 11, textAlign: 'left', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Enroll Status</th>
                                      <th style={{ padding: '6px 10px', fontSize: 11, textAlign: 'right', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Paid</th>
                                      <th style={{ padding: '6px 10px', fontSize: 11, textAlign: 'right', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Balance</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {batchStudentsExpanded[b.id].map((s: any, si: number) => (
                                      <tr key={si} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                        <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{s.student_code}</td>
                                        <td style={{ padding: '7px 10px', fontWeight: 600, fontSize: 13 }}>{s.full_name}</td>
                                        <td style={{ padding: '7px 10px' }}><span className={`badge badge-${s.status}`} style={{ fontSize: 11 }}>{s.status}</span></td>
                                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: 'var(--teal)', fontSize: 13 }}>
                                          {s.amount_paid > 0 ? fmt(s.amount_paid) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                        </td>
                                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, fontSize: 13, color: s.balance > 0 ? 'var(--red)' : 'var(--teal)' }}>
                                          {s.balance > 0 ? fmt(s.balance) : '✓'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                    ))}
                  </tbody>

                </table>
              </div>}
        </div>
      )}

      {/* ══════════ ENROLL MODAL ══════════ */}
      {showEnrollModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <h2 className="modal-title">Enroll Candidate</h2>
              <button className="modal-close" onClick={() => setShowEnrollModal(false)}><FiX /></button>
            </div>
            <form onSubmit={handleEnrollSubmit}>
              <div className="form-group">
                <label className="form-label">Candidate *</label>
                <select className="form-control" value={enrollForm.student_id} onChange={setE('student_id')} required>
                  <option value="">Select Candidate</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.student_id})</option>)}
                </select>
              </div>
              {/* Master Course filter */}
              <div className="form-group">
                <label className="form-label">Master Course</label>
                <select className="form-control" value={enrollForm.category_id || ''}
                  onChange={e => {
                    setEnrollForm(p => ({ ...p, category_id: e.target.value, course_id: '', batch_id: '' }));
                    setEnrollFilteredBatches([]);
                  }}>
                  <option value="">— All Master Courses —</option>
                  {categories.filter(c => c.status === 'active').map(c => (
                    <option key={c.id} value={c.id}>{c.category_name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Sub-Course *</label>
                <select className="form-control" value={enrollForm.course_id} onChange={e => handleEnrollCourseChange(e.target.value)} required>
                  <option value="">Select Sub-Course</option>
                  {(enrollForm.category_id
                    ? courses.filter(c => String(c.category_id) === enrollForm.category_id)
                    : courses
                  ).map(c => (
                    <option key={c.id} value={c.id}>
                      {c.course_name}
                      {c.fee_amount ? ` — ${fmt(c.fee_amount)}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Batch Year</label>
                <select className="form-control" value={enrollForm.batch_id} onChange={setE('batch_id')} disabled={!enrollForm.course_id}>
                  <option value="">{enrollForm.course_id ? 'Select Batch Year (optional)' : '— select sub-course first —'}</option>
                  {enrollFilteredBatches.map(b => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Admission Date</label>
                <div className="date-field-wrap" data-format="DD/MM/YYYY">
                  <input type="date" className="form-control" value={enrollForm.admission_date} onChange={setE('admission_date')} />
                </div>
              </div>

              {/* Fee breakdown */}
              <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '14px 16px', marginBottom: 16, border: '1px solid var(--border-light)' }}>
                <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text-secondary)' }}>💰 Fee Breakdown (optional)</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: 12 }}>Course Fee ₹</label>
                    <input type="number" className="form-control" value={enrollForm.course_fee} onChange={setE('course_fee')} min={0} placeholder="0" />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: 12 }}>Hostel Fee ₹</label>
                    <input type="number" className="form-control" value={enrollForm.hostel_fee} onChange={setE('hostel_fee')} min={0} placeholder="0" />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: 12 }}>Uniform Fee ₹</label>
                    <input type="number" className="form-control" value={enrollForm.uniform_fee} onChange={setE('uniform_fee')} min={0} placeholder="0" />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: 12 }}>Materials Fee ₹</label>
                    <input type="number" className="form-control" value={enrollForm.materials_fee} onChange={setE('materials_fee')} min={0} placeholder="0" />
                  </div>
                </div>
                {(Number(enrollForm.course_fee) + Number(enrollForm.hostel_fee) + Number(enrollForm.uniform_fee) + Number(enrollForm.materials_fee)) > 0 && (
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', marginTop: 4 }}>
                    Total: {fmt(Number(enrollForm.course_fee) + Number(enrollForm.hostel_fee) + Number(enrollForm.uniform_fee) + Number(enrollForm.materials_fee))}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-control" value={enrollForm.notes} onChange={setE('notes')} rows={2} />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={enrollLoading}>{enrollLoading ? 'Saving...' : 'Enroll'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowEnrollModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════ FEE MODAL ══════════ */}
      {showFeeModal && selectedEnrollment && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2 className="modal-title">📋 Fee Breakdown</h2>
              <button className="modal-close" onClick={() => setShowFeeModal(false)}><FiX /></button>
            </div>

            {/* Summary banner */}
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '12px 14px', marginBottom: 18, border: '1px solid var(--border-light)' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{selectedEnrollment.student_name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {selectedEnrollment.course_name}
                {selectedEnrollment.category_name && ` · ${selectedEnrollment.category_name}`}
                {selectedEnrollment.batch_name && ` · ${selectedEnrollment.batch_name}`}
              </div>
            </div>

            {/* Live fee summary cards */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <FeePill label="Course" value={Number(feeForm.course_fee) || 0} />
              <FeePill label="Hostel" value={Number(feeForm.hostel_fee) || 0} />
              <FeePill label="Uniform" value={Number(feeForm.uniform_fee) || 0} />
              <FeePill label="Materials" value={Number(feeForm.materials_fee) || 0} />
              <FeePill label="Total" value={feeTotal} color="var(--accent)" />
              <FeePill label="Paid" value={selectedEnrollment.amount_paid} color="var(--teal)" />
              <FeePill
                label="Balance"
                value={Math.max(0, feeTotal - selectedEnrollment.amount_paid)}
                color={Math.max(0, feeTotal - selectedEnrollment.amount_paid) > 0 ? 'var(--red)' : 'var(--teal)'}
              />
            </div>

            <form onSubmit={handleFeeSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Course Fee ₹</label>
                  <input type="number" className="form-control" value={feeForm.course_fee} onChange={setF('course_fee')} min={0} />
                </div>
                <div className="form-group">
                  <label className="form-label">Hostel Fee ₹</label>
                  <input type="number" className="form-control" value={feeForm.hostel_fee} onChange={setF('hostel_fee')} min={0} />
                </div>
                <div className="form-group">
                  <label className="form-label">Uniform Fee ₹</label>
                  <input type="number" className="form-control" value={feeForm.uniform_fee} onChange={setF('uniform_fee')} min={0} />
                </div>
                <div className="form-group">
                  <label className="form-label">Materials Fee ₹</label>
                  <input type="number" className="form-control" value={feeForm.materials_fee} onChange={setF('materials_fee')} min={0} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-control" value={feeForm.notes} onChange={setF('notes')} rows={2} />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={feeLoading}>{feeLoading ? 'Saving...' : 'Save Fee Details'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowFeeModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
>>>>>>> db4c08a89fc3294053c71826514ea5eec542b960

      {/* ══════════ PAYMENT MODAL ══════════ */}
      {showPayModal && selectedEnrollment && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2 className="modal-title">💰 Record Payment</h2>
              <button className="modal-close" onClick={() => setShowPayModal(false)}><FiX /></button>
            </div>

            {/* Student + fee summary */}
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '12px 14px', marginBottom: 18, border: '1px solid var(--border-light)' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{selectedEnrollment.student_name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
                {selectedEnrollment.course_name}{selectedEnrollment.batch_name ? ` · ${selectedEnrollment.batch_name}` : ''}
              </div>
              {/* Fee breakdown summary */}
              {Number(selectedEnrollment.total_fee) > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {Number(selectedEnrollment.course_fee) > 0 && <span style={{ fontSize: 11, background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 6 }}>Course: {fmt(selectedEnrollment.course_fee)}</span>}
                  {Number(selectedEnrollment.hostel_fee) > 0 && <span style={{ fontSize: 11, background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 6 }}>Hostel: {fmt(selectedEnrollment.hostel_fee)}</span>}
                  {Number(selectedEnrollment.uniform_fee) > 0 && <span style={{ fontSize: 11, background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 6 }}>Uniform: {fmt(selectedEnrollment.uniform_fee)}</span>}
                  {Number(selectedEnrollment.materials_fee) > 0 && <span style={{ fontSize: 11, background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 6 }}>Materials: {fmt(selectedEnrollment.materials_fee)}</span>}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Fee</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{fmt(selectedEnrollment.total_fee)}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Discount</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--amber)' }}>{fmt(selectedEnrollment.discount || 0)}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Final Fee</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{fmt(Math.max(0, Number(selectedEnrollment.total_fee) - Number(selectedEnrollment.discount || 0)))}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Balance</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: Number(selectedEnrollment.balance_amount) > 0 ? 'var(--red)' : 'var(--teal)' }}>
                    {Number(selectedEnrollment.balance_amount) > 0 ? fmt(selectedEnrollment.balance_amount) : '✓ Cleared'}
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={handlePaySubmit}>
              <div className="form-group">
                <label className="form-label">Amount Paid ₹ *</label>
                <input
                  type="number"
                  className="form-control"
                  value={payForm.amount}
                  onChange={setP('amount')}
                  min={1}
                  max={Number(selectedEnrollment.balance_amount) || undefined}
                  placeholder={`e.g. ${fmt(selectedEnrollment.balance_amount).replace('₹', '')}`}
                  required
                  autoFocus
                />
                {Number(payForm.amount) > 0 && Number(selectedEnrollment.balance_amount) > 0 && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Remaining after this payment:{' '}
                    <strong style={{ color: Math.max(0, Number(selectedEnrollment.balance_amount) - Number(payForm.amount)) > 0 ? 'var(--red)' : 'var(--teal)' }}>
                      {fmt(Math.max(0, Number(selectedEnrollment.balance_amount) - Number(payForm.amount)))}
                    </strong>
                  </p>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Payment Date</label>
                <input type="date" className="form-control" value={payForm.payment_date} onChange={setP('payment_date')} />
              </div>
              <div className="form-group">
                <label className="form-label">Notes / Reference</label>
                <input className="form-control" value={payForm.notes} onChange={setP('notes')} placeholder="e.g. Cash, cheque no, UPI ref..." />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={payLoading}>{payLoading ? 'Recording...' : '✓ Record Payment'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowPayModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════ COURSE DISCOUNT MODAL ══════════ */}
      {showDiscountModal && selectedEnrollment && (
        <div className="modal-overlay" onClick={() => setShowDiscountModal(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">🏷️ Apply Discount</h2>
              <button className="modal-close" onClick={() => setShowDiscountModal(false)}><FiX /></button>
            </div>
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '12px 14px', marginBottom: 18, border: '1px solid var(--border-light)' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{selectedEnrollment.student_name} — {selectedEnrollment.student_code}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>{selectedEnrollment.course_name}{selectedEnrollment.batch_name ? ` · ${selectedEnrollment.batch_name}` : ''}</div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                <span>Total: <strong>{fmt(selectedEnrollment.total_fee)}</strong></span>
                <span>Discount: <strong style={{ color: 'var(--amber)' }}>{fmt(selectedEnrollment.discount || 0)}</strong></span>
                <span>Final: <strong style={{ color: 'var(--teal)' }}>{fmt(Math.max(0, Number(selectedEnrollment.total_fee) - Number(selectedEnrollment.discount || 0)))}</strong></span>
              </div>
            </div>
            <form onSubmit={handleDiscountSubmit}>
              <div className="form-group">
                <label className="form-label">Discount Amount (₹) *</label>
                <input type="number" className="form-control" value={discountAmount} onChange={e => setDiscountAmount(e.target.value)} min={0} max={Number(selectedEnrollment.total_fee) || 0} step="0.01" placeholder="e.g. 1000" required autoFocus />
                {discountAmount !== '' && Number(discountAmount) >= 0 && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5 }}>Actual course fee after discount: <strong style={{ color: 'var(--teal)' }}>{fmt(Math.max(0, Number(selectedEnrollment.total_fee) - Number(discountAmount || 0)))}</strong></p>
                )}
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={discountLoading}>{discountLoading ? 'Applying...' : '✓ Apply Discount'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowDiscountModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
<<<<<<< HEAD
=======

      {/* ══════════ BATCH MODAL ══════════ */}
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
                <div className="form-group">
                  <label className="form-label">Start Year</label>
                  <select className="form-control" value={batchForm.start_date ? batchForm.start_date.substring(0, 4) : ''} onChange={e => {
                    const yr = e.target.value;
                    setB('start_date')({ target: { value: yr ? `${yr}-06-01` : '' } } as any);
                  }}>
                    <option value="">Select Year</option>
                    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 3 + i).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Course Duration</label>
                  <select className="form-control" value={
                    batchForm.start_date && batchForm.end_date
                      ? String(new Date(batchForm.end_date).getFullYear() - new Date(batchForm.start_date).getFullYear())
                      : ''
                  } onChange={e => {
                    const yrs = Number(e.target.value);
                    if (batchForm.start_date && yrs) {
                      const startYr = new Date(batchForm.start_date).getFullYear();
                      setB('end_date')({ target: { value: `${startYr + yrs}-05-31` } } as any);
                    }
                  }}>
                    <option value="">Select Duration</option>
                    <option value="1">1 Year</option>
                    <option value="2">2 Years</option>
                    <option value="3">3 Years</option>
                  </select>
                </div>
              </div>
              <div className="form-group"><label className="form-label">Status</label>
                <select className="form-control" value={batchForm.status} onChange={setB('status')}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={batchLoading}>{batchLoading ? 'Saving...' : 'Save Batch'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowBatchModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════ BATCH STUDENTS MODAL ══════════ */}
      {showBatchStudentsModal && selectedBatchForStudents && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 720 }}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">🎓 {selectedBatchForStudents.batch_name}</h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                  {selectedBatchForStudents.course_name} · {batchStudents.length} student{batchStudents.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button className="modal-close" onClick={() => setShowBatchStudentsModal(false)}><FiX /></button>
            </div>

            {batchStudentsLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading students...</div>
            ) : batchStudents.length === 0 ? (
              <div className="empty-state" style={{ padding: 40 }}>
                <div className="empty-state-icon">🎓</div>
                <h3>No Students</h3>
                <p>No candidates enrolled in this batch yet.</p>
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Student ID</th>
                      <th>Name</th>
                      <th>Mobile</th>
                      <th>Enrollment Status</th>
                      <th style={{ textAlign: 'right' }}>Paid</th>
                      <th style={{ textAlign: 'right' }}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchStudents.map((s, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{s.student_id}</td>
                        <td style={{ fontWeight: 600 }}>{s.full_name}</td>
                        <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{s.mobile}</td>
                        <td>
                          <span className={`badge badge-${s.enrollment_status || s.status}`}>
                            {s.enrollment_status || s.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--teal)' }}>
                          {s.amount_paid !== undefined ? fmt(s.amount_paid) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: s.balance_amount && s.balance_amount > 0 ? 'var(--red)' : 'var(--teal)' }}>
                          {s.balance_amount !== undefined
                            ? (s.balance_amount > 0 ? fmt(s.balance_amount) : '✓ Cleared')
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ padding: '12px 0 0', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowBatchStudentsModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
>>>>>>> db4c08a89fc3294053c71826514ea5eec542b960
    </div>
  );
};

export default EnrollmentList;
