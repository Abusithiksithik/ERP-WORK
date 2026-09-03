import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  FiPlus, FiSearch, FiDownload, FiEdit2, FiEye, FiX,
  FiAlertTriangle, FiCheckSquare, FiDollarSign,
} from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { Student, Course } from '../../types';
import { useAuth } from '../../context/AuthContext';

interface FeeCategory {
  name: string;
  actual: number;
  paid: number;
  remaining: number;
}

interface DiscontinueDetails {
  student: Student & { fee_amount?: number; course_name?: string; batch_name?: string };
  enrollments: any[];
  payments: any[];
  totalPaid: number;
  courseFee: number;
  pendingDues: number;
  feeCategories: FeeCategory[];
}

const StudentList: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCourse, setFilterCourse] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 15;

  // ── Step 1: Fee / enrollment confirmation modal ──────────────────────
  const [showDiscontinueModal, setShowDiscontinueModal] = useState(false);
  const [discontinueDetails, setDiscontinueDetails] = useState<DiscontinueDetails | null>(null);
  const [discontinueReason, setDiscontinueReason] = useState('');
  const [discontinueLoading, setDiscontinueLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // ── Step 2: Certificate verification popup ───────────────────────────
  const [showCertModal, setShowCertModal] = useState(false);
  const [certPending, setCertPending] = useState({ force: false });
  const [discCert10th, setDiscCert10th] = useState(false);
  const [discCert12th, setDiscCert12th] = useState(false);
  const [discCertDiploma, setDiscCertDiploma] = useState(false);
  const [certLoading, setCertLoading] = useState(false);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit };
      if (search) params.search = search;
      if (filterCourse) params.course_id = filterCourse;
      if (filterStatus) params.status = filterStatus;
      const res = await api.get('/students', { params });
      setStudents(res.data.data);
      setTotal(res.data.total);
    } catch { toast.error('Failed to load students'); }
    finally { setLoading(false); }
  }, [page, search, filterCourse, filterStatus]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);
  useEffect(() => {
    api.get('/courses').then(r => setCourses(r.data.data));
  }, []);

  // ── Discontinue flow ─────────────────────────────────────────────────
  const openDiscontinueModal = async (student: Student) => {
    setDetailsLoading(true);
    setDiscontinueReason('');
    setDiscontinueDetails(null);
    setShowDiscontinueModal(true);
    try {
      const res = await api.get(`/students/${student.id}/discontinue-details`);
      setDiscontinueDetails(res.data.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load student details');
      setShowDiscontinueModal(false);
    } finally {
      setDetailsLoading(false);
    }
  };

  const proceedToCertStep = (force: boolean) => {
    setCertPending({ force });
    setDiscCert10th(false);
    setDiscCert12th(false);
    setDiscCertDiploma(false);
    setShowDiscontinueModal(false);
    setShowCertModal(true);
  };

  const handleFinalDiscontinue = async () => {
    if (!discontinueDetails) return;
    setCertLoading(true);
    try {
      await api.post(`/students/${discontinueDetails.student.id}/discontinue`, {
        reason: discontinueReason,
        force: certPending.force,
        disc_cert_10th: discCert10th,
        disc_cert_12th: discCert12th,
        disc_cert_diploma: discCertDiploma,
      });
      toast.success(`${discontinueDetails.student.full_name} has been discontinued.`);
      // Optimistically remove from active list immediately
      setStudents(prev => prev.filter(s => s.id !== discontinueDetails.student.id));
      setTotal(prev => Math.max(0, prev - 1));
      setShowCertModal(false);
      setDiscontinueDetails(null);
      // Then re-fetch to sync with server
      fetchStudents();
    } catch (err: any) {
      if (err.response?.status === 422) {
        toast.warning(err.response.data.message);
      } else {
        toast.error(err.response?.data?.message || 'Failed to discontinue student');
      }
    } finally {
      setCertLoading(false);
    }
  };

  // ── Export ──────────────────────────────────────────────────────────
  const handleExport = async () => {
    try {
      toast.info('Preparing export...');
      const response = await api.get('/students/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `students_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Students exported!');
    } catch {
      toast.error('Export failed. Please try again.');
    }
  };

  const totalPages = Math.ceil(total / limit);

  // ── Certificate definitions — ONLY the existing 3 certs ─────────────
  // "Diploma Marksheet" is displayed as "TC" per UI rename requirement
  const certItems = [
    { checked: discCert10th,    set: setDiscCert10th,    label: '10th Marksheet',  icon: '📄' },
    { checked: discCert12th,    set: setDiscCert12th,    label: '12th Marksheet',  icon: '📄' },
    { checked: discCertDiploma, set: setDiscCertDiploma, label: 'TC',              icon: '🎓' },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Candidates</h1>
          <p className="page-subtitle">{total} total candidates</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {isAdmin && <button className="btn btn-secondary" onClick={handleExport}><FiDownload /> Export CSV</button>}
          {isAdmin && <Link to="/students/add" className="btn btn-primary"><FiPlus /> Add Candidate</Link>}
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
          <select className="form-control filter-select" value={filterCourse} onChange={e => { setFilterCourse(e.target.value); setPage(1); }}>
            <option value="">All Courses</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.course_name}</option>)}
          </select>
          <select className="form-control filter-select" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
            <option value="">All Status</option>
            <option value="active">Active</option>
          </select>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading...</div>
        ) : students.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👥</div>
            <h3>No Candidates Found</h3>
            <p>Add your first candidate to get started.</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>ID</th>
                  <th>Mobile</th>
                  <th>Course</th>
                  <th>Batch</th>
                  <th>Admission</th>
                  <th>Status</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {s.photo_url
                          ? <img src={s.photo_url} alt={s.full_name} className="student-photo" />
                          : <div className="student-avatar">{s.full_name.charAt(0)}</div>}
                        <div>
                          <div style={{ fontWeight: 600 }}>{s.full_name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><code style={{ color: 'var(--accent)', fontSize: 12 }}>{s.student_id}</code></td>
                    <td>{s.mobile}</td>
                    <td>{s.course_name || '—'}</td>
                    <td>{s.batch_name || '—'}</td>
                    <td>{s.admission_date ? new Date(s.admission_date).toLocaleDateString('en-GB') : '—'}</td>
                    <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                    {isAdmin && (
                      <td>
                        <div className="table-actions">
                          <Link to={`/students/${s.id}`} className="action-btn view" title="View"><FiEye /></Link>
                          <Link to={`/students/${s.id}/edit`} className="action-btn edit" title="Edit"><FiEdit2 /></Link>
                          <button
                            className="action-btn delete"
                            title="Discontinue Candidate"
                            onClick={() => openDiscontinueModal(s)}
                            style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                          >
                            🚫
                          </button>
                        </div>
                      </td>
                    )}
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

      {/* ════════════════════════════════════════════════════════════════
          STEP 1 — DISCONTINUE: STUDENT DETAILS + FEE STRUCTURE
      ════════════════════════════════════════════════════════════════ */}
      {showDiscontinueModal && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal disc-modal-step1">

            {/* ── Header ── */}
            <div className="modal-header" style={{ borderBottom: '2px solid rgba(239,68,68,0.25)', flexWrap: 'wrap', gap: 8 }}>
              <h2 className="modal-title" style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 8, fontSize: 'clamp(15px, 3vw, 18px)' }}>
                <FiAlertTriangle /> Discontinue Candidate — Step 1 of 2
              </h2>
              <button className="modal-close" onClick={() => setShowDiscontinueModal(false)}><FiX /></button>
            </div>

            {detailsLoading ? (
              <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                <div style={{ width: 36, height: 36, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                Loading candidate details…
              </div>
            ) : discontinueDetails ? (
              <div style={{ maxHeight: '74vh', overflowY: 'auto', paddingRight: 2 }}>

                {/* ── Student Info Strip ── */}
                <section style={{ marginBottom: 18 }}>
                  <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.05))', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, padding: '14px 18px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '12px 20px', alignItems: 'center' }}>
                    <div style={{ gridRow: '1 / 3', width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,var(--accent),var(--accent-2))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 22, color: '#fff', flexShrink: 0 }}>
                      {discontinueDetails.student.full_name.charAt(0)}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{discontinueDetails.student.full_name}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                      <span><code style={{ color: 'var(--accent)' }}>{discontinueDetails.student.student_id}</code></span>
                      <span>📱 {discontinueDetails.student.mobile}</span>
                      <span>✉️ {discontinueDetails.student.email}</span>
                      {discontinueDetails.student.course_name && <span>📚 {discontinueDetails.student.course_name}</span>}
                      {discontinueDetails.student.batch_name && <span>🗂 {discontinueDetails.student.batch_name}</span>}
                    </div>
                  </div>
                </section>

                {/* ── Fee Structure ── */}
                <section style={{ marginBottom: 18 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FiDollarSign /> Fee Structure
                  </h3>

                  {/* Summary cards */}
                  <div className="disc-fee-summary">
                    <div className="disc-fee-card disc-fee-card--total">
                      <div className="disc-fee-card__label">Total Fee</div>
                      <div className="disc-fee-card__value">₹{Number(discontinueDetails.courseFee).toLocaleString()}</div>
                    </div>
                    <div className="disc-fee-card disc-fee-card--paid">
                      <div className="disc-fee-card__label">Total Paid</div>
                      <div className="disc-fee-card__value" style={{ color: 'var(--teal)' }}>₹{Number(discontinueDetails.totalPaid).toLocaleString()}</div>
                    </div>
                    <div className={`disc-fee-card ${discontinueDetails.pendingDues > 0 ? 'disc-fee-card--danger' : 'disc-fee-card--clear'}`}>
                      <div className="disc-fee-card__label">{discontinueDetails.pendingDues > 0 ? 'Pending Dues' : 'Fully Paid'}</div>
                      <div className="disc-fee-card__value" style={{ color: discontinueDetails.pendingDues > 0 ? '#ef4444' : 'var(--teal)' }}>
                        ₹{Number(discontinueDetails.pendingDues).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Category breakdown table */}
                  {discontinueDetails.feeCategories.length > 0 && (
                    <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, overflow: 'hidden', marginTop: 12 }}>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: 'rgba(99,102,241,0.12)' }}>
                              <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Category</th>
                              <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Actual</th>
                              <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Paid</th>
                              <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Remaining</th>
                            </tr>
                          </thead>
                          <tbody>
                            {discontinueDetails.feeCategories.map((cat, idx) => (
                              <tr key={cat.name} style={{ borderTop: idx > 0 ? '1px solid var(--border-light)' : 'none' }}>
                                <td style={{ padding: '10px 14px', fontWeight: 600 }}>{cat.name}</td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-secondary)' }}>₹{cat.actual.toLocaleString()}</td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--teal)', fontWeight: 600 }}>₹{cat.paid.toLocaleString()}</td>
                                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                  {cat.remaining > 0 ? (
                                    <span style={{ color: '#ef4444', fontWeight: 700 }}>₹{cat.remaining.toLocaleString()}</span>
                                  ) : (
                                    <span style={{ color: 'var(--teal)', fontWeight: 600 }}>₹0</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ borderTop: '2px solid var(--border)', background: 'rgba(0,0,0,0.15)' }}>
                              <td style={{ padding: '10px 14px', fontWeight: 800, fontSize: 13 }}>Total</td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800 }}>₹{Number(discontinueDetails.courseFee).toLocaleString()}</td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: 'var(--teal)' }}>₹{Number(discontinueDetails.totalPaid).toLocaleString()}</td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: discontinueDetails.pendingDues > 0 ? '#ef4444' : 'var(--teal)' }}>₹{Number(discontinueDetails.pendingDues).toLocaleString()}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}
                </section>

                {/* ── Dues Warning ── */}
                {discontinueDetails.pendingDues > 0 && (
                  <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 18, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <FiAlertTriangle size={18} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: 3, fontSize: 13 }}>
                        Outstanding Dues: ₹{Number(discontinueDetails.pendingDues).toLocaleString()}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        This candidate has unpaid fees. It is recommended to clear dues before discontinuing.
                        You may still proceed by clicking <strong>"Discontinue Anyway"</strong>.
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Reason textarea ── */}
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="form-label">Reason for Discontinuation</label>
                  <textarea
                    className="form-control"
                    placeholder="Enter reason (optional)…"
                    value={discontinueReason}
                    onChange={e => setDiscontinueReason(e.target.value)}
                    rows={3}
                  />
                </div>

                {/* ── Info note ── */}
                <div style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <strong>Next:</strong> You will verify original certificate collection before finalising discontinuation.
                </div>

                {/* ── Action buttons ── */}
                <div className="disc-action-row">
                  {discontinueDetails.pendingDues > 0 ? (
                    <>
                      <button
                        className="disc-btn disc-btn--danger"
                        onClick={() => proceedToCertStep(true)}
                        disabled={discontinueLoading}
                      >
                        🚫 Discontinue Anyway → Next
                      </button>
                      <button className="btn btn-secondary" onClick={() => setShowDiscontinueModal(false)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button
                        className="disc-btn disc-btn--danger"
                        onClick={() => proceedToCertStep(false)}
                        disabled={discontinueLoading}
                      >
                        🚫 Proceed → Certificate Verification
                      </button>
                      <button className="btn btn-secondary" onClick={() => setShowDiscontinueModal(false)}>Cancel</button>
                    </>
                  )}
                </div>

              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          STEP 2 — CERTIFICATE VERIFICATION (3 existing certificates only)
          "Diploma Marksheet" is displayed as "TC" per label rename
      ════════════════════════════════════════════════════════════════ */}
      {showCertModal && discontinueDetails && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className="modal disc-modal-step2">

            {/* Header */}
            <div className="modal-header" style={{ borderBottom: '2px solid rgba(99,102,241,0.2)', flexWrap: 'wrap', gap: 8 }}>
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'clamp(14px, 3vw, 17px)' }}>
                <FiCheckSquare style={{ color: 'var(--accent)' }} /> Certificate Verification — Step 2 of 2
              </h2>
              <button className="modal-close" onClick={() => setShowCertModal(false)}><FiX /></button>
            </div>

            <div>
              {/* Student strip */}
              <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,var(--accent),var(--accent-2))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, color: '#fff', flexShrink: 0 }}>
                  {discontinueDetails.student.full_name.charAt(0)}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{discontinueDetails.student.full_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {discontinueDetails.student.student_id} · {discontinueDetails.student.email}
                  </div>
                </div>
              </div>

              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
                Confirm which original certificates have been collected from this candidate. These are saved permanently and cannot be changed after discontinuation.
              </p>

              {/* ── 3 Certificate checkboxes — original certs only ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                {certItems.map(({ checked, set, label, icon }) => (
                  <label key={label} style={{
                    display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
                    background: checked ? 'rgba(16,185,129,0.08)' : 'var(--bg-tertiary)',
                    border: checked ? '1.5px solid rgba(16,185,129,0.45)' : '1.5px solid var(--border)',
                    borderRadius: 10, padding: '14px 18px', transition: 'all 0.2s',
                  }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => set(e.target.checked)}
                      style={{ width: 20, height: 20, accentColor: 'var(--teal)', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
                      <div style={{ fontSize: 12, color: checked ? 'var(--teal)' : 'var(--text-muted)', marginTop: 2 }}>
                        {checked ? '✓ Original collected from student' : 'Not yet collected / Not applicable'}
                      </div>
                    </div>
                    {checked && (
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ color: '#fff', fontSize: 13, fontWeight: 900 }}>✓</span>
                      </div>
                    )}
                  </label>
                ))}
              </div>

              {/* Pending dues reminder in cert step */}
              {discontinueDetails.pendingDues > 0 && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 12, color: '#ef4444', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <FiAlertTriangle size={14} style={{ flexShrink: 0 }} />
                  <span>Note: ₹{Number(discontinueDetails.pendingDues).toLocaleString()} in fees remain unpaid.</span>
                </div>
              )}

              {/* Action buttons */}
              <div className="disc-action-row">
                <button
                  className="disc-btn disc-btn--danger"
                  style={{ opacity: certLoading ? 0.7 : 1 }}
                  onClick={handleFinalDiscontinue}
                  disabled={certLoading}
                >
                  {certLoading ? 'Processing…' : '✅ Confirm Discontinue'}
                </button>
                <button className="btn btn-secondary" onClick={() => setShowCertModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentList;
