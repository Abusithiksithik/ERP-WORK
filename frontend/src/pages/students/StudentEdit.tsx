import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FiUpload, FiFileText, FiUser, FiChevronDown, FiArrowLeft, FiImage, FiVideo, FiFilePlus, FiCheckCircle } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { CourseCategory, Course, Batch } from '../../types';

interface CertFile { file: File | null; preview: string | null; existingUrl?: string; }

const fmtDate = (iso: string) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return iso; }
};

const addThreeMonths = (isoDate: string): string => {
  const d = new Date(isoDate);
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().split('T')[0];
};

const StudentEdit: React.FC = () => {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const photoRef   = useRef<HTMLInputElement>(null);
  const cert10Ref  = useRef<HTMLInputElement>(null);
  const cert12Ref  = useRef<HTMLInputElement>(null);
  const certDipRef = useRef<HTMLInputElement>(null);
  const consentImgRef   = useRef<HTMLInputElement>(null);
  const consentPdfRef   = useRef<HTMLInputElement>(null);
  const consentVideoRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading]         = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [form, setForm] = useState<any>({});
  const [certFiles, setCertFiles] = useState<Record<string, CertFile>>({
    '10th':    { file: null, preview: null },
    '12th':    { file: null, preview: null },
    'diploma': { file: null, preview: null },
  });

  // Consent — three separate files
  const [consentImageFile, setConsentImageFile]       = useState<File | null>(null);
  const [consentImagePreview, setConsentImagePreview] = useState<string | null>(null);
  const [consentPdfFile, setConsentPdfFile]           = useState<File | null>(null);
  const [consentVideoFile, setConsentVideoFile]       = useState<File | null>(null);
  const [existingConsentImage, setExistingConsentImage] = useState<string | null>(null);
  const [existingConsentPdf, setExistingConsentPdf]     = useState<string | null>(null);
  const [existingConsentVideo, setExistingConsentVideo] = useState<string | null>(null);


  // ── Cascade state ──────────────────────────────────────────
  const [masterCategories, setMasterCategories] = useState<CourseCategory[]>([]);
  const [allCourses, setAllCourses]             = useState<Course[]>([]);
  const [subCourses, setSubCourses]             = useState<Course[]>([]);
  const [batches, setBatches]                   = useState<Batch[]>([]);

  const [selectedMaster, setSelectedMaster] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedBatch,  setSelectedBatch]  = useState('');

  useEffect(() => {
    const init = async () => {
      try {
        const [sRes, catRes, courseRes] = await Promise.all([
          api.get(`/students/${id}`),
          api.get('/categories'),
          api.get('/courses'),
        ]);
        const s       = sRes.data.data;
        const cats    = (catRes.data.data || []).filter((c: CourseCategory) => c.status === 'active');
        const courses = (courseRes.data.data || []).filter((c: Course) => c.status === 'active');

        setMasterCategories(cats);
        setAllCourses(courses);

        setForm({
          full_name:              s.full_name  || '',
          mobile:                 s.mobile     || '',
          email:                  s.email      || '',
          date_of_birth:          s.date_of_birth ? s.date_of_birth.split('T')[0] : '',
          gender:                 s.gender     || '',
          address:                s.address    || '',
          parent_present:         !!(s.parent_name || s.parent_mobile),
          guardian_type:          s.guardian_type || (s.parent_name ? 'parent' : ''),
          parent_name:            s.parent_name   || '',
          parent_mobile:          s.parent_mobile || '',
          status:                 s.status     || 'active',
          cert_10th_collected:    !!s.cert_10th_collected,
          cert_12th_collected:    !!s.cert_12th_collected,
          cert_diploma_collected: !!s.cert_diploma_collected,
          uniform_received:       !!s.uniform_received,
          consent_given:          !!s.consent_given,
          admission_date:         s.admission_date ? s.admission_date.split('T')[0] : new Date().toISOString().split('T')[0],
          accommodation_type:     s.accommodation_type || 'day_scholar',
        });

        if (s.photo_url) setPhotoPreview(s.photo_url);
        setCertFiles({
          '10th':    { file: null, preview: s.cert_10th_url    || null, existingUrl: s.cert_10th_url },
          '12th':    { file: null, preview: s.cert_12th_url    || null, existingUrl: s.cert_12th_url },
          'diploma': { file: null, preview: s.cert_diploma_url || null, existingUrl: s.cert_diploma_url },
        });

        // Load existing consent data
        if (s.consent_given !== undefined) setForm((f: any) => ({ ...f, consent_given: !!s.consent_given }));
        if (s.consent_image_url) setExistingConsentImage(s.consent_image_url);
        if (s.consent_pdf_url)   setExistingConsentPdf(s.consent_pdf_url);
        if (s.consent_video_url) setExistingConsentVideo(s.consent_video_url);

        // Pre-select master category from existing course
        if (s.course_id) {
          const existingCourse = courses.find((c: Course) => c.id === s.course_id);
          if (existingCourse) {
            const catId = String(existingCourse.category_id || '');
            setSelectedMaster(catId);
            setSubCourses(catId ? courses.filter((c: Course) => String(c.category_id) === catId) : courses);
            setSelectedCourse(String(s.course_id));
            // Load batches for existing course
            const br = await api.get('/batches', { params: { course_id: s.course_id } });
            setBatches((br.data.data || []).filter((b: Batch) => b.status === 'active'));
            if (s.batch_id) setSelectedBatch(String(s.batch_id));
          }
        }
      } catch {
        toast.error('Failed to load student data');
      } finally {
        setPageLoading(false);
      }
    };
    init();
  }, [id]);

  const handleMasterChange = (catId: string) => {
    setSelectedMaster(catId);
    setSelectedCourse('');
    setSelectedBatch('');
    setBatches([]);
    setSubCourses(catId ? allCourses.filter(c => String(c.category_id) === catId) : []);
  };

  const handleCourseChange = async (courseId: string) => {
    setSelectedCourse(courseId);
    setSelectedBatch('');
    setBatches([]);
    if (!courseId) return;
    try {
      const r = await api.get('/batches', { params: { course_id: courseId } });
      setBatches((r.data.data || []).filter((b: Batch) => b.status === 'active'));
    } catch { /* silent */ }
  };

  const handleCertFileChange = (certType: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = /\.(jpg|jpeg|png|webp)$/i.test(file.name);
    setCertFiles(prev => ({ ...prev, [certType]: { ...prev[certType], file, preview: isImage ? URL.createObjectURL(file) : null } }));
  };

  const handleConsentImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setConsentImageFile(file);
    setConsentImagePreview(URL.createObjectURL(file));
  };
  const handleConsentPdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setConsentPdfFile(file);
  };
  const handleConsentVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setConsentVideoFile(file);
  };

  const selectedCourseObj = allCourses.find(c => String(c.id) === selectedCourse);
  const isFree            = selectedCourseObj?.is_free || false;
  const completionDate    = isFree && form.admission_date ? addThreeMonths(form.admission_date) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('full_name', String(form.full_name).trim());
      fd.append('mobile',    String(form.mobile).trim());
      fd.append('email',     String(form.email).trim());
      if (form.date_of_birth) fd.append('date_of_birth', form.date_of_birth);
      fd.append('gender',  form.gender || '');
      fd.append('address', form.address || '');
      fd.append('status',  form.status || 'active');
      fd.append('admission_date', form.admission_date || '');
      fd.append('cert_10th_collected',    String(form.cert_10th_collected));
      fd.append('cert_12th_collected',    String(form.cert_12th_collected));
      fd.append('cert_diploma_collected', String(form.cert_diploma_collected));
      fd.append('uniform_received', String(form.uniform_received));
      fd.append('accommodation_type', (form as any).accommodation_type || 'day_scholar');
      fd.append('consent_given', String(form.consent_given || false));

      if (form.guardian_type) {
        fd.append('guardian_type',  form.guardian_type);
        fd.append('parent_present', 'true');
        fd.append('parent_name',    form.parent_name   || '');
        fd.append('parent_mobile',  form.parent_mobile || '');
      } else {
        fd.append('parent_name',   '');
        fd.append('parent_mobile', '');
      }

      if (photoRef.current?.files?.[0]) fd.append('photo', photoRef.current.files[0]);

      // Update course/batch via separate endpoint to avoid overwriting enrollment
      if (selectedCourse) {
        fd.append('course_id', selectedCourse);
        if (selectedBatch) fd.append('batch_id', selectedBatch);
      }

      await api.put(`/students/${id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });

      // Upload new cert files
      const certMap: Record<string, string> = {
        cert_10th_collected: '10th', cert_12th_collected: '12th', cert_diploma_collected: 'diploma',
      };
      for (const [key, certType] of Object.entries(certMap)) {
        const certFile = certFiles[certType].file;
        if (form[key] && certFile) {
          const cfd = new FormData();
          cfd.append('file', certFile);
          cfd.append('cert_type', certType);
          await api.post(`/students/${id}/cert`, cfd, { headers: { 'Content-Type': 'multipart/form-data' } });
        }
      }

      // Upload new consent files if changed
      if (consentImageFile) {
        const cfd = new FormData(); cfd.append('file', consentImageFile);
        await api.post(`/students/${id}/consent-image`, cfd, { headers: { 'Content-Type': 'multipart/form-data' } }).catch(() => {});
      }
      if (consentPdfFile) {
        const cfd = new FormData(); cfd.append('file', consentPdfFile);
        await api.post(`/students/${id}/consent-pdf`, cfd, { headers: { 'Content-Type': 'multipart/form-data' } }).catch(() => {});
      }
      if (consentVideoFile) {
        const cfd = new FormData(); cfd.append('file', consentVideoFile);
        await api.post(`/students/${id}/consent-video`, cfd, { headers: { 'Content-Type': 'multipart/form-data' } }).catch(() => {});
      }

      toast.success('Student updated successfully!');
      navigate('/students');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally { setLoading(false); }
  };

  const set = (field: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f: any) => ({ ...f, [field]: e.target.value }));

  const certRefs   = { '10th': cert10Ref, '12th': cert12Ref, 'diploma': certDipRef };
  const certLabels: Record<string, { key: string; label: string }> = {
    '10th':    { key: 'cert_10th_collected',    label: '10th Marksheet' },
    '12th':    { key: 'cert_12th_collected',    label: '12th / HSC Marksheet' },
    'diploma': { key: 'cert_diploma_collected', label: 'TC / Diploma Certificate' },
  };

  if (pageLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80, color: 'var(--text-muted)' }}>
      Loading student data...
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link to={`/students/${id}`} className="btn btn-secondary btn-sm"><FiArrowLeft /></Link>
          <div>
            <h1 className="page-title">Edit Candidate</h1>
            <p className="page-subtitle">Update candidate information</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>

        {/* ── Photo ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="section-heading">📸 Student Photo</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {photoPreview
              ? <img src={photoPreview} alt="preview" style={{ width: 90, height: 90, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--accent)' }} />
              : <div style={{ width: 90, height: 90, borderRadius: '50%', background: 'var(--bg-tertiary)', border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 32 }}><FiUser /></div>}
            <div>
              <button type="button" className="btn btn-secondary" onClick={() => photoRef.current?.click()}>
                <FiUpload size={14} /> Change Photo
              </button>
              <input type="file" ref={photoRef} accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) setPhotoPreview(URL.createObjectURL(f)); }} style={{ display: 'none' }} />
            </div>
          </div>
        </div>

        {/* ── Basic Info ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="section-heading">👤 Basic Information</h3>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input className="form-control" value={form.full_name || ''} onChange={set('full_name')} required />
            </div>
            <div className="form-group">
              <label className="form-label">Mobile Number *</label>
              <input className="form-control" value={form.mobile || ''} onChange={set('mobile')} required maxLength={10} />
            </div>
            <div className="form-group">
              <label className="form-label">Email Address <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <input type="email" className="form-control" value={form.email || ''} onChange={set('email')} />
            </div>
            <div className="form-group">
              <label className="form-label">Date of Birth</label>
              <div className="date-field-wrap" data-format="DD/MM/YYYY">
                <input type="date" className="form-control" value={form.date_of_birth || ''} onChange={set('date_of_birth')} max={new Date().toISOString().split('T')[0]} />
              </div>
              {form.date_of_birth && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{fmtDate(form.date_of_birth)}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Gender</label>
              <select className="form-control" value={form.gender || ''} onChange={set('gender')}>
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Joining / Admission Date</label>
              <div className="date-field-wrap" data-format="DD/MM/YYYY">
                <input type="date" className="form-control" value={form.admission_date || ''} onChange={set('admission_date')} />
              </div>
              {form.admission_date && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{fmtDate(form.admission_date)}</div>}
            </div>
<<<<<<< HEAD
=======
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={form.status || 'active'} onChange={set('status')}>
                <option value="active">Active</option>
              </select>
            </div>
>>>>>>> db4c08a89fc3294053c71826514ea5eec542b960
          </div>
          <div className="form-group">
            <label className="form-label">Address</label>
            <textarea className="form-control" value={form.address || ''} onChange={set('address')} rows={2} />
          </div>
        </div>

        {/* ── Course Selection (Cascade) ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="section-heading">📚 Course Selection</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, marginTop: -8 }}>
            Changing course here updates the student's primary course. Use Enrollments for formal enrollment changes.
          </p>

          {/* Step 1: Master Course */}
          <div className={`cascade-step ${selectedMaster ? 'active' : ''}`} style={{ marginBottom: 16 }}>
            <div className="cascade-step-label">Master Course</div>
            <div style={{ position: 'relative' }}>
              <select className="form-control" value={selectedMaster} onChange={e => handleMasterChange(e.target.value)} style={{ paddingRight: 32, appearance: 'none' }}>
                <option value="">— Select Master Course —</option>
                {masterCategories.map(cat => <option key={cat.id} value={cat.id}>{cat.category_name}</option>)}
              </select>
              <FiChevronDown style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
            </div>
          </div>

          {/* Step 2: Sub-Course */}
          {selectedMaster && (
            <div className={`cascade-step ${selectedCourse ? 'active' : ''}`} style={{ marginBottom: 16 }}>
              <div className="cascade-step-label">Sub-Course</div>
              <div style={{ position: 'relative' }}>
                <select className="form-control" value={selectedCourse} onChange={e => handleCourseChange(e.target.value)} style={{ paddingRight: 32, appearance: 'none' }}>
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

          {/* FREE completion info */}
          {isFree && selectedCourse && completionDate && (
            <div className="free-completion-banner" style={{ marginBottom: 16 }}>
              ✅ <strong>Free Course (3 Months):</strong>&nbsp;
              Completion Date: <strong>{fmtDate(completionDate)}</strong>&nbsp;
              <span style={{ fontSize: 11, opacity: 0.8 }}>(Admission Date + 3 months)</span>
            </div>
          )}

          {/* Step 3: Batch Year */}
          {selectedCourse && (
            <div className={`cascade-step ${selectedBatch ? 'active' : ''}`}>
              <div className="cascade-step-label">Batch Year {isFree ? '(Optional)' : ''}</div>
              <div style={{ position: 'relative' }}>
                <select className="form-control" value={selectedBatch} onChange={e => setSelectedBatch(e.target.value)} style={{ paddingRight: 32, appearance: 'none' }}>
                  <option value="">— Select Batch Year —</option>
                  {batches.map(b => <option key={b.id} value={b.id}>{b.batch_name}</option>)}
                </select>
                <FiChevronDown style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
              </div>
            </div>
          )}
        </div>

        {/* ── Uniform ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="section-heading">👕 Uniform</h3>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', userSelect: 'none',
            padding: '14px 18px', borderRadius: 10,
            border: `2px solid ${form.uniform_received ? 'var(--teal)' : 'var(--border-light)'}`,
            background: form.uniform_received ? 'rgba(16,185,129,0.07)' : 'var(--bg-tertiary)',
            transition: 'all 0.2s',
          }}>
            <input type="checkbox" checked={!!form.uniform_received}
              onChange={e => setForm((f: any) => ({ ...f, uniform_received: e.target.checked }))}
              style={{ width: 20, height: 20, accentColor: 'var(--teal)', cursor: 'pointer', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: form.uniform_received ? 'var(--teal)' : 'var(--text-primary)' }}>
                {form.uniform_received ? '✅ Uniform Received' : '⬜ Uniform Not Received'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Check if student has received uniform</div>
            </div>
          </label>
        </div>

        {/* ── Accommodation Type ── */}
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
                border: `2px solid ${(form as any).accommodation_type === opt.value ? 'var(--accent)' : 'var(--border-light)'}`,
                background: (form as any).accommodation_type === opt.value ? 'rgba(99,102,241,0.08)' : 'var(--bg-tertiary)',
                transition: 'all 0.2s',
              }}>
                <input type="radio" name="accommodation_type" value={opt.value}
                  checked={(form as any).accommodation_type === opt.value}
                  onChange={() => setForm((f: any) => ({ ...f, accommodation_type: opt.value }))}
                  style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: (form as any).accommodation_type === opt.value ? 'var(--accent)' : 'var(--text-primary)' }}>{opt.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
          {(form as any).accommodation_type === 'hostel' && (
            <div style={{ marginTop: 10, padding: '8px 14px', background: 'rgba(99,102,241,0.07)', borderRadius: 8, fontSize: 12, color: 'var(--accent)' }}>
              ℹ️ This student will appear in the Hostel module for fee and payment management.
            </div>
          )}
        </div>

        {/* ── Parent / Guardian ── */}
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
                  onChange={() => setForm((f: any) => ({ ...f, guardian_type: opt.value, parent_present: opt.value !== '', parent_name: opt.value ? f.parent_name : '', parent_mobile: opt.value ? f.parent_mobile : '' }))}
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
                <input className="form-control" value={form.parent_name || ''} onChange={set('parent_name')} placeholder={form.guardian_type === 'parent' ? 'Father / Mother name' : 'Guardian full name'} />
              </div>
              <div className="form-group">
                <label className="form-label">{form.guardian_type === 'parent' ? 'Parent Mobile' : 'Guardian Mobile'}</label>
                <input className="form-control" value={form.parent_mobile || ''} onChange={set('parent_mobile')} maxLength={10} />
              </div>
            </div>
          )}
        </div>

        {/* ── Consent Section ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="section-heading">📝 Consent</h3>

          {/* Consent checkbox */}
          <div style={{ background: form.consent_given ? 'rgba(16,185,129,0.06)' : 'var(--bg-tertiary)', borderRadius: 10, padding: '16px 18px', border: `2px solid ${form.consent_given ? 'rgba(16,185,129,0.35)' : 'var(--border-light)'}`, transition: 'all 0.2s', marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 14, cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={!!form.consent_given} onChange={e => setForm((f: any) => ({ ...f, consent_given: e.target.checked }))} style={{ width: 20, height: 20, accentColor: 'var(--teal)', cursor: 'pointer', marginTop: 3, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>I / We hereby give consent</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                  I/We hereby consent to the enrollment of the above-named student at <strong>Nalam Academy — EPFT</strong> and agree to abide by all rules, regulations, and terms and conditions of the institution.
                </div>
                {form.consent_given && <div style={{ fontSize: 12, color: 'var(--teal)', marginTop: 8, fontWeight: 700 }}>✓ Consent confirmed</div>}
              </div>
            </label>
          </div>

          {/* Three upload boxes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>

            {/* Box 1: Image */}
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '14px 16px', border: `2px dashed ${consentImageFile ? 'var(--teal)' : (existingConsentImage ? 'rgba(16,185,129,0.4)' : 'var(--border-light)')}`, transition: 'border-color 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <FiImage size={18} style={{ color: 'var(--teal)' }} />
                <span style={{ fontSize: 13, fontWeight: 700 }}>Image Upload</span>
                {(consentImageFile || existingConsentImage) && <FiCheckCircle size={14} style={{ color: 'var(--teal)', marginLeft: 'auto' }} />}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>Signed consent photo / signature image</p>
              <button type="button" className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={() => consentImgRef.current?.click()}>
                <FiUpload size={12} /> {consentImageFile ? 'Change Image' : existingConsentImage ? 'Replace Image' : 'Upload Image'}
              </button>
              <input type="file" ref={consentImgRef} accept=".jpg,.jpeg,.png,.webp" onChange={handleConsentImageChange} style={{ display: 'none' }} />
              {(consentImagePreview || existingConsentImage) && (
                <div style={{ marginTop: 10 }}>
                  <img src={consentImagePreview || existingConsentImage!} alt="consent" style={{ maxWidth: '100%', maxHeight: 90, borderRadius: 6, objectFit: 'cover', border: '2px solid rgba(16,185,129,0.3)' }} />
                </div>
              )}
              {consentImageFile && <div style={{ fontSize: 11, color: 'var(--teal)', marginTop: 6, fontWeight: 600, wordBreak: 'break-all' }}>✓ {consentImageFile.name}</div>}
            </div>

            {/* Box 2: PDF */}
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '14px 16px', border: `2px dashed ${consentPdfFile ? 'var(--accent)' : (existingConsentPdf ? 'rgba(99,102,241,0.4)' : 'var(--border-light)')}`, transition: 'border-color 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <FiFilePlus size={18} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 13, fontWeight: 700 }}>PDF Document</span>
                {(consentPdfFile || existingConsentPdf) && <FiCheckCircle size={14} style={{ color: 'var(--accent)', marginLeft: 'auto' }} />}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>Consent form, agreement or letter (PDF)</p>
              <button type="button" className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={() => consentPdfRef.current?.click()}>
                <FiUpload size={12} /> {consentPdfFile ? 'Change PDF' : existingConsentPdf ? 'Replace PDF' : 'Upload PDF'}
              </button>
              <input type="file" ref={consentPdfRef} accept=".pdf" onChange={handleConsentPdfChange} style={{ display: 'none' }} />
              {existingConsentPdf && !consentPdfFile && <a href={existingConsentPdf} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--accent)', display: 'block', marginTop: 8 }}><FiFileText size={11} /> View existing PDF</a>}
              {consentPdfFile && <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 6, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, wordBreak: 'break-all' }}><FiFileText size={12} /> {consentPdfFile.name}</div>}
            </div>

            {/* Box 3: Video */}
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '14px 16px', border: `2px dashed ${consentVideoFile ? 'var(--amber)' : (existingConsentVideo ? 'rgba(245,158,11,0.4)' : 'var(--border-light)')}`, transition: 'border-color 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <FiVideo size={18} style={{ color: 'var(--amber)' }} />
                <span style={{ fontSize: 13, fontWeight: 700 }}>Video Upload</span>
                {(consentVideoFile || existingConsentVideo) && <FiCheckCircle size={14} style={{ color: 'var(--amber)', marginLeft: 'auto' }} />}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>Verbal consent video recording (MP4/MOV)</p>
              <button type="button" className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={() => consentVideoRef.current?.click()}>
                <FiUpload size={12} /> {consentVideoFile ? 'Change Video' : existingConsentVideo ? 'Replace Video' : 'Upload Video'}
              </button>
              <input type="file" ref={consentVideoRef} accept=".mp4,.mov,.webm,.mkv" onChange={handleConsentVideoChange} style={{ display: 'none' }} />
              {existingConsentVideo && !consentVideoFile && <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 6, fontWeight: 600 }}>🎬 Video on file</div>}
              {consentVideoFile && <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 6, fontWeight: 600, wordBreak: 'break-all' }}>✓ {consentVideoFile.name}</div>}
            </div>
          </div>
        </div>

        {/* ── Certificate Verification ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="section-heading">📋 Certificate Verification</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(Object.entries(certLabels) as [string, { key: string; label: string }][]).map(([certType, { key, label }]) => (
              <div key={certType} style={{ background: form[key] ? 'rgba(16,185,129,0.05)' : 'var(--bg-tertiary)', borderRadius: 10, padding: '14px 16px', border: `1px solid ${form[key] ? 'rgba(16,185,129,0.25)' : 'var(--border-light)'}`, transition: 'all 0.2s' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none', marginBottom: form[key] ? 12 : 0 }}>
                  <input type="checkbox" checked={!!form[key]} onChange={e => setForm((f: any) => ({ ...f, [key]: e.target.checked }))} style={{ width: 18, height: 18, accentColor: 'var(--teal)', cursor: 'pointer' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
                    {form[key] && <div style={{ fontSize: 12, color: 'var(--teal)', marginTop: 2 }}>✓ Marked as collected</div>}
                  </div>
                </label>
                {form[key] && (
                  <div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => certRefs[certType as keyof typeof certRefs].current?.click()}>
                      <FiUpload size={12} /> {certFiles[certType].file ? 'Change File' : certFiles[certType].existingUrl ? 'Replace Scan' : 'Upload Scan'}
                    </button>
                    <input type="file" ref={certRefs[certType as keyof typeof certRefs]} accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={handleCertFileChange(certType)} style={{ display: 'none' }} />
                    {certFiles[certType].file && certFiles[certType].preview && (
                      <img src={certFiles[certType].preview!} alt="cert" style={{ display: 'block', maxWidth: 140, maxHeight: 90, borderRadius: 6, marginTop: 8 }} />
                    )}
                    {certFiles[certType].file && !certFiles[certType].preview && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--teal)', marginTop: 8 }}>
                        <FiFileText /> {certFiles[certType].file!.name}
                      </div>
                    )}
                    {!certFiles[certType].file && certFiles[certType].existingUrl && (
                      <div style={{ marginTop: 8 }}>
                        {/\.(jpg|jpeg|png|webp)$/i.test(certFiles[certType].existingUrl!)
                          ? <img src={certFiles[certType].existingUrl!} alt="cert" style={{ maxWidth: 120, maxHeight: 80, borderRadius: 6 }} />
                          : <a href={certFiles[certType].existingUrl!} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}><FiFileText /> View existing file</a>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ minWidth: 160 }}>
            {loading ? '⏳ Saving...' : '✓ Update Student'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/students/${id}`)} disabled={loading}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default StudentEdit;
