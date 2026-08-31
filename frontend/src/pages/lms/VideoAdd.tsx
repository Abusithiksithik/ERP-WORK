import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FiUpload, FiVideo, FiImage, FiArrowLeft, FiCheckCircle } from 'react-icons/fi';
import api from '../../api/axios';
import { Course } from '../../types';

const VideoAdd: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const videoRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLInputElement>(null);

  // Pre-select course if coming from CourseList → Manage Videos
  const presetCourseId = searchParams.get('course_id') || '';
  const presetCourseName = searchParams.get('course_name') || '';

  const [loading, setLoading] = useState(false);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [videoName, setVideoName] = useState('');
  const [videoSize, setVideoSize] = useState('');
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [form, setForm] = useState({
    course_id: presetCourseId,
    title: '',
    description: '',
    is_free: false,
    order_number: '1',
  });

  // Load courses on mount
  useEffect(() => {
    setCoursesLoading(true);
    api.get('/courses')
      .then(r => setCourses(r.data.data || []))
      .catch(() => toast.error('Failed to load courses'))
      .finally(() => setCoursesLoading(false));
  }, []);

  const handleCourseChange = (courseId: string) => {
    setForm(f => ({ ...f, course_id: courseId }));
  };

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoName(file.name);
      const mb = file.size / (1024 * 1024);
      setVideoSize(mb > 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.course_id) { toast.error('Please select a course'); return; }
    if (!form.title.trim()) { toast.error('Please enter a video title'); return; }
    if (!videoRef.current?.files?.[0]) { toast.error('Please select a video file'); return; }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('video', videoRef.current.files[0]);
      if (thumbRef.current?.files?.[0]) fd.append('thumbnail', thumbRef.current.files[0]);
      fd.append('course_id', form.course_id);
      fd.append('title', form.title);
      fd.append('description', form.description);
      fd.append('is_free', String(form.is_free));
      fd.append('order_number', form.order_number);

      await api.post('/videos', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        // Show upload progress for large files
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            if (pct < 100) toast.info(`Uploading... ${pct}%`, { toastId: 'upload-progress', autoClose: false });
            else toast.dismiss('upload-progress');
          }
        },
      });

      toast.success('Video uploaded successfully!');
      if (presetCourseId) {
        navigate(`/videos?course_id=${presetCourseId}&course_name=${encodeURIComponent(presetCourseName)}`);
      } else {
        navigate('/videos');
      }
    } catch (err: any) {
      toast.dismiss('upload-progress');
      toast.error(err.response?.data?.message || 'Upload failed. Check file size (max 5GB).');
    } finally {
      setLoading(false);
    }
  };

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }));

  const backUrl = presetCourseId
    ? `/videos?course_id=${presetCourseId}&course_name=${encodeURIComponent(presetCourseName)}`
    : '/videos';

  return (
    <div>
      <div className="page-header">
        <div>
          {presetCourseId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Link to="/courses" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 13 }}>Courses</Link>
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>→</span>
              <Link to={backUrl} style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 13 }}>{presetCourseName}</Link>
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>→</span>
              <span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>Upload Video</span>
            </div>
          )}
          <h1 className="page-title">Upload Video</h1>
          <p className="page-subtitle">
            {presetCourseId ? `Adding to: ${presetCourseName}` : 'Upload a new video — Max 5GB'}
          </p>
        </div>
        <Link to={backUrl} className="btn btn-secondary"><FiArrowLeft /> Back</Link>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit}>

          {/* ── Course ── */}
          <h3 className="section-heading">📚 Course</h3>
          <div className="form-group">
            <label className="form-label">
              Course *
              {coursesLoading && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 8 }}>Loading courses...</span>}
            </label>
            <select
              className="form-control"
              value={form.course_id}
              onChange={e => handleCourseChange(e.target.value)}
              required
              disabled={coursesLoading}
            >
              <option value="">{coursesLoading ? 'Loading courses...' : courses.length === 0 ? 'No courses found — create a course first' : 'Select Course'}</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.course_name}</option>
              ))}
            </select>
            {!coursesLoading && courses.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>
                No courses available. <Link to="/courses/add" style={{ color: 'var(--accent)' }}>Create a course first →</Link>
              </p>
            )}
          </div>

          {/* ── Video Details ── */}
          <h3 className="section-heading">📝 Video Details</h3>
          <div className="form-group">
            <label className="form-label">Video Title *</label>
            <input className="form-control" value={form.title} onChange={set('title')} placeholder="Enter video title" required />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-control" value={form.description} onChange={set('description')} rows={3} placeholder="Brief description of this video..." />
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Order Number</label>
              <input type="number" className="form-control" value={form.order_number} onChange={set('order_number')} min={1} />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ marginBottom: 14 }}>Access Type</label>
              <label className="toggle-switch">
                <span className="toggle">
                  <input type="checkbox" checked={form.is_free} onChange={e => setForm(f => ({ ...f, is_free: e.target.checked }))} />
                  <span className="toggle-slider"></span>
                </span>
                <span style={{ fontSize: 13 }}>
                  {form.is_free ? '🆓 Free — all students can watch' : '💰 Paid — enrolled students only'}
                </span>
              </label>
            </div>
          </div>

          {/* ── Video File ── */}
          <h3 className="section-heading">🎬 Video File * <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>Max 5 GB</span></h3>
          <div
            className="file-upload-area"
            onClick={() => !loading && videoRef.current?.click()}
            style={{ cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            <input
              type="file"
              ref={videoRef}
              accept="video/*,.mp4,.mkv,.avi,.mov,.webm"
              onChange={handleVideoChange}
              style={{ display: 'none' }}
            />
            {videoName ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <FiCheckCircle style={{ fontSize: 36, color: 'var(--teal)' }} />
                <div className="file-preview" style={{ justifyContent: 'center' }}>
                  <FiVideo /> {videoName}
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{videoSize} — Click to change</span>
              </div>
            ) : (
              <>
                <div className="upload-icon"><FiVideo /></div>
                <p className="upload-text">Click to select video file</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>MP4, MKV, AVI, MOV, WEBM — Maximum 5 GB</p>
              </>
            )}
          </div>

          {/* ── Thumbnail ── */}
          <h3 className="section-heading" style={{ marginTop: 24 }}>🖼️ Thumbnail Image <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>Optional</span></h3>
          <div
            className="file-upload-area"
            onClick={() => thumbRef.current?.click()}
            style={{ cursor: 'pointer' }}
          >
            <input
              type="file"
              ref={thumbRef}
              accept="image/*"
              onChange={e => { const f = e.target.files?.[0]; if (f) setThumbPreview(URL.createObjectURL(f)); }}
              style={{ display: 'none' }}
            />
            {thumbPreview ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <img src={thumbPreview} alt="thumbnail" style={{ maxHeight: 140, borderRadius: 8, maxWidth: '100%' }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Click to change</span>
              </div>
            ) : (
              <>
                <div className="upload-icon"><FiImage /></div>
                <p className="upload-text">Click to upload a thumbnail image</p>
              </>
            )}
          </div>

          <div className="form-actions" style={{ marginTop: 24 }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || coursesLoading}
              style={{ minWidth: 160 }}
            >
              <FiUpload /> {loading ? 'Uploading...' : 'Upload Video'}
            </button>
            <Link to={backUrl} className="btn btn-secondary">Cancel</Link>
          </div>

          {loading && (
            <div style={{ marginTop: 12, padding: '10px 16px', background: 'rgba(99,102,241,0.1)', borderRadius: 8, fontSize: 13, color: 'var(--accent)' }}>
              ⏳ Uploading video... Large files may take a few minutes. Please do not close this page.
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default VideoAdd;
