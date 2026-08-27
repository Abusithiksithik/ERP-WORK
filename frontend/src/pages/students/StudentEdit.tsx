import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FiUpload, FiFileText, FiUser, FiChevronDown, FiArrowLeft } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { CourseCategory, Course, Batch } from '../../types';

interface CertFile { file: File | null; preview: string | null; existingUrl?: string; }

const StudentEdit: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const photoRef   = useRef<HTMLInputElement>(null);
  const cert10Ref  = useRef<HTMLInputElement>(null);
  const cert12Ref  = useRef<HTMLInputElement>(null);
  const certDipRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading]           = useState(false);
  const [pageLoading, setPageLoading]   = useState(true);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [form, setForm] = useState<any>({});
  const [certFiles, setCertFiles] = useState<Record<string, CertFile>>({
    '10th':    { file: null, preview: null },
    '12th':    { file: null, preview: null },
    'diploma': { file: null, preview: null },
  });

  // Course cascade
  const [categories, setCategories]             = useState<CourseCategory[]>([]);
  const [allCourses, setAllCourses]             = useState<Course[]>([]);
  const [filteredCourses, setFilteredCourses]   = useState<Course[]>([]);
  const [filteredBatches, setFilteredBatches]   = useState<Batch[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedCourse, setSelectedCourse]     = useState('');
  const [selectedBatch, setSelectedBatch]       = useState('');

  useEffect(() => {
    const init = async () => {
      try {
        const [sRes, catRes, courseRes] = await Promise.all([
          api.get(`/students/${id}`),
          api.get('/categories'),
          api.get('/courses'),
        ]);
        const s       = sRes.data.data;
        const cats    = catRes.data.data || [];
        const courses = courseRes.data.data || [];

        setCategories(cats);
        setAllCourses(courses);
        setFilteredCourses(courses);

        setForm({
          full_name:              s.full_name || '',
          mobile:                 s.mobile || '',
          email:                  s.email || '',
          date_of_birth:          s.date_of_birth ? s.date_of_birth.split('T')[0] : '',
          gender:                 s.gender || '',
          address:                s.address || '',
          parent_present:         !!(s.parent_name || s.parent_mobile),
          guardian_type:          s.guardian_type || (s.parent_name ? 'parent' : ''),
          parent_name:            s.parent_name || '',
          parent_mobile:          s.parent_mobile || '',
          status:                 s.status || 'active',
          cert_10th_collected:    !!s.cert_10th_collected,
          cert_12th_collected:    !!s.cert_12th_collected,
          cert_diploma_collected: !!s.cert_diploma_collected,
        });

        if (s.photo_url) setPhotoPreview(s.photo_url);
        setCertFiles({
          '10th':    { file: null, preview: s.cert_10th_url || null, existingUrl: s.cert_10th_url },
          '12th':    { file: null, preview: s.cert_12th_url || null, existingUrl: s.cert_12th_url },
          'diploma': { file: null, preview: s.cert_diploma_url || null, existingUrl: s.cert_diploma_url },
        });

        // Set existing course / batch
        if (s.course_id) {
          const course = courses.find((c: Course) => c.id === s.course_id);
          if (course) {
            const catId = String(course.category_id || '');
            setSelectedCategory(catId);
            setFilteredCourses(catId ? courses.filter((c: Course) => String(c.category_id) === catId) : courses);
            setSelectedCourse(String(s.course_id));
            // Fetch batches for this course
            const br = await api.get('/batches', { params: { course_id: s.course_id } });
            setFilteredBatches(br.data.data || []);
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

  const handleCategoryChange = (catId: string) => {
    setSelectedCategory(catId);
    setSelectedCourse('');
    setSelectedBatch('');
    setFilteredBatches([]);
    setFilteredCourses(catId ? allCourses.filter(c => String(c.category_id) === catId) : allCourses);
  };

  const handleCourseChange = async (courseId: string) => {
    setSelectedCourse(courseId);
    setSelectedBatch('');
    setFilteredBatches([]);
    if (!courseId) return;
    try {
      const r = await api.get('/batches', { params: { course_id: courseId } });
      setFilteredBatches(r.data.data || []);
    } catch { /* silent */ }
  };

  const handleCertFileChange = (certType: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = /\.(jpg|jpeg|png|webp)$/i.test(file.name);
    setCertFiles(prev => ({ ...prev, [certType]: { ...prev[certType], file, preview: isImage ? URL.createObjectURL(file) : null } }));
  };

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
      fd.append('cert_10th_collected',    String(form.cert_10th_collected));
      fd.append('cert_12th_collected',    String(form.cert_12th_collected));
      fd.append('cert_diploma_collected', String(form.cert_diploma_collected));

      // Parent
      if (form.parent_present) {
        fd.append('parent_name',   form.parent_name || '');
        fd.append('parent_mobile', form.parent_mobile || '');
      } else {
        fd.append('parent_name',   '');
        fd.append('parent_mobile', '');
      }
      if (photoRef.current?.files?.[0]) fd.append('photo', photoRef.current.files[0]);

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

      toast.success('Student updated successfully!');
      navigate(`/students/${id}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally {
      setLoading(false);
    }
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
            <h1 className="page-title">Edit Student</h1>
            <p className="page-subtitle">Update student information</p>
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
              <label className="form-label">Email Address *</label>
              <input type="email" className="form-control" value={form.email || ''} onChange={set('email')} required />
            </div>
            <div className="form-group">
              <label className="form-label">Date of Birth</label>
              <input type="date" className="form-control dob-picker" value={form.date_of_birth || ''} onChange={set('date_of_birth')} max={new Date().toISOString().split('T')[0]} style={{ colorScheme: 'dark', cursor: 'pointer' }} />
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
              <label className="form-label">Status</label>
              <select className="form-control" value={form.status || 'active'} onChange={set('status')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Address</label>
            <textarea className="form-control" value={form.address || ''} onChange={set('address')} rows={2} />
          </div>
        </div>

        {/* ── Course Selection ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="section-heading">📚 Course Selection</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, marginTop: -8 }}>Course / batch is managed via Enrollment. Changes here update the student's primary course record.</p>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Category</label>
              <div style={{ position: 'relative' }}>
                <select className="form-control" value={selectedCategory} onChange={e => handleCategoryChange(e.target.value)} style={{ paddingRight: 32, appearance: 'none' }}>
                  <option value="">— All Categories —</option>
                  {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.category_name}</option>)}
                </select>
                <FiChevronDown style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Course</label>
              <div style={{ position: 'relative' }}>
                <select className="form-control" value={selectedCourse} onChange={e => handleCourseChange(e.target.value)} style={{ paddingRight: 32, appearance: 'none' }}>
                  <option value="">— Select Course —</option>
                  {filteredCourses.map(c => (
                    <option key={c.id} value={c.id}>{c.course_name}{c.is_free ? ' (Free)' : ''}</option>
                  ))}
                </select>
                <FiChevronDown style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Batch</label>
              <div style={{ position: 'relative' }}>
                <select className="form-control" value={selectedBatch} onChange={e => setSelectedBatch(e.target.value)} disabled={!selectedCourse} style={{ paddingRight: 32, appearance: 'none' }}>
                  <option value="">— Select Batch —</option>
                  {filteredBatches.map(b => (
                    <option key={b.id} value={b.id}>{b.batch_name}</option>
                  ))}
                </select>
                <FiChevronDown style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
              </div>
            </div>
          </div>
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
              <label
                key={opt.value}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 6, padding: '12px 8px', borderRadius: 10, cursor: 'pointer',
                  border: `2px solid ${form.guardian_type === opt.value ? 'var(--accent)' : 'var(--border-light)'}`,
                  background: form.guardian_type === opt.value ? 'rgba(99,102,241,0.08)' : 'var(--bg-tertiary)',
                  transition: 'all 0.15s', userSelect: 'none',
                }}
              >
                <input
                  type="radio"
                  name="guardian_type"
                  value={opt.value}
                  checked={form.guardian_type === opt.value}
                  onChange={() => setForm((f: any) => ({
                    ...f,
                    guardian_type:  opt.value,
                    parent_present: opt.value !== '',
                    parent_name:    opt.value ? f.parent_name : '',
                    parent_mobile:  opt.value ? f.parent_mobile : '',
                  }))}
                  style={{ display: 'none' }}
                />
                <span style={{ fontSize: 22 }}>{opt.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: form.guardian_type === opt.value ? 'var(--accent)' : 'var(--text-secondary)' }}>{opt.label}</span>
              </label>
            ))}
          </div>

          {form.guardian_type && (
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">
                  {form.guardian_type === 'parent' ? 'Parent Name' : 'Guardian Name'}
                </label>
                <input
                  className="form-control"
                  value={form.parent_name || ''}
                  onChange={set('parent_name')}
                  placeholder={form.guardian_type === 'parent' ? 'Father / Mother name' : 'Guardian full name'}
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  {form.guardian_type === 'parent' ? 'Parent Mobile' : 'Guardian Mobile'}
                </label>
                <input
                  className="form-control"
                  value={form.parent_mobile || ''}
                  onChange={set('parent_mobile')}
                  placeholder={form.guardian_type === 'parent' ? 'Parent mobile number' : 'Guardian mobile number'}
                  maxLength={10}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Certificate Verification ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="section-heading">📋 Certificate Verification</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(Object.entries(certLabels) as [string, { key: string; label: string }][]).map(([certType, { key, label }]) => (
              <div key={certType} style={{ background: form[key] ? 'rgba(16,185,129,0.05)' : 'var(--bg-tertiary)', borderRadius: 10, padding: '14px 16px', border: `1px solid ${form[key] ? 'rgba(16,185,129,0.25)' : 'var(--border-light)'}`, transition: 'all 0.2s' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none', marginBottom: form[key] ? 12 : 0 }}>
                  <input
                    type="checkbox"
                    checked={!!form[key]}
                    onChange={e => setForm((f: any) => ({ ...f, [key]: e.target.checked }))}
                    style={{ width: 18, height: 18, accentColor: 'var(--teal)', cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
                    {form[key] && <div style={{ fontSize: 12, color: 'var(--teal)', marginTop: 2 }}>✓ Marked as collected</div>}
                  </div>
                </label>
                {form[key] && (
                  <div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => certRefs[certType as keyof typeof certRefs].current?.click()}
                    >
                      <FiUpload size={12} /> {certFiles[certType].file ? 'Change File' : certFiles[certType].existingUrl ? 'Replace Scan' : 'Upload Scan'}
                    </button>
                    <input
                      type="file"
                      ref={certRefs[certType as keyof typeof certRefs]}
                      accept=".jpg,.jpeg,.png,.webp,.pdf"
                      onChange={handleCertFileChange(certType)}
                      style={{ display: 'none' }}
                    />
                    {/* Show new file */}
                    {certFiles[certType].file && certFiles[certType].preview && (
                      <img src={certFiles[certType].preview!} alt="cert" style={{ display: 'block', maxWidth: 140, maxHeight: 90, borderRadius: 6, marginTop: 8 }} />
                    )}
                    {certFiles[certType].file && !certFiles[certType].preview && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--teal)', marginTop: 8 }}>
                        <FiFileText /> {certFiles[certType].file!.name}
                      </div>
                    )}
                    {/* Show existing scan if no new file */}
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
