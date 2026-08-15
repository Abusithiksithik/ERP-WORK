import React, { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FiPlus, FiEdit2, FiTrash2, FiEye, FiPlay, FiArrowLeft } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { LmsVideo, Course } from '../../types';
import { useAuth } from '../../context/AuthContext';

const VideoList: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const [searchParams] = useSearchParams();

  // ✅ Read pre-selected course from URL (when coming from CourseList → Manage Videos)
  const urlCourseId = searchParams.get('course_id') || '';
  const urlCourseName = searchParams.get('course_name') || '';

  const [videos, setVideos] = useState<LmsVideo[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [filterCourse, setFilterCourse] = useState(urlCourseId);
  const [loading, setLoading] = useState(true);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterCourse) params.course_id = filterCourse;
      const r = await api.get('/videos', { params });
      setVideos(r.data.data);
    } catch { toast.error('Failed to load videos'); }
    finally { setLoading(false); }
  }, [filterCourse]);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);
  useEffect(() => { api.get('/courses').then(r => setCourses(r.data.data)); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this video?')) return;
    try { await api.delete(`/videos/${id}`); toast.success('Video deleted'); fetchVideos(); }
    catch { toast.error('Failed to delete video'); }
  };

  const handleTogglePublish = async (id: number) => {
    try { await api.patch(`/videos/${id}/publish`); fetchVideos(); }
    catch { toast.error('Failed to update publish status'); }
  };

  const selectedCourseName = urlCourseName || courses.find(c => String(c.id) === filterCourse)?.course_name || '';

  return (
    <div>
      <div className="page-header">
        <div>
          {/* ✅ Show breadcrumb when coming from a course */}
          {urlCourseId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Link to="/courses" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                <FiArrowLeft size={13} /> Courses
              </Link>
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>→</span>
              <span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>{selectedCourseName}</span>
            </div>
          )}
          <h1 className="page-title">
            {filterCourse && selectedCourseName ? `${selectedCourseName} — Videos` : 'LMS Videos'}
          </h1>
          <p className="page-subtitle">{videos.length} videos{filterCourse ? ' in this course' : ' total'}</p>
        </div>
        {isAdmin && (
          <Link
            to={filterCourse ? `/videos/add?course_id=${filterCourse}&course_name=${encodeURIComponent(selectedCourseName)}` : '/videos/add'}
            className="btn btn-primary"
          >
            <FiPlus /> Upload Video
          </Link>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="search-bar">
          <select
            className="form-control filter-select"
            value={filterCourse}
            onChange={e => setFilterCourse(e.target.value)}
          >
            <option value="">All Courses</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.course_name}</option>)}
          </select>
          {filterCourse && (
            <button className="btn btn-secondary btn-sm" onClick={() => setFilterCourse('')}>Clear Filter</button>
          )}
        </div>
      </div>

      {loading
        ? <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Loading videos...</div>
        : videos.length === 0
          ? (
            <div className="empty-state">
              <div className="empty-state-icon">🎬</div>
              <h3>No Videos{filterCourse ? ' in this Course' : ''}</h3>
              <p>{isAdmin ? 'Upload the first video using the button above.' : 'No videos available yet.'}</p>
              {isAdmin && filterCourse && (
                <Link
                  to={`/videos/add?course_id=${filterCourse}&course_name=${encodeURIComponent(selectedCourseName)}`}
                  className="btn btn-primary"
                  style={{ marginTop: 16, display: 'inline-flex' }}
                >
                  <FiPlus /> Upload First Video
                </Link>
              )}
            </div>
          )
          : (
            <div className="video-grid">
              {videos.map(v => (
                <div key={v.id} className="video-card">
                  <div className="video-thumbnail">
                    {v.thumbnail_url
                      ? <img src={v.thumbnail_url} alt={v.title} />
                      : <div className="video-thumbnail-placeholder"><FiPlay /></div>}
                    <div className="video-badge">
                      <span className={`badge badge-${v.is_free ? 'free' : 'paid'}`}>{v.is_free ? 'Free' : 'Paid'}</span>
                    </div>
                  </div>
                  <div className="video-body">
                    <div className="video-title" title={v.title}>{v.title}</div>
                    <div className="video-meta">{v.course_name}{v.module_name ? ` → ${v.module_name}` : ''}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                      <span className={`badge badge-${v.is_published ? 'published' : 'draft'}`}>
                        {v.is_published ? 'Published' : 'Draft'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>#{v.order_number}</span>
                    </div>
                    <div className="video-actions">
                      {isAdmin ? (
                        <>
                          <button
                            className={`btn btn-sm ${v.is_published ? 'btn-secondary' : 'btn-success'}`}
                            onClick={() => handleTogglePublish(v.id)}
                          >
                            {v.is_published ? 'Unpublish' : 'Publish'}
                          </button>
                          <Link to={`/videos/${v.id}/edit`} className="action-btn edit" title="Edit"><FiEdit2 /></Link>
                          <button className="action-btn delete" onClick={() => handleDelete(v.id)} title="Delete"><FiTrash2 /></button>
                        </>
                      ) : (
                        <a href={v.video_url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-primary">
                          <FiPlay /> Watch
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
    </div>
  );
};

export default VideoList;
