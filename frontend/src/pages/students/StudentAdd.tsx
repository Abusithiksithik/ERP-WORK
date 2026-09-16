import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FiUpload, FiFileText, FiUser, FiChevronDown, FiImage, FiAlertCircle, FiVideo, FiFilePlus, FiCheckCircle } from 'react-icons/fi';
import api from '../../api/axios';
import { CourseCategory, Course, Batch } from '../../types';

interface CertFile { file: File | null; preview: string | null; }

// Helper: format date as DD/MM/YYYY for display
const fmtDate = (iso: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

// Add 3 months to an ISO date string
const addThreeMonths = (isoDate: string): string => {
  const d = new Date(isoDate);
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().split('T')[0];
};

const StudentAdd: React.FC = () => {
  const navigate = useNavigate();
  const photoRef      = useRef<HTMLInputElement>(null);
  const cert10Ref     = useRef<HTMLInputElement>(null);
  const cert12Ref     = useRef<HTMLInputElement>(null);
  const certDipRef    = useRef<HTMLInputElement>(null);
  const consentImgRef   = useRef<HTMLInputElement>(null);
  const consentPdfRef   = useRef<HTMLInputElement>(null);
  const consentVideoRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [emailError, setEmailError] = useState('');
  const [certFiles, setCertFiles] = useState<Record<string, CertFile>>({
    '10th':    { file: null, preview: null },
    '12th':    { file: null, preview: null },
    'diploma': { file: null, preview: null },
  });
  // Consent — three separate files
  const [consentImageFile, setConsentImageFile]     = useState<File | null>(null);
  const [consentImagePreview, setConsentImagePreview] = useState<string | null>(null);
  const [consentPdfFile, setConsentPdfFile]         = useState<File | null>(null);
  const [consentVideoFile, setConsentVideoFile]     = useState<File | null>(null);

  const [form, setForm] = useState({
    full_name: '', mobile: '', email: '',
    date_of_birth: '', gender: '', address: '',
    parent_present: false, guardian_type: '', parent_name: '', parent_mobile: '',
    status: 'active',
    cert_10th_collected: false, cert_12th_collected: false, cert_diploma_collected: false,
    consent_given: false,
    admission_date: new Date().toISOString().split('T')[0],
    uniform_received: false,
    uniform_set_count: 0,
    uniform_payment: '',
    accommodation_type: 'day_scholar',
  });

  // ── Cascade State ────────────────────────────────────────
  const [masterCategories, setMasterCategories] = useState<CourseCategory[]>([]);
  const [allCourses, setAllCourses]             = useState<Course[]>([]);
  const [subCourses, setSubCourses]             = useState<Course[]>([]);
  const [batches, setBatches]                   = useState<Batch[]>([]);

  const [selectedMaster, setSelectedMaster] = useState('');   // category id
  const [selectedCourse, setSelectedCourse] = useState('');   // course (sub-course) id
  const [selectedBatch, setSelectedBatch]   = useState('');   // batch id

  // Payment
  const [initialPayment, setInitialPayment] = useState('');
  const [paymentMethod, setPaymentMethod]   = useState('cash');
  const [payLater, setPayLater]             = useState(false);

  // Uniform setup
  const [showUniformSetup, setShowUniformSetup] = useState(false);
  const [uniformSetupStep, setUniformSetupStep] = useState<'sets' | 'payment'>('sets');
  const [uniformSetCount, setUniformSetCount] = useState<1 | 2>(1);

  // Internship plan
  const [showInternship, setShowInternship]       = useState(false);
  const [internshipMonthly, setInternshipMonthly] = useState('');
  const [internshipMonths, setInternshipMonths]   = useState('');

  // ── Load master categories + all courses on mount ────────
  useEffect(() => {
    Promise.all([
      api.get('/categories'),
      api.get('/courses'),
    ]).then(([catRes, courseRes]) => {
      const cats: CourseCategory[] = catRes.data.data || [];
      const courses: Course[]      = courseRes.data.data || [];
      // Only show active master categories (IMA, TNSCVT, Vetri Nichayam)
      const activeCats = cats.filter(c => c.status === 'active');
      setMasterCategories(activeCats);
      setAllCourses(courses.filter(c => c.status === 'active'));
    }).catch(() => toast.error('Failed to load course data'));
  }, []);

  // ── Cascade: master → sub-courses ────────────────────────
  const handleMasterChange = (catId: string) => {
    setSelectedMaster(catId);
    setSelectedCourse('');
    setSelectedBatch('');
    setBatches([]);
    setInitialPayment('');
    setPayLater(false);
    if (catId) {
      setSubCourses(allCourses.filter(c => String(c.category_id) === catId));
    } else {
      setSubCourses([]);
    }
  };

  // ── Cascade: sub-course → batches ────────────────────────
  const handleCourseChange = async (courseId: string) => {
    setSelectedCourse(courseId);
    setSelectedBatch('');
    setBatches([]);
    setInitialPayment('');
    setPayLater(false);
    if (!courseId) return;
    try {
      const r = await api.get('/batches', { params: { course_id: courseId } });
      setBatches((r.data.data || []).filter((b: Batch) => b.status === 'active'));
    } catch { toast.error('Failed to load batch years'); }
  };

  // ── Derived values ────────────────────────────────────────
  const selectedCourseObj  = allCourses.find(c => String(c.id) === selectedCourse);
  const isFree             = selectedCourseObj?.is_free || false;
  const courseFee          = isFree ? 0 : Number(selectedCourseObj?.fee_amount || 0);
  const initPayAmt         = Math.max(0, Number(initialPayment) || 0);
  const balance            = Math.max(0, courseFee - initPayAmt);
  const internshipTotal    = (Number(internshipMonthly) || 0) * (Number(internshipMonths) || 0);
  const completionDate     = isFree && form.admission_date ? addThreeMonths(form.admission_date) : null;

  // ── File handlers ─────────────────────────────────────────
  const handleCertFileChange = (certType: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = /\.(jpg|jpeg|png|webp)$/i.test(file.name);
    setCertFiles(prev => ({ ...prev, [certType]: { file, preview: isImage ? URL.createObjectURL(file) : null } }));
  };

  const handleConsentImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setConsentImageFile(file);
    setConsentImagePreview(URL.createObjectURL(file));
  };
  const handleConsentPdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setConsentPdfFile(file);
  };
  const handleConsentVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setConsentVideoFile(file);
  };

  // ── Submit ────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');

    if (!form.full_name.trim()) { toast.error('Full name is required'); return; }
    if (!form.mobile.trim())    { toast.error('Mobile number is required'); return; }
    // Email is optional — skip required check
    if (!selectedMaster)        { toast.error('Please select a Master Course'); return; }
    if (!selectedCourse)        { toast.error('Please select a Sub-Course'); return; }
    if (!isFree && !selectedBatch) { toast.error('Batch Year is required for paid courses'); return; }
    if (initPayAmt > courseFee)    { toast.error('Initial payment cannot exceed course fee'); return; }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('full_name',  form.full_name.trim());
      fd.append('mobile',     form.mobile.trim());
      fd.append('email',      form.email.trim().toLowerCase());
      if (form.date_of_birth) fd.append('date_of_birth', form.date_of_birth);
      if (form.gender)        fd.append('gender', form.gender);
      if (form.address)       fd.append('address', form.address);
      fd.append('status',           form.status);
      fd.append('admission_date',   form.admission_date);
      fd.append('cert_10th_collected',    String(form.cert_10th_collected));
      fd.append('cert_12th_collected',    String(form.cert_12th_collected));
      fd.append('cert_diploma_collected', String(form.cert_diploma_collected));
      fd.append('consent_given',          String(form.consent_given));
      fd.append('uniform_received',       String(form.uniform_received));
      fd.append('accommodation_type',     form.accommodation_type);

      if (form.guardian_type) {
        fd.append('guardian_type',  form.guardian_type);
        fd.append('parent_present', 'true');
        if (form.parent_name)   fd.append('parent_name',   form.parent_name);
        if (form.parent_mobile) fd.append('parent_mobile', form.parent_mobile);
      }

      fd.append('course_id', selectedCourse);
      if (selectedBatch) fd.append('batch_id', selectedBatch);

      if (!payLater && initPayAmt > 0) {
        fd.append('initial_payment',   String(initPayAmt));
        fd.append('payment_method',    paymentMethod);
        fd.append('payment_type_label', 'Initial payment at admission');
      }
      if (showInternship && internshipMonthly && internshipMonths) {
        fd.append('internship_monthly', internshipMonthly);
        fd.append('internship_months',  internshipMonths);
      }

      if (photoRef.current?.files?.[0]) fd.append('photo', photoRef.current.files[0]);
      fd.append('consent_given', String(form.consent_given));

      const res = await api.post('/students', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const studentId = res.data.data.id;

      if (form.uniform_received && Number(form.uniform_set_count) > 0 && Number(form.uniform_payment) > 0) {
        await api.post(`/student-materials/uniform/${studentId}/receive`, {
          set_count: Number(form.uniform_set_count),
          amount: Number(form.uniform_payment),
          payment_date: form.admission_date,
        });
      }

      // Upload certificates
      const certMap: Record<string, string> = {
        cert_10th_collected: '10th', cert_12th_collected: '12th', cert_diploma_collected: 'diploma',
      };
      for (const [key, certType] of Object.entries(certMap)) {
        const collected = form[key as keyof typeof form];
        const certFile  = certFiles[certType].file;
        if (collected && certFile) {
          const cfd = new FormData();
          cfd.append('file', certFile);
          cfd.append('cert_type', certType);
          await api.post(`/students/${studentId}/cert`, cfd, { headers: { 'Content-Type': 'multipart/form-data' } });
        }
      }

      // Upload consent files via dedicated endpoints
      if (consentImageFile) {
        const cfd = new FormData(); cfd.append('file', consentImageFile);
        await api.post(`/students/${studentId}/consent-image`, cfd, { headers: { 'Content-Type': 'multipart/form-data' } }).catch(() => {});
      }
      if (consentPdfFile) {
        const cfd = new FormData(); cfd.append('file', consentPdfFile);
        await api.post(`/students/${studentId}/consent-pdf`, cfd, { headers: { 'Content-Type': 'multipart/form-data' } }).catch(() => {});
      }
      if (consentVideoFile) {
        const cfd = new FormData(); cfd.append('file', consentVideoFile);
        await api.post(`/students/${studentId}/consent-video`, cfd, { headers: { 'Content-Type': 'multipart/form-data' } }).catch(() => {});
      }

      toast.success('Student added successfully!');
      navigate(`/students/${studentId}`);
    } catch (err: any) {
      const errData = err.response?.data;
      if (errData?.error === 'DUPLICATE_EMAIL') {
        setEmailError(errData.message || 'This email already exists.');
        toast.error('Duplicate email — please use a different email address');
      } else {
        toast.error(errData?.message || 'Failed to add student');
      }
    } finally { setLoading(false); }
  };

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const certRefs = { '10th': cert10Ref, '12th': cert12Ref, 'diploma': certDipRef };
  const certLabels: Record<string, { key: keyof typeof form; label: string }> = {
    '10th':    { key: 'cert_10th_collected',    label: '10th Marksheet' },
    '12th':    { key: 'cert_12th_collected',    label: '12th / HSC Marksheet' },
    'diploma': { key: 'cert_diploma_collected', label: 'TC / Diploma Certificate' },
  };

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Add Candidate</h1><p className="page-subtitle">Fill all details carefully</p></div>
        <button className="btn btn-secondary" onClick={() => navigate('/students')}>Cancel</button>
      </div>

      <form onSubmit={handleSubmit}>

        {/* SECTION 1: Photo */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="section-heading">📸 Student Photo</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div>
              {photoPreview
                ? <img src={photoPreview} alt="preview" style={{ width: 90, height: 90, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--accent)' }} />
                : <div style={{ width: 90, height: 90, borderRadius: '50%', background: 'var(--bg-tertiary)', border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 32 }}><FiUser /></div>}
            </div>
            <div>
              <button type="button" className="btn btn-secondary" onClick={() => photoRef.current?.click()}>
                <FiUpload size={14} /> Upload Photo
              </button>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>JPG, PNG, WEBP — max 5MB</p>
              <input type="file" ref={photoRef} accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) setPhotoPreview(URL.createObjectURL(f)); }} style={{ display: 'none' }} />
            </div>
          </div>
        </div>

        {/* SECTION 2: Basic Information */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="section-heading">👤 Basic Information</h3>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Full Name <span style={{ color: 'var(--red)' }}>*</span></label>
              <input className="form-control" value={form.full_name} onChange={set('full_name')} placeholder="Candidate full name" required />
            </div>
            <div className="form-group">
              <label className="form-label">Mobile Number <span style={{ color: 'var(--red)' }}>*</span></label>
              <input className="form-control" value={form.mobile} onChange={set('mobile')} placeholder="10-digit mobile" maxLength={10} required />
            </div>
            <div className="form-group">
              <label className="form-label">Email Address <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <input
                type="email" className="form-control"
                value={form.email}
                onChange={e => { set('email')(e); setEmailError(''); }}
                placeholder="student@email.com"
                style={emailError ? { borderColor: 'var(--red)' } : {}}
              />
              {emailError && (
                <div className="field-error"><FiAlertCircle size={12} style={{ marginRight: 4 }} />{emailError}</div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Date of Birth</label>
              <div className="date-field-wrap" data-format="DD/MM/YYYY">
                <input type="date" className="form-control" value={form.date_of_birth} onChange={set('date_of_birth')} max={new Date().toISOString().split('T')[0]} />
              </div>
              {form.date_of_birth && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{fmtDate(form.date_of_birth)}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Gender</label>
              <select className="form-control" value={form.gender} onChange={set('gender')}>
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Joining / Admission Date</label>
              <div className="date-field-wrap" data-format="DD/MM/YYYY">
                <input type="date" className="form-control" value={form.admission_date} onChange={e => { set('admission_date')(e); }} />
              </div>
              {form.admission_date && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{fmtDate(form.admission_date)}</div>}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Address</label>
            <textarea className="form-control" value={form.address} onChange={set('address')} rows={2} placeholder="Full residential address" />
          </div>
        </div>

        {/* SECTION 3: Master Course → Sub-Course → Batch Year */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="section-heading">📚 Course Enrollment</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, marginTop: -8 }}>
            Select Master Course, then Sub-Course, then Batch Year
          </p>

          {/* Step 1: Master Course */}
          <div className={`cascade-step ${selectedMaster ? 'active' : ''}`} style={{ marginBottom: 16 }}>
            <div className="cascade-step-label">Step 1 — Master Course *</div>
            <div style={{ position: 'relative' }}>
              <select
                className="form-control"
                value={selectedMaster}
                onChange={e => handleMasterChange(e.target.value)}
                required
                style={{ paddingRight: 32, appearance: 'none' }}
              >
                <option value="">— Select Master Course —</option>
                {masterCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.category_name}</option>
                ))}
              </select>
              <FiChevronDown style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
            </div>
          </div>

          {/* Step 2: Sub-Course */}
          {selectedMaster && (
            <div className={`cascade-step ${selectedCourse ? 'active' : ''}`} style={{ marginBottom: 16 }}>
              <div className="cascade-step-label">Step 2 — Sub-Course *</div>
              <div style={{ position: 'relative' }}>
                <select
                  className="form-control"
                  value={selectedCourse}
                  onChange={e => handleCourseChange(e.target.value)}
                  required
                  style={{ paddingRight: 32, appearance: 'none' }}
                >
                  <option value="">— Select Sub-Course —</option>
                  {subCourses.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.course_name} {c.is_free ? '(FREE — 3 months)' : `— ₹${Number(c.fee_amount).toLocaleString('en-IN')} / 2 Years`}
                    </option>
                  ))}
                </select>
                <FiChevronDown style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
              </div>
            </div>
          )}

          {/* FREE course completion info */}
          {isFree && selectedCourse && completionDate && (
            <div className="free-completion-banner" style={{ marginBottom: 16 }}>
              ✅ <strong>Free Course (3 Months):</strong>&nbsp;
              Completion Date auto-set to <strong>{fmtDate(completionDate)}</strong> &nbsp;
              <span style={{ fontSize: 11, color: 'var(--teal)', opacity: 0.8 }}>(Admission Date + 3 months)</span>
            </div>
          )}

          {/* Step 3: Batch Year */}
          {selectedCourse && (
            <div className={`cascade-step ${selectedBatch ? 'active' : ''}`} style={{ marginBottom: 16 }}>
              <div className="cascade-step-label">Step 3 — Batch Year {isFree ? '(Optional)' : '*'}</div>
              <div style={{ position: 'relative' }}>
                <select
                  className="form-control"
                  value={selectedBatch}
                  onChange={e => setSelectedBatch(e.target.value)}
                  style={{ paddingRight: 32, appearance: 'none', borderColor: !isFree && !selectedBatch ? 'var(--amber)' : undefined }}
                >
                  <option value="">— Select Batch Year —</option>
                  {batches.map(b => (
                    <option key={b.id} value={b.id}>{b.batch_name}</option>
                  ))}
                </select>
                <FiChevronDown style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
              </div>
              {!isFree && !selectedBatch && (
                <p style={{ fontSize: 11, color: 'var(--amber)', marginTop: 4, fontWeight: 600 }}>⚠ Batch year is mandatory for paid courses</p>
              )}
            </div>
          )}

          {/* Fee Preview */}
          {selectedCourse && (
            <div className="fee-preview-box">
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--text-secondary)' }}>💰 Fee Summary</div>
              <div className="fee-preview-row">
                <span>Course</span>
                <span style={{ fontWeight: 700 }}>{selectedCourseObj?.course_name || '—'}</span>
              </div>
              <div className="fee-preview-row">
                <span>Course Fee</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                  {isFree ? '₹0 (Free Course)' : `₹${courseFee.toLocaleString('en-IN')}`}
                </span>
              </div>
              <div className="fee-preview-row">
                <span>Duration</span>
                <span>{isFree ? '3 Months' : '2 Years'}</span>
              </div>
              {!isFree && (
                <>
                  <div className="fee-preview-row">
                    <span>Initial Payment</span>
                    <span style={{ color: 'var(--teal)' }}>₹{initPayAmt.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="fee-preview-row">
                    <span style={{ fontWeight: 700 }}>Balance</span>
                    <span style={{ color: balance > 0 ? 'var(--red)' : 'var(--teal)', fontWeight: 700 }}>
                      ₹{balance.toLocaleString('en-IN')}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Payment Section for paid courses */}
          {selectedCourse && !isFree && (
            <div style={{ marginTop: 16 }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none',
                padding: '10px 16px', borderRadius: 10, marginBottom: 16,
                border: `2px solid ${payLater ? 'var(--amber)' : 'var(--border-light)'}`,
                background: payLater ? 'rgba(245,158,11,0.08)' : 'var(--bg-tertiary)',
              }}>
                <input type="checkbox" checked={payLater} onChange={e => { setPayLater(e.target.checked); if (e.target.checked) setInitialPayment(''); }}
                  style={{ width: 18, height: 18, accentColor: 'var(--amber)', cursor: 'pointer' }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: payLater ? 'var(--amber)' : 'var(--text-primary)' }}>⏳ Pay Later</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Candidate will pay fees later</div>
                </div>
              </label>

              {!payLater && (
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">💰 Initial Payment ₹ <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(Optional)</span></label>
                    <input
                      type="number" className="form-control"
                      value={initialPayment}
                      onChange={e => setInitialPayment(e.target.value)}
                      placeholder={`e.g. 5000 (max ₹${courseFee.toLocaleString('en-IN')})`}
                      min={0} max={courseFee}
                    />
                  </div>
                  {initPayAmt > 0 && (
                    <div className="form-group">
                      <label className="form-label">Payment Method <span style={{ color: 'var(--red)' }}>*</span></label>
                      <select className="form-control" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                        <option value="cash">Cash</option>
                        <option value="upi">GPay / UPI</option>
                        <option value="bank">Bank Transfer</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Internship Plan */}
              <label style={{
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none',
                padding: '10px 16px', borderRadius: 10, marginTop: 8,
                border: `2px solid ${showInternship ? 'var(--accent)' : 'var(--border-light)'}`,
                background: showInternship ? 'rgba(99,102,241,0.06)' : 'var(--bg-tertiary)',
              }}>
                <input type="checkbox" checked={showInternship} onChange={e => setShowInternship(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: showInternship ? 'var(--accent)' : 'var(--text-primary)' }}>🎓 Internship Payment Plan</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Monthly installments — plan only</div>
                </div>
              </label>
              {showInternship && (
                <div className="form-grid" style={{ marginTop: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Monthly Amount ₹</label>
                    <input type="number" className="form-control" value={internshipMonthly} onChange={e => setInternshipMonthly(e.target.value)} placeholder="e.g. 5000" min={0} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Number of Months</label>
                    <input type="number" className="form-control" value={internshipMonths} onChange={e => setInternshipMonths(e.target.value)} placeholder="e.g. 4" min={1} max={24} />
                  </div>
                  {internshipTotal > 0 && (
                    <div style={{ gridColumn: '1 / -1', padding: '10px 14px', borderRadius: 8, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', fontSize: 13 }}>
                      📋 <strong>Planned Total:</strong> ₹{internshipMonthly} × {internshipMonths} months = <strong style={{ color: 'var(--accent)' }}>₹{internshipTotal.toLocaleString('en-IN')}</strong>
                      <span style={{ color: 'var(--amber)', marginLeft: 8, fontWeight: 600 }}>⚠ Plan only — not actual payment</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* SECTION 4: Parent / Guardian */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="section-heading">👨‍👩‍👧 Parent / Guardian</h3>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            {[
              { value: '',         label: 'Not Present', icon: '—'  },
              { value: 'parent',   label: 'Parent',      icon: '👨‍👩‍👧' },
              { value: 'guardian', label: 'Guardian',    icon: '🧑‍🤝‍🧑' },
            ].map(opt => (
              <label key={opt.value} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 6, padding: '12px 8px', borderRadius: 10, cursor: 'pointer',
                border: `2px solid ${form.guardian_type === opt.value ? 'var(--accent)' : 'var(--border-light)'}`,
                background: form.guardian_type === opt.value ? 'rgba(99,102,241,0.08)' : 'var(--bg-tertiary)',
                transition: 'all 0.15s', userSelect: 'none',
              }}>
                <input type="radio" name="guardian_type" value={opt.value}
                  checked={form.guardian_type === opt.value}
                  onChange={() => setForm(f => ({ ...f, guardian_type: opt.value, parent_present: opt.value !== '', parent_name: '', parent_mobile: '' }))}
                  style={{ display: 'none' }} />
                <span style={{ fontSize: 22 }}>{opt.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: form.guardian_type === opt.value ? 'var(--accent)' : 'var(--text-secondary)' }}>{opt.label}</span>
              </label>
            ))}
          </div>
          {form.guardian_type && (
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{form.guardian_type === 'parent' ? 'Parent Name' : 'Guardian Name'}</label>
                <input className="form-control" value={form.parent_name} onChange={set('parent_name')} placeholder={form.guardian_type === 'parent' ? 'Father / Mother name' : 'Guardian full name'} />
              </div>
              <div className="form-group">
                <label className="form-label">{form.guardian_type === 'parent' ? 'Parent Mobile' : 'Guardian Mobile'}</label>
                <input className="form-control" value={form.parent_mobile} onChange={set('parent_mobile')} maxLength={10} />
              </div>
            </div>
          )}
        </div>

        {/* SECTION 5: Uniform */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="section-heading">👕 Uniform</h3>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', userSelect: 'none',
            padding: '14px 18px', borderRadius: 10,
            border: `2px solid ${form.uniform_received ? 'var(--teal)' : 'var(--border-light)'}`,
            background: form.uniform_received ? 'rgba(16,185,129,0.07)' : 'var(--bg-tertiary)',
            transition: 'all 0.2s',
          }}>
            <input type="checkbox" checked={form.uniform_received}
              onChange={e => {
                if (e.target.checked) {
                  setUniformSetCount(1);
                  setUniformSetupStep('sets');
                  setShowUniformSetup(true);
                } else {
                  setForm(f => ({ ...f, uniform_received: false, uniform_set_count: 0, uniform_payment: '' }));
                }
              }}
              style={{ width: 20, height: 20, accentColor: 'var(--teal)', cursor: 'pointer', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: form.uniform_received ? 'var(--teal)' : 'var(--text-primary)' }}>
                {form.uniform_received ? '✅ Uniform Received' : '⬜ Uniform Not Received'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Check if student has received uniform</div>
            </div>
          </label>
        </div>

        {/* SECTION: Accommodation Type */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="section-heading">🏠 Accommodation Type</h3>
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              { value: 'day_scholar', label: '🏫 Day Scholar', desc: 'Student commutes daily' },
              { value: 'hostel',      label: '🏠 Hostel',      desc: 'Student stays in hostel' },
            ].map(opt => (
              <label key={opt.value} style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                padding: '14px 18px', borderRadius: 10,
                border: `2px solid ${form.accommodation_type === opt.value ? 'var(--accent)' : 'var(--border-light)'}`,
                background: form.accommodation_type === opt.value ? 'rgba(99,102,241,0.08)' : 'var(--bg-tertiary)',
                transition: 'all 0.2s',
              }}>
                <input type="radio" name="accommodation_type" value={opt.value}
                  checked={form.accommodation_type === opt.value}
                  onChange={() => setForm(f => ({ ...f, accommodation_type: opt.value }))}
                  style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: form.accommodation_type === opt.value ? 'var(--accent)' : 'var(--text-primary)' }}>{opt.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
          {form.accommodation_type === 'hostel' && (
            <div style={{ marginTop: 10, padding: '8px 14px', background: 'rgba(99,102,241,0.07)', borderRadius: 8, fontSize: 12, color: 'var(--accent)' }}>
              ℹ️ This student will automatically appear in the Hostel module where fees and payments can be managed.
            </div>
          )}
        </div>

        {/* SECTION 6: Certificate Verification */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="section-heading">📋 Certificate Verification</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, marginTop: -8 }}>
            Check each certificate that has been collected. Upload scanned copies if available.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(Object.entries(certLabels) as [string, { key: keyof typeof form; label: string }][]).map(([certType, { key, label }]) => (
              <div key={certType} style={{ background: form[key] ? 'rgba(16,185,129,0.05)' : 'var(--bg-tertiary)', borderRadius: 10, padding: '14px 16px', border: `1px solid ${form[key] ? 'rgba(16,185,129,0.25)' : 'var(--border-light)'}`, transition: 'all 0.2s' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none', marginBottom: form[key] ? 12 : 0 }}>
                  <input type="checkbox" checked={form[key] as boolean} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} style={{ width: 18, height: 18, accentColor: 'var(--teal)', cursor: 'pointer' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
                    {form[key] && <div style={{ fontSize: 12, color: 'var(--teal)', marginTop: 2 }}>✓ Marked as collected</div>}
                  </div>
                </label>
                {form[key] && (
                  <div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => certRefs[certType as keyof typeof certRefs].current?.click()}>
                      <FiUpload size={12} /> {certFiles[certType].file ? 'Change File' : 'Upload Scan'}
                    </button>
                    <input type="file" ref={certRefs[certType as keyof typeof certRefs]} accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={handleCertFileChange(certType)} style={{ display: 'none' }} />
                    {certFiles[certType].preview && <img src={certFiles[certType].preview!} alt="cert" style={{ display: 'block', maxWidth: 140, maxHeight: 90, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--border)', marginTop: 8 }} />}
                    {certFiles[certType].file && !certFiles[certType].preview && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--teal)', marginTop: 8 }}>
                        <FiFileText /> {certFiles[certType].file!.name}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* SECTION 7: Consent */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="section-heading">📝 Consent</h3>

          {/* Consent checkbox */}
          <div style={{ background: form.consent_given ? 'rgba(16,185,129,0.06)' : 'var(--bg-tertiary)', borderRadius: 10, padding: '16px 18px', border: `2px solid ${form.consent_given ? 'rgba(16,185,129,0.35)' : 'var(--border-light)'}`, transition: 'all 0.2s', marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 14, cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={form.consent_given} onChange={e => setForm(f => ({ ...f, consent_given: e.target.checked }))} style={{ width: 20, height: 20, accentColor: 'var(--teal)', cursor: 'pointer', marginTop: 3, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>I / We hereby give consent</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                  I/We hereby consent to the enrollment of the above-named student at <strong>Nalam Academy — EPFT</strong> and agree to abide by all rules, regulations, and terms and conditions of the institution.
                </div>
                {form.consent_given && <div style={{ fontSize: 12, color: 'var(--teal)', marginTop: 8, fontWeight: 700 }}>✓ Consent confirmed</div>}
              </div>
            </label>
          </div>

          {/* Three separate upload boxes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>

            {/* Box 1: Image Upload */}
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '14px 16px', border: `2px dashed ${consentImageFile ? 'var(--teal)' : 'var(--border-light)'}`, transition: 'border-color 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <FiImage size={18} style={{ color: 'var(--teal)' }} />
                <span style={{ fontSize: 13, fontWeight: 700 }}>Image Upload</span>
                {consentImageFile && <FiCheckCircle size={14} style={{ color: 'var(--teal)', marginLeft: 'auto' }} />}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>Signed consent photo / signature image</p>
              <button type="button" className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={() => consentImgRef.current?.click()}>
                <FiUpload size={12} /> {consentImageFile ? 'Change Image' : 'Upload Image'}
              </button>
              <input type="file" ref={consentImgRef} accept=".jpg,.jpeg,.png,.webp" onChange={handleConsentImageChange} style={{ display: 'none' }} />
              {consentImagePreview && (
                <div style={{ marginTop: 10 }}>
                  <img src={consentImagePreview} alt="consent" style={{ maxWidth: '100%', maxHeight: 100, borderRadius: 6, objectFit: 'cover', border: '2px solid rgba(16,185,129,0.3)' }} />
                </div>
              )}
              {consentImageFile && (
                <div style={{ fontSize: 11, color: 'var(--teal)', marginTop: 6, fontWeight: 600, wordBreak: 'break-all' }}>
                  ✓ {consentImageFile.name}
                </div>
              )}
            </div>

            {/* Box 2: PDF Document Upload */}
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '14px 16px', border: `2px dashed ${consentPdfFile ? 'var(--accent)' : 'var(--border-light)'}`, transition: 'border-color 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <FiFilePlus size={18} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 13, fontWeight: 700 }}>PDF Document</span>
                {consentPdfFile && <FiCheckCircle size={14} style={{ color: 'var(--accent)', marginLeft: 'auto' }} />}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>Consent form, agreement or letter (PDF)</p>
              <button type="button" className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={() => consentPdfRef.current?.click()}>
                <FiUpload size={12} /> {consentPdfFile ? 'Change PDF' : 'Upload PDF'}
              </button>
              <input type="file" ref={consentPdfRef} accept=".pdf" onChange={handleConsentPdfChange} style={{ display: 'none' }} />
              {consentPdfFile && (
                <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 6, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, wordBreak: 'break-all' }}>
                  <FiFileText size={12} /> {consentPdfFile.name}
                </div>
              )}
            </div>

            {/* Box 3: Video Upload */}
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '14px 16px', border: `2px dashed ${consentVideoFile ? 'var(--amber)' : 'var(--border-light)'}`, transition: 'border-color 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <FiVideo size={18} style={{ color: 'var(--amber)' }} />
                <span style={{ fontSize: 13, fontWeight: 700 }}>Video Upload</span>
                {consentVideoFile && <FiCheckCircle size={14} style={{ color: 'var(--amber)', marginLeft: 'auto' }} />}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>Verbal consent video recording (MP4/MOV)</p>
              <button type="button" className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={() => consentVideoRef.current?.click()}>
                <FiUpload size={12} /> {consentVideoFile ? 'Change Video' : 'Upload Video'}
              </button>
              <input type="file" ref={consentVideoRef} accept=".mp4,.mov,.webm,.mkv" onChange={handleConsentVideoChange} style={{ display: 'none' }} />
              {consentVideoFile && (
                <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 6, fontWeight: 600, wordBreak: 'break-all' }}>
                  ✓ {consentVideoFile.name}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Uniform setup modal */}
        {showUniformSetup && (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: 430 }}>
              <div className="modal-header">
                <h2 className="modal-title">👕 Uniform</h2>
                <button type="button" className="modal-close" onClick={() => setShowUniformSetup(false)}>×</button>
              </div>
              {uniformSetupStep === 'sets' ? (
                <div>
                  <label className="form-label" style={{ marginBottom: 12 }}>How many uniform sets?</label>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {([1, 2] as const).map(count => (
                      <button key={count} type="button" className={`uniform-set-option ${uniformSetCount === count ? 'selected' : ''}`} onClick={() => { setUniformSetCount(count); setUniformSetupStep('payment'); }}>
                        <strong>{count}</strong><span>{count === 1 ? 'Set' : 'Sets'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
                    <strong style={{ color: 'var(--teal)' }}>✅ {uniformSetCount} set{uniformSetCount > 1 ? 's' : ''} selected</strong>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Manual Payment Amount ₹ *</label>
                    <input id="add-uniform-payment" type="number" className="form-control" min={0.01} step="0.01" placeholder="Enter amount" autoFocus required
                      onChange={e => setForm(f => ({ ...f, uniform_payment: e.target.value }))} />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => {
                      if (Number(form.uniform_payment) <= 0) { toast.error('Enter a valid payment amount'); return; }
                      setForm(f => ({ ...f, uniform_received: true, uniform_set_count: uniformSetCount }));
                      setShowUniformSetup(false);
                    }}>✓ Save Uniform</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setUniformSetupStep('sets')}>Back</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Submit */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ minWidth: 160 }}>
            {loading ? '⏳ Adding Student...' : '✓ Add Student'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/students')} disabled={loading}>Cancel</button>
        </div>
      </form>
    </div>
  );
};

export default StudentAdd;
