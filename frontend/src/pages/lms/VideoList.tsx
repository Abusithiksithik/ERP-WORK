import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FiPlus, FiEdit2, FiTrash2, FiPlay, FiArrowLeft, FiX, FiMaximize2, FiVolume2 } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { LmsVideo, Course } from '../../types';
import { useAuth } from '../../context/AuthContext';

const VideoList: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const [searchParams] = useSearchParams();

  const urlCourseId   = searchParams.get('course_id')   || '';
  const urlCourseName = searchParams.get('course_name') || '';

  const [videos, setVideos]           = useState<LmsVideo[]>([]);
  const [courses, setCourses]         = useState<Course[]>([]);
  const [filterCourse, setFilterCourse] = useState(urlCourseId);
  const [loading, setLoading]         = useState(true);

  // ── Video player modal state ──────────────────────────────
  const [playingVideo, setPlayingVideo] = useState<LmsVideo | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const openPlayer = (v: LmsVideo) => setPlayingVideo(v);
  const closePlayer = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = '';
    }
    setPlayingVideo(null);
  };

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePlayer(); };
    if (playingVideo) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playingVideo]);

  // ── Data fetching ─────────────────────────────────────────
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

  const selectedCourseName =
    urlCourseName || courses.find(c => String(c.id) === filterCourse)?.course_name || '';

  // ── Render ────────────────────────────────────────────────
  return (
    <div>
      {/* ── Page header ─────────────────────────────────── */}
      <div className="page-header">
        <div>
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
            to={filterCourse
              ? `/videos/add?course_id=${filterCourse}&course_name=${encodeURIComponent(selectedCourseName)}`
              : '/videos/add'}
            className="btn btn-primary"
          >
            <FiPlus /> Upload Video
          </Link>
        )}
      </div>

      {/* ── Filter bar ──────────────────────────────────── */}
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

      {/* ── Video grid ──────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Loading videos...</div>
      ) : videos.length === 0 ? (
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
      ) : (
        <div className="video-grid">
          {videos.map(v => (
            <div key={v.id} className="video-card">
              {/* ── Thumbnail / play area ── */}
              <div
                className="video-thumbnail"
                style={{ cursor: 'pointer', position: 'relative' }}
                onClick={() => openPlayer(v)}
                title="Click to play"
              >
                {v.thumbnail_url ? (
                  <img src={v.thumbnail_url} alt={v.title} />
                ) : (
                  <div className="video-thumbnail-placeholder"><FiPlay /></div>
                )}

                {/* Play overlay */}
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(0,0,0,0.35)',
                  opacity: 0,
                  transition: 'opacity 0.2s',
                }}
                  className="play-overlay"
                  onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                >
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.92)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                  }}>
                    <FiPlay size={22} color="#1a1a2e" style={{ marginLeft: 3 }} />
                  </div>
                </div>

                <div className="video-badge">
                  <span className={`badge badge-${v.is_free ? 'free' : 'paid'}`}>{v.is_free ? 'Free' : 'Paid'}</span>
                </div>
              </div>

              {/* ── Card body ── */}
              <div className="video-body">
                <div
                  className="video-title"
                  title={v.title}
                  style={{ cursor: 'pointer' }}
                  onClick={() => openPlayer(v)}
                >
                  {v.title}
                </div>
                <div className="video-meta">{v.course_name}{v.module_name ? ` → ${v.module_name}` : ''}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  <span className={`badge badge-${v.is_published ? 'published' : 'draft'}`}>
                    {v.is_published ? 'Published' : 'Draft'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>#{v.order_number}</span>
                </div>

                <div className="video-actions">
                  {/* Play button — everyone */}
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => openPlayer(v)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  >
                    <FiPlay size={12} /> Play
                  </button>

                  {isAdmin && (
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
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════ VIDEO PLAYER MODAL ══════════ */}
      {playingVideo && (
        <div
          className="modal-overlay"
          style={{ zIndex: 9999, background: 'rgba(0,0,0,0.88)' }}
          onClick={e => { if (e.target === e.currentTarget) closePlayer(); }}
        >
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: 14,
            width: '92vw',
            maxWidth: 960,
            overflow: 'hidden',
            boxShadow: '0 25px 80px rgba(0,0,0,0.7)',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Modal header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px',
              borderBottom: '1px solid var(--border-light)',
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                  {playingVideo.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {playingVideo.course_name}
                  {playingVideo.module_name ? ` → ${playingVideo.module_name}` : ''}
                </div>
              </div>
              <button
                onClick={closePlayer}
                style={{
                  background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: 8, color: '#f87171', cursor: 'pointer',
                  padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 13, fontWeight: 600,
                }}
              >
                <FiX size={14} /> Close
              </button>
            </div>

            {/* Video player */}
            <div style={{ background: '#000', width: '100%', aspectRatio: '16/9', position: 'relative' }}>
              <video
                ref={videoRef}
                key={playingVideo.id}   /* remount on video change */
                src={playingVideo.video_url}
                controls
                autoPlay
                controlsList="nodownload"
                style={{ width: '100%', height: '100%', display: 'block' }}
                onError={e => {
                  console.error('Video error:', e);
                  toast.error('Could not load video. The file may be missing or in an unsupported format.');
                }}
              >
                Your browser does not support the video tag.
              </video>
            </div>

            {/* Description */}
            {playingVideo.description && (
              <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border-light)' }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                  {playingVideo.description}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoList;
