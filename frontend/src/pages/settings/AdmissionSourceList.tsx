import React, { useEffect, useState } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiToggleLeft, FiToggleRight, FiX } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../api/axios';

interface Source { id: number; source_name: string; is_active: boolean; }

const AdmissionSourceList: React.FC = () => {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Source | null>(null);
  const [name, setName] = useState('');

  const load = async () => {
    try { setLoading(true); const r = await api.get('/admission-sources'); setSources(r.data.data || []); }
    catch (err: any) { toast.error(err.response?.data?.message || 'Failed to load admission sources'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const openAdd = () => { setEditing(null); setName(''); setModal(true); };
  const openEdit = (s: Source) => { setEditing(s); setName(s.source_name); setModal(true); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); const value = name.trim(); if (!value) { toast.error('Source name is required'); return; }
    setSaving(true);
    try { if (editing) await api.put(`/admission-sources/${editing.id}`, { source_name: value }); else await api.post('/admission-sources', { source_name: value }); toast.success(editing ? 'Source updated' : 'Source added'); setModal(false); load(); }
    catch (err: any) { toast.error(err.response?.data?.message || 'Failed to save source'); }
    finally { setSaving(false); }
  };
  const toggle = async (id: number) => { try { await api.patch(`/admission-sources/${id}/toggle`); load(); } catch (err: any) { toast.error(err.response?.data?.message || 'Failed to update source'); } };
  const remove = async (id: number, sourceName: string) => { if (!window.confirm(`Delete source "${sourceName}"?`)) return; try { await api.delete(`/admission-sources/${id}`); toast.success('Source deleted'); load(); } catch (err: any) { toast.error(err.response?.data?.message || 'Failed to delete source'); } };

  return <div>
    <div className="page-header"><div><h1 className="page-title">Source Master</h1><p className="page-subtitle">Manage the source options used in New Candidates.</p></div><button className="btn btn-primary" onClick={openAdd}><FiPlus /> Add Source</button></div>
    <div className="card">
      {loading ? <div className="empty-state">Loading…</div> : sources.length === 0 ? <div className="empty-state"><h3>No Sources</h3></div> : <div className="table-container"><table><thead><tr><th>#</th><th>Source</th><th>Status</th><th>Actions</th></tr></thead><tbody>{sources.map((s,i)=><tr key={s.id}><td>{i+1}</td><td style={{fontWeight:600}}>{s.source_name}</td><td><span className={`badge badge-${s.is_active?'active':'inactive'}`}>{s.is_active?'Active':'Disabled'}</span></td><td><div className="table-actions"><button className="action-btn view" title="Enable / Disable" onClick={()=>toggle(s.id)}>{s.is_active?<FiToggleRight/>:<FiToggleLeft/>}</button><button className="action-btn edit" title="Edit" onClick={()=>openEdit(s)}><FiEdit2/></button><button className="action-btn delete" title="Delete" onClick={()=>remove(s.id,s.source_name)}><FiTrash2/></button></div></td></tr>)}</tbody></table></div>}
    </div>
    {modal && <div className="modal-overlay" onClick={()=>setModal(false)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:460}}><div className="modal-header"><h2 className="modal-title">{editing?'Edit':'Add'} Admission Source</h2><button className="modal-close" onClick={()=>setModal(false)}><FiX/></button></div><form onSubmit={save}><div className="form-group"><label className="form-label">Source Name *</label><input className="form-control" value={name} onChange={e=>setName(e.target.value)} maxLength={50} autoFocus placeholder="e.g. Google Ads" required/></div><div className="form-actions"><button className="btn btn-primary" type="submit" disabled={saving}>{saving?'Saving…':'Save'}</button><button className="btn btn-secondary" type="button" onClick={()=>setModal(false)}>Cancel</button></div></form></div></div>}
  </div>;
};
export default AdmissionSourceList;
