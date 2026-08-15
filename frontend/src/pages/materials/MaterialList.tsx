import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiPlus, FiTrash2, FiDownload, FiFile } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { LmsMaterial, Course } from '../../types';
import { useAuth } from '../../context/AuthContext';

const fileTypeIcon: Record<string, string> = { pdf: '📄', ppt: '📊', docx: '📝', zip: '🗜️', other: '📎' };

const MaterialList: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'faculty';
  const [materials, setMaterials] = useState<LmsMaterial[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [filterCourse, setFilterCourse] = useState('');
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterCourse) params.course_id = filterCourse;
      const r = await api.get('/materials', { params });
      setMaterials(r.data.data);
    } catch { toast.error('Failed'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [filterCourse]);
  useEffect(() => { api.get('/courses').then(r => setCourses(r.data.data)); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete material?')) return;
    try { await api.delete(`/materials/${id}`); toast.success('Deleted'); fetch(); }
    catch { toast.error('Failed'); }
  };

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Course Materials</h1><p className="page-subtitle">{materials.length} files</p></div>
        {isAdmin && <Link to="/materials/add" className="btn btn-primary"><FiPlus /> Upload Material</Link>}
      </div>
      <div className="card">
        <div className="search-bar">
          <select className="form-control filter-select" value={filterCourse} onChange={e => setFilterCourse(e.target.value)}>
            <option value="">All Courses</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.course_name}</option>)}
          </select>
        </div>
        {loading ? <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>
        : materials.length === 0 ? <div className="empty-state"><div className="empty-state-icon">📁</div><h3>No Materials</h3><p>Upload course materials.</p></div>
        : <div className="table-container">
            <table>
              <thead><tr><th>Title</th><th>Course</th><th>Module</th><th>Type</th><th>Access</th><th>Actions</th></tr></thead>
              <tbody>
                {materials.map(m => (
                  <tr key={m.id}>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 20 }}>{fileTypeIcon[m.file_type] || '📎'}</span>
                      <div><div style={{ fontWeight: 600 }}>{m.title}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.description?.slice(0,50)}</div></div>
                    </div></td>
                    <td>{m.course_name}</td>
                    <td>{m.module_name || '—'}</td>
                    <td><span style={{ textTransform: 'uppercase', fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{m.file_type}</span></td>
                    <td><span className={`badge badge-${m.is_free ? 'free' : 'paid'}`}>{m.is_free ? 'Free' : 'Paid'}</span></td>
                    <td><div className="table-actions">
                      <a href={m.file_url} target="_blank" rel="noopener noreferrer" className="action-btn view" download><FiDownload /></a>
                      {isAdmin && <button className="action-btn delete" onClick={() => handleDelete(m.id)}><FiTrash2 /></button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
      </div>
    </div>
  );
};

export default MaterialList;
