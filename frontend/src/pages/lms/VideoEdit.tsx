import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { LmsModule, Course } from '../../types';

const VideoEdit: React.FC = () => {
  const { id } = useParams(); const navigate = useNavigate();
  const thumbRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [modules, setModules] = useState<LmsModule[]>([]);
  const [form, setForm] = useState<any>({});
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.get(`/videos/${id}`), api.get('/courses')]).then(([v, c]) => {
      const video = v.data.data;
      setForm({ course_id: video.course_id, module_id: video.module_id || '', title: video.title, description: video.description || '', is_free: video.is_free, order_number: video.order_number });
      if (video.thumbnail_url) setThumbPreview(video.thumbnail_url);
      setCourses(c.data.data);
      if (video.course_id) api.get(`/modules?course_id=${video.course_id}`).then(r => setModules(r.data.data));
    });
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      const fd = new FormData();
      if (videoRef.current?.files?.[0]) fd.append('video', videoRef.current.files[0]);
      if (thumbRef.current?.files?.[0]) fd.append('thumbnail', thumbRef.current.files[0]);
      Object.entries(form).forEach(([k, v]) => { if (v !== undefined && v !== null) fd.append(k, String(v)); });
      await api.put(`/videos/${id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Video updated!'); navigate('/videos');
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((p: any) => ({ ...p, [f]: e.target.value }));

  if (!form.title) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>;

  return (
    <div>
      <div className="page-header"><div><h1 className="page-title">Edit Video</h1></div></div>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group"><label className="form-label">Course *</label>
              <select className="form-control" value={form.course_id} onChange={e => { setForm((f: any) => ({ ...f, course_id: e.target.value })); api.get(`/modules?course_id=${e.target.value}`).then(r => setModules(r.data.data)); }} required>
                {courses.map(c => <option key={c.id} value={c.id}>{c.course_name}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Module</label>
              <select className="form-control" value={form.module_id} onChange={set('module_id')}>
                <option value="">No Module</option>
                {modules.map(m => <option key={m.id} value={m.id}>{m.module_name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group"><label className="form-label">Title *</label><input className="form-control" value={form.title} onChange={set('title')} required /></div>
          <div className="form-group"><label className="form-label">Description</label><textarea className="form-control" value={form.description} onChange={set('description')} rows={3} /></div>
          <div className="form-grid">
            <div className="form-group"><label className="form-label">Order #</label><input type="number" className="form-control" value={form.order_number} onChange={set('order_number')} /></div>
            <div className="form-group" style={{ paddingTop: 26 }}>
              <label className="toggle-switch">
                <span className="toggle"><input type="checkbox" checked={form.is_free} onChange={e => setForm((f: any) => ({ ...f, is_free: e.target.checked }))} /><span className="toggle-slider"></span></span>
                <span style={{ fontSize: 13 }}>{form.is_free ? 'Free' : 'Paid'}</span>
              </label>
            </div>
          </div>
          <div className="form-group"><label className="form-label">Replace Video (optional)</label>
            <input type="file" ref={videoRef} accept="video/*" className="form-control" />
          </div>
          <div className="form-group"><label className="form-label">Replace Thumbnail (optional)</label>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              {thumbPreview && <img src={thumbPreview} alt="thumb" style={{ height: 60, borderRadius: 6, border: '1px solid var(--border)' }} />}
              <input type="file" ref={thumbRef} accept="image/*" className="form-control" onChange={e => { const f = e.target.files?.[0]; if (f) setThumbPreview(URL.createObjectURL(f)); }} />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/videos')}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VideoEdit;
