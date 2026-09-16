import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  FiEdit2, FiArrowLeft, FiUser, FiPhone, FiMail, FiCalendar,
  FiBook, FiCheckSquare, FiDollarSign, FiMapPin, FiUsers,
  FiTrash2, FiX, FiPackage,
} from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { Student, Enrollment, Payment } from '../../types';
import { useAuth } from '../../context/AuthContext';

const fmt = (n: number | string) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (d: string) => {
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return d; }
};

interface StudentMaterial {
  id: number;
  student_id: number;
  title: string;
  description?: string;
  material_type: string;
  date_given: string;
  given_by_name?: string;
  created_at: string;
}

interface UniformStatus {
  student_id: number | string;
  status: 'received' | 'not_received' | 'pending';
  set_count?: number;
  notes?: string;
}

const StudentView: React.FC = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'incharge';

  const [student, setStudent] = useState<Student | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [materials, setMaterials] = useState<StudentMaterial[]>([]);
  const [uniform, setUniform] = useState<UniformStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Material modal
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [matLoading, setMatLoading]               = useState(false);
  const [matForm, setMatForm] = useState({ title: '', description: '', date_given: new Date().toISOString().split('T')[0] });

  // Uniform modal
  const [showUniformModal, setShowUniformModal]   = useState(false);
  const [uniformStatus, setUniformStatus]         = useState<'received' | 'not_received' | 'pending'>('pending');
  const [uniformSetCount, setUniformSetCount]     = useState<1 | 2>(1);
  const [uniformPayment, setUniformPayment]       = useState('');
  const [uniformPaymentDate, setUniformPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [uniformStep, setUniformStep]             = useState<'status' | 'sets' | 'payment'>('status');
  const [uniformLoading, setUniformLoading]       = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      const [studentRes, enrollRes, payRes] = await Promise.all([
        api.get(`/students/${id}`),
        api.get('/enrollments', { params: { student_id: id } }),
        api.get('/payments', { params: { student_id: id } }),
      ]);
      setStudent(studentRes.data.data);
      setEnrollments(enrollRes.data.data || []);
      setPayments(payRes.data.data || []);
    } catch (err) {
      console.error(err);
    }
    // Materials and uniform
    try {
      const [matRes, uniRes] = await Promise.all([
        api.get('/student-materials', { params: { student_id: id } }),
        api.get(`/student-materials/uniform/${id}`),
      ]);
      setMaterials(matRes.data.data || []);
      setUniform(uniRes.data.data || null);
    } catch { /* non-critical */ }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Computed fee values ──────────────────────────────────────────────
  const enrollment = enrollments[0];
  const baseCourseFee = enrollment
    ? Number(enrollment.total_fee || enrollment.course_fee || 0)
    : Number((student as any)?.course_fee_amount || 0);
  const discount = enrollment ? Number(enrollment.discount || 0) : 0;
  const courseFee = Math.max(0, baseCourseFee - discount);

  const verifiedPayments = payments.filter(p => p.status === 'verified');
  const totalPaid = verifiedPayments.reduce((s, p) => s + Number(p.amount), 0);
  const balance   = Math.max(0, courseFee - totalPaid);
  const isFree    = courseFee === 0;

  // ── Delete Payment ──────────────────────────────────────────────────
  const handleDeletePayment = async (paymentId: number) => {
    if (!confirm('Delete this payment record? This will recalculate the balance.')) return;
    try {
      await api.delete(`/payments/${paymentId}`);
      toast.success('Payment deleted — balance recalculated');
      fetchData();
    } catch {
      toast.error('Failed to delete payment');
    }
  };

  // ── Add Material ────────────────────────────────────────────────────
  const handleMatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matForm.title.trim()) { toast.error('Title is required'); return; }
    setMatLoading(true);
    try {
      await api.post('/student-materials', {
        student_id:    id,
        title:         matForm.title.trim(),
        description:   matForm.description || undefined,
        material_type: 'book',
        date_given:    matForm.date_given,
      });
      toast.success('Material record added!');
      setShowMaterialModal(false);
      setMatForm({ title: '', description: '', date_given: new Date().toISOString().split('T')[0] });
      fetchData();
    } catch { toast.error('Failed to add material'); }
    finally { setMatLoading(false); }
  };

  // ── Update Uniform ──────────────────────────────────────────────────
  const handleUniformSimpleStatus = async (status: 'not_received' | 'pending') => {
    setUniformLoading(true);
    try {
      await api.put(`/student-materials/uniform/${id}`, { status });
      toast.success(status === 'pending' ? 'Uniform marked pending' : 'Uniform marked not received');
      setShowUniformModal(false);
      fetchData();
    } catch { toast.error('Failed to update uniform status'); }
    finally { setUniformLoading(false); }
  };

  const handleUniformPaymentSubmit = async () => {
    const amount = Number(uniformPayment);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid payment amount');
      return;
    }
    setUniformLoading(true);
    try {
      await api.post(`/student-materials/uniform/${id}/receive`, {
        set_count: uniformSetCount,
        amount,
        payment_date: uniformPaymentDate,
      });
      toast.success(`Uniform received — ${uniformSetCount} set${uniformSetCount > 1 ? 's' : ''} and payment saved!`);
      setShowUniformModal(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save uniform and payment');
    } finally {
      setUniformLoading(false);
    }
  };

  const openUniformModal = () => {
    setUniformStatus(uniform?.status || 'pending');
    setUniformSetCount(uniform?.set_count === 2 ? 2 : 1);
    setUniformPayment('');
    setUniformPaymentDate(new Date().toISOString().split('T')[0]);
    setUniformStep('status');
    setShowUniformModal(true);
  };

  const chooseUniformStatus = (status: 'received' | 'not_received' | 'pending') => {
    setUniformStatus(status);
    if (status === 'received') setUniformStep('sets');
    else handleUniformSimpleStatus(status);
  };

  const chooseUniformSets = (count: 1 | 2) => {
    setUniformSetCount(count);
    setUniformStep('payment');
  };

  // ── Delete Material ──────────────────────────────────────────────────
  const handleDeleteMaterial = async (matId: number) => {
    if (!confirm('Delete this material record?')) return;
    try {
      await api.delete(`/student-materials/${matId}`);
      toast.success('Material record deleted');
      fetchData();
    } catch { toast.error('Failed to delete'); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Loading...</div>;
  if (!student) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Candidate not found</div>;

  const certItems = [
    { label: '10th Marksheet', collected: student.cert_10th_collected,  url: (student as any).cert_10th_url },
    { label: '12th Marksheet', collected: student.cert_12th_collected,  url: (student as any).cert_12th_url },
    { label: 'TC / Diploma',   collected: student.cert_diploma_collected, url: (student as any).cert_diploma_url },
  ];

  const uniformLabel: Record<string, { text: string; color: string; emoji: string }> = {
    received:     { text: 'Received',     color: 'var(--teal)', emoji: '✅' },
    not_received: { text: 'Not Received', color: 'var(--red)',  emoji: '❌' },
    pending:      { text: 'Pending',      color: 'var(--amber)', emoji: '⏳' },
  };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link to="/students" className="btn btn-secondary btn-sm"><FiArrowLeft /></Link>
          <div>
            <h1 className="page-title">Candidate Profile</h1>
            <p className="page-subtitle">{student.student_id}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {isAdmin && (
            <Link to={`/students/${id}/edit`} className="btn btn-secondary"><FiEdit2 /> Edit</Link>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>
        {/* ── Left column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Photo + name */}
          <div className="card" style={{ textAlign: 'center' }}>
            {student.photo_url
              ? <img src={student.photo_url} alt={student.full_name} style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--accent)', margin: '0 auto 16px', display: 'block' }} />
              : <div style={{ width: 120, height: 120, borderRadius: '50%', background: 'linear-gradient(135deg,var(--accent),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, fontWeight: 800, color: '#fff', margin: '0 auto 16px' }}>
                  {student.full_name.charAt(0)}
                </div>
            }
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{student.full_name}</h2>
            <code style={{ color: 'var(--accent)', fontSize: 13, background: 'rgba(99,102,241,0.1)', padding: '2px 10px', borderRadius: 6 }}>{student.student_id}</code>
            <div style={{ marginTop: 12 }}>
              <span className={`badge badge-${student.status}`} style={{ textTransform: 'capitalize', fontWeight: 700 }}>{student.status}</span>
            </div>
            {student.address && (
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 6, justifyContent: 'center' }}>
                <FiMapPin style={{ color: 'var(--text-muted)', marginTop: 2, flexShrink: 0 }} size={13} />
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'left' }}>{student.address}</p>
              </div>
            )}
          </div>

          {/* ── Fee Summary ── */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 className="section-heading" style={{ margin: 0 }}>
                <FiDollarSign style={{ verticalAlign: 'middle', marginRight: 6 }} />Fee Summary
              </h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="fee-summary-row">
                <span className="fee-summary-label">Course Fee</span>
                <span className="fee-summary-value">
                  {isFree ? '₹0 (Free)' : (discount > 0 ? <><span style={{ textDecoration: 'line-through', color: 'var(--text-muted)', marginRight: 6 }}>{fmt(baseCourseFee)}</span>{fmt(courseFee)}</> : fmt(courseFee))}
                </span>
              </div>
              <div className="fee-summary-row">
                <span className="fee-summary-label">Total Paid</span>
                <span className="fee-summary-value" style={{ color: 'var(--teal)' }}>{fmt(totalPaid)}</span>
              </div>
              <div className="fee-summary-row">
                <span className="fee-summary-label">Balance</span>
                <span className="fee-summary-value" style={{ color: balance > 0 ? 'var(--red)' : 'var(--teal)' }}>
                  {balance > 0 ? fmt(balance) : '✓ Fully Paid'}
                </span>
              </div>
            </div>
          </div>

          {/* Certificates */}
          <div className="card">
            <h3 className="section-heading" style={{ marginBottom: 12 }}>
              <FiCheckSquare style={{ verticalAlign: 'middle', marginRight: 6 }} />Certificates
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {certItems.map(c => (
                <div key={c.label} style={{
                  padding: '8px 12px', borderRadius: 8,
                  background: c.collected ? 'rgba(16,185,129,0.06)' : 'var(--bg-tertiary)',
                  border: `1px solid ${c.collected ? 'rgba(16,185,129,0.25)' : 'var(--border-light)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: c.url ? 6 : 0 }}>
                    <span>{c.collected ? '✅' : '⬜'}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</div>
                      <div style={{ fontSize: 11, color: c.collected ? 'var(--teal)' : 'var(--text-muted)' }}>
                        {c.collected ? 'Collected' : 'Not collected'}
                      </div>
                    </div>
                  </div>
                  {c.url && (
                    /\.(jpg|jpeg|png|webp)$/i.test(c.url)
                      ? <img src={c.url} alt={c.label} style={{ maxWidth: '100%', maxHeight: 80, borderRadius: 6, marginTop: 4 }} />
                      : <a href={c.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>📄 View file</a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Personal Info */}
          <div className="card">
            <h3 className="section-heading"><FiUser style={{ verticalAlign: 'middle', marginRight: 6 }} />Personal Information</h3>
            <div className="form-grid">
              {[
                { label: 'Gender',        value: student.gender || '—',   icon: <FiUser /> },
                { label: 'Mobile',        value: student.mobile,           icon: <FiPhone /> },
                { label: 'Email',         value: student.email,            icon: <FiMail /> },
                { label: 'Date of Birth', value: student.date_of_birth ? fmtDate(student.date_of_birth) : '—', icon: <FiCalendar /> },
                { label: 'Admission Date', value: student.admission_date ? fmtDate(student.admission_date) : '—', icon: <FiCalendar /> },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ color: 'var(--accent)', fontSize: 18, marginTop: 2 }}>{item.icon}</div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.label}</div>
                    <div style={{ fontWeight: 500, marginTop: 2 }}>{item.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Parent / Guardian */}
          <div className="card">
            <h3 className="section-heading"><FiUsers style={{ verticalAlign: 'middle', marginRight: 6 }} />
              {(student as any).guardian_type === 'guardian' ? 'Guardian' : 'Parent / Guardian'}
            </h3>
            {student.parent_name ? (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 12px', borderRadius: 20, background: (student as any).guardian_type === 'guardian' ? 'rgba(139,92,246,0.12)' : 'rgba(99,102,241,0.12)', color: (student as any).guardian_type === 'guardian' ? 'var(--accent-2)' : 'var(--accent)' }}>
                    {(student as any).guardian_type === 'guardian' ? '🧑‍🤝‍🧑 Guardian' : '👨‍👩‍👧 Parent'}
                  </span>
                </div>
                <div className="form-grid">
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Name</div>
                    <div style={{ fontWeight: 500, marginTop: 2 }}>{student.parent_name}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mobile</div>
                    <div style={{ fontWeight: 500, marginTop: 2 }}>{student.parent_mobile || '—'}</div>
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No parent / guardian present during admission</p>
            )}
          </div>

          {/* Enrollment */}
          <div className="card">
            <h3 className="section-heading"><FiBook style={{ verticalAlign: 'middle', marginRight: 6 }} />Course Enrollment</h3>
            {enrollments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>No Enrollments Yet</div>
                {isAdmin && <Link to="/enrollments" className="btn btn-primary btn-sm">Enroll Now</Link>}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {enrollments.map(enr => (
                  <div key={enr.id} style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: '14px 16px', border: '1px solid var(--border-light)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div>
                        {/* Master Course badge */}
                        {(enr.category_name || (student as any).master_course_name) && (
                          <span style={{ fontSize: 11, background: 'rgba(99,102,241,0.1)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 10, fontWeight: 700, display: 'inline-block', marginBottom: 4 }}>
                            {enr.category_name || (student as any).master_course_name}
                          </span>
                        )}
                        {/* Sub-course */}
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{enr.course_name}</div>
                        {/* Batch year */}
                        {enr.batch_name && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>📅 Batch: {enr.batch_name}</div>}
                        {/* FREE course completion */}
                        {(student as any).course_is_free && (student as any).course_completion_date && (
                          <div style={{ fontSize: 12, color: 'var(--teal)', marginTop: 4, fontWeight: 600 }}>
                            🎓 Completion: {fmtDate((student as any).course_completion_date)} (3 months from joining)
                          </div>
                        )}
                      </div>
                      <span className={`badge badge-${enr.status}`}>{enr.status}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Enrolled: {fmtDate(enr.enrolled_at)}</div>
                    {enr.notes && (
                      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--amber)', background: 'rgba(245,158,11,0.06)', borderRadius: 6, padding: '6px 10px', border: '1px solid rgba(245,158,11,0.15)' }}>
                        📋 {enr.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Uniform status (from student record) */}
            {student && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>👕 Uniform</div>
                <div>
                  <span className={`uni-badge uni-badge--${student.uniform_received ? 'received' : 'not_received'}`}>
                    {student.uniform_received ? '✅ Received' : '❌ Not Received'}
                  </span>
                  {isAdmin && (
                    <button className="btn btn-sm btn-secondary" style={{ marginLeft: 10 }} onClick={openUniformModal}>Update</button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Payment History ── */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 className="section-heading" style={{ margin: 0 }}>
                <FiDollarSign style={{ verticalAlign: 'middle', marginRight: 6 }} />Payment History
              </h3>
            </div>
            {isFree ? (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--teal)', fontWeight: 600 }}>
                🎓 Free Course — No fees required
              </div>
            ) : verifiedPayments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                No payment records yet.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="payment-history-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Notes</th>
                      {isAdmin && <th>Delete</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {verifiedPayments.map(p => (
                      <tr key={p.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.payment_date)}</td>
                        <td><span style={{ fontWeight: 700, color: 'var(--teal)' }}>{fmt(p.amount)}</span></td>
                        <td style={{ textTransform: 'capitalize' }}>{p.method_type || (p as any).payment_method || '—'}</td>
                        <td style={{ color: 'var(--text-muted)', maxWidth: 180 }}>
                          {(p as any).payment_type && (
                            <span style={{ fontSize: 11, background: 'rgba(99,102,241,0.1)', color: 'var(--accent)', padding: '1px 6px', borderRadius: 8, marginRight: 4, fontWeight: 700 }}>
                              {(p as any).payment_type}
                            </span>
                          )}
                          {p.notes || '—'}
                        </td>
                        {isAdmin && (
                          <td>
                            <button
                              className="action-btn delete"
                              onClick={() => handleDeletePayment(p.id)}
                              title="Delete payment"
                              style={{ padding: '4px 8px' }}
                            >
                              <FiTrash2 size={13} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Total Paid</span>
                  <span style={{ fontWeight: 700, color: 'var(--teal)' }}>{fmt(totalPaid)}</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Consent Section ── */}
          {((student as any).consent_given || (student as any).consent_image_url || (student as any).consent_pdf_url || (student as any).consent_video_url) && (
            <div className="card">
              <h3 className="section-heading">📝 Consent</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: (student as any).consent_given ? 'rgba(16,185,129,0.06)' : 'var(--bg-tertiary)', border: `1px solid ${(student as any).consent_given ? 'rgba(16,185,129,0.25)' : 'var(--border-light)'}` }}>
                <span style={{ fontSize: 18 }}>{(student as any).consent_given ? '✅' : '⬜'}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{(student as any).consent_given ? 'Consent Given' : 'Consent Not Yet Given'}</div>
                  <div style={{ fontSize: 12, color: (student as any).consent_given ? 'var(--teal)' : 'var(--text-muted)' }}>
                    {(student as any).consent_given ? 'Student / guardian has given formal consent' : 'No consent recorded'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                {/* Image */}
                <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', marginBottom: 8 }}>🖼 Consent Image</div>
                  {(student as any).consent_image_url
                    ? <a href={(student as any).consent_image_url} target="_blank" rel="noreferrer"><img src={(student as any).consent_image_url} alt="consent" style={{ maxWidth: '100%', maxHeight: 80, borderRadius: 6, objectFit: 'cover', border: '2px solid rgba(16,185,129,0.3)' }} /></a>
                    : <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No image uploaded</div>}
                </div>
                {/* PDF */}
                <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>📄 Consent PDF</div>
                  {(student as any).consent_pdf_url
                    ? <a href={(student as any).consent_pdf_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>📄 View PDF Document</a>
                    : <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No PDF uploaded</div>}
                </div>
                {/* Video */}
                <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber)', marginBottom: 8 }}>🎬 Consent Video</div>
                  {(student as any).consent_video_url
                    ? <a href={(student as any).consent_video_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 4 }}>🎬 View Video Recording</a>
                    : <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No video uploaded</div>}
                </div>
              </div>
            </div>
          )}

          {/* ── Materials Section ── */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <FiPackage style={{ color: 'var(--accent-2)', fontSize: 20 }} />
              <h3 className="section-heading" style={{ margin: 0 }}>Materials & Uniform</h3>
            </div>

            <div className="materials-btn-group" style={{ marginBottom: 20 }}>
              <button
                type="button" className="material-btn"
                onClick={() => { setMatForm({ title: '', description: '', date_given: new Date().toISOString().split('T')[0] }); setShowMaterialModal(true); }}
                disabled={!isAdmin}
              >
                <span className="mat-icon">📚</span>
                <span>Book / Material</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Add given material</span>
              </button>
              <button
                type="button" className="material-btn"
                onClick={openUniformModal}
                disabled={!isAdmin}
              >
                <span className="mat-icon">👕</span>
                <span>Uniform</span>
                <span style={{ fontSize: 11, color: uniformLabel[uniform?.status || 'pending'].color }}>
                  {uniformLabel[uniform?.status || 'pending'].emoji} {uniformLabel[uniform?.status || 'pending'].text}
                </span>
              </button>
            </div>

            {/* Materials list */}
            {materials.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                  Given Materials ({materials.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {materials.map(m => (
                    <div key={m.id} style={{ background: 'var(--bg-tertiary)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>📚 {m.title}</div>
                        {m.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{m.description}</div>}
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                          Given: {fmtDate(m.date_given)} {m.given_by_name ? `by ${m.given_by_name}` : ''}
                        </div>
                      </div>
                      {isAdmin && (
                        <button className="action-btn delete" onClick={() => handleDeleteMaterial(m.id)} title="Delete" style={{ padding: '4px 8px', flexShrink: 0 }}>
                          <FiTrash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Add Material Modal ── */}
      {showMaterialModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2 className="modal-title">📚 Add Book / Material</h2>
              <button className="modal-close" onClick={() => setShowMaterialModal(false)}><FiX /></button>
            </div>
            <form onSubmit={handleMatSubmit}>
              <div className="form-group">
                <label className="form-label">Title / Name *</label>
                <input type="text" className="form-control"
                  value={matForm.title}
                  onChange={e => setMatForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. IMR Study Material Volume 1" required />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-control" rows={2}
                  value={matForm.description}
                  onChange={e => setMatForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Optional notes about this material" />
              </div>
              <div className="form-group">
                <label className="form-label">Date Given</label>
                <input type="date" className="form-control"
                  value={matForm.date_given}
                  onChange={e => setMatForm(p => ({ ...p, date_given: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" className="btn btn-primary" disabled={matLoading} style={{ flex: 1 }}>
                  {matLoading ? '⏳ Adding...' : '✓ Add Material'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowMaterialModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Uniform Status / Sets / Payment Modal ── */}
      {showUniformModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 430 }}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">👕 Uniform</h2>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{student.full_name} · {student.student_id}</p>
              </div>
              <button className="modal-close" onClick={() => setShowUniformModal(false)}><FiX /></button>
            </div>

            {uniformStep === 'status' && (
              <div>
                <label className="form-label" style={{ marginBottom: 12 }}>Uniform status</label>
                <div className="uniform-status-group">
                  <button type="button" className="uniform-status-btn selected-received" onClick={() => chooseUniformStatus('received')}>
                    ✅ Received
                  </button>
                  <button type="button" className="uniform-status-btn selected-not_received" onClick={() => chooseUniformStatus('not_received')}>
                    ❌ Not Received
                  </button>
                  <button type="button" className="uniform-status-btn selected-pending" onClick={() => chooseUniformStatus('pending')}>
                    ⏳ Pending
                  </button>
                </div>
              </div>
            )}

            {uniformStep === 'sets' && (
              <div>
                <label className="form-label" style={{ marginBottom: 12 }}>How many uniform sets?</label>
                <div style={{ display: 'flex', gap: 12 }}>
                  {([1, 2] as const).map(count => (
                    <button
                      key={count}
                      type="button"
                      className={`uniform-set-option ${uniformSetCount === count ? 'selected' : ''}`}
                      onClick={() => chooseUniformSets(count)}
                    >
                      <strong>{count}</strong>
                      <span>{count === 1 ? 'Set' : 'Sets'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {uniformStep === 'payment' && (
              <form onSubmit={e => { e.preventDefault(); handleUniformPaymentSubmit(); }}>
                <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
                  <strong style={{ color: 'var(--teal)' }}>✅ {uniformSetCount} uniform set{uniformSetCount > 1 ? 's' : ''} selected</strong>
                </div>
                <div className="form-group">
                  <label className="form-label">Manual Payment Amount ₹ *</label>
                  <input
                    type="number"
                    className="form-control"
                    value={uniformPayment}
                    onChange={e => setUniformPayment(e.target.value)}
                    min={0.01}
                    step="0.01"
                    placeholder="Enter amount"
                    required
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Date</label>
                  <input type="date" className="form-control" value={uniformPaymentDate} onChange={e => setUniformPaymentDate(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="submit" className="btn btn-primary" disabled={uniformLoading} style={{ flex: 1 }}>
                    {uniformLoading ? '⏳ Saving...' : '✓ Save Payment'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setUniformStep('sets')}>Back</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentView;
