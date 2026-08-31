import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FiUpload } from 'react-icons/fi';
import api from '../../api/axios';
import { Course } from '../../types';

const MaterialAdd: React.FC = () => {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [fileName, setFileName] = useState('');
  const [form, setForm] = useState({
    course_id: '', title: '', description: '', is_free: false,
  });

  useEffect(() => {
    api.get('/courses').then(r => setCourses((r.data.data || []).filter((c: Course) => c.status === 'active')));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.course_id) { toast.error('Please select a course'); return; }
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!fileRef.current?.files?.[0]) { toast.error('Please select a file'); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file',        fileRef.current.files[0]);
      fd.append('course_id',   form.course_id);
      fd.append('title',       form.title.trim());
      fd.append('description', form.description || '');
      fd.append('is_free',     String(form.is_free));
      await api.post('/materials', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Material uploaded!');
      navigate('/materials');
    } catch (err: any) { toast.error(err.response?.data?.message || 'Upload failed'); }
    finally { setLoading(false); }
  };

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }));

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Upload Material</h1><p className="page-subtitle">Upload a course material file</p></div>
        <button className="btn btn-secondary" onClick={() => navigate('/materials')}>← Back</button>
      </div>
      <div className="card" style={{ maxWidth: 700 }}>
        <form onSubmit={handleSubmit}>

          {/* Course only — no Module */}
          <div className="form-group">
            <label className="form-label">Course (Sub-Course) *</label>
            <select className="form-control" value={form.course_id} onChange={set('course_id')} required>
              <option value="">— Select Course —</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.course_name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Title *</label>
            <input className="form-control" value={form.title} onChange={set('title')} placeholder="e.g. Anatomy Study Guide Chapter 1" required />
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-control" value={form.description} onChange={set('description')} rows={2} placeholder="Optional description" />
          </div>

          <div className="form-group">
            <label className="toggle-switch">
              <span className="toggle">
                <input type="checkbox" checked={form.is_free} onChange={e => setForm(f => ({ ...f, is_free: e.target.checked }))} />
                <span className="toggle-slider"></span>
              </span>
              <span className="form-label" style={{ margin: 0 }}>Free Material (visible to all students)</span>
            </label>
          </div>

          <div className="file-upload-area" onClick={() => fileRef.current?.click()} style={{ cursor: 'pointer' }}>
            <input type="file" ref={fileRef} accept=".pdf,.ppt,.pptx,.doc,.docx,.zip"
              onChange={e => setFileName(e.target.files?.[0]?.name || '')} style={{ display: 'none' }} />
            <div className="upload-icon"><FiUpload /></div>
            {fileName
              ? <div className="file-preview">📎 {fileName}</div>
              : <p className="upload-text">Click to upload file (PDF, PPT, DOCX, ZIP — max 50 MB)</p>}
          </div>

          <div className="form-actions" style={{ marginTop: 20 }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Uploading...' : 'Upload Material'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/materials')}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MaterialAdd;
